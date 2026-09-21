-- Removes the DB-only "fake payment" simulation from the three Work Team /
-- Group mission RPCs (they used to just insert a transactions row marked
-- Paid/Returned/Sent without ever calling Stripe) and instead returns flags
-- the API route uses to trigger REAL Stripe holds/release/capture per
-- member via lib/mission-payment.ts + lib/supabase-admin.ts.

create or replace function public.respond_work_team_invitation(target_mission_id uuid, response text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_member public.mission_members;
  target_mission public.missions;
  next_status text;
  everyone_accepted boolean;
  member_name text;
begin
  select * into target_member from public.mission_members where mission_id = target_mission_id and user_id = auth.uid() for update;
  if not found or target_member.role <> 'member' or target_member.status <> 'pending' then raise exception 'Invitation is no longer available'; end if;
  if response not in ('accept', 'decline') then raise exception 'Invalid response'; end if;

  next_status := case when response = 'accept' then 'accepted' else 'declined' end;
  update public.mission_members set status = next_status, responded_at = now() where mission_id = target_mission_id and user_id = auth.uid();
  select * into target_mission from public.missions where id = target_mission_id for update;

  insert into public.mission_events (mission_id, user_id, event_type, payload)
  values (target_mission_id, auth.uid(), case when response = 'accept' then 'member_accepted' else 'member_declined' end, jsonb_build_object('user_id', auth.uid()));

  select coalesce(name, 'A team member') into member_name from public.profiles where user_id = auth.uid();
  insert into public.notifications (user_id, mission_id, event_type, title, description, payload)
  select user_id, target_mission_id,
    case when response = 'accept' then 'member_accepted' else 'member_declined' end,
    case when response = 'accept' then 'Member Accepted' else 'Member Declined' end,
    case when response = 'accept' then member_name || ' accepted the invitation.' else member_name || ' declined the invitation.' end,
    jsonb_build_object('member_id', auth.uid(), 'member_name', member_name)
  from public.mission_members where mission_id = target_mission_id and user_id <> auth.uid();

  everyone_accepted := false;
  if response = 'decline' then
    update public.missions set status = 'cancelled' where id = target_mission_id and status = 'waiting_for_members';
    update public.mission_members set status = 'declined' where mission_id = target_mission_id and status = 'pending';
    insert into public.notifications (user_id, mission_id, event_type, title, description, payload)
    select user_id, target_mission_id, 'group_mission_cancelled', 'Group Mission Cancelled', 'Not all invited members accepted the mission.', jsonb_build_object('declined_user_id', auth.uid())
    from public.mission_members where mission_id = target_mission_id;
  else
    select not exists (select 1 from public.mission_members where mission_id = target_mission_id and status = 'pending') into everyone_accepted;
    if everyone_accepted then
      update public.missions set status = 'upcoming' where id = target_mission_id and status = 'waiting_for_members';
      -- payment_status here is just a lightweight in-progress marker; the
      -- API route sets each member's real transaction status right after
      -- this RPC returns (per-member, via a real Stripe hold), not here.
      update public.mission_members set payment_status = 'paid' where mission_id = target_mission_id and status = 'accepted';
      insert into public.mission_events (mission_id, event_type, payload) values (target_mission_id, 'group_mission_ready', jsonb_build_object('pledge_amount', target_mission.pledge_amount));
      insert into public.notifications (user_id, mission_id, event_type, title, description, payload)
      select user_id, target_mission_id, 'group_mission_ready', 'Group Mission Ready', 'Everyone accepted the mission -- charging pledges now.', jsonb_build_object('pledge_amount', target_mission.pledge_amount)
      from public.mission_members where mission_id = target_mission_id;
    end if;
  end if;

  return jsonb_build_object('mission_id', target_mission_id, 'status', next_status, 'everyone_accepted', everyone_accepted);
end;
$$;

create or replace function public.complete_work_team_member(target_mission_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_mission public.missions;
  all_completed boolean;
begin
  select * into target_mission from public.missions where id = target_mission_id for update;
  if not found or not exists (select 1 from public.mission_members where mission_id = target_mission_id and user_id = auth.uid()) then raise exception 'Mission access denied'; end if;
  if target_mission.status <> 'in_progress' then raise exception 'Mission is not in progress'; end if;
  update public.mission_members set status = 'completed', completed_at = now() where mission_id = target_mission_id and user_id = auth.uid() and status in ('accepted', 'in_progress');
  insert into public.mission_events (mission_id, user_id, event_type, payload) values (target_mission_id, auth.uid(), 'member_completed', '{}'::jsonb);
  select not exists (select 1 from public.mission_members where mission_id = target_mission_id and status <> 'completed') into all_completed;
  if all_completed then
    update public.missions set status = 'completed' where id = target_mission_id;
    -- Real pledge release (Stripe cancel, per member) happens in the API
    -- route right after this RPC returns all_completed = true.
    insert into public.notifications (user_id, mission_id, event_type, title, description) select user_id, target_mission_id, 'group_mission_completed', 'Group Mission Completed', 'Everyone completed the mission.' from public.mission_members where mission_id = target_mission_id;
  else
    insert into public.notifications (user_id, mission_id, event_type, title, description) select user_id, target_mission_id, 'member_completed', 'Team Member Completed', 'A team member completed the Work Team mission.' from public.mission_members where mission_id = target_mission_id and user_id <> auth.uid();
  end if;
  return jsonb_build_object('mission_id', target_mission_id, 'completed', all_completed);
end;
$$;

create or replace function public.sync_work_team_mission(target_mission_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  target_mission public.missions;
begin
  select * into target_mission from public.missions where id = target_mission_id for update;
  if not found then return; end if;
  if not exists (select 1 from public.mission_members where mission_id = target_mission_id and user_id = auth.uid()) then
    raise exception 'Mission access denied';
  end if;
  if target_mission.status = 'upcoming' and now() >= target_mission.start_time then
    update public.missions set status = 'in_progress' where id = target_mission_id;
    update public.mission_members set status = 'in_progress' where mission_id = target_mission_id and status = 'accepted';
    insert into public.mission_events (mission_id, event_type) values (target_mission_id, 'group_mission_started');
    insert into public.notifications (user_id, mission_id, event_type, title, description)
    select user_id, target_mission_id, 'group_mission_started', 'Group Mission Started', 'The Work Team mission has started.'
    from public.mission_members where mission_id = target_mission_id;
  end if;
  if target_mission.status in ('upcoming', 'in_progress') and now() >= target_mission.end_time then
    update public.mission_members set status = 'failed', failed_at = now(), payment_status = 'sent'
    where mission_id = target_mission_id and status not in ('completed', 'failed');
    update public.mission_members set payment_status = 'returned'
    where mission_id = target_mission_id and status = 'completed';
    update public.missions set status = case when exists (select 1 from public.mission_members where mission_id = target_mission_id and status = 'failed') then 'failed' else 'completed' end where id = target_mission_id;
    insert into public.mission_events (mission_id, event_type, payload) values (target_mission_id, 'member_failed', jsonb_build_object('at', now()));
    insert into public.notifications (user_id, mission_id, event_type, title, description)
    select user_id, target_mission_id, 'member_failed', 'Member Failed', 'A team member did not complete the Work Team mission before the end time.'
    from public.mission_members where mission_id = target_mission_id and status = 'failed';
    -- Real per-member Stripe release/capture happens in the API route right
    -- after this RPC returns, looping every member whose status just
    -- changed to completed/failed above.
  end if;
end;
$$;

notify pgrst, 'reload schema';
