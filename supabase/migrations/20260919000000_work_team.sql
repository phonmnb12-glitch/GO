create extension if not exists pgcrypto;

alter table public.transactions
  alter column stripe_customer_id drop not null;
alter table public.transactions
  alter column amount drop not null;

create table if not exists public.friendships (
  user_id uuid not null references auth.users(id) on delete cascade,
  friend_id uuid not null references auth.users(id) on delete cascade,
  status text not null default 'accepted' check (status in ('pending', 'accepted', 'declined')),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  primary key (user_id, friend_id),
  check (user_id <> friend_id)
);

create index if not exists friendships_friend_id_idx on public.friendships(friend_id);

create table if not exists public.missions (
  id uuid primary key default gen_random_uuid(),
  creator_id uuid not null references auth.users(id) on delete cascade,
  mission_type text not null default 'work_team' check (mission_type = 'work_team'),
  name text not null,
  description text not null default '',
  category text not null default 'Work Team',
  start_time timestamptz not null,
  end_time timestamptz not null,
  pledge_amount numeric(12, 2) not null check (pledge_amount >= 0),
  failed_destination text not null default 'return-to-friends',
  status text not null default 'waiting_for_members' check (status in ('waiting_for_members', 'upcoming', 'in_progress', 'completed', 'cancelled', 'failed')),
  created_at timestamptz not null default now(),
  check (end_time > start_time)
);

create index if not exists missions_creator_id_idx on public.missions(creator_id);
create index if not exists missions_status_idx on public.missions(status);

create table if not exists public.mission_members (
  mission_id uuid not null references public.missions(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'member' check (role in ('creator', 'member')),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'declined', 'in_progress', 'completed', 'failed')),
  payment_status text not null default 'pending' check (payment_status in ('pending', 'paid', 'returned', 'sent')),
  invited_at timestamptz not null default now(),
  responded_at timestamptz,
  completed_at timestamptz,
  failed_at timestamptz,
  primary key (mission_id, user_id)
);

create index if not exists mission_members_user_id_idx on public.mission_members(user_id);

create table if not exists public.mission_events (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.missions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists mission_events_mission_id_idx on public.mission_events(mission_id, created_at desc);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id uuid references public.missions(id) on delete cascade,
  event_type text not null,
  title text not null,
  description text not null,
  payload jsonb not null default '{}'::jsonb,
  action text,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists notifications_user_id_idx on public.notifications(user_id, created_at desc);
create index if not exists notifications_mission_id_idx on public.notifications(mission_id);

alter table public.friendships enable row level security;
alter table public.missions enable row level security;
alter table public.mission_members enable row level security;
alter table public.mission_events enable row level security;
alter table public.notifications enable row level security;

create or replace function public.is_work_team_member(target_mission_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.mission_members
    where mission_id = target_mission_id and user_id = auth.uid()
  );
$$;

create or replace function public.are_friends(first_user uuid, second_user uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.friendships
    where user_id = first_user and friend_id = second_user and status = 'accepted'
  ) or exists (
    select 1 from public.friendships
    where user_id = second_user and friend_id = first_user and status = 'accepted'
  );
$$;

alter table public.profiles enable row level security;
drop policy if exists "Users view authorized profiles" on public.profiles;
create policy "Users view authorized profiles" on public.profiles for select to authenticated
using (user_id = auth.uid() or public.are_friends(auth.uid(), user_id));

drop policy if exists "Users update own profile" on public.profiles;
create policy "Users update own profile" on public.profiles for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users view their friendships" on public.friendships;
create policy "Users view their friendships" on public.friendships for select to authenticated
using (auth.uid() = user_id or auth.uid() = friend_id);

drop policy if exists "Members view work team missions" on public.missions;
create policy "Members view work team missions" on public.missions for select to authenticated
using (creator_id = auth.uid() or public.is_work_team_member(id));

drop policy if exists "Creators insert work team missions" on public.missions;
create policy "Creators insert work team missions" on public.missions for insert to authenticated
with check (creator_id = auth.uid() and mission_type = 'work_team');

drop policy if exists "Members view mission members" on public.mission_members;
create policy "Members view mission members" on public.mission_members for select to authenticated
using (public.is_work_team_member(mission_id));

drop policy if exists "Creators insert mission members" on public.mission_members;
create policy "Creators insert mission members" on public.mission_members for insert to authenticated
with check (exists (select 1 from public.missions where id = mission_id and creator_id = auth.uid()));

drop policy if exists "Members update own mission member" on public.mission_members;
create policy "Members update own mission member" on public.mission_members for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Members view mission events" on public.mission_events;
create policy "Members view mission events" on public.mission_events for select to authenticated
using (public.is_work_team_member(mission_id));

drop policy if exists "Members view notifications" on public.notifications;
create policy "Members view notifications" on public.notifications for select to authenticated
using (user_id = auth.uid());

drop policy if exists "Members update notifications" on public.notifications;
create policy "Members update notifications" on public.notifications for update to authenticated
using (user_id = auth.uid()) with check (user_id = auth.uid());

drop policy if exists "Users view own work team transactions" on public.transactions;
create policy "Users view own work team transactions" on public.transactions for select to authenticated
using (auth.uid() = user_id);

create or replace function public.create_work_team_mission(
  mission_name text,
  mission_description text,
  mission_category text,
  mission_start timestamptz,
  mission_end timestamptz,
  mission_pledge numeric,
  invited_user_ids uuid[],
  failure_destination text default 'return-to-friends'
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
  if mission_end <= mission_start then raise exception 'End time must be after start time'; end if;
  if coalesce(array_length(invited_user_ids, 1), 0) = 0 then raise exception 'At least one friend is required'; end if;

  insert into public.missions (creator_id, name, description, category, start_time, end_time, pledge_amount, failed_destination)
  values (auth.uid(), mission_name, mission_description, mission_category, mission_start, mission_end, mission_pledge, failure_destination)
  returning id into new_mission_id;

  insert into public.mission_members (mission_id, user_id, role, status, payment_status, responded_at)
  values (new_mission_id, auth.uid(), 'creator', 'accepted', 'pending', now());

  foreach invited_user in array invited_user_ids loop
    if invited_user <> auth.uid() and public.are_friends(auth.uid(), invited_user) then
      insert into public.mission_members (mission_id, user_id)
      values (new_mission_id, invited_user)
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
  member_user uuid;
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
      update public.mission_members set payment_status = 'paid' where mission_id = target_mission_id and status = 'accepted';
      insert into public.transactions (transaction_id, user_id, mission_id, amount, currency, payment_status, created_at)
      select 'work_team_' || target_mission_id || '_' || user_id, user_id, target_mission_id::text, target_mission.pledge_amount, 'THB', 'Paid', now()
      from public.mission_members where mission_id = target_mission_id and status = 'accepted'
      on conflict (transaction_id) do nothing;
      insert into public.mission_events (mission_id, event_type, payload) values (target_mission_id, 'group_mission_ready', jsonb_build_object('pledge_amount', target_mission.pledge_amount));
      insert into public.notifications (user_id, mission_id, event_type, title, description, payload)
      select user_id, target_mission_id, 'group_mission_ready', 'Group Mission Ready', 'Everyone accepted the mission.', jsonb_build_object('pledge_amount', target_mission.pledge_amount)
      from public.mission_members where mission_id = target_mission_id;
      insert into public.notifications (user_id, mission_id, event_type, title, description, payload)
      select user_id, target_mission_id, 'pledge_deducted', 'Pledge Deducted', 'Your pledge has been deducted.', jsonb_build_object('amount', target_mission.pledge_amount)
      from public.mission_members where mission_id = target_mission_id and status = 'accepted';
    end if;
  end if;

  return jsonb_build_object('mission_id', target_mission_id, 'status', next_status);
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
    update public.mission_members set payment_status = 'returned' where mission_id = target_mission_id and status = 'completed';
    insert into public.notifications (user_id, mission_id, event_type, title, description) select user_id, target_mission_id, 'group_mission_completed', 'Group Mission Completed', 'Everyone completed the mission.' from public.mission_members where mission_id = target_mission_id;
    insert into public.notifications (user_id, mission_id, event_type, title, description, payload) select user_id, target_mission_id, 'money_returned', 'Money Returned', 'Your pledge has been returned.', jsonb_build_object('amount', target_mission.pledge_amount) from public.mission_members where mission_id = target_mission_id;
    update public.transactions set payment_status = 'Returned' where mission_id = target_mission_id::text;
  else
    insert into public.notifications (user_id, mission_id, event_type, title, description) select user_id, target_mission_id, 'member_completed', 'Team Member Completed', 'A team member completed the Work Team mission.' from public.mission_members where mission_id = target_mission_id and user_id <> auth.uid();
  end if;
  return jsonb_build_object('mission_id', target_mission_id, 'completed', all_completed);
end;
$$;

grant execute on function public.create_work_team_mission(text, text, text, timestamptz, timestamptz, numeric, uuid[], text) to authenticated;
grant execute on function public.respond_work_team_invitation(uuid, text) to authenticated;
grant execute on function public.complete_work_team_member(uuid) to authenticated;

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
    update public.transactions set payment_status = 'Sent' where mission_id = target_mission_id::text and user_id in (select user_id from public.mission_members where mission_id = target_mission_id and status = 'failed');
    update public.transactions set payment_status = 'Returned' where mission_id = target_mission_id::text and user_id in (select user_id from public.mission_members where mission_id = target_mission_id and status = 'completed');
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