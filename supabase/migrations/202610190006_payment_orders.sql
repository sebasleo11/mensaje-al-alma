-- Prepared locally only. Do not apply until the remote schema is reconciled and approved.
begin;

create table public.payment_orders (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  package_code text not null,
  credit_amount integer not null check (credit_amount > 0),
  amount numeric(12,2) not null check (amount > 0),
  currency text not null check (currency = 'ARS'),
  status text not null default 'pending' check (status in ('pending','approved','rejected','cancelled','refunded','charged_back')),
  external_reference text not null unique,
  idempotency_key text not null unique,
  mp_preference_id text unique,
  mp_payment_id text unique,
  mp_status text,
  mp_status_detail text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz
);

create index payment_orders_user_created_idx on public.payment_orders(user_id, created_at desc);
alter table public.payment_orders enable row level security;
revoke all on public.payment_orders from public, anon, authenticated;
grant select on public.payment_orders to authenticated;
grant select, insert, update on public.payment_orders to service_role;
create policy payment_orders_read_own on public.payment_orders
  for select to authenticated using ((select auth.uid()) = user_id);

create table public.message_credit_grants (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  source_type text not null check (source_type in ('mercado_pago')),
  source_id uuid not null references public.payment_orders(id) on delete restrict,
  amount integer not null check (amount > 0),
  status text not null default 'active' check (status in ('active','revoked')),
  created_at timestamptz not null default now(),
  unique (source_type, source_id)
);

alter table public.message_credit_grants enable row level security;
revoke all on public.message_credit_grants from public, anon, authenticated, service_role;

create or replace function public.reconcile_payment_order(
  p_external_reference text,
  p_package_code text,
  p_payment_id text,
  p_preference_id text,
  p_mp_status text,
  p_mp_status_detail text,
  p_status text,
  p_amount numeric,
  p_currency text
) returns public.payment_orders
language plpgsql security definer set search_path=''
as $$
declare o public.payment_orders;
begin
  if p_status not in ('pending','approved','rejected','cancelled','refunded','charged_back') then
    raise exception 'invalid payment status';
  end if;
  if nullif(btrim(p_external_reference), '') is null
     or nullif(btrim(p_package_code), '') is null
     or nullif(btrim(p_mp_status), '') is null
     or p_amount is null
     or nullif(btrim(p_currency), '') is null then
    raise exception 'incomplete payment reconciliation';
  end if;
  if p_status='approved'
     and (nullif(btrim(p_payment_id), '') is null
          or nullif(btrim(p_preference_id), '') is null) then
    raise exception 'approved payment requires identifiers';
  end if;
  select * into o from public.payment_orders where external_reference=p_external_reference for update;
  if not found then raise exception 'payment order missing'; end if;
  if o.package_code<>p_package_code then raise exception 'payment package mismatch'; end if;
  if o.amount<>p_amount or o.currency<>p_currency then raise exception 'payment amount mismatch'; end if;
  if o.mp_payment_id is not null and o.mp_payment_id<>p_payment_id then raise exception 'payment mismatch'; end if;
  if p_preference_id is not null
     and (o.mp_preference_id is null or o.mp_preference_id<>p_preference_id) then
    raise exception 'preference mismatch';
  end if;
  if o.status<>p_status and not (
    (o.status='pending' and p_status in ('approved','rejected','cancelled'))
    or (o.status='approved' and p_status in ('refunded','charged_back'))
  ) then
    raise exception 'invalid payment state transition';
  end if;

  update public.payment_orders
    set mp_payment_id=coalesce(mp_payment_id,p_payment_id), mp_status=p_mp_status,
        mp_status_detail=p_mp_status_detail, status=p_status, updated_at=now()
    where id=o.id;

  -- Refunds and chargebacks do not revoke credits automatically. A separate,
  -- explicitly approved reversal policy is required before changing a grant.
  if p_status='approved' and not exists(
    select 1 from public.message_credit_grants where source_type='mercado_pago' and source_id=o.id
  ) then
    insert into public.message_credit_grants(user_id,source_type,source_id,amount)
      values(o.user_id,'mercado_pago',o.id,o.credit_amount);
    update public.payment_orders set approved_at=coalesce(approved_at,now()), updated_at=now() where id=o.id;
  end if;
  select * into o from public.payment_orders where id=o.id;
  return o;
end;
$$;

revoke all on function public.reconcile_payment_order(text,text,text,text,text,text,text,numeric,text) from public, anon, authenticated, service_role;
grant execute on function public.reconcile_payment_order(text,text,text,text,text,text,text,numeric,text) to service_role;

commit;
