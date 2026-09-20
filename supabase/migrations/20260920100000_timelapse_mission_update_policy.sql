drop policy if exists "Creators update own missions" on public.missions;
create policy "Creators update own missions"
on public.missions
for update
to authenticated
using (creator_id = auth.uid())
with check (creator_id = auth.uid());
