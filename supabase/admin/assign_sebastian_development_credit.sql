-- REVIEW ONLY. Run separately after 005, with administrative SQL privileges.
-- Never create a user, reset usage or run calendar 004 for this allocation.
-- The UUID is resolved from existing Auth. Zero/multiple/unconfirmed matches abort.
begin;
do $$
declare target uuid; matches bigint; existing_owner uuid;
begin
 select count(*) into matches from auth.users where lower(email)='cursoiainteligente@gmail.com';
 if matches<>1 then raise exception 'expected exactly one existing Auth account; allocation aborted'; end if;
 select id into strict target from auth.users where lower(email)='cursoiainteligente@gmail.com' and email_confirmed_at is not null for share;
 insert into public.message_send_accounts(user_id) values(target) on conflict do nothing;
 perform 1 from public.message_send_accounts where user_id=target for update;
 insert into public.message_development_credits(grant_key,user_id,amount,reason)
 values('sebastian-development-50-v1',target,50,'manual_development') on conflict(grant_key) do nothing;
 select user_id into strict existing_owner from public.message_development_credits where grant_key='sebastian-development-50-v1';
 if existing_owner<>target then raise exception 'grant belongs to a different Auth identity; allocation aborted'; end if;
end; $$;
-- Reports grant and preserved consumption without exposing message content.
select c.user_id,c.amount,c.reason,c.grant_key,public.message_quota_limit(c.user_id) as total_allowance,
 (select count(*) from public.message_send_attempts a where a.user_id=c.user_id and a.state<>'failed') as attempts_used
from public.message_development_credits c where c.grant_key='sebastian-development-50-v1';
commit;
