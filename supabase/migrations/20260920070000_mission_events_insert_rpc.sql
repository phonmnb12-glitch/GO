create or replace function public.record_mission_event(
  target_mission_id uuid,
  target_event_type text,
  target_payload jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  created_event_id uuid;
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;

  if not exists (
    select 1
    from public.missions
    where id = target_mission_id
      and (
        creator_id = auth.uid()
        or exists (
          select 1
          from public.mission_members
          where mission_id = target_mission_id
            and user_id = auth.uid()
            and status in ('accepted', 'in_progress', 'completed', 'failed')
        )
      )
  ) then
    raise exception 'Mission event access denied';
  end if;

  insert into public.mission_events (mission_id, user_id, event_type, payload)
  values (target_mission_id, auth.uid(), target_event_type, coalesce(target_payload, '{}'::jsonb))
  returning id into created_event_id;

  return created_event_id;
end;
$$;

grant execute on function public.record_mission_event(uuid, text, jsonb) to authenticated;

notify pgrst, 'reload schema';
