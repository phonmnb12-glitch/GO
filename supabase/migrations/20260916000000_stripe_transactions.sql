alter table public.profiles
  add column if not exists stripe_customer_id text unique;

create table if not exists public.transactions (
  transaction_id text primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  mission_id text not null,
  stripe_customer_id text not null,
  stripe_payment_intent_id text,
  amount numeric(12, 2) not null,
  currency text not null default 'THB',
  payment_status text not null default 'Pending',
  created_at timestamptz not null default now()
);

create index if not exists transactions_user_id_idx on public.transactions(user_id);
create index if not exists transactions_mission_id_idx on public.transactions(mission_id);
create index if not exists transactions_stripe_payment_intent_id_idx on public.transactions(stripe_payment_intent_id);

alter table public.transactions enable row level security;

drop policy if exists "Users can insert their own transactions" on public.transactions;
create policy "Users can insert their own transactions"
  on public.transactions for insert
  to authenticated
  with check (auth.uid() = user_id);

drop policy if exists "Users can view their own transactions" on public.transactions;
create policy "Users can view their own transactions"
  on public.transactions for select
  to authenticated
  using (auth.uid() = user_id);

drop policy if exists "Users can update their own transactions" on public.transactions;
create policy "Users can update their own transactions"
  on public.transactions for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);