import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { sendMessage,type SendDependencies } from '../lib/messages/send';
import { messageEmail,recipientToken,validRecipientToken } from '../lib/email/message';
import { messageInput } from '../lib/messages/panel';
import { inspectMedia } from '../lib/media/inspect';
import { validateVideoResult } from '../lib/media/browser';
import type { SendAttempt,Message } from '../utils/supabase/database.types';

export async function verifyMessageFeatures(){
 const owner='owner-a';const rows=new Map<string,Message>();const attempts:SendAttempt[]=[];let calls=0;let failure:'none'|'rejected'|'timeout'='none';let outsideWindow=false;
 const secret='test-secret-for-recipient-links-with-32-characters';
 function create(id:string,text:string,type:'text'|'audio'='text'){
  rows.set(id,{id,user_id:owner,recipient_email:'recipient@example.com',content_type:type,content_body:text,status:'draft',created_at:new Date().toISOString(),updated_at:new Date().toISOString(),archived_at:null});
 }
 create('draft-a','Uno');create('draft-b','Dos');rows.get('draft-a')!.content_body='Uno editado';assert.equal(rows.get('draft-b')!.content_body,'Dos');
 const payloads=new Map<string,ReturnType<typeof messageEmail>>();
 function deps(messageId:string,actor=owner):SendDependencies{return {
  reserve:async()=>{
   const m=rows.get(messageId);if(!m||m.user_id!==actor)throw new Error('Not owned');
   const previous=attempts.findLast(a=>a.message_id===messageId&&a.state!=='failed');if(previous)return structuredClone(previous);
   if(attempts.filter(a=>a.state!=='failed').length>=3)throw new Error('Quota reached');
   const a:SendAttempt={id:crypto.randomUUID(),message_id:m.id,user_id:m.user_id,recipient_email:m.recipient_email,content_type:m.content_type,content_body:m.content_body,asset_id:m.content_type==='audio'?'asset-a':null,email_payload:null,sender:'Mensaje al Alma <sender@example.com>',app_url:'https://example.com/',state:'prepared',provider_id:null,lease_until:null,revoked_at:null,created_at:new Date().toISOString(),updated_at:new Date().toISOString()};attempts.push(a);return structuredClone(a);
  },
  prepare:async a=>{if(!payloads.has(a.id))payloads.set(a.id,messageEmail(a,secret));},
  claim:async id=>{const a=attempts.find(a=>a.id===id)!;if(a.state==='sending'||['accepted','delivered','bounced'].includes(a.state)||(outsideWindow&&a.state==='uncertain'))return null;const replay=a.state!=='prepared';a.state='sending';return {attempt:structuredClone(a),replay,payload:payloads.get(a.id)!};},
  finish:async(id,state,provider)=>{const a=attempts.find(a=>a.id===id)!;if(a.state==='accepted'&&state!=='accepted')return;a.state=state;a.provider_id=provider??a.provider_id;},
  send:async(payload,key)=>{calls++;assert.match(key,/^alma-message\/.+\/v1$/);assert.equal(payload.to[0],'recipient@example.com');if(failure==='timeout')throw new Error('Timeout');if(failure==='rejected')return {data:null,error:{name:'validation_error',message:'test rejection',statusCode:422}};await Promise.resolve();return {data:{id:'provider-'+key},error:null};},
 };}
 assert.equal(calls,0,'Saving never sends');
 await assert.rejects(sendMessage(deps('draft-a','owner-b')));assert.equal(calls,0);
 const concurrent=await Promise.all([sendMessage(deps('draft-a')),sendMessage(deps('draft-a'))]);assert.equal(calls,1);assert.ok(concurrent.some(r=>r.state==='accepted'));
 await sendMessage(deps('draft-a'));assert.equal(calls,1,'Accepted sends never repeat beyond provider TTL');
 assert.equal(attempts[0].content_body,'Uno editado');rows.get('draft-a')!.content_body='Future edit';assert.equal(attempts[0].content_body,'Uno editado','Snapshot independent of draft');
 failure='rejected';assert.equal((await sendMessage(deps('draft-b'))).state,'failed');assert.equal(attempts.filter(a=>a.state!=='failed').length,1);
 failure='none';assert.equal((await sendMessage(deps('draft-b'))).state,'accepted');
 create('draft-c','Tres','audio');failure='timeout';const uncertain=await sendMessage(deps('draft-c'));assert.equal(uncertain.state,'uncertain');
 assert.equal(attempts.filter(a=>a.state!=='failed').length,3,'Uncertain attempt keeps shared format quota');
 const held=attempts.find(a=>a.id===uncertain.attemptId)!;const payload=JSON.stringify(payloads.get(held.id));
 outsideWindow=true;const previousCalls=calls;await sendMessage(deps('draft-c'));assert.equal(calls,previousCalls,'No blind resend outside 23-hour window');
 outsideWindow=false;failure='none';await sendMessage(deps('draft-c'));assert.equal(JSON.stringify(payloads.get(held.id)),payload,'Replay keeps identical payload');assert.equal(attempts.filter(a=>a.state!=='failed').length,3);
 create('draft-d','Cuatro');await assert.rejects(sendMessage(deps('draft-d')),/Quota/);
 assert.equal(attempts.find(a=>a.message_id==='draft-c')?.asset_id,'asset-a');
 const token=recipientToken(held.id,secret);assert.equal(token.length,43);assert.ok(validRecipientToken(held.id,token,secret));assert.equal(validRecipientToken('other-message',token,secret),false);assert.equal(validRecipientToken(held.id,'wrong',secret),false);
 const template=messageEmail({...held,content_body:'<script>private</script>\nOtra línea'},secret);assert.ok(template.html.includes('&lt;script&gt;'));assert.equal(template.html.includes('<script>'),false);assert.ok(template.text.includes('\nOtra línea'));assert.ok(template.html.includes('/recibir/'+held.id+'#'));
 assert.throws(()=>messageInput({recipient_email:'bad',content_body:'text',content_type:'text'}));
 assert.equal(messageInput({recipient_email:'recipient@example.com',content_body:'',content_type:'photo'}).content_type,'photo');
 validateVideoResult(1000000,500000,20,20.1);assert.throws(()=>validateVideoResult(1000000,1000000,20,20));assert.throws(()=>validateVideoResult(1000000,500000,20,12));assert.throws(()=>validateVideoResult(1000000,500000,45,46));
 // A complete PCM WAV is duration-checked from container bytes, not client claims.
 function wave(seconds:number){const size=seconds*8000;const b=new Uint8Array(44+size);const v=new DataView(b.buffer);b.set(new TextEncoder().encode('RIFF'),0);v.setUint32(4,b.length-8,true);b.set(new TextEncoder().encode('WAVEfmt '),8);v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,1,true);v.setUint32(24,8000,true);v.setUint32(28,8000,true);v.setUint16(32,1,true);v.setUint16(34,8,true);b.set(new TextEncoder().encode('data'),36);v.setUint32(40,size,true);return b;}
 assert.equal(inspectMedia(wave(2),'audio/wav','audio').duration,2);assert.throws(()=>inspectMedia(wave(121),'audio/wav','audio'));assert.throws(()=>inspectMedia(wave(2),'video/mp4','video'));assert.throws(()=>inspectMedia(new Uint8Array([0xff,0xd8,0xff,0xd9]),'image/jpeg','photo'));
 function element(id:number[],data:number[]){return [...id,0x80|data.length,...data];}
 function webmFixture(lastSeconds:number,declaredSeconds:number){
  const f=new Uint8Array(8);new DataView(f.buffer).setFloat64(0,declaredSeconds*1000);
  const info=element([0x15,0x49,0xa9,0x66],element([0x44,0x89],[...f]));
  const tracks=element([0x16,0x54,0xae,0x6b],element([0xae],element([0x83],[1])));
  const tick=Math.floor(lastSeconds*1000);const cluster=element([0x1f,0x43,0xb6,0x75],[...element([0xe7],[(tick>>8)&255,tick&255]),...element([0xa3],[129,0,0,128,1])]);
  return new Uint8Array([...element([0x1a,0x45,0xdf,0xa3],element([0x42,0x82],[119,101,98,109])),...element([0x18,0x53,0x80,0x67],[...info,...tracks,...cluster])]);
 }
 assert.equal(inspectMedia(webmFixture(29,30),'video/webm','video').duration,30);
 assert.throws(()=>inspectMedia(webmFixture(46,10),'video/webm','video'),'Frame timestamps cannot hide an overlong video');
 assert.throws(()=>inspectMedia(webmFixture(29,30),'audio/webm','audio'),'Video cannot impersonate audio');
 // Regression: empty EBML elements must not be confused with truncated sizes.
 const ebmlHeader=element([0x1a,0x45,0xdf,0xa3],element([0x42,0x82],[119,101,98,109]));
 const videoTracks=element([0x16,0x54,0xae,0x6b],element([0xae],element([0x83],[1])));
 const videoCluster=element([0x1f,0x43,0xb6,0x75],[...element([0xe7],[]),...element([0xa3],[129,0x1f,0x40,128,1])]);
 const videoData=[...videoTracks,...videoCluster];
 const segment=(data:number[],size:number[]=[0x80|data.length])=>new Uint8Array([...ebmlHeader,0x18,0x53,0x80,0x67,...size,...data]);
 const durationBefore=inspectMedia(segment(videoData),'video/webm','video').duration;
 assert.equal(inspectMedia(segment([...element([0xec],[]),...element([0x15,0x49,0xa9,0x66],[]),...videoData]),'video/webm','video').duration,durationBefore,'Empty Void/Info and timestamp preserve duration');
 for(const size of [[0xff],[0x01,0xff,0xff,0xff,0xff,0xff,0xff,0xff]]){
  assert.equal(inspectMedia(segment(videoData,size),'video/webm','video').duration,durationBefore,'Unknown Segment size (1/8-byte VINT)');
  const unknownCluster=[0x1f,0x43,0xb6,0x75,...size,...videoCluster.slice(5)];
  assert.equal(inspectMedia(segment([...videoTracks,...unknownCluster]),'video/webm','video').duration,durationBefore,'Unknown Cluster size');
 }
 assert.equal(inspectMedia(segment(videoData,[0x01,0,0,0,0,0,0,videoData.length]),'video/webm','video').duration,durationBefore,'Finite 8-byte VINT');
 assert.throws(()=>inspectMedia(segment(videoData,[0x80|videoData.length+1]),'video/webm','video'),/Invalid EBML size/,'Finite size beyond parent');
 assert.throws(()=>inspectMedia(segment(videoData).slice(0,-1),'video/webm','video'),/Invalid EBML size/,'Truncated payload');
 assert.throws(()=>inspectMedia(new Uint8Array([...ebmlHeader,...element([0x18,0x53,0x80,0x67],[0xec,0x40]),...videoData]),'video/webm','video'),/Invalid EBML size/,'Size header crossing parent boundary');
 assert.throws(()=>inspectMedia(segment([...videoTracks,0xec,0xff,...videoCluster]),'video/webm','video'),/Invalid EBML size/,'Unknown size on non-master');
 assert.throws(()=>inspectMedia(segment([...videoTracks,...element([0x1f,0x43,0xb6,0x75],[...element([0xe7],[0]),...element([0xa3],[])])]),'video/webm','video'),/Invalid EBML size/,'Empty media block');
 assert.throws(()=>inspectMedia(segment([...element([0xec],[]),...videoTracks]),'video/webm','video'),/Missing media frames/,'Empty elements cannot replace frames');
 // Browser WebM writes sibling Clusters with unknown sizes. They are not nested.
 const siblingClusters:number[]=[];
 for(let i=0;i<12;i++)siblingClusters.push(0x1f,0x43,0xb6,0x75,0x01,0xff,0xff,0xff,0xff,0xff,0xff,0xff,...element([0xe7],[(i*1000)>>8,(i*1000)&255]),...element([0xa3],[129,0,0,128,1]));
 const browserWebm=segment([...videoTracks,...siblingClusters],[0x01,0xff,0xff,0xff,0xff,0xff,0xff,0xff]);
 assert.ok(Math.abs(inspectMedia(browserWebm,'video/webm','video').duration!- (11+1/24))<0.001,'Sibling clusters reset timestamps and depth');
 const firstUnknown=[0x1f,0x43,0xb6,0x75,0xff,...videoCluster.slice(5)];
 assert.equal(inspectMedia(segment([...videoTracks,...firstUnknown,...element([0x15,0x49,0xa9,0x66],[]),...videoCluster],[0xff]),'video/webm','video').duration,durationBefore,'Segment sibling closes an unknown Cluster');
 assert.throws(()=>inspectMedia(browserWebm.slice(0,-1),'video/webm','video'),/Invalid EBML size/,'Truncated last block in unknown Cluster');
 assert.throws(()=>inspectMedia(segment([...videoTracks,...element([0x1f,0x43,0xb6,0x75],videoCluster)]),'video/webm','video'),/Invalid EBML nesting/,'Finite Cluster cannot contain another Cluster');
 const longUnknown=[0x1f,0x43,0xb6,0x75,0xff,...element([0xe7],[0xb3,0xb0]),...element([0xa3],[129,0,0,128,1])];
 assert.throws(()=>inspectMedia(segment([...videoTracks,...firstUnknown,...longUnknown],[0xff]),'video/webm','video'),/Invalid media duration/,'Later sibling cannot hide an overlong video');
 const sql=readFileSync('supabase/migrations/202610040002_messages_panel_delivery.sql','utf8');assert.ok(sql.includes('from public.message_send_accounts where user_id=p_user for update'));assert.ok(sql.includes("state<>'failed')>=3"));assert.ok(sql.includes("interval '23 hours'"));assert.ok(sql.includes('from public,anon,authenticated'));assert.ok(sql.includes('p_expected is null or m.updated_at<>p_expected'));
 const storageSql=readFileSync('supabase/migrations/202610040003_private_media.sql','utf8');assert.ok(storageSql.includes("'alma-private','alma-private',false"));assert.ok(storageSql.includes("state<>'failed'"));assert.ok(!storageSql.includes('for update to authenticated'));assert.ok(storageSql.includes("a.state='pending'"));
 console.log('OK: envío con modelo persistente: doble solicitud, cuota compartida, fallo/reintento, resultado incierto, snapshot, enlaces y validación de contenedores. No equivale a concurrencia/RLS remotos ni compresión nativa.');
}
