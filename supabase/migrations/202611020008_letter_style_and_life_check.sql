begin;
-- Prepared locally only; review before applying. Requires migrations 001-007.

-- 1. Letter style (paper + handwriting) chosen per message, snapshotted into each send attempt.
alter table public.messages
 add column letter_paper text not null default 'clasica' check (letter_paper in ('clasica','azul','pergamino','kraft','rosa','salvia','acuarela','cuadriculado','puntos','noche')),
 add column letter_font text not null default 'caveat' check (letter_font in ('caveat','homemade','dancing','reenie','kalam','lora')),
 add column release_on_lapse boolean not null default false;
alter table public.message_send_attempts
 add column letter_paper text not null default 'clasica',
 add column letter_font text not null default 'caveat';

-- The attempt freezes the style at reservation time, like content_body, without rewriting the reservation RPCs.
create function public.copy_letter_style() returns trigger language plpgsql security definer set search_path='' as $$
begin
 select m.letter_paper,m.letter_font into new.letter_paper,new.letter_font from public.messages m where m.id=new.message_id;
 return new;
end; $$;
create trigger copy_letter_style before insert on public.message_send_attempts for each row execute function public.copy_letter_style();
revoke all on function public.copy_letter_style() from public,anon,authenticated;

-- Style and release mode are frozen while the message is locked (scheduled or sent).
create or replace function public.guard_message() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if TG_OP='DELETE' then
  if public.message_locked(old.id) then raise exception 'message locked' using errcode='42501'; end if;
  return old;
 end if;
 if new.id<>old.id or new.user_id<>old.user_id or new.created_at<>old.created_at then raise exception 'immutable identity' using errcode='42501'; end if;
 if (new.recipient_email,new.content_body,new.content_type,new.archived_at,new.letter_paper,new.letter_font,new.release_on_lapse) is distinct from (old.recipient_email,old.content_body,old.content_type,old.archived_at,old.letter_paper,old.letter_font,old.release_on_lapse) and public.message_locked(old.id) then raise exception 'message locked' using errcode='42501'; end if;
 if auth.role()<>'service_role' and (old.status<>'draft' or new.status<>'draft' or public.message_locked(old.id)) then raise exception 'message locked' using errcode='42501'; end if;
 new.updated_at=now(); return new;
end; $$;

-- 2. Proof of life. One row per account that has messages; the owner confirms explicitly.
create table public.life_checkins (
 user_id uuid primary key references auth.users(id) on delete cascade,
 last_checkin_at timestamptz not null default now(),
 reminder_stage smallint not null default 0 check (reminder_stage between 0 and 4),
 last_reminder_at timestamptz,
 released_at timestamptz,
 created_at timestamptz not null default now()
);
alter table public.life_checkins enable row level security;
revoke all on public.life_checkins from public,anon,authenticated;
grant select on public.life_checkins to authenticated;
grant all on public.life_checkins to service_role;
create policy checkin_read_own on public.life_checkins for select to authenticated using(user_id=(select auth.uid()));

create function public.ensure_life_checkin() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.life_checkins(user_id) values(new.user_id) on conflict do nothing;
 return new;
end; $$;
create trigger ensure_life_checkin after insert on public.messages for each row execute function public.ensure_life_checkin();
revoke all on function public.ensure_life_checkin() from public,anon,authenticated;
insert into public.life_checkins(user_id) select distinct user_id from public.messages on conflict do nothing;

-- Only the authenticated owner (through the API, which passes the verified id) may confirm. Resets reminders
-- unless a release is in progress (release_on_lapse messages released but not yet sent).
create function public.record_life_checkin(p_user uuid) returns public.life_checkins language plpgsql security definer set search_path='' as $$
declare c public.life_checkins;
begin
 insert into public.life_checkins(user_id) values(p_user) on conflict do nothing;
 update public.life_checkins set last_checkin_at=clock_timestamp(),reminder_stage=0,last_reminder_at=null,released_at=null where user_id=p_user and (released_at is null or not exists(select 1 from public.messages m where m.user_id=p_user and m.release_on_lapse and m.status='draft' and m.archived_at is null)) returning * into c;
 if not found then select * into c from public.life_checkins where user_id=p_user; end if;
 return c;
end; $$;
revoke all on function public.record_life_checkin(uuid) from public,anon,authenticated;
grant execute on function public.record_life_checkin(uuid) to service_role;

-- Accounts that need reminders or a release decision: they own an active schedule or a release_on_lapse draft.
create function public.life_checkin_candidates() returns table(user_id uuid,last_checkin_at timestamptz,reminder_stage smallint,released_at timestamptz,next_schedule timestamptz,scheduled_count bigint,legacy_count bigint) language sql security definer set search_path='' as $$
 select c.user_id,c.last_checkin_at,c.reminder_stage,c.released_at,
  (select min(s.scheduled_at) from public.message_schedules s where s.user_id=c.user_id and s.state in ('scheduled','blocked')),
  (select count(*) from public.message_schedules s where s.user_id=c.user_id and s.state in ('scheduled','blocked')),
  (select count(*) from public.messages m where m.user_id=c.user_id and m.release_on_lapse and m.status='draft' and m.archived_at is null)
 from public.life_checkins c
 where exists(select 1 from public.message_schedules s where s.user_id=c.user_id and s.state in ('scheduled','blocked'))
    or exists(select 1 from public.messages m where m.user_id=c.user_id and m.release_on_lapse and m.status='draft' and m.archived_at is null)
 order by c.last_checkin_at limit 200;
$$;
revoke all on function public.life_checkin_candidates() from public,anon,authenticated;
grant execute on function public.life_checkin_candidates() to service_role;

commit;
