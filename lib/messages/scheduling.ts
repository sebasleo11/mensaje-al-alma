import type { MessageSchedule } from '@/utils/supabase/database.types';
export function formatUtcOffset(minutes:number) { const absolute=Math.abs(minutes);return `UTC${minutes<0?'−':'+'}${String(Math.floor(absolute/60)).padStart(2,'0')}:${String(absolute%60).padStart(2,'0')}`; }
export function formatLocalDateTime(local:string) {
 const match=/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(local);
 if(!match)return local;
 const [,year,month,day,hour,minute]=match;
 return `${day}/${month}/${year} · ${hour}:${minute} h`;
}
export function formatStoredTimestamp(value:string,timeZone='America/Argentina/Buenos_Aires') {
 const date=new Date(value);
 if(!Number.isFinite(date.getTime()))return value;
 return new Intl.DateTimeFormat('es-AR',{timeZone,day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(date).replace(',', ' ·')+' h';
}
export const MIN_ADVANCE_MS = 5 * 60_000;
export const MAX_DELAY_MS = 15 * 60_000;
export function activeSchedule(s: MessageSchedule) { return ['scheduled','blocked','dispatching'].includes(s.state); }
export function latestSchedule(schedules: MessageSchedule[], messageId: string) {
 return schedules.filter(s=>s.message_id===messageId).sort((a,b)=>Date.parse(b.updated_at)-Date.parse(a.updated_at))[0]??null;
}
export function schedulePresentation(schedule: MessageSchedule|null, attemptState?: string) {
 if(attemptState==='uncertain') return {key:'uncertain',label:'Resultado incierto',description:'No pudimos confirmar todavía el resultado del envío.'};
 if(!schedule) return null;
 if(schedule.state==='scheduled') return {key:'scheduled',title:'Mensaje preparado',label:'En espera de envío',description:'Mensaje preparado. Tu mensaje quedó guardado y se enviará automáticamente en la fecha indicada.'};
 if(schedule.state==='blocked') return {key:'blocked',label:'En revisión',description:'La programación necesita revisión antes de continuar.'};
 if(schedule.state==='dispatching') return {key:'dispatching',label:'Enviando',description:'El envío de este mensaje está comenzando.'};
 if(schedule.state==='cancelled') return {key:'cancelled',label:'Cancelado',description:'La programación fue cancelada y no se realizará este envío.'};
 return {key:'finished',label:'Enviado',description:'El envío de este mensaje finalizó.'};
}
export function missingScheduleSchema(error: {code?:string}|null) { return !!error && ['42P01','42883','PGRST205','PGRST202'].includes(error.code??''); }
export function occupiedSlots(attempts: {state:string}[], schedules: {state:string}[]) { return attempts.filter(a=>a.state!=='failed').length+schedules.filter(s=>['scheduled','blocked'].includes(s.state)).length; }
export function overdue(scheduledAt:string, now=Date.now()) { return now-Date.parse(scheduledAt)>MAX_DELAY_MS; }
/** Enumerate UTC offsets via Intl's IANA database; never interpret local input in the host zone. */
export function scheduleTime(local:string, zone:string, offset?:number, now=Date.now()) {
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))throw new Error('Revisá la fecha y la hora.');
 const naive=Date.parse(local+':00Z');
 if(!Number.isFinite(naive)||new Date(naive).toISOString().slice(0,16)!==local)throw new Error('La fecha no es válida.');
 let formatter:Intl.DateTimeFormat;
 try { formatter=new Intl.DateTimeFormat('en-CA',{timeZone:zone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}); }catch{throw new Error('Elegí una zona horaria IANA válida.');}
 const matches:{instant:number;offset:number}[]=[];
 // Modern IANA offsets are minute-aligned. Search both sides of DST without choosing an occurrence silently.
 for(let minutes=-14*60;minutes<=14*60;minutes++){
  const instant=naive-minutes*60_000;
  const parts=Object.fromEntries(formatter.formatToParts(instant).map(p=>[p.type,p.value]));
  if(`${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`===local)matches.push({instant,offset:minutes});
 }
 if(!matches.length)throw new Error('Esa hora no existe en la zona elegida por un cambio de horario.');
 if(matches.length>1&&offset===undefined)throw new Error('Esa hora se repite. Indicá el desplazamiento UTC de la ocurrencia que querés.');
 const chosen=offset===undefined?matches[0]:matches.find(m=>m.offset===offset);
 if(!chosen)throw new Error('El desplazamiento UTC no corresponde a esa fecha y zona.');
 if(chosen.instant-now<MIN_ADVANCE_MS)throw new Error('Programá con al menos 5 minutos de anticipación.');
 return {scheduledAt:new Date(chosen.instant).toISOString(),timeZone:zone,localDatetime:local,utcOffsetMinutes:chosen.offset};
}
