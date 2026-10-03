-- Run against a LOCAL/test Supabase database after the migration:
-- supabase test db
-- All fixtures and writes are rolled back. Do not run on production.
begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id) values
  ('11111111-1111-4111-8111-111111111111'),
  ('22222222-2222-4222-8222-222222222222');
insert into public.messages (id, user_id, recipient_email, content_type, content_body) values
  ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '11111111-1111-4111-8111-111111111111', 'one@example.com', 'text', 'Own draft'),
  ('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '22222222-2222-4222-8222-222222222222', 'two@example.com', 'text', 'Private draft');

set local role authenticated;
select set_config('request.jwt.claim.sub', '11111111-1111-4111-8111-111111111111', true);
select set_config('request.jwt.claims', '{"sub":"11111111-1111-4111-8111-111111111111","role":"authenticated"}', true);

select is((select count(*) from public.messages where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 1::bigint, 'Can read own message');
select is((select count(*) from public.messages where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'), 0::bigint, 'Cannot read another user message');
select lives_ok($$insert into public.messages (id,user_id,recipient_email,content_type,content_body) values ('cccccccc-cccc-4ccc-8ccc-cccccccccccc','11111111-1111-4111-8111-111111111111','one@example.com','text','New draft')$$, 'Can insert own message');
select throws_ok($$insert into public.messages (user_id,recipient_email,content_type,content_body) values ('22222222-2222-4222-8222-222222222222','two@example.com','text','Forged owner')$$, '42501', null, 'Cannot insert for another user');
select lives_ok($$update public.messages set content_body = 'Edited' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, 'Can update own message');
select is((select content_body from public.messages where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'), 'Edited', 'Own update persisted');
select results_eq($$update public.messages set content_body = 'Intrusion' where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning id$$, array[]::uuid[], 'Cannot update another user message');
select throws_ok($$update public.messages set user_id = '22222222-2222-4222-8222-222222222222' where id = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'$$, '42501', null, 'Cannot transfer ownership');
select results_eq($$delete from public.messages where id = 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb' returning id$$, array[]::uuid[], 'Cannot delete another user message');
select results_eq($$delete from public.messages where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc' returning id$$, array['cccccccc-cccc-4ccc-8ccc-cccccccccccc']::uuid[], 'Can delete own message');
select is((select count(*) from public.messages where id = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'), 0::bigint, 'Own message deleted');
select throws_ok($$insert into public.messages (user_id,recipient_email,content_type,content_body) values ('11111111-1111-4111-8111-111111111111','one@example.com','photo','Invalid type')$$, '23514', null, 'Invalid content type rejected');

reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
select set_config('request.jwt.claims', '{}', true);
select throws_ok('select * from public.messages', '42501', null, 'Signed-out clients cannot read');
select throws_ok($$insert into public.messages (user_id,recipient_email,content_type,content_body) values ('11111111-1111-4111-8111-111111111111','one@example.com','text','Anonymous')$$, '42501', null, 'Signed-out clients cannot insert');
select throws_ok($$update public.messages set content_body = 'Anonymous'$$, '42501', null, 'Signed-out clients cannot update');
select throws_ok('delete from public.messages', '42501', null, 'Signed-out clients cannot delete');
reset role;
select * from finish();
rollback;
