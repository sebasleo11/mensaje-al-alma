-- Depends on 202610190006_payment_orders.sql.
-- Only quota calculation changes here. Reservations, attempts, schedules and
-- the executor keep their existing definitions and continue calling this RPC.
begin;

create or replace function public.message_quota_limit(p_user uuid)
returns bigint
language sql stable security definer set search_path=''
as $$
  select 3::bigint
    + coalesce((
        select sum(amount)::bigint
        from public.message_development_credits
        where user_id=p_user
      ), 0)
    + coalesce((
        select sum(amount)::bigint
        from public.message_credit_grants
        where user_id=p_user and status='active'
      ), 0);
$$;

revoke all on function public.message_quota_limit(uuid) from public, anon, authenticated, service_role;

create or replace function public.get_message_quota()
returns jsonb
language plpgsql security definer set search_path=''
as $$
declare
  uid uuid=auth.uid();
  budget bigint;
  occupied bigint;
begin
  if uid is null then
    raise exception 'authentication required' using errcode='42501';
  end if;
  budget=public.message_quota_limit(uid);
  if to_regclass('public.message_schedules') is null then
    select count(*) into occupied
    from public.message_send_attempts
    where user_id=uid and state<>'failed';
  else
    execute 'select (select count(*) from public.message_send_attempts where user_id=$1 and state<>''failed'')+(select count(*) from public.message_schedules where user_id=$1 and state in (''scheduled'',''blocked''))'
      into occupied using uid;
  end if;
  return jsonb_build_object(
    'limit',budget,
    'additional',budget-3,
    'used',occupied,
    'remaining',greatest(0,budget-occupied)
  );
end;
$$;

revoke all on function public.get_message_quota() from public, anon, authenticated, service_role;
grant execute on function public.get_message_quota() to authenticated;

commit;
