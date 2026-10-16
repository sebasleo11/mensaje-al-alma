# PREPARED ONLY. PostgreSQL isolationtester format; disposable DB after 001–004.
# Two sessions and permutations test actual waiting/lock ordering when later run.
# No network calls. teardown is exclusively for these isolated fixtures.
setup
{
 INSERT INTO auth.users(id,email,email_confirmed_at) VALUES ('99999999-9999-4999-8999-999999999999','isolation@example.com',now());
 INSERT INTO public.messages(id,user_id,recipient_email,content_type,content_body) VALUES ('aaaaaaaa-9999-4999-8999-999999999999','99999999-9999-4999-8999-999999999999','recipient@example.com','text','Immutable snapshot');
 INSERT INTO public.message_schedules(id,message_id,user_id,scheduled_at,time_zone,local_datetime,utc_offset_minutes,message_updated_at,confirmation)
 SELECT 'bbbbbbbb-9999-4999-8999-999999999999',id,user_id,date_trunc('minute',now())-interval '1 minute','UTC',(date_trunc('minute',now())-interval '1 minute') at time zone 'UTC',0,updated_at,'{}'::jsonb FROM public.messages WHERE id='aaaaaaaa-9999-4999-8999-999999999999';
}
teardown
{
 DELETE FROM public.message_schedules WHERE user_id='99999999-9999-4999-8999-999999999999';
 DELETE FROM public.message_send_attempts WHERE user_id='99999999-9999-4999-8999-999999999999';
 DELETE FROM public.messages WHERE user_id='99999999-9999-4999-8999-999999999999';
 DELETE FROM public.message_send_accounts WHERE user_id='99999999-9999-4999-8999-999999999999';
 DELETE FROM auth.users WHERE id='99999999-9999-4999-8999-999999999999';
}
session "cancel"
step "c_begin" { BEGIN; }
step "cancel" { SELECT state FROM public.change_message_schedule('99999999-9999-4999-8999-999999999999','aaaaaaaa-9999-4999-8999-999999999999','bbbbbbbb-9999-4999-8999-999999999999','cancel',null,1,null,null,null,null); }
step "c_commit" { COMMIT; }
session "dispatch"
step "d_begin" { BEGIN; }
step "dispatch" { SELECT id FROM public.begin_message_schedule('99999999-9999-4999-8999-999999999999','aaaaaaaa-9999-4999-8999-999999999999','bbbbbbbb-9999-4999-8999-999999999999',1,'sender@example.com','https://example.com'); }
step "d_commit" { COMMIT; }
step "inspect" { SELECT s.state,s.version,s.attempt_id is not null AS linked,(SELECT count(*) FROM public.message_send_attempts WHERE user_id=s.user_id) AS attempts FROM public.message_schedules s WHERE s.id='bbbbbbbb-9999-4999-8999-999999999999'; }
permutation "c_begin" "d_begin" "cancel" "dispatch" "c_commit" "d_commit" "inspect"
permutation "c_begin" "d_begin" "dispatch" "cancel" "d_commit" "c_commit" "inspect"
# Expected: cancellation wins -> cancelled, version 2, no attempt, dispatch conflicts.
# Dispatch wins -> dispatching, version 2, exactly one linked attempt, cancel conflicts.
# Capture/approve isolationtester expected output only after a real isolated run.
