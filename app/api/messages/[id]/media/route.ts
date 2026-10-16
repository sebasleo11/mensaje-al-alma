import { authorize, body, handled, HttpError, reply, validId } from '@/lib/messages/http';
import { createAdminClient } from '@/utils/supabase/admin';
import { cleanupAsset,cleanupOrphans } from '@/lib/media/storage';
import { inspectMedia,MAX_MEDIA_BYTES } from '@/lib/media/inspect';
export const maxDuration=60;
type Context={params:Promise<{id:string}>};
const extensions:Record<string,string>={'image/webp':'webp','image/jpeg':'jpg','audio/webm':'webm','audio/mp4':'m4a','audio/wav':'wav','audio/ogg':'ogg','video/webm':'webm','video/mp4':'mp4'};
// Temporary local-development diagnostic. Never log SDK payloads or private paths.
function reportMediaFailure(stage:'storage_download'|'file_inspection',error:unknown,file?:Blob){
 if(process.env.NODE_ENV!=='development')return;
 const safeMessages=new Set(['Truncated media','Invalid EBML','Invalid EBML nesting','Invalid EBML size','Missing media frames','Invalid MP4','Invalid MP4 size','Invalid MP4 samples','Missing MP4 payload','Invalid WAV','Invalid Ogg','Only Opus Ogg supported','Invalid JPEG','Invalid JPEG marker','Invalid JPEG size','Invalid WebP size','Invalid image dimensions','Invalid media size','Media type mismatch','Invalid media duration','Offset is outside the bounds of the DataView','Object not found','The resource was not found','fetch failed']);
 const message=error&&typeof error==='object'&&'message' in error&&typeof error.message==='string'?error.message:'';
 const type=file?.type.split(';')[0];
 console.warn('[alma-media:dev]',{stage,message:safeMessages.has(message)?message:'Unrecognized exception (private details omitted)',bytes:file?.size??null,type:type&&Object.hasOwn(extensions,type)?type:file?'unknown':null});
}
// Temporary private capture of rejected WebM bytes, only in local development.
async function captureRejectedWebm(bytes:Uint8Array|undefined,mime:string){
 if(process.env.NODE_ENV!=='development'||mime!=='video/webm'||!bytes?.length||bytes.length>MAX_MEDIA_BYTES)return;
 try{
  const {mkdtemp,writeFile}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');
  const directory=await mkdtemp(join(tmpdir(),'alma-media-debug-'));
  const file=join(directory,'rejected.webm');
  await writeFile(file,bytes,{mode:0o600,flag:'wx'});
  console.warn('[alma-media:dev:capture]',{file,bytes:bytes.length,type:'video/webm'});
 }catch{console.warn('[alma-media:dev:capture] Private capture unavailable.');}
}
export async function POST(request:Request,context:Context){return handled(async()=>{
 const {user}=await authorize(request,true);const id=validId((await context.params).id);const input=await body(request);
 const mime=typeof input.mime==='string'?input.mime:'';const bytes=Number(input.bytes);
 if(!extensions[mime]||!Number.isSafeInteger(bytes)||bytes<=0||bytes>MAX_MEDIA_BYTES)throw new HttpError(400,'Elegí un archivo compatible de hasta 20 MB.');
 const admin=createAdminClient();const r=await admin.rpc('reserve_message_asset',{p_user:user.id,p_message:id,p_mime:mime,p_bytes:bytes,p_ext:extensions[mime]});
 if(r.error)throw new HttpError(409,'No pudimos preparar el archivo. Guardá el borrador y volvé a intentar.');
 return reply({asset:r.data});
});}
export async function PATCH(request:Request,context:Context){return handled(async()=>{
 const {user}=await authorize(request,true);const id=validId((await context.params).id);const assetId=validId(String((await body(request)).assetId));const admin=createAdminClient();
 const a=await admin.from('message_assets').select('*').eq('id',assetId).eq('message_id',id).eq('user_id',user.id).single();if(a.error||a.data.state!=='pending')throw new HttpError(409,'No encontramos ese archivo pendiente.');
 let download;
 try{download=await admin.storage.from('alma-private').download(a.data.path);if(download.error)throw download.error;}
 catch(error){reportMediaFailure('storage_download',error,download?.data??undefined);throw error;}
 // Validate actual container bytes and duration from Storage, not browser claims.
 if(download.data.size>MAX_MEDIA_BYTES)throw new HttpError(400,'El archivo supera el límite.');
 let info;let inspectedBytes:Uint8Array|undefined;try{inspectedBytes=new Uint8Array(await download.data.arrayBuffer());info=inspectMedia(inspectedBytes,a.data.mime,a.data.mime.startsWith('image/')?'photo':a.data.mime.startsWith('video/')?'video':'audio');}catch(error){reportMediaFailure('file_inspection',error,download.data);await captureRejectedWebm(inspectedBytes,a.data.mime);await cleanupAsset(admin,user.id,assetId,false);throw new HttpError(400,'No pudimos validar el archivo o su duración. Conservamos el archivo anterior; probá otro compatible.');}
 const complete=await admin.rpc('complete_message_asset',{p_user:user.id,p_asset:assetId,p_bytes:info.bytes,p_duration:info.duration});if(complete.error)throw complete.error;
 // Replacement cleanup only after the new, validated asset is ready.
 await cleanupOrphans(admin,user.id,id).catch(()=>{});
 return reply({ready:true});
});}
export async function DELETE(request:Request,context:Context){return handled(async()=>{
 const {user}=await authorize(request,true);const id=validId((await context.params).id);const assetId=validId(String((await body(request)).assetId));const admin=createAdminClient();
 const a=await admin.from('message_assets').select('id').eq('id',assetId).eq('message_id',id).eq('user_id',user.id).maybeSingle();if(a.error||!a.data)throw new HttpError(404,'No encontramos ese archivo.');
 if(!await cleanupAsset(admin,user.id,assetId,false))throw new HttpError(409,'El archivo está protegido por un envío.');
 return reply({removed:true});
});}
