-- PREPARED, NOT EXECUTED. Isolated database only, after migrations 001–004.
-- Requires pgTAP already installed. No extensions, jobs, network calls or emails.
begin;
select no_plan();
insert into auth.users(id,email,email_confirmed_at) values ('11111111-1111-4111-8111-111111111111','schedule@example.com',now());
insert into public.messages(id,user_id,recipient_email,content_type,content_body) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','recipient@example.com','text','Keep these words'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','11111111-1111-4111-8111-111111111111','recipient@example.com','text','Immediate'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','recipient@example.com','text','Third'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111','recipient@example.com','text','Fourth');
select ok(not has_table_privilege('authenticated','public.message_schedules','INSERT'),'Browser cannot forge reservations');
select ok(not has_function_privilege('authenticated','public.change_message_schedule(uuid,uuid,uuid,text,timestamptz,bigint,timestamptz,text,timestamp,smallint)','EXECUTE'),'User RPC is server-only');
select ok(not has_function_privilege('service_role','public.reserve_message_send_internal(uuid,uuid,text,text,timestamptz,uuid)','EXECUTE'),'No public transfer bypass');
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"service_role"}',true);
select throws_ok($$select public.change_message_schedule('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','ffffffff-ffff-4fff-8fff-ffffffffffff','confirm',(select updated_at from public.messages where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'),null,now()+interval '4 minutes','UTC',(now()+interval '4 minutes') at time zone 'UTC',0::smallint)$$,'P0001','minimum advance','Minimum five minutes enforced in SQL');
select throws_ok($$select public.change_message_schedule('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','ffffffff-ffff-4fff-8fff-ffffffffffff','confirm',(select updated_at from public.messages where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'),null,now()+interval '1 hour','bad/zone',(now()+interval '1 hour') at time zone 'UTC',0::smallint)$$,'P0001','invalid time zone','Invalid SQL zone rejected');
-- Fixed transaction time makes repeated confirmation fingerprint identical.
select public.change_message_schedule('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','confirm',(select updated_at from public.messages where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),null,date_trunc('minute',now())+interval '1 hour','UTC',(date_trunc('minute',now())+interval '1 hour') at time zone 'UTC',0::smallint);
select public.change_message_schedule('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','confirm',(select updated_at from public.messages where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),null,date_trunc('minute',now())+interval '1 hour','UTC',(date_trunc('minute',now())+interval '1 hour') at time zone 'UTC',0::smallint);
select is((select count(*) from public.message_schedules),1::bigint,'Duplicate confirmation reserves once');
select is((select count(*) from public.message_send_attempts),0::bigint,'Scheduling does not create an early attempt');
select throws_ok($$update public.messages set content_body='Changed' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'42501','message locked','Even service writes protect content');
select public.reserve_message_send('11111111-1111-4111-8111-111111111111','bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','sender@example.com','https://example.com',(select updated_at from public.messages where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'));
select public.reserve_message_send('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','sender@example.com','https://example.com',(select updated_at from public.messages where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'));
select throws_ok($$select public.reserve_message_send('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','sender@example.com','https://example.com',(select updated_at from public.messages where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'))$$,'P0001','free quota used','Scheduled plus immediate cannot exceed three');
select public.change_message_schedule('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','cancel',null,1,null,null,null,null);
select public.change_message_schedule('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','cancel',null,1,null,null,null,null);
select is((select version from public.message_schedules),2::bigint,'Repeated cancellation releases once');
select is((select content_body from public.messages where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'Keep these words','Cancel preserves content');
select lives_ok($$update public.messages set content_body='Editable again' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'Cancelled draft can be edited');
select lives_ok($$select public.reserve_message_send('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','sender@example.com','https://example.com',(select updated_at from public.messages where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'))$$,'Cancelled slot available for immediate send');
select * from finish();
rollback;
