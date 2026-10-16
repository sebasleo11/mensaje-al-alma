export const MAX_MEDIA_BYTES=20*1024*1024;
export type MediaKind='audio'|'video'|'photo';
const text=(b:Uint8Array,start:number,length:number)=>new TextDecoder().decode(b.subarray(start,start+length));
function int(b:Uint8Array,start:number,length:number){let n=0;for(let i=0;i<length;i++){if(start+i>=b.length)throw new Error('Truncated media');n=n*256+b[start+i];}return n;}
function vint(b:Uint8Array,start:number,keepMarker=false){let length=1;while(length<=8&&!(b[start]&(1<<(8-length))))length++;if(length>8||start+length>b.length)throw new Error('Invalid EBML');let value=keepMarker?b[start]:b[start]&((1<<(8-length))-1);let unknown=!keepMarker&&value===((1<<(8-length))-1);for(let i=1;i<length;i++){value=value*256+b[start+i];unknown &&= b[start+i]===0xff;}return {length,value,unknown};}
function webm(b:Uint8Array){
 let scale=1e6,duration=0,last=0,hasVideo=false,hasAudio=false,blocks=0;const masters=new Set([0x1a45dfa3,0x18538067,0x1549a966,0x1654ae6b,0xae,0x1f43b675,0xa0]);
 const segmentChildren=new Set([0x114d9b74,0x1549a966,0x1654ae6b,0x1f43b675,0x1c53bb6b,0x1941a469,0x1043a770,0x1254c367]);
 function parse(start:number,end:number,cluster=0,depth=0,parent=0,unknown=false):number{if(depth>8)throw new Error('Invalid EBML nesting');for(let p=start;p<end;){const id=vint(b,p,true);
  // Unknown-sized masters end at a sibling/ancestor header, not at EOF.
  if((parent===0x1f43b675&&segmentChildren.has(id.value))||((parent===0x1f43b675||parent===0x18538067)&&(id.value===0x1a45dfa3||id.value===0x18538067))){
   if(unknown)return p;
   throw new Error('Invalid EBML nesting');
  }
  p+=id.length;const size=vint(b,p);p+=size.length;const remaining=end-p;
  // A zero-byte payload is valid: its ID/size header already advanced p.
  // Only Segment/Cluster may omit their size; finite sizes must fit the parent.
  if(remaining<0||(!size.unknown&&size.value>remaining)||(size.unknown&&id.value!==0x18538067&&id.value!==0x1f43b675))throw new Error('Invalid EBML size');
  const len=size.unknown?remaining:size.value;const next=p+len;if(next<p||next>end||next>b.length)throw new Error('Invalid EBML size');
  if((id.value===0xa3||id.value===0xa1)&&len<4)throw new Error('Invalid EBML size');
  if(id.value===0x2ad7b1)scale=int(b,p,len);
  if(id.value===0x4489&&(len===4||len===8)){const v=new DataView(b.buffer,b.byteOffset+p,len);duration=len===4?v.getFloat32(0):v.getFloat64(0);}
  if(id.value===0x83){const t=int(b,p,len);hasVideo ||= t===1;hasAudio ||= t===2;}
  if(id.value===0xe7)cluster=int(b,p,len);
  if((id.value===0xa3||id.value===0xa1)&&len>=4){const track=vint(b,p);const q=p+track.length;if(q+3>=next)throw new Error('Invalid EBML size');const timestamp=new DataView(b.buffer,b.byteOffset+q,2).getInt16(0);if(len>track.length+3)blocks++;last=Math.max(last,cluster+timestamp);}
  if(masters.has(id.value))p=parse(p,next,cluster,depth+1,id.value,size.unknown);else p=next;
 }return end;}parse(0,b.length);
 const seconds=Math.max(duration*scale/1e9,(last*scale/1e9)+(hasVideo?1/24:0.02));
 if(!blocks)throw new Error('Missing media frames');return {duration:seconds,hasVideo,hasAudio};
}
function mp4(b:Uint8Array){let duration=0,hasVideo=false,hasAudio=false,mediaData=false,trackScale=0;const masters=new Set(['moov','trak','mdia','minf','stbl']);function parse(start:number,end:number,depth=0){if(depth>8)throw new Error('Invalid MP4');for(let p=start;p+8<=end;){let size=int(b,p,4);const type=text(b,p+4,4);let header=8;if(size===1){size=int(b,p+8,8);header=16;}if(size===0)size=end-p;if(size<header||p+size>end)throw new Error('Invalid MP4 size');const q=p+header,len=size-header;
 if(type==='mdat'&&len>0)mediaData=true;
 if((type==='mvhd'||type==='mdhd')&&len>=20){const v=b[q];const scale=int(b,q+(v?20:12),4);const ticks=int(b,q+(v?24:16),v?8:4);if(scale>0){duration=Math.max(duration,ticks/scale);if(type==='mdhd')trackScale=scale;}}
 if(type==='stts'&&len>=8){const count=int(b,q+4,4);if(8+count*8>len||!trackScale)throw new Error('Invalid MP4 samples');let ticks=0;for(let i=0;i<count;i++)ticks+=int(b,q+8+i*8,4)*int(b,q+12+i*8,4);duration=Math.max(duration,ticks/trackScale);}
 if(type==='hdlr'&&len>=12){const h=text(b,q+8,4);hasVideo ||= h==='vide';hasAudio ||= h==='soun';}
 if(masters.has(type))parse(q,p+size,depth+1);p+=size;
 }}parse(0,b.length);if(!mediaData)throw new Error('Missing MP4 payload');return {duration,hasVideo,hasAudio};}
function wav(b:Uint8Array){let rate=0,size=0;for(let p=12;p+8<=b.length;){const n=int(new Uint8Array(b.subarray(p+4,p+8)).reverse(),0,4);const kind=text(b,p,4);if(p+8+n>b.length)throw new Error('Invalid WAV');if(kind==='fmt '&&n>=16)rate=new DataView(b.buffer,b.byteOffset+p+16,4).getUint32(0,true);if(kind==='data')size+=n;p+=8+n+(n%2);}return {duration:rate?size/rate:0,hasAudio:true,hasVideo:false};}
function ogg(b:Uint8Array){let last=0;for(let p=0;p+27<=b.length;){if(text(b,p,4)!=='OggS')throw new Error('Invalid Ogg');const count=b[p+26];if(p+27+count>b.length)throw new Error('Invalid Ogg');let length=0;for(let i=0;i<count;i++)length+=b[p+27+i];last=Math.max(last,new DataView(b.buffer,b.byteOffset+p+6,8).getUint32(0,true)+new DataView(b.buffer,b.byteOffset+p+6,8).getUint32(4,true)*2**32);p+=27+count+length;if(p>b.length)throw new Error('Invalid Ogg');}if(!text(b,0,Math.min(b.length,256)).includes('OpusHead'))throw new Error('Only Opus Ogg supported');return {duration:last/48000,hasAudio:true,hasVideo:false};}
function imageDimensions(b:Uint8Array,mime:string){
 let width=0,height=0;
 if(mime==='image/jpeg'){
  if(b[b.length-2]!==0xff||b[b.length-1]!==0xd9)throw new Error('Invalid JPEG');
  for(let p=2;p+4<b.length;){if(b[p++]!==0xff)throw new Error('Invalid JPEG marker');while(b[p]===0xff)p++;const marker=b[p++];if(marker===0xda||marker===0xd9)break;const size=int(b,p,2);if(size<2||p+size>b.length)throw new Error('Invalid JPEG size');if([0xc0,0xc1,0xc2].includes(marker)){height=int(b,p+3,2);width=int(b,p+5,2);}p+=size;}
 }else{
  if(b.length<30||new DataView(b.buffer,b.byteOffset+4,4).getUint32(0,true)+8!==b.length)throw new Error('Invalid WebP size');
  const chunk=text(b,12,4);
  if(chunk==='VP8X'){width=1+b[24]+b[25]*256+b[26]*65536;height=1+b[27]+b[28]*256+b[29]*65536;}
  if(chunk==='VP8 '&&b[23]===0x9d&&b[24]===1&&b[25]===0x2a){width=(b[26]+b[27]*256)&0x3fff;height=(b[28]+b[29]*256)&0x3fff;}
  if(chunk==='VP8L'&&b[20]===0x2f){width=1+b[21]+((b[22]&0x3f)<<8);height=1+(b[22]>>6)+(b[23]<<2)+((b[24]&0xf)<<10);}
 }
 if(!width||!height||width>2048||height>2048)throw new Error('Invalid image dimensions');
 return {width,height};
}
export function inspectMedia(bytes:Uint8Array,mime:string,kind:MediaKind){
 if(!bytes.length||bytes.length>MAX_MEDIA_BYTES)throw new Error('Invalid media size');
 const type=mime.split(';')[0];let detected='';let info:{duration:number;hasAudio:boolean;hasVideo:boolean}|undefined;
 if(bytes[0]===0xff&&bytes[1]===0xd8&&bytes[2]===0xff)detected='image/jpeg';
 else if(text(bytes,0,4)==='RIFF'&&text(bytes,8,4)==='WEBP')detected='image/webp';
 else if(int(bytes,0,4)===0x1a45dfa3){info=webm(bytes);detected=info.hasVideo?'video/webm':'audio/webm';}
 else if(text(bytes,4,4)==='ftyp'){info=mp4(bytes);detected=info.hasVideo?'video/mp4':'audio/mp4';}
 else if(text(bytes,0,4)==='RIFF'&&text(bytes,8,4)==='WAVE'){info=wav(bytes);detected='audio/wav';}
 else if(text(bytes,0,4)==='OggS'){info=ogg(bytes);detected='audio/ogg';}
 if(detected!==type||!detected.startsWith(kind==='photo'?'image/':kind+'/'))throw new Error('Media type mismatch');
 if(kind!=='photo'&&(!info||!Number.isFinite(info.duration)||info.duration<=0||info.duration>(kind==='video'?45:120)||(!info.hasAudio&&kind==='audio')))throw new Error('Invalid media duration');
 const dimensions=kind==='photo'?imageDimensions(bytes,detected):null;
 return {mime:detected,bytes:bytes.length,duration:info?.duration??null,dimensions};
}
