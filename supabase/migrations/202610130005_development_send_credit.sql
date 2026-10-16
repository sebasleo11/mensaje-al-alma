begin;
-- Independent of calendar 004: apply only after 001–003. No allocation here.
create table public.message_development_credits (
 grant_key text primary key check(grant_key='sebastian-development-50-v1'),
 user_id uuid not null references auth.users(id),
 amount integer not null check(amount=50),
 reason text not null check(reason='manual_development'),
 created_at timestamptz not null default now()
);
alter table public.message_development_credits enable row level security;
revoke all on public.message_development_credits from public,anon,authenticated,service_role;
-- Allocation is administrative SQL only; application credentials cannot grant credits.
create or replace function public.message_quota_limit(p_user uuid) returns bigint language sql stable security definer set search_path='' as $$
 select 3::bigint+coalesce(sum(amount),0) from public.message_development_credits where user_id=p_user;
$$;
revoke all on function public.message_quota_limit(uuid) from public,anon,authenticated,service_role;

-- Same authorization identity as the verified session, never a client-supplied UUID.
create function public.get_message_quota() returns jsonb language plpgsql security definer set search_path='' as $$
declare uid uuid=auth.uid(); budget bigint; occupied bigint;
begin
 if uid is null then raise exception 'authentication required' using errcode='42501'; end if;
 budget=public.message_quota_limit(uid);
 if to_regclass('public.message_schedules') is null then
  select count(*) into occupied from public.message_send_attempts where user_id=uid and state<>'failed';
 else
  execute 'select (select count(*) from public.message_send_attempts where user_id=$1 and state<>''failed'')+(select count(*) from public.message_schedules where user_id=$1 and state in (''scheduled'',''blocked''))' into occupied using uid;
 end if;
 return jsonb_build_object('limit',budget,'additional',budget-3,'used',occupied,'remaining',greatest(0,budget-occupied));
end; $$;
revoke all on function public.get_message_quota() from public,anon,authenticated,service_role;
grant execute on function public.get_message_quota() to authenticated;

-- Preserve existing function bodies, validations, snapshot and locks. Replace only
-- the hardcoded threshold. Fail atomically on an unexpected definition.
do $$
declare signature text; source text;
begin
 foreach signature in array array[
  'public.reserve_message_send(uuid,uuid,text,text,timestamp with time zone)',
  'public.reserve_message_send_internal(uuid,uuid,text,text,timestamp with time zone,uuid)',
  'public.change_message_schedule(uuid,uuid,uuid,text,timestamp with time zone,bigint,timestamp with time zone,text,timestamp without time zone,smallint)'
 ] loop
  if to_regprocedure(signature) is null then
   if signature like 'public.reserve_message_send(%' then raise exception 'required send function missing'; end if;
   continue;
  end if;
  source=pg_get_functiondef(to_regprocedure(signature));
  if strpos(source,'>=3 then')>0 then
   execute replace(source,'>=3 then','>=public.message_quota_limit(p_user) then');
  elsif strpos(source,'public.message_quota_limit(p_user)')=0 and strpos(source,'select public.reserve_message_send_internal(')=0 then
   raise exception 'unexpected quota definition: %',signature;
  end if;
 end loop;
end; $$;
commit;
