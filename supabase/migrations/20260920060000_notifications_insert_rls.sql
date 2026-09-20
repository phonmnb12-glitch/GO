alter table public.notifications enable row level security;

drop policy if exists "Users insert own notifications" on public.notifications;
create policy "Users insert own notifications"
  on public.notifications for insert
  to authenticated
  with check (user_id = auth.uid());

notify pgrst, 'reload schema';
