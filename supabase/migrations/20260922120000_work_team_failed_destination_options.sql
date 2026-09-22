-- Work Team's creation form had no "if the mission fails" destination
-- picker at all (unlike GPS Check) -- it silently always used
-- 'return-to-friends' behind the scenes. Bringing the same picker to Work
-- Team means the RPC also needs to accept foundation/support recipients,
-- same as the plain missions insert already does for GPS/Photo AI.
drop function if exists public.create_work_team_mission(text, text, text, timestamptz, timestamptz, numeric, uuid[], text, jsonb);

create or replace function public.create_work_team_mission(
  mission_name text,
  mission_description text,
  mission_category text,
  mission_start timestamptz,
  mission_end timestamptz,
  mission_pledge numeric,
  invited_user_ids uuid[],
  failure_destination text default 'return-to-friends',
  invited_user_tasks jsonb default '{}'::jsonb,
  foundation_recipient text default null,
  support_recipient text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  new_mission_id uuid;
  invited_user uuid;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  if mission_start <= now() then raise exception 'Start time must be in the future'; end if;
  if mission_end <= mission_start then raise exception 'End time must be after start time'; end if;
  if coalesce(array_length(invited_user_ids, 1), 0) = 0 then raise exception 'At least one friend is required'; end if;

  insert into public.missions (creator_id, mission_type, name, description, category, start_time, end_time, pledge_amount, failed_destination, foundation_recipient, support_recipient)
  values (auth.uid(), 'work_team', mission_name, mission_description, mission_category, mission_start, mission_end, mission_pledge, failure_destination, foundation_recipient, support_recipient)
  returning id into new_mission_id;

  insert into public.mission_members (mission_id, user_id, role, status, payment_status, responded_at)
  values (new_mission_id, auth.uid(), 'creator', 'accepted', 'pending', now());

  foreach invited_user in array invited_user_ids loop
    if invited_user <> auth.uid() and public.are_friends(auth.uid(), invited_user) then
      insert into public.mission_members (mission_id, user_id, assigned_task)
      values (new_mission_id, invited_user, nullif(invited_user_tasks ->> invited_user::text, ''))
      on conflict do nothing;
    end if;
  end loop;

  if not exists (select 1 from public.mission_members where mission_id = new_mission_id and role = 'member') then
    raise exception 'No valid friends were selected';
  end if;

  insert into public.mission_events (mission_id, user_id, event_type, payload)
  values (new_mission_id, auth.uid(), 'group_invitation', jsonb_build_object('mission_name', mission_name));

  insert into public.notifications (user_id, mission_id, event_type, title, description, payload, action)
  select user_id, new_mission_id, 'group_invitation', 'Group Mission Invitation',
    'You have been invited to join ' || mission_name || '.',
    jsonb_build_object('mission_name', mission_name, 'creator_id', auth.uid(), 'start_time', mission_start, 'end_time', mission_end, 'duration_minutes', extract(epoch from (mission_end - mission_start)) / 60, 'pledge_amount', mission_pledge), 'respond'
  from public.mission_members where mission_id = new_mission_id and role = 'member';

  return new_mission_id;
end;
$$;

grant execute on function public.create_work_team_mission(text, text, text, timestamptz, timestamptz, numeric, uuid[], text, jsonb, text, text) to authenticated;

notify pgrst, 'reload schema';
