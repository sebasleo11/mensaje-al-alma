-- PREPARED ONLY: disposable database after 001–003 + 005, optionally 004.
-- Requires pgTAP already installed. Fixtures only; no network/provider calls.
begin;
select no_plan();
insert into auth.users(id,email,email_confirmed_at) values
 ('11111111-1111-4111-8111-111111111111','credit-fixture@example.com',now()),
 ('22222222-2222-4222-8222-222222222222','ordinary-fixture@example.com',now());
insert into public.message_development_credits(grant_key,user_id,amount,reason) values
 ('sebastian-development-50-v1','11111111-1111-4111-8111-111111111111',50,'manual_development') on conflict(grant_key) do nothing;
insert into public.message_development_credits(grant_key,user_id,amount,reason) values
 ('sebastian-development-50-v1','11111111-1111-4111-8111-111111111111',50,'manual_development') on conflict(grant_key) do nothing;
select is(public.message_quota_limit('11111111-1111-4111-8111-111111111111'),53::bigint,'Additional fifty, not replacement/reset');
select is(public.message_quota_limit('22222222-2222-4222-8222-222222222222'),3::bigint,'Other account keeps three');
select is((select count(*) from public.message_development_credits),1::bigint,'Repeat allocation does not add another fifty');
select ok(not has_table_privilege('authenticated','public.message_development_credits','INSERT'),'Browser cannot grant credits');
select ok(not has_table_privilege('service_role','public.message_development_credits','INSERT'),'App admin key cannot grant credits');
select ok(not has_function_privilege('anon','public.get_message_quota()','EXECUTE'),'No anonymous quota access');
insert into public.messages(id,user_id,recipient_email,content_type,content_body)
select md5('fixture-credit-'||n)::uuid,'11111111-1111-4111-8111-111111111111','recipient@example.com','text','Fictitious' from generate_series(1,54) n;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select public.reserve_message_send('11111111-1111-4111-8111-111111111111',id,'sender@example.com','https://example.com',updated_at)
from public.messages where user_id='11111111-1111-4111-8111-111111111111' and id<>md5('fixture-credit-54')::uuid;
select throws_ok($$select public.reserve_message_send('11111111-1111-4111-8111-111111111111',md5('fixture-credit-54')::uuid,'sender@example.com','https://example.com',(select updated_at from public.messages where id=md5('fixture-credit-54')::uuid))$$,'P0001','free quota used','54th blocked under server lock');
select public.reserve_message_send('11111111-1111-4111-8111-111111111111',md5('fixture-credit-1')::uuid,'sender@example.com','https://example.com',(select updated_at from public.messages where id=md5('fixture-credit-1')::uuid));
select is((select count(*) from public.message_send_attempts),53::bigint,'Same-attempt replay does not consume another credit');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select is((public.get_message_quota()->>'remaining')::bigint,0::bigint,'Authoritative exhausted balance');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select is((public.get_message_quota()->>'limit')::bigint,3::bigint,'Quota lookup derives authenticated identity');
select * from finish();
rollback;
