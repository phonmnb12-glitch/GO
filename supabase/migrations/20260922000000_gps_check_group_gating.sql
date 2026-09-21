-- Group GPS Check had no "everyone must accept before it starts" gate at
-- all: /api/missions POST already created real mission_members rows
-- (creator accepted, invitees pending) but set the mission's own status to
-- "upcoming" immediately, so the creator's own GPS check-in effect started
-- running the moment start_time arrived regardless of whether anyone else
-- had responded. Work Team already solves this exact problem generically
-- (waiting_for_members -> respond_work_team_invitation -> upcoming, only
-- once every invite is accepted), and its RPCs never check mission_type, so
-- they're reused as-is here. The one missing piece is per-member outcome
-- tracking for GPS Check specifically, since a group check-in should mark
-- just that member -- not stomp the whole mission's status the way the
-- solo flow's direct PATCH does.
create or replace function public.complete_gps_check_group_member(
  target_mission_id uuid,
  outcome text,
  check_in_latitude double precision default null,
  check_in_longitude double precision default null,
  check_in_distance double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  target_mission public.missions;
  all_resolved boolean;
begin
  if outcome not in ('completed', 'failed') then raise exception 'Invalid outcome'; end if;
  select * into target_mission from public.missions where id = target_mission_id for update;
  if not found or not exists (select 1 from public.mission_members where mission_id = target_mission_id and user_id = auth.uid()) then
    raise exception 'Mission access denied';
  end if;
  if target_mission.status = 'waiting_for_members' then raise exception 'Mission has not started -- not everyone has accepted yet'; end if;

  update public.mission_members
  set status = outcome,
      completed_at = case when outcome = 'completed' then now() else completed_at end,
      failed_at = case when outcome = 'failed' then now() else failed_at end
  where mission_id = target_mission_id and user_id = auth.uid() and status in ('accepted', 'in_progress');

  insert into public.mission_events (mission_id, user_id, event_type, payload)
  values (
    target_mission_id, auth.uid(), 'gps_check_in',
    jsonb_build_object('outcome', outcome, 'latitude', check_in_latitude, 'longitude', check_in_longitude, 'distance', check_in_distance, 'at', now())
  );

  select not exists (
    select 1 from public.mission_members where mission_id = target_mission_id and status not in ('completed', 'failed', 'declined')
  ) into all_resolved;

  if all_resolved then
    update public.missions set status = case
      when exists (select 1 from public.mission_members where mission_id = target_mission_id and status = 'failed') then 'failed'
      else 'completed'
    end where id = target_mission_id;
    insert into public.notifications (user_id, mission_id, event_type, title, description)
    select user_id, target_mission_id, 'group_mission_completed', 'Group Mission Finished', 'Everyone has checked in.'
    from public.mission_members where mission_id = target_mission_id;
  end if;

  return jsonb_build_object('mission_id', target_mission_id, 'outcome', outcome, 'all_resolved', all_resolved);
end;
$$;

grant execute on function public.complete_gps_check_group_member(uuid, text, double precision, double precision, double precision) to authenticated;

notify pgrst, 'reload schema';
