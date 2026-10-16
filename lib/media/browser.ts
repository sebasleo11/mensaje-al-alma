'use client';
import { MAX_MEDIA_BYTES } from './inspect';
export type PreparedMedia={file:File;originalBytes:number;outputBytes:number;duration:number|null};
export function recordingMime(kind:'audio'|'video'){
 if(typeof MediaRecorder==='undefined')return null;
 const candidates=kind==='video'?['video/webm;codecs=vp8,opus','video/webm','video/mp4']:['audio/webm;codecs=opus','audio/webm','audio/mp4'];
 return candidates.find(m=>MediaRecorder.isTypeSupported(m))??null;
}
export async function mediaDuration(file:Blob,kind:'audio'|'video'){
 const element=document.createElement(kind);const url=URL.createObjectURL(file);element.preload='metadata';element.src=url;
 try{return await new Promise<number>((resolve,reject)=>{
  const timer=setTimeout(()=>{element.removeAttribute('src');reject(new Error('No pudimos leer la duración. Probá otro archivo.'));},10000);
  const done=()=>{if(Number.isFinite(element.duration)&&element.duration>0){clearTimeout(timer);resolve(element.duration);}};
  element.onloadedmetadata=()=>{if(element.duration===Infinity){element.currentTime=1e9;element.ontimeupdate=done;}else done();};
  element.onerror=()=>{clearTimeout(timer);reject(new Error('No pudimos reproducir este archivo. Elegí otro formato compatible.'));};
 });}finally{URL.revokeObjectURL(url);element.removeAttribute('src');element.load();}
}
function canvasBlob(canvas:HTMLCanvasElement,type='image/webp',quality=.82){return new Promise<Blob>((resolve,reject)=>canvas.toBlob(b=>b?resolve(b):reject(new Error('No pudimos optimizar la imagen.')),type,quality));}
export function validateVideoResult(originalBytes:number,outputBytes:number,originalDuration:number,outputDuration:number){
 if(!Number.isFinite(outputDuration)||outputDuration<=0||outputDuration>45||Math.abs(outputDuration-originalDuration)>1||outputBytes<=0||outputBytes>=originalBytes||outputBytes>MAX_MEDIA_BYTES)throw new Error('No pudimos reducir el video conservando su duración. Probá otro archivo o navegador; no subimos ni recortamos el original.');
}
export async function prepareMedia(file:File,kind:'photo'|'audio'|'video',progress:(value:string)=>void):Promise<PreparedMedia>{
 if(file.size<=0||file.size>MAX_MEDIA_BYTES)throw new Error('Elegí un archivo de hasta 20 MB.');
 if(kind==='photo'){
  progress('Estamos preparando tu foto…');
  const image=await createImageBitmap(file);try{
   const scale=Math.min(1,2048/Math.max(image.width,image.height));const canvas=document.createElement('canvas');canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));const ctx=canvas.getContext('2d');if(!ctx)throw new Error('No pudimos preparar tu foto.');ctx.drawImage(image,0,0,canvas.width,canvas.height);
   let blob=await canvasBlob(canvas);if(!['image/webp','image/jpeg'].includes(blob.type))blob=await canvasBlob(canvas,'image/jpeg');
   return {file:new File([blob],blob.type==='image/webp'?'foto.webp':'foto.jpg',{type:blob.type}),originalBytes:file.size,outputBytes:blob.size,duration:null};
  }finally{image.close();}
 }
 const duration=await mediaDuration(file,kind);if(duration>(kind==='video'?45:120))throw new Error(kind==='video'?'Tu video puede durar hasta 45 segundos. Elegí uno más breve; no lo recortamos.':'Tu audio puede durar hasta 2 minutos. Elegí uno más breve; no lo recortamos.');
 if(kind==='audio'){
  const mime=file.type.split(';')[0];if(!['audio/webm','audio/mp4','audio/wav','audio/ogg'].includes(mime))throw new Error('Elegí audio WebM, M4A, WAV u Ogg, o grabá tu voz acá.');
  return {file:new File([file],file.name,{type:mime}),originalBytes:file.size,outputBytes:file.size,duration};
 }
 progress('Estamos comprimiendo tu video. Puede tardar lo que dura el original…');
 const mime=recordingMime('video');if(!mime||!HTMLCanvasElement.prototype.captureStream)throw new Error('Este navegador no permite comprimir video. Probá Chrome o Firefox actualizado, o elegí Texto, Audio o Fotos.');
 const video=document.createElement('video');const source=URL.createObjectURL(file);video.src=source;video.playsInline=true;
 let stream:MediaStream|undefined;let context:AudioContext|undefined;let frame=0;
 try{
  await new Promise<void>((resolve,reject)=>{const timer=setTimeout(()=>reject(new Error('No pudimos abrir el video a tiempo.')),10000);video.onloadeddata=()=>{clearTimeout(timer);resolve();};video.onerror=()=>{clearTimeout(timer);reject(new Error('No pudimos abrir el video.'));};});
  const canvas=document.createElement('canvas');const scale=Math.min(1,720/Math.max(video.videoWidth,video.videoHeight));canvas.width=Math.max(2,Math.round(video.videoWidth*scale/2)*2);canvas.height=Math.max(2,Math.round(video.videoHeight*scale/2)*2);const ctx=canvas.getContext('2d');if(!ctx)throw new Error('No pudimos comprimir el video.');
  stream=canvas.captureStream(24);
  context=new AudioContext();await context.resume();const audio=context.createMediaElementSource(video);const destination=context.createMediaStreamDestination();audio.connect(destination);destination.stream.getAudioTracks().forEach(track=>stream!.addTrack(track));
  // Re-encode every frame at bounded resolution/bitrate. Never trim the message.
  const bitrate=Math.max(80000,Math.min(800000,Math.floor(file.size*8/duration*.55)));
  const recorder=new MediaRecorder(stream,{mimeType:mime,videoBitsPerSecond:bitrate,audioBitsPerSecond:48000});
  const chunks:Blob[]=[];const recorded=new Promise<Blob>((resolve,reject)=>{recorder.ondataavailable=e=>{if(e.data.size)chunks.push(e.data);};recorder.onerror=()=>reject(new Error('No pudimos comprimir el video.'));recorder.onstop=()=>resolve(new Blob(chunks,{type:mime.split(';')[0]}));});
  let timer:ReturnType<typeof setTimeout>|undefined;
  const draw=()=>{ctx.drawImage(video,0,0,canvas.width,canvas.height);frame=requestAnimationFrame(draw);};
  const ended=new Promise<void>((resolve,reject)=>{video.onended=()=>{clearTimeout(timer);resolve();};video.onerror=()=>reject(new Error('No pudimos terminar de leer el video.'));timer=setTimeout(()=>reject(new Error('La compresión tardó demasiado. Conservá el original y reintentá.')),(duration+15)*1000);});
  void ended.catch(()=>{});void recorded.catch(()=>{});recorder.start(250);draw();try{await video.play();await ended;}finally{clearTimeout(timer);if(recorder.state!=='inactive')recorder.stop();}
  const blob=await recorded;const output=new File([blob],blob.type==='video/mp4'?'video.mp4':'video.webm',{type:blob.type});
  const resultDuration=await mediaDuration(output,'video');
  validateVideoResult(file.size,blob.size,duration,resultDuration);
  return {file:output,originalBytes:file.size,outputBytes:blob.size,duration:resultDuration};
 }finally{cancelAnimationFrame(frame);video.pause();video.removeAttribute('src');video.load();stream?.getTracks().forEach(t=>t.stop());await context?.close();URL.revokeObjectURL(source);}
}
export async function uploadPrivateFile(file:File,path:string,accessToken:string,url:string,key:string,onProgress:(percent:number)=>void){
 return new Promise<void>((resolve,reject)=>{
  const xhr=new XMLHttpRequest();xhr.open('POST',`${url}/storage/v1/object/alma-private/${path.split('/').map(encodeURIComponent).join('/')}`);xhr.setRequestHeader('Authorization',`Bearer ${accessToken}`);xhr.setRequestHeader('apikey',key);xhr.setRequestHeader('Content-Type',file.type);xhr.setRequestHeader('x-upsert','false');xhr.timeout=120000;
  xhr.upload.onprogress=e=>{if(e.lengthComputable)onProgress(Math.round(e.loaded/e.total*100));};xhr.onload=()=>xhr.status>=200&&xhr.status<300?resolve():reject(new Error('No pudimos subir el archivo. El anterior sigue guardado.'));xhr.onerror=xhr.ontimeout=()=>reject(new Error('La subida se interrumpió. Conservá el archivo y reintentá.'));xhr.send(file);
 });
}
