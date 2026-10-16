begin;
alter table public.messages drop constraint messages_content_type_check;
alter table public.messages add constraint messages_content_type_check check (content_type in ('text','audio','video','photo'));
alter table public.messages add column archived_at timestamptz;
alter table public.messages add column updated_at timestamptz not null default now();

create table public.message_assets (
 id uuid primary key default gen_random_uuid(),
 message_id uuid not null references public.messages(id) on delete cascade,
 user_id uuid not null references auth.users(id),
 path text unique not null,
 mime text not null,
 bytes bigint not null check(bytes > 0 and bytes <= 20971520),
 duration numeric,
 state text not null default 'pending' check(state in ('pending','ready','deleting')),
 created_at timestamptz not null default now(),
 check(path like user_id::text || '/' || message_id::text || '/' || id::text || '.%')
);
create table public.message_send_accounts (
 user_id uuid primary key references auth.users(id),
 created_at timestamptz not null default now()
);
create table public.message_send_attempts (
 id uuid primary key default gen_random_uuid(),
 message_id uuid not null references public.messages(id),
 user_id uuid not null references auth.users(id),
 recipient_email text not null,
 content_type text not null,
 content_body text not null,
 asset_id uuid references public.message_assets(id),
 email_payload jsonb,
 sender text not null,
 app_url text not null,
 state text not null default 'prepared' check(state in ('prepared','sending','uncertain','accepted','delivered','bounced','failed')),
 provider_id text unique,
 lease_until timestamptz,
 revoked_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index message_send_owner_idx on public.message_send_attempts(user_id,created_at);
create index message_send_message_idx on public.message_send_attempts(message_id,created_at desc);
alter table public.message_assets enable row level security;
alter table public.message_send_accounts enable row level security;
alter table public.message_send_attempts enable row level security;
revoke all on public.message_assets, public.message_send_accounts, public.message_send_attempts from anon, authenticated;
grant select on public.message_assets to authenticated;
grant select(id,message_id,user_id,recipient_email,content_type,content_body,asset_id,state,provider_id,revoked_at,created_at,updated_at) on public.message_send_attempts to authenticated;
grant all on public.message_assets, public.message_send_accounts, public.message_send_attempts to service_role;
create policy assets_read_own on public.message_assets for select to authenticated using(user_id=(select auth.uid()));
create policy attempts_read_own on public.message_send_attempts for select to authenticated using(user_id=(select auth.uid()));

create function public.message_locked(p_id uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(
  select 1 from public.message_send_attempts a
  join public.messages m on m.id=a.message_id
  where a.message_id=p_id and a.state <> 'failed'
  and (auth.role()='service_role' or m.user_id=auth.uid())
 );
$$;
revoke all on function public.message_locked(uuid) from public;
grant execute on function public.message_locked(uuid) to authenticated, service_role;

-- Preserve old rows. Only editable drafts may be written/deleted by a browser.
drop policy messages_select_own on public.messages;
create policy messages_select_own on public.messages for select to authenticated using(user_id=(select auth.uid()) and archived_at is null);
drop policy messages_insert_own on public.messages;
drop policy messages_update_own on public.messages;
drop policy messages_delete_own on public.messages;
create policy messages_insert_own on public.messages for insert to authenticated with check(user_id=(select auth.uid()) and status='draft');
create policy messages_update_own on public.messages for update to authenticated using(user_id=(select auth.uid()) and status='draft' and not public.message_locked(id)) with check(user_id=(select auth.uid()) and status='draft' and not public.message_locked(id));
create policy messages_delete_own on public.messages for delete to authenticated using(user_id=(select auth.uid()) and status='draft' and not exists(select 1 from public.message_send_attempts where message_id=messages.id));
grant all on public.messages to service_role;
revoke insert,update on public.messages from authenticated;
grant insert(id,user_id,recipient_email,content_type,content_body,status), update(recipient_email,content_type,content_body) on public.messages to authenticated;
create function public.guard_message() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' then
  if new.id<>old.id or new.user_id<>old.user_id or new.created_at<>old.created_at then raise exception 'immutable identity' using errcode='42501'; end if;
  if auth.role()<>'service_role' and (old.status<>'draft' or new.status<>'draft' or public.message_locked(old.id)) then raise exception 'message locked' using errcode='42501'; end if;
  new.updated_at=now();
 end if;
 return new;
end; $$;
create trigger guard_message before update on public.messages for each row execute function public.guard_message();

-- Service-only reservation serializes ALL formats for one account.
create function public.reserve_message_send(p_user uuid,p_message uuid,p_sender text,p_app_url text,p_expected timestamptz) returns public.message_send_attempts language plpgsql security definer set search_path='' as $$
declare m public.messages; a public.message_send_attempts; media public.message_assets;
begin
 insert into public.message_send_accounts(user_id) values(p_user) on conflict do nothing;
 perform 1 from public.message_send_accounts where user_id=p_user for update;
 select * into m from public.messages where id=p_message and user_id=p_user for update;
 if not found then raise exception 'message unavailable' using errcode='P0002'; end if;
 select * into a from public.message_send_attempts where message_id=m.id and state<>'failed' order by created_at desc limit 1;
 if found then return a; end if;
 if m.status<>'draft' or m.archived_at is not null then raise exception 'message not draft'; end if;
 if p_expected is null or m.updated_at<>p_expected then raise exception 'message changed' using errcode='40001'; end if;
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then raise exception 'email unconfirmed' using errcode='42501'; end if;
 if length(m.content_body)>5000 or (m.content_type='text' and length(btrim(m.content_body))=0) then raise exception 'invalid content'; end if;
 if (select count(*) from public.message_send_attempts where user_id=p_user and state<>'failed')>=3 then raise exception 'free quota used' using errcode='P0001'; end if;
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
create function public.claim_message_send(p_attempt uuid) returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.message_send_attempts; replay boolean;
begin
 select * into a from public.message_send_attempts where id=p_attempt for update;
 if not found then return null; end if;
 replay=a.state<>'prepared';
 if a.state='prepared' or (a.state in ('uncertain','sending') and coalesce(a.lease_until,now())<=now() and a.created_at>now()-interval '23 hours') then
  update public.message_send_attempts set state='sending',lease_until=now()+interval '60 seconds',updated_at=now() where id=a.id;
  return jsonb_build_object('attempt',to_jsonb(a),'replay',replay);
 end if;
 return null;
end; $$;
create function public.finish_message_send(p_attempt uuid,p_state text,p_provider text default null) returns void language plpgsql security definer set search_path='' as $$
declare a public.message_send_attempts;
begin
 if p_state not in ('accepted','uncertain','failed','delivered','bounced') then raise exception 'invalid state'; end if;
 select * into a from public.message_send_attempts where id=p_attempt for update;
 if not found then raise exception 'attempt missing'; end if;
 -- A late failure cannot undo evidence that the provider accepted a message.
 if a.state in ('accepted','delivered','bounced') and p_state in ('uncertain','failed') then return; end if;
 if a.state in ('delivered','bounced') and p_state='accepted' then return; end if;
 if a.provider_id is not null and p_provider is not null and a.provider_id<>p_provider then raise exception 'provider mismatch'; end if;
 update public.message_send_attempts set state=p_state,provider_id=coalesce(provider_id,p_provider),lease_until=null,updated_at=now() where id=a.id;
 if p_state in ('accepted','delivered','bounced') then update public.messages set status='sent' where id=a.message_id; end if;
end; $$;
revoke all on function public.reserve_message_send(uuid,uuid,text,text,timestamptz), public.claim_message_send(uuid),public.finish_message_send(uuid,text,text) from public,anon,authenticated;
grant execute on function public.reserve_message_send(uuid,uuid,text,text,timestamptz), public.claim_message_send(uuid),public.finish_message_send(uuid,text,text) to service_role;
commit;
