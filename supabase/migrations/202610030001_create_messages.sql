-- Apply once in Supabase SQL Editor or through Supabase migrations.
-- Intentionally fails if messages already exists: inspect it before changing its schema.
begin;

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  recipient_email text not null check (
    length(recipient_email) <= 254 and
    recipient_email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  ),
  content_type text not null check (content_type in ('text', 'audio', 'video')),
  content_body text not null,
  status text not null default 'draft' check (status in ('draft', 'saved', 'sent')),
  created_at timestamptz not null default now()
);

create index messages_user_drafts_idx
  on public.messages (user_id, created_at desc, id desc)
  where status = 'draft' and content_type = 'text';

alter table public.messages enable row level security;
revoke all on table public.messages from anon, authenticated;
grant select, insert, update, delete on table public.messages to authenticated;

create policy messages_select_own
  on public.messages for select to authenticated
  using ((select auth.uid()) = user_id);

create policy messages_insert_own
  on public.messages for insert to authenticated
  with check ((select auth.uid()) = user_id);

create policy messages_update_own
  on public.messages for update to authenticated
  using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

create policy messages_delete_own
  on public.messages for delete to authenticated
  using ((select auth.uid()) = user_id);

commit;
