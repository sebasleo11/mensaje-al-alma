-- LOCAL/test Supabase only, after migrations 002+003. All fixtures roll back.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at) values
 ('33333333-3333-4333-8333-333333333333','lock-a@example.com',now()),
 ('44444444-4444-4444-8444-444444444444','lock-b@example.com',now());
insert into public.messages(id,user_id,recipient_email,content_type,content_body) values
 ('33333333-aaaa-4333-8333-333333333333','33333333-3333-4333-8333-333333333333','recipient@example.com','text','Locked'),
 ('33333333-bbbb-4333-8333-333333333333','33333333-3333-4333-8333-333333333333','recipient@example.com','text','Unlocked'),
 ('44444444-aaaa-4444-8444-444444444444','44444444-4444-4444-8444-444444444444','recipient@example.com','text','Other locked'),
 ('33333333-cccc-4333-8333-333333333333','33333333-3333-4333-8333-333333333333','recipient@example.com','audio','Audio'),
 ('33333333-dddd-4333-8333-333333333333','33333333-3333-4333-8333-333333333333','recipient@example.com','video','Video');
insert into public.message_send_attempts(message_id,user_id,recipient_email,content_type,content_body,sender,app_url) values
 ('33333333-aaaa-4333-8333-333333333333','33333333-3333-4333-8333-333333333333','recipient@example.com','text','Locked','sender@example.com','https://example.com'),
 ('44444444-aaaa-4444-8444-444444444444','44444444-4444-4444-8444-444444444444','recipient@example.com','text','Other locked','sender@example.com','https://example.com');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"33333333-3333-4333-8333-333333333333","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','33333333-3333-4333-8333-333333333333',true);
select is(public.message_locked('33333333-aaaa-4333-8333-333333333333'),true,'Owner sees own lock');
select is(public.message_locked('33333333-bbbb-4333-8333-333333333333'),false,'Owner sees own unlocked draft');
select is(public.message_locked('44444444-aaaa-4444-8444-444444444444'),false,'Other owner lock is not disclosed');
select is(public.message_locked('55555555-5555-4555-8555-555555555555'),false,'Missing ID indistinguishable from inaccessible lock');
select set_config('request.jwt.claims','{"sub":"44444444-4444-4444-8444-444444444444","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','44444444-4444-4444-8444-444444444444',true);
select is(public.message_locked('44444444-aaaa-4444-8444-444444444444'),true,'Second owner sees own lock');
select is(public.message_locked('33333333-aaaa-4333-8333-333333333333'),false,'Second owner cannot inspect first owner lock');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('request.jwt.claim.sub','',true);
select is(public.message_locked('33333333-aaaa-4333-8333-333333333333'),true,'Service sees first owner lock without user sub');
select is(public.message_locked('44444444-aaaa-4444-8444-444444444444'),true,'Service sees second owner lock');
select is(public.message_locked('33333333-bbbb-4333-8333-333333333333'),false,'Service preserves unlocked result');
insert into public.message_assets(id,message_id,user_id,path,mime,bytes,state) values
 ('33333333-eeee-4333-8333-333333333333','33333333-cccc-4333-8333-333333333333','33333333-3333-4333-8333-333333333333','33333333-3333-4333-8333-333333333333/33333333-cccc-4333-8333-333333333333/33333333-eeee-4333-8333-333333333333.webm','audio/webm',1024,'ready'),
 ('33333333-ffff-4333-8333-333333333333','33333333-dddd-4333-8333-333333333333','33333333-3333-4333-8333-333333333333','33333333-3333-4333-8333-333333333333/33333333-dddd-4333-8333-333333333333/33333333-ffff-4333-8333-333333333333.webm','video/webm',1024,'ready');
-- Ready legacy/corrupt metadata must not bypass reservation validation.
select throws_ok(format($q$select public.reserve_message_send('33333333-3333-4333-8333-333333333333',%L,'sender@example.com','https://example.com',(select updated_at from public.messages where id=%L))$q$,id,id),'P0001','media unavailable',content_type||' NULL duration rejected') from public.messages where content_type in ('audio','video');
update public.message_assets set duration=0;
select throws_ok(format($q$select public.reserve_message_send('33333333-3333-4333-8333-333333333333',%L,'sender@example.com','https://example.com',(select updated_at from public.messages where id=%L))$q$,id,id),'P0001','media unavailable',content_type||' zero duration rejected') from public.messages where content_type in ('audio','video');
update public.message_assets set duration=-1;
select throws_ok(format($q$select public.reserve_message_send('33333333-3333-4333-8333-333333333333',%L,'sender@example.com','https://example.com',(select updated_at from public.messages where id=%L))$q$,id,id),'P0001','media unavailable',content_type||' negative duration rejected') from public.messages where content_type in ('audio','video');
update public.message_assets set duration=case when mime='audio/webm' then 121 else 46 end;
select throws_ok(format($q$select public.reserve_message_send('33333333-3333-4333-8333-333333333333',%L,'sender@example.com','https://example.com',(select updated_at from public.messages where id=%L))$q$,id,id),'P0001','media unavailable',content_type||' over-limit duration rejected') from public.messages where content_type in ('audio','video');
select is((select count(*) from public.message_send_attempts where content_type in ('audio','video')),0::bigint,'Invalid durations create no attempts or quota reservations');
update public.message_assets set duration=case when mime='audio/webm' then 120 else 45 end;
select lives_ok($$select public.reserve_message_send('33333333-3333-4333-8333-333333333333','33333333-cccc-4333-8333-333333333333','sender@example.com','https://example.com',(select updated_at from public.messages where id='33333333-cccc-4333-8333-333333333333'))$$,'Audio at 120 seconds accepted');
select lives_ok($$select public.reserve_message_send('33333333-3333-4333-8333-333333333333','33333333-dddd-4333-8333-333333333333','sender@example.com','https://example.com',(select updated_at from public.messages where id='33333333-dddd-4333-8333-333333333333'))$$,'Video at 45 seconds accepted');
reset role;
select * from finish();
rollback;
