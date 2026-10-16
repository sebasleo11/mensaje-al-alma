begin;
alter table public.message_assets add column removed_at timestamptz;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('alma-private','alma-private',false,20971520,array['image/webp','image/jpeg','audio/webm','audio/mp4','audio/wav','audio/ogg','video/webm','video/mp4']) on conflict(id) do update set public=false,file_size_limit=20971520,allowed_mime_types=excluded.allowed_mime_types;
create policy alma_asset_upload on storage.objects for insert to authenticated with check(bucket_id='alma-private' and exists(select 1 from public.message_assets a join public.messages m on m.id=a.message_id where a.path=name and a.user_id=(select auth.uid()) and a.state='pending' and m.status='draft' and not public.message_locked(m.id)));
create policy alma_asset_read on storage.objects for select to authenticated using(bucket_id='alma-private' and exists(select 1 from public.message_assets a where a.path=name and a.user_id=(select auth.uid()) and a.state<>'deleting'));
-- No UPDATE/DELETE policies: immutable versioned objects. Cleanup runs on server
-- through Storage API only after checking references and marking 'deleting'.
create function public.reserve_message_asset(p_user uuid,p_message uuid,p_mime text,p_bytes bigint,p_ext text) returns public.message_assets language plpgsql security definer set search_path='' as $$
declare m public.messages; a public.message_assets; aid uuid=gen_random_uuid();
begin
 select * into m from public.messages where id=p_message and user_id=p_user for update;
 if not found or m.status<>'draft' or m.archived_at is not null or public.message_locked(m.id) then raise exception 'message locked' using errcode='42501'; end if;
 if not ((m.content_type='photo' and p_mime in ('image/webp','image/jpeg') and p_ext in ('webp','jpg')) or (m.content_type='audio' and p_mime in ('audio/webm','audio/mp4','audio/wav','audio/ogg') and p_ext in ('webm','m4a','wav','ogg')) or (m.content_type='video' and p_mime in ('video/webm','video/mp4') and p_ext in ('webm','mp4'))) then raise exception 'invalid media type'; end if;
 insert into public.message_assets(id,message_id,user_id,path,mime,bytes) values(aid,m.id,p_user,p_user::text||'/'||m.id::text||'/'||aid::text||'.'||p_ext,p_mime,p_bytes) returning * into a;
 return a;
end; $$;
create function public.complete_message_asset(p_user uuid,p_asset uuid,p_bytes bigint,p_duration numeric) returns void language plpgsql security definer set search_path='' as $$
declare a public.message_assets; m public.messages;
begin
 select m0.* into m from public.messages m0 join public.message_assets a0 on a0.message_id=m0.id where a0.id=p_asset and a0.user_id=p_user for update of m0;
 if not found or m.status<>'draft' or m.archived_at is not null or public.message_locked(m.id) then raise exception 'message locked'; end if;
 select * into a from public.message_assets where id=p_asset and user_id=p_user for update;
 if a.state<>'pending' or a.bytes<>p_bytes then raise exception 'asset mismatch'; end if;
 if (m.content_type='video' and (p_duration is null or p_duration<=0 or p_duration>45)) or (m.content_type='audio' and (p_duration is null or p_duration<=0 or p_duration>120)) then raise exception 'invalid duration'; end if;
 update public.message_assets set state='ready',duration=p_duration where id=a.id;
 update public.messages set updated_at=now() where id=m.id;
end; $$;
create function public.mark_asset_cleanup(p_user uuid,p_asset uuid,p_expired_only boolean default false) returns text language plpgsql security definer set search_path='' as $$
declare a public.message_assets; m public.messages;
begin
 select m0.* into m from public.messages m0 join public.message_assets a0 on a0.message_id=m0.id where a0.id=p_asset and a0.user_id=p_user for update of m0;
 if not found then return null; end if;
 select * into a from public.message_assets where id=p_asset and user_id=p_user for update;
 if exists(select 1 from public.message_send_attempts where asset_id=a.id and state<>'failed') then return null; end if;
 if not p_expired_only and (m.status<>'draft' or m.archived_at is not null or public.message_locked(m.id)) then return null; end if;
 if p_expired_only and a.state='pending' and a.created_at>now()-interval '24 hours' then return null; end if;
 if p_expired_only and a.state='ready' and a.id=(select id from public.message_assets where message_id=m.id and state='ready' order by created_at desc limit 1) then return null; end if;
 update public.message_assets set state='deleting' where id=a.id;
 if not p_expired_only then update public.messages set updated_at=now() where id=m.id; end if;
 return a.path;
end; $$;
create function public.orphan_message_assets() returns table(id uuid,user_id uuid) language sql security definer set search_path='' as $$
 select a.id,a.user_id from public.message_assets a
 where a.removed_at is null
 and not exists(select 1 from public.message_send_attempts s where s.asset_id=a.id and s.state<>'failed')
 and (a.state='deleting' or (a.state='pending' and a.created_at<now()-interval '24 hours') or
 (a.state='ready' and a.id<>(select b.id from public.message_assets b where b.message_id=a.message_id and b.state='ready' order by b.created_at desc limit 1)))
 order by a.created_at limit 100;
$$;
revoke all on function public.orphan_message_assets() from public,anon,authenticated;
grant execute on function public.orphan_message_assets() to service_role;
revoke all on function public.reserve_message_asset(uuid,uuid,text,bigint,text),public.complete_message_asset(uuid,uuid,bigint,numeric),public.mark_asset_cleanup(uuid,uuid,boolean) from public,anon,authenticated;
grant execute on function public.reserve_message_asset(uuid,uuid,text,bigint,text),public.complete_message_asset(uuid,uuid,bigint,numeric),public.mark_asset_cleanup(uuid,uuid,boolean) to service_role;
commit;
