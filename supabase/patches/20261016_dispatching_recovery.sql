-- Local follow-up patch for migration 202610130004.
-- This is intentionally not a migration and must not be applied in this block.
-- It makes recovery of an already-linked dispatching attempt idempotent:
-- an existing non-failed attempt is returned before the active-schedule
-- conflict is evaluated. A scheduled message without an attempt still
-- returns `message scheduled`, so immediate send cannot bypass a reservation.

create or replace function public.reserve_message_send_internal(
 p_user uuid,
 p_message uuid,
 p_sender text,
 p_app_url text,
 p_expected timestamptz,
 p_schedule uuid
) returns public.message_send_attempts
language plpgsql security definer set search_path='' as $$
declare m public.messages; a public.message_send_attempts; media public.message_assets;
begin
 insert into public.message_send_accounts(user_id) values(p_user) on conflict do nothing;
 perform 1 from public.message_send_accounts where user_id=p_user for update;
 select * into m from public.messages where id=p_message and user_id=p_user for update;
 if not found then raise exception 'message unavailable' using errcode='P0002'; end if;

 -- Recovery must find the same attempt before rejecting an active schedule.
 -- The account/message locks above serialize this lookup with begin/finish.
 select * into a from public.message_send_attempts
 where message_id=m.id and user_id=p_user and state<>'failed'
 order by created_at desc limit 1;
 if found then
  if p_schedule is null then return a; end if;
  raise exception 'invalid transfer';
 end if;

 if exists(select 1 from public.message_schedules
   where message_id=m.id and state in ('scheduled','blocked','dispatching')
   and id is distinct from p_schedule) then raise exception 'message scheduled'; end if;
 if p_schedule is not null and not exists(
   select 1 from public.message_schedules
   where id=p_schedule and message_id=m.id and user_id=p_user
     and state='scheduled' and attempt_id is null
 ) then raise exception 'invalid transfer'; end if;
 if m.status<>'draft' or m.archived_at is not null then raise exception 'message not draft'; end if;
 if p_expected is null or m.updated_at<>p_expected then raise exception 'message changed' using errcode='40001'; end if;
 if not exists(select 1 from auth.users where id=p_user and email_confirmed_at is not null) then raise exception 'email unconfirmed' using errcode='42501'; end if;
 if length(m.content_body)>5000 or (m.content_type='text' and length(btrim(m.content_body))=0) then raise exception 'invalid content'; end if;
 if (select count(*) from public.message_send_attempts where user_id=p_user and state<>'failed')
   +(select count(*) from public.message_schedules where user_id=p_user and state in ('scheduled','blocked') and id is distinct from p_schedule)
   >=public.message_quota_limit(p_user) then raise exception 'free quota used' using errcode='P0001'; end if;
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

-- The original reserve_message_send wrapper remains unchanged.
