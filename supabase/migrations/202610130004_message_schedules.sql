begin;
-- Prepared locally only. Requires migrations 001–003; no extension or job creation.
create table public.message_schedules (
 id uuid primary key, message_id uuid not null references public.messages(id) on delete cascade,
 user_id uuid not null references auth.users(id), scheduled_at timestamptz not null,
 time_zone text not null, local_datetime timestamp not null, utc_offset_minutes smallint not null,
 message_updated_at timestamptz not null, asset_id uuid references public.message_assets(id),
 confirmation jsonb not null, version bigint not null default 1 check(version>0),
 state text not null default 'scheduled' check(state in ('scheduled','blocked','dispatching','finished','cancelled')),
 attempt_id uuid unique references public.message_send_attempts(id), started_at timestamptz, cancelled_at timestamptz,
 created_at timestamptz not null default now(), updated_at timestamptz not null default now(), last_error_code text,
 check ((state in ('dispatching','finished')) = (attempt_id is not null and started_at is not null)),
 check ((state='cancelled') = (cancelled_at is not null)),
 check (state in ('dispatching','finished') or (attempt_id is null and started_at is null))
);
create unique index one_active_message_schedule on public.message_schedules(message_id) where state in ('scheduled','blocked','dispatching');
create index pending_message_schedules on public.message_schedules(scheduled_at,id) where state='scheduled';
alter table public.message_schedules enable row level security;
revoke all on public.message_schedules from public,anon,authenticated;
grant select on public.message_schedules to authenticated;
grant all on public.message_schedules to service_role;
create policy schedule_read_own on public.message_schedules for select to authenticated using(user_id=(select auth.uid()));

create or replace function public.message_locked(p_id uuid) returns boolean language sql volatile security definer set search_path='' as $$
 select exists(
  select 1 from public.messages m where m.id=p_id
  and (auth.role()='service_role' or m.user_id=auth.uid())
  and (
   exists(select 1 from public.message_send_attempts where message_id=m.id and state<>'failed')
   or exists(select 1 from public.message_schedules where message_id=m.id and state in ('scheduled','blocked','dispatching'))
  )
 );
$$;
-- Row UPDATE/DELETE already owns the message lock. VOLATILE reads obtain a fresh
-- snapshot after waiting on that lock; do not rely solely on RLS's earlier snapshot.
create or replace function public.guard_message() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then
  if public.message_locked(old.id) then raise exception 'message locked' using errcode='42501'; end if;
  return old;
 end if;
 if new.id<>old.id or new.user_id<>old.user_id or new.created_at<>old.created_at then raise exception 'immutable identity' using errcode='42501'; end if;
 if (new.recipient_email,new.content_body,new.content_type,new.archived_at) is distinct from (old.recipient_email,old.content_body,old.content_type,old.archived_at) and public.message_locked(old.id) then raise exception 'message locked' using errcode='42501'; end if;
 if auth.role()<>'service_role' and (old.status<>'draft' or new.status<>'draft' or public.message_locked(old.id)) then raise exception 'message locked' using errcode='42501'; end if;
 new.updated_at=now(); return new;
end; $$;
create trigger guard_message_delete before delete on public.messages for each row execute function public.guard_message();

-- Keep a previously assigned development allowance when 004 is applied later.
-- Without independent credit migration 005, retain the original three free sends.
do $$ begin
 if to_regprocedure('public.message_quota_limit(uuid)') is null then
  execute 'create function public.message_quota_limit(p_user uuid) returns bigint language sql stable security definer set search_path='''' as $body$ select 3::bigint; $body$';
  execute 'revoke all on function public.message_quota_limit(uuid) from public,anon,authenticated,service_role';
 end if;
end; $$;

-- Shared locks for all scheduling RPCs, immediate reservation and finishing.
create function public.lock_schedule_message(p_user uuid,p_message uuid) returns public.messages language plpgsql security definer set search_path='' as $$
declare m public.messages;
begin
 insert into public.message_send_accounts(user_id) values(p_user) on conflict do nothing;
 perform 1 from public.message_send_accounts where user_id=p_user for update;
 select * into m from public.messages where id=p_message and user_id=p_user for update;
 if not found then raise exception 'message unavailable' using errcode='42501'; end if;
 return m;
end; $$;
create function public.change_message_schedule(p_user uuid,p_message uuid,p_id uuid,p_action text,p_expected timestamptz,p_version bigint,p_at timestamptz,p_zone text,p_local timestamp,p_offset smallint) returns public.message_schedules language plpgsql security definer set search_path='' as $$
declare m public.messages; s public.message_schedules; a public.message_assets; fingerprint jsonb;
begin
 m=public.lock_schedule_message(p_user,p_message);
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then raise exception 'email unconfirmed' using errcode='42501'; end if;
 select * into s from public.message_schedules where id=p_id for update;
 if found and (s.user_id<>p_user or s.message_id<>p_message) then raise exception 'schedule unavailable' using errcode='42501'; end if;
 if p_action='confirm' then
  fingerprint=jsonb_build_object('expected',p_expected,'at',p_at,'zone',p_zone,'local',p_local,'offset',p_offset);
  if s.id is not null then
   if s.confirmation<>fingerprint then raise exception 'confirmation conflict' using errcode='40001'; end if;
   return s;
  end if;
  if m.status<>'draft' or m.archived_at is not null or public.message_locked(m.id) then raise exception 'message locked'; end if;
  if p_expected is null or m.updated_at<>p_expected then raise exception 'message changed' using errcode='40001'; end if;
  if length(m.content_body)>5000 or (m.content_type='text' and length(btrim(m.content_body))=0) then raise exception 'invalid content'; end if;
  if (select count(*) from public.message_send_attempts where user_id=p_user and state<>'failed')+(select count(*) from public.message_schedules where user_id=p_user and state in ('scheduled','blocked'))>=public.message_quota_limit(p_user) then raise exception 'free quota used'; end if;
  if m.content_type<>'text' then
   select * into a from public.message_assets where message_id=m.id and user_id=p_user and state='ready' and removed_at is null order by created_at desc limit 1 for update;
   if not found or ((m.content_type='photo' and a.mime like 'image/%') or (m.content_type='audio' and a.mime like 'audio/%') or (m.content_type='video' and a.mime like 'video/%')) is not true then raise exception 'media unavailable'; end if;
   if m.content_type in ('audio','video') and (a.duration is null or a.duration<=0 or a.duration>case when m.content_type='audio' then 120 else 45 end) then raise exception 'media unavailable'; end if;
  end if;
 elsif p_action in ('reschedule','cancel') then
  if s.id is null then raise exception 'schedule unavailable'; end if;
  if p_action='cancel' and s.state='cancelled' and p_version=s.version-1 then return s; end if;
  if p_version is null or s.version<>p_version then raise exception 'schedule changed' using errcode='40001'; end if;
  if s.state not in ('scheduled','blocked') then raise exception 'schedule started'; end if;
  if p_action='cancel' then
   update public.message_schedules set state='cancelled',cancelled_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where id=s.id returning * into s;
   return s;
  end if;
 else raise exception 'invalid action'; end if;
 -- UTC and reviewed local intent must agree; ambiguous hours require explicit offset.
 if p_at is null or not isfinite(p_at) or p_at<clock_timestamp()+interval '5 minutes' then raise exception 'minimum advance'; end if;
 if p_zone is null or not exists(select 1 from pg_catalog.pg_timezone_names where name=p_zone) or p_local is null or p_offset is null then raise exception 'invalid time zone'; end if;
 if (p_at at time zone p_zone)<>p_local or (p_at at time zone 'UTC')<>p_local-make_interval(mins=>p_offset::int) then raise exception 'invalid local time'; end if;
 if p_action='confirm' then
  insert into public.message_schedules(id,message_id,user_id,scheduled_at,time_zone,local_datetime,utc_offset_minutes,message_updated_at,asset_id,confirmation) values(p_id,m.id,p_user,p_at,p_zone,p_local,p_offset,m.updated_at,a.id,fingerprint) returning * into s;
 else
  update public.message_schedules set scheduled_at=p_at,time_zone=p_zone,local_datetime=p_local,utc_offset_minutes=p_offset,state='scheduled',last_error_code=null,version=version+1,updated_at=clock_timestamp() where id=s.id returning * into s;
 end if;
 return s;
end; $$;
create or replace function public.reserve_message_send_internal(p_user uuid,p_message uuid,p_sender text,p_app_url text,p_expected timestamptz,p_schedule uuid) returns public.message_send_attempts language plpgsql security definer set search_path='' as $$
declare m public.messages; a public.message_send_attempts; media public.message_assets;
begin
 insert into public.message_send_accounts(user_id) values(p_user) on conflict do nothing;
 perform 1 from public.message_send_accounts where user_id=p_user for update;
 select * into m from public.messages where id=p_message and user_id=p_user for update;
 if not found then raise exception 'message unavailable' using errcode='P0002'; end if;
 if exists(select 1 from public.message_schedules where message_id=m.id and state in ('scheduled','blocked','dispatching') and id is distinct from p_schedule) then raise exception 'message scheduled'; end if;
 if p_schedule is not null and not exists(select 1 from public.message_schedules where id=p_schedule and message_id=m.id and user_id=p_user and state='scheduled' and attempt_id is null) then raise exception 'invalid transfer'; end if;
 select * into a from public.message_send_attempts where message_id=m.id and state<>'failed' order by created_at desc limit 1;
 if found then return a; end if;
 if m.status<>'draft' or m.archived_at is not null then raise exception 'message not draft'; end if;
 if p_expected is null or m.updated_at<>p_expected then raise exception 'message changed' using errcode='40001'; end if;
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then raise exception 'email unconfirmed' using errcode='42501'; end if;
 if length(m.content_body)>5000 or (m.content_type='text' and length(btrim(m.content_body))=0) then raise exception 'invalid content'; end if;
 if (select count(*) from public.message_send_attempts where user_id=p_user and state<>'failed')+(select count(*) from public.message_schedules where user_id=p_user and state in ('scheduled','blocked') and id is distinct from p_schedule)>=public.message_quota_limit(p_user) then raise exception 'free quota used' using errcode='P0001'; end if;
 if m.content_type<>'text' then
  select * into media from public.message_assets where message_id=m.id and user_id=p_user and state='ready' order by created_at desc limit 1 for update;
  if not found then raise exception 'media unavailable'; end if;
  if m.content_type in ('audio','video') and (media.duration is null or media.duration<=0 or media.duration>case when m.content_type='audio' then 120 else 45 end) then raise exception 'media unavailable'; end if;
  if ((m.content_type='photo' and media.mime like 'image/%') or (m.content_type='audio' and media.mime like 'audio/%') or (m.content_type='video' and media.mime like 'video/%')) is not true then raise exception 'media unavailable'; end if;
 end if;
 insert into public.message_send_attempts(message_id,user_id,recipient_email,content_type,content_body,asset_id,sender,app_url)
 values(m.id,p_user,m.recipient_email,m.content_type,m.content_body,media.id,p_sender,p_app_url) returning * into a;
 return a;
end; $$;
create or replace function public.reserve_message_send(p_user uuid,p_message uuid,p_sender text,p_app_url text,p_expected timestamptz) returns public.message_send_attempts language sql security definer set search_path='' as $$
 select public.reserve_message_send_internal(p_user,p_message,p_sender,p_app_url,p_expected,null);
$$;
create function public.begin_message_schedule(p_user uuid,p_message uuid,p_id uuid,p_version bigint,p_sender text,p_app_url text) returns public.message_send_attempts language plpgsql security definer set search_path='' as $$
declare m public.messages; s public.message_schedules; a public.message_send_attempts;
begin
 m=public.lock_schedule_message(p_user,p_message);
 select * into s from public.message_schedules where id=p_id and user_id=p_user and message_id=p_message for update;
 if not found then raise exception 'schedule unavailable'; end if;
 if p_version is null or s.version<>p_version then raise exception 'schedule changed' using errcode='40001'; end if;
 if s.state='dispatching' then select * into a from public.message_send_attempts where id=s.attempt_id; return a; end if;
 if s.state<>'scheduled' then raise exception 'schedule not pending'; end if;
 if s.scheduled_at>clock_timestamp() then raise exception 'schedule not due'; end if;
 if clock_timestamp()-s.scheduled_at>interval '15 minutes' then
  update public.message_schedules set state='blocked',last_error_code='overdue',version=version+1,updated_at=clock_timestamp() where id=s.id;
  return null;
 end if;
 if m.updated_at<>s.message_updated_at then raise exception 'message changed'; end if;
 if m.content_type<>'text' and s.asset_id is distinct from (select id from public.message_assets where message_id=m.id and state='ready' and removed_at is null order by created_at desc limit 1) then raise exception 'media changed'; end if;
 a=public.reserve_message_send_internal(p_user,p_message,p_sender,p_app_url,s.message_updated_at,s.id);
 -- No externally visible intermediate state: reservation transfer and attempt commit together.
 update public.message_schedules set state='dispatching',attempt_id=a.id,started_at=clock_timestamp(),version=version+1,updated_at=clock_timestamp() where id=s.id;
 return a;
end; $$;
create or replace function public.finish_message_send(p_attempt uuid,p_state text,p_provider text default null) returns void language plpgsql security definer set search_path='' as $$
declare a public.message_send_attempts;
begin
 if p_state not in ('accepted','uncertain','failed','delivered','bounced') then raise exception 'invalid state'; end if;
 select * into a from public.message_send_attempts where id=p_attempt;
 if not found then raise exception 'attempt missing'; end if;
 perform public.lock_schedule_message(a.user_id,a.message_id);
 perform 1 from public.message_schedules where attempt_id=p_attempt for update;
 select * into a from public.message_send_attempts where id=p_attempt for update;
 if not found then raise exception 'attempt missing'; end if;
 -- A late failure cannot undo evidence that the provider accepted a message.
 if a.state in ('accepted','delivered','bounced') and p_state in ('uncertain','failed') then return; end if;
 if a.state in ('delivered','bounced') and p_state='accepted' then return; end if;
 if a.provider_id is not null and p_provider is not null and a.provider_id<>p_provider then raise exception 'provider mismatch'; end if;
 update public.message_send_attempts set state=p_state,provider_id=coalesce(provider_id,p_provider),lease_until=null,updated_at=now() where id=a.id;
 if p_state in ('accepted','delivered','bounced','failed') then update public.message_schedules set state='finished',version=version+1,updated_at=clock_timestamp() where attempt_id=p_attempt and state='dispatching'; end if;
 if p_state in ('accepted','delivered','bounced') then update public.messages set status='sent' where id=a.message_id; end if;
end; $$;
create or replace function public.mark_asset_cleanup(p_user uuid,p_asset uuid,p_expired_only boolean default false) returns text language plpgsql security definer set search_path='' as $$
declare a public.message_assets; m public.messages;
begin
 select m0.* into m from public.messages m0 join public.message_assets a0 on a0.message_id=m0.id where a0.id=p_asset and a0.user_id=p_user for update of m0;
 if not found then return null; end if;
 select * into a from public.message_assets where id=p_asset and user_id=p_user for update;
 if exists(select 1 from public.message_schedules where message_id=m.id and state in ('scheduled','blocked','dispatching')) then return null; end if;
 if exists(select 1 from public.message_send_attempts where asset_id=a.id and state<>'failed') then return null; end if;
 if not p_expired_only and (m.status<>'draft' or m.archived_at is not null or public.message_locked(m.id)) then return null; end if;
 if p_expired_only and a.state='pending' and a.created_at>now()-interval '24 hours' then return null; end if;
 if p_expired_only and a.state='ready' and a.id=(select id from public.message_assets where message_id=m.id and state='ready' order by created_at desc limit 1) then return null; end if;
 update public.message_assets set state='deleting' where id=a.id;
 if not p_expired_only then update public.messages set updated_at=now() where id=m.id; end if;
 return a.path;
end; $$;
create function public.guard_scheduled_asset() returns trigger language plpgsql security definer set search_path='' as $$
declare mid uuid;
begin
 if TG_OP='INSERT' then mid=new.message_id; else mid=old.message_id; end if;
 -- RPCs already hold this lock. Direct asset writes must fail rather than invert
 -- message -> asset order while a scheduler transaction owns the message.
 perform 1 from public.messages where id=mid for update nowait;
 -- Cleanup crosses a Storage HTTP call after marking 'deleting'. A later
 -- schedule may protect another ready asset; permit only its unreferenced
 -- deleting predecessor's tombstone, never content/state/path changes.
 if TG_OP='UPDATE' then
  if old.state='deleting' and new.removed_at is not null
   and (to_jsonb(new)-'removed_at')=(to_jsonb(old)-'removed_at')
   and not exists(select 1 from public.message_schedules where asset_id=old.id and state in ('scheduled','blocked','dispatching'))
   and not exists(select 1 from public.message_send_attempts where asset_id=old.id and state<>'failed') then
   return new;
  end if;
 end if;
 if exists(select 1 from public.message_schedules where message_id=mid and state in ('scheduled','blocked','dispatching')) then raise exception 'message scheduled' using errcode='42501'; end if;
 if TG_OP='DELETE' then return old; end if;
 if TG_OP='UPDATE' and (new.id,new.message_id,new.user_id,new.path) is distinct from (old.id,old.message_id,old.user_id,old.path) then raise exception 'immutable asset' using errcode='42501'; end if;
 return new;
end; $$;
create trigger guard_scheduled_asset before insert or update or delete on public.message_assets for each row execute function public.guard_scheduled_asset();
revoke all on function public.lock_schedule_message(uuid,uuid),public.reserve_message_send_internal(uuid,uuid,text,text,timestamptz,uuid),public.change_message_schedule(uuid,uuid,uuid,text,timestamptz,bigint,timestamptz,text,timestamp,smallint),public.begin_message_schedule(uuid,uuid,uuid,bigint,text,text) from public,anon,authenticated,service_role;
grant execute on function public.change_message_schedule(uuid,uuid,uuid,text,timestamptz,bigint,timestamptz,text,timestamp,smallint),public.begin_message_schedule(uuid,uuid,uuid,bigint,text,text) to service_role;
create or replace function public.orphan_message_assets() returns table(id uuid,user_id uuid) language sql security definer set search_path='' as $$
 select a.id,a.user_id from public.message_assets a
 where a.removed_at is null
 and not exists(select 1 from public.message_schedules s where s.message_id=a.message_id and s.state in ('scheduled','blocked','dispatching'))
 and not exists(select 1 from public.message_send_attempts s where s.asset_id=a.id and s.state<>'failed')
 and (a.state='deleting' or (a.state='pending' and a.created_at<now()-interval '24 hours') or
 (a.state='ready' and a.id<>(select b.id from public.message_assets b where b.message_id=a.message_id and b.state='ready' order by b.created_at desc limit 1)))
 order by a.created_at limit 100;
$$;
commit;
