-- Read-only: run in the SQL Editor of the project's existing Supabase database.
-- Does not select message content or change schema, permissions, RLS or data.
select to_regclass('public.messages') as messages_table;

select table_schema, table_name, column_name, data_type, is_nullable
from information_schema.columns
where table_name = 'messages'
order by table_schema, ordinal_position;

select n.nspname as schema_name, c.relname, c.relrowsecurity as rls_enabled
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where c.relname = 'messages' and c.relkind in ('r', 'p');

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where tablename = 'messages';

select grantee, privilege_type
from information_schema.role_table_grants
where table_schema = 'public' and table_name = 'messages'
  and grantee in ('anon', 'authenticated');
