-- LOCAL/TEST Supabase only. Run after 002+003 via `supabase test db`.
-- No real email/files: fixtures and assertions roll back.
begin;
create extension if not exists pgtap with schema extensions;
select no_plan();
insert into auth.users(id,email,email_confirmed_at) values
 ('11111111-1111-4111-8111-111111111111','account-a@example.com',now()),
 ('22222222-2222-4222-8222-222222222222','account-b@example.com',now());
insert into public.messages(id,user_id,recipient_email,content_type,content_body) values
 ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','recipient@example.com','text','Alpha'),
 ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','recipient@example.com','text','Beta'),
 ('dddddddd-dddd-4ddd-8ddd-dddddddddddd','11111111-1111-4111-8111-111111111111','recipient@example.com','text','Gamma'),
 ('eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','11111111-1111-4111-8111-111111111111','recipient@example.com','text','Fourth'),
 ('ffffffff-ffff-4fff-8fff-ffffffffffff','11111111-1111-4111-8111-111111111111','recipient@example.com','photo','Photo'),
 ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb','22222222-2222-4222-8222-222222222222','private@example.com','text','Private');
select is((select public from storage.buckets where id='alma-private'),false,'Bucket is private');
select ok(not has_function_privilege('authenticated','public.reserve_message_send(uuid,uuid,text,text,timestamptz)','EXECUTE'),'Client cannot reserve quota/send');
select ok(not has_function_privilege('anon','public.claim_message_send(uuid)','EXECUTE'),'Visitor cannot dispatch');
select ok(not has_table_privilege('authenticated','public.message_send_accounts','UPDATE'),'Client cannot replenish quota');
select ok(not has_table_privilege('authenticated','public.message_send_attempts','UPDATE'),'Client cannot forge provider evidence');
select ok(not has_column_privilege('authenticated','public.message_send_attempts','email_payload','SELECT'),'Private payload inaccessible to browser');
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','11111111-1111-4111-8111-111111111111',true);
select is((select count(*) from public.messages),5::bigint,'Only own messages visible');
select lives_ok($$update public.messages set content_body='Edited alpha' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'Edit one draft');
select is((select content_body from public.messages where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'),'Beta','Second draft untouched');
select throws_ok($$update public.messages set status='sent' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$,'42501',null,'Cannot forge sent status');
select throws_ok($$insert into public.messages(user_id,recipient_email,content_type,content_body,status) values('11111111-1111-4111-8111-111111111111','recipient@example.com','text','fake','sent')$$,'42501',null,'Cannot insert forged history');
select throws_ok($$insert into public.message_send_attempts(message_id,user_id,recipient_email,content_type,content_body,sender,app_url) values('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','11111111-1111-4111-8111-111111111111','recipient@example.com','text','fake','fake','fake')$$,'42501',null,'Cannot insert quota records');
select results_eq($$update public.messages set content_body='intrusion' where id='bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning id$$,array[]::uuid[],'Other account protected');
reset role;
set local role service_role;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select lives_ok($$select public.reserve_message_send('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','sender@example.com','https://example.com',(select updated_at from public.messages where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))$$,'Reserve first send');
select lives_ok($$select public.reserve_message_send('11111111-1111-4111-8111-111111111111','aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','sender@example.com','https://example.com',(select updated_at from public.messages where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'))$$,'Retry finds same reservation');
select is((select count(*) from public.message_send_attempts),1::bigint,'One attempt after duplicate reservation');
select ok(public.claim_message_send((select id from public.message_send_attempts limit 1)) is not null,'First dispatch claims attempt');
select ok(public.claim_message_send((select id from public.message_send_attempts limit 1)) is null,'Concurrent dispatch cannot claim live lease');
select lives_ok($$select public.finish_message_send((select id from public.message_send_attempts limit 1),'accepted','provider-test-a')$$,'Provider acceptance persisted');
select is((select status from public.messages where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'),'sent','Marked sent only after acceptance');
select lives_ok($$select public.reserve_message_send('11111111-1111-4111-8111-111111111111','cccccccc-cccc-4ccc-8ccc-cccccccccccc','sender@example.com','https://example.com',(select updated_at from public.messages where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'))$$,'Second reservation');
select lives_ok($$select public.finish_message_send((select id from public.message_send_attempts where message_id='cccccccc-cccc-4ccc-8ccc-cccccccccccc'),'uncertain',null)$$,'Uncertain keeps reservation');
select lives_ok($$select public.reserve_message_send('11111111-1111-4111-8111-111111111111','dddddddd-dddd-4ddd-8ddd-dddddddddddd','sender@example.com','https://example.com',(select updated_at from public.messages where id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'))$$,'Third reservation');
select throws_ok($$select public.reserve_message_send('11111111-1111-4111-8111-111111111111','eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee','sender@example.com','https://example.com',(select updated_at from public.messages where id='eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'))$$,'P0001','free quota used','Fourth reservation blocked');
select lives_ok($$select public.finish_message_send((select id from public.message_send_attempts where message_id='dddddddd-dddd-4ddd-8ddd-dddddddddddd'),'failed',null)$$,'Confirmed failure releases its reservation');
select lives_ok($$select public.reserve_message_asset('11111111-1111-4111-8111-111111111111','ffffffff-ffff-4fff-8fff-ffffffffffff','image/webp',1024,'webp')$$,'Private media reservation');
select throws_ok($$select public.reserve_message_asset('22222222-2222-4222-8222-222222222222','ffffffff-ffff-4fff-8fff-ffffffffffff','image/webp',1024,'webp')$$,'42501',null,'Cannot reserve another account asset');
select throws_ok($$select public.complete_message_asset('11111111-1111-4111-8111-111111111111',(select id from public.message_assets limit 1),512,null)$$,'P0001','asset mismatch','Actual byte size must match');
select lives_ok($$select public.complete_message_asset('11111111-1111-4111-8111-111111111111',(select id from public.message_assets limit 1),1024,null)$$,'Validated media made ready');
select lives_ok($$select public.reserve_message_send('11111111-1111-4111-8111-111111111111','ffffffff-ffff-4fff-8fff-ffffffffffff','sender@example.com','https://example.com',(select updated_at from public.messages where id='ffffffff-ffff-4fff-8fff-ffffffffffff'))$$,'Photo shares same quota');
select ok(public.mark_asset_cleanup('11111111-1111-4111-8111-111111111111',(select id from public.message_assets limit 1),false) is null,'Referenced media cannot be removed');
reset role;
set local role authenticated;
select set_config('request.jwt.claims','{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}',true);
select results_eq($$update public.messages set content_body='changed' where id='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa' returning id$$,array[]::uuid[],'Sent snapshot protected');
select results_eq($$update public.messages set content_body='changed' where id='cccccccc-cccc-4ccc-8ccc-cccccccccccc' returning id$$,array[]::uuid[],'Uncertain content frozen');
select throws_ok($$delete from public.message_send_attempts$$,'42501',null,'Cannot restore quota by deleting attempts');
select set_config('request.jwt.claims','{"sub":"22222222-2222-4222-8222-222222222222","role":"authenticated"}',true);
select set_config('request.jwt.claim.sub','22222222-2222-4222-8222-222222222222',true);
select is((select count(id) from public.message_send_attempts),0::bigint,'Attempts isolated between users');
select is((select count(*) from public.message_assets),0::bigint,'Media metadata isolated between users');
reset role;
select * from finish();
rollback;
