-- sync_work_team_mission (called on every GET of a group mission, both Work
-- Team and Group GPS Check which shares this same route) was directly
-- flipping each stragglers's transactions.payment_status straight to 'Sent'
-- / 'Returned' by raw UPDATE the moment the mission's end_time passed --
-- with no actual Stripe capture/release call at all. That raced ahead of
-- the real resolution path (resolveGroupPledges -> captureMissionPledgeHold
-- / releaseMissionPledgeHold in lib/mission-payment.ts, called right after
-- this RPC in the same request): by the time it ran, it found the
-- transaction already out of the 'Authorized' state and silently treated it
-- as already resolved (result.resolved = false) -- which also meant
-- splitFailedPledgeAmongTeam, gated on captureMissionPledgeHold actually
-- resolving something, never ran. That's why a straggler timing out never
-- produced the "you got a share of the forfeited pledge" notification for
-- the teammate who finished. Dropping these two raw UPDATEs here lets the
-- real Stripe capture/release + the pledge-split notification run as
-- designed; the mission_members status flip and the existing
-- member_failed/money_sent/money_returned notifications (informational,
-- not the money-movement itself) are unaffected.
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
    insert into public.notifications (user_id, mission_id, event_type, title, description, payload)
    select user_id, target_mission_id, 'money_returned', 'Money Returned', 'Your pledge has been returned.', jsonb_build_object('amount', target_mission.pledge_amount)
    from public.mission_members where mission_id = target_mission_id and status = 'completed';
    insert into public.notifications (user_id, mission_id, event_type, title, description, payload)
    select user_id, target_mission_id, 'money_sent', 'Money Sent', 'Your pledge was sent according to the failed mission destination.', jsonb_build_object('amount', target_mission.pledge_amount, 'destination', target_mission.failed_destination)
    from public.mission_members where mission_id = target_mission_id and status = 'failed';
  end if;
end;
$$;

grant execute on function public.sync_work_team_mission(uuid) to authenticated;

notify pgrst, 'reload schema';
