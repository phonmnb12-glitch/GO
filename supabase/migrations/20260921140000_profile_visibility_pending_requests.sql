-- Friend-request senders were invisible ("ผู้ใช้ไม่ระบุชื่อ") to the
-- recipient because the profiles SELECT policy only allowed viewing a
-- profile once are_friends() returned true, which requires status =
-- 'accepted'. That made it impossible to see who sent a request before
-- deciding whether to accept it. This adds visibility for a pending
-- friendship in either direction, on top of the existing self/accepted
-- cases -- nothing existing is removed.
drop policy if exists "Users view authorized profiles" on public.profiles;
create policy "Users view authorized profiles" on public.profiles for select to authenticated
using (
  user_id = auth.uid()
  or public.are_friends(auth.uid(), user_id)
  or exists (
    select 1 from public.friendships f
    where f.status = 'pending'
      and (
        (f.user_id = auth.uid() and f.friend_id = profiles.user_id)
        or (f.user_id = profiles.user_id and f.friend_id = auth.uid())
      )
  )
);
