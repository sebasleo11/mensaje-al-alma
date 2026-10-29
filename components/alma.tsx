'use client';
import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import Image from 'next/image';
import { useMessageDraft } from '@/hooks/use-message-draft';
import AuthNav from '@/components/auth/AuthNav';
import BrandMark from '@/components/BrandMark';
import { ArrowRight, ArrowUpRight, AudioLines, Check, ChevronRight, Gift, Heart, Image as ImageIcon, LockKeyhole, Mail, Moon, Play, ShieldCheck, Sparkles, Sun, Video, X, Feather, Users, Send } from 'lucide-react';

type Format = 'Texto' | 'Audio' | 'Video' | 'Fotos';
type Panel = 'message' | 'gift' | 'privacy' | 'terms' | 'support' | null;
const formats: {name: Format; icon: typeof Mail; label: string; description: string}[] = [
  {name:'Texto',icon:Feather,label:'De tu puño y corazón',description:'Hay palabras que merecen quedarse.'},
  {name:'Audio',icon:AudioLines,label:'Con tu propia voz',description:'Ese tono que solo vos tenés.'},
  {name:'Video',icon:Video,label:'Un instante para siempre',description:'Una mirada también dice mucho.'},
  {name:'Fotos',icon:ImageIcon,label:'Recuerdos que abrazan',description:'Una imagen, mil cosas compartidas.'},
];
export default function Alma() {
 const [dark,setDark] = useState(false);
 const [logoPaused,setLogoPaused] = useState(false);
 useEffect(()=>{try{setLogoPaused(localStorage.getItem('alma-brand-motion')==='paused');}catch{}},[]);
 const [panel,setPanel] = useState<Panel>(null);
 const [format,setFormat] = useState<Format>('Texto');
 const [notice,setNotice] = useState('');
 const { recipient, setRecipient, message, setMessage, saved, setSaved, loading, saving, blocked, source, dirty, saveDraft, saveCurrentDraft, retry } = useMessageDraft(panel === 'message', setNotice);
 const dialog = useRef<HTMLDialogElement>(null);
 const [attachment,setAttachment] = useState<string>('');
 const [videoLimit,setVideoLimit] = useState<45|900>(45);
 const [giftName,setGiftName] = useState('');
 const [giftFrom,setGiftFrom] = useState('');
 const [giftFallbackText,setGiftFallbackText] = useState('');
 const selectedFormat = formats.find(item => item.name === format) ?? formats[0];
 const SelectedFormatIcon = selectedFormat.icon;
 useEffect(()=>{try{setDark(localStorage.getItem('alma-theme')==='dark');}catch{}},[]);
 useEffect(()=>{document.documentElement.dataset.theme=dark?'dark':'light';},[dark]);
 useEffect(()=>{if(panel){dialog.current?.showModal();}else{dialog.current?.close();}setNotice('');},[panel]);
 function closePanel() {
  if (saving) return;
  if (panel === 'message' && (dirty || attachment) && !window.confirm('Tenés texto sin guardar o un archivo de vista previa. ¿Querés cerrar sin conservar esos cambios?')) return;
  setPanel(null);
 }
 async function continueToMessages() {
  if (loading || saving || blocked) return;
  if (attachment && !window.confirm('El archivo de esta vista previa no se guarda. Tendrás que elegirlo de nuevo en Mis mensajes. ¿Querés continuar?')) return;
  if (dirty || recipient || message) {
   const result = await saveCurrentDraft();
   if (!result) return;
   setPanel(null);
   window.setTimeout(() => window.location.assign(result.id ? `/mis-mensajes?borrador=${result.id}` : '/mis-mensajes'), 0);
  } else window.location.assign('/mis-mensajes');
 }
 useEffect(() => {
  const warn = (event: BeforeUnloadEvent) => { if (panel === 'message' && dirty) { event.preventDefault(); event.returnValue = ''; } };
  window.addEventListener('beforeunload', warn);
  return () => window.removeEventListener('beforeunload', warn);
 }, [panel, dirty]);
 function openComposer(selected:Format='Texto') {setFormat(selected);setAttachment('');setVideoLimit(45);setSaved(false);setPanel('message');}
 const invitationUrl = 'https://mensaje-al-alma.vercel.app/';
 function invitationText() {
  return `${giftName.trim()}, quiero invitarte a conocer Mensaje al Alma: un espacio para guardar y compartir palabras, recuerdos y sentimientos con las personas que querés.\n\nDescubrilo acá: ${invitationUrl}\n\nCon cariño,\n${giftFrom.trim()}`;
 }
 function giftFieldsReady() {
  if (giftName.trim() && giftFrom.trim()) return true;
  setNotice('Completá los dos nombres para preparar tu invitación.');
  return false;
 }
 async function copyInvitation(text = invitationText()) {
  try {
   await navigator.clipboard.writeText(text);
   setGiftFallbackText('');
   setNotice('La invitación está copiada, con el enlace incluido. Ya podés compartirla.');
   return true;
  } catch {
   setGiftFallbackText(text);
   setNotice('No pudimos copiarla automáticamente. Seleccioná el texto de abajo y copialo.');
   return false;
  }
 }
 async function createGiftCard() {
  const canvas = document.createElement('canvas');
  canvas.width = 1200;
  canvas.height = 900;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas no disponible');
  const image = new window.Image();
  image.src = '/images/hero-background-still.webp';
  await new Promise<void>((resolve, reject) => { image.onload = () => resolve(); image.onerror = () => reject(new Error('Imagen no disponible')); });
  const scale = Math.max(canvas.width / image.width, canvas.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;
  context.drawImage(image, (canvas.width - width) / 2, (canvas.height - height) / 2, width, height);
  context.fillStyle = 'rgba(20, 34, 27, .58)';
  context.fillRect(0, 0, canvas.width, canvas.height);
  context.fillStyle = '#fffdf6';
  context.textAlign = 'center';
  const drawWrappedText = (text:string, x:number, startY:number, maxWidth:number, lineHeight:number, maxLines:number) => {
   const words = text.split(/\s+/);
   const lines:string[] = [];
   let line = '';
   for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && context.measureText(candidate).width > maxWidth) {
     lines.push(line);
     line = word;
    } else line = candidate;
   }
   if (line) lines.push(line);
   const visibleLines = lines.slice(0, maxLines);
   if (lines.length > maxLines) {
    let last = visibleLines[maxLines - 1] ?? '';
    while (last && context.measureText(`${last}…`).width > maxWidth) last = last.slice(0, -1);
    visibleLines[maxLines - 1] = `${last.trimEnd()}…`;
   }
   visibleLines.forEach((currentLine, index) => context.fillText(currentLine, x, startY + index * lineHeight));
   return startY + visibleLines.length * lineHeight;
  };
  context.font = '600 28px Arial, sans-serif';
  context.letterSpacing = '4px';
  context.fillText('UNA INVITACIÓN PARA VOS', canvas.width / 2, 150);
  context.letterSpacing = '0px';
  context.font = '500 64px Georgia, serif';
  context.fillText('Mensaje al Alma', canvas.width / 2, 280);
  context.font = '400 34px Arial, sans-serif';
  const invitationLineEnd = drawWrappedText(`${giftName.trim()}, te invito a conocer`, canvas.width / 2, 415, 980, 46, 3);
  context.fillText('un espacio para compartir lo que importa.', canvas.width / 2, invitationLineEnd + 10);
  context.fillStyle = '#e7c98b';
  context.font = '600 30px Arial, sans-serif';
  context.fillText(invitationUrl, canvas.width / 2, 610);
  context.fillStyle = '#fffdf6';
  context.font = '400 28px Georgia, serif';
  drawWrappedText(`Con cariño, ${giftFrom.trim()}`, canvas.width / 2, 760, 1000, 36, 2);
  return new Promise<Blob>((resolve, reject) => canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('Imagen no generada')), 'image/png'));
 }
 function downloadGiftCard(blob: Blob) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = 'invitacion-mensaje-al-alma.png';
  link.click();
  URL.revokeObjectURL(url);
 }
 async function offerGiftFallback(blob: Blob) {
  let downloaded = false;
  try {
   downloadGiftCard(blob);
   downloaded = true;
  } catch {}
  const copied = await copyInvitation();
  if (downloaded && copied) setNotice('La tarjeta se descargó y el texto está copiado. Adjuntá la imagen cuando compartas la invitación.');
  else if (downloaded) setNotice('La tarjeta se descargó. Copiá el texto de abajo para compartirlo.');
  else if (copied) setNotice('El texto está copiado, pero no pudimos descargar la tarjeta.');
  else setNotice('No pudimos descargar la tarjeta ni copiar el texto automáticamente. Seleccioná el texto de abajo y probá de nuevo.');
 }
 async function shareGiftCard() {
  if (!giftFieldsReady()) return;
  setGiftFallbackText('');
  let blob:Blob;
  try {
   blob = await createGiftCard();
  } catch {
   setNotice('No pudimos generar la tarjeta. Probá de nuevo o usá “Copiar invitación”.');
   return;
  }
  const file = new File([blob], 'invitacion-mensaje-al-alma.png', {type: 'image/png'});
  const shareData = {title: 'Una invitación a Mensaje al Alma', text: invitationText(), files: [file]};
  let canShareInvitation = false;
  try {
   canShareInvitation = typeof navigator.share === 'function' && typeof navigator.canShare === 'function' && navigator.canShare(shareData);
  } catch {}
  if (canShareInvitation) {
   try {
    await navigator.share(shareData);
    setNotice('La tarjeta y el texto quedaron disponibles para compartir.');
    return;
   } catch (error) {
    if (error instanceof DOMException && error.name === 'AbortError') return;
   }
  }
  await offerGiftFallback(blob);
 }
 function handleAttachmentChange(event: ChangeEvent<HTMLInputElement>) {
  const file = event.target.files?.[0];
  setAttachment('');
  if (!file) return;
  if (file.size > 20 * 1024 * 1024) { setNotice('Elegí un archivo de hasta 20 MB para esta vista previa.'); event.target.value=''; return; }
  if (format === 'Video') {
   const url = URL.createObjectURL(file);
   const video = document.createElement('video');
   video.preload = 'metadata';
   video.src = url;
   video.onloadedmetadata = () => {
    URL.revokeObjectURL(url);
    if (video.duration > videoLimit) {
     setNotice(`Tu video puede durar hasta ${videoLimit === 45 ? '45 segundos' : '15 minutos'}. Elegí uno más corto.`);
     event.target.value='';
    } else {
     setAttachment(file.name);
     setNotice('Archivo seleccionado para la vista previa. Todavía no se sube ni se guarda.');
    }
   };
   video.onerror = () => { URL.revokeObjectURL(url); setNotice('No pudimos leer este video. Probá con otro archivo.'); };
   return;
  }
  setAttachment(file.name);
  setNotice('Archivo seleccionado para la vista previa. Todavía no se sube ni se guarda.');
 }
 return <>
 <header className="header"><div className="shell nav"><div className="brand"><button className="brand-symbol brand-motion-toggle" type="button" aria-label={logoPaused?'Reanudar animación del logo':'Pausar animación del logo'} title={logoPaused?'Reanudar animación del logo':'Pausar animación del logo'} onClick={()=>{const paused=!logoPaused;setLogoPaused(paused);try{localStorage.setItem('alma-brand-motion',paused?'paused':'playing');}catch{}}}><BrandMark animated paused={logoPaused} size={32}/></button><a href="#" className="brand-wordmark" aria-label="Mensaje al Alma, inicio">mensaje al alma<span className="brand-dot">.</span></a></div><nav aria-label="Navegación principal"><a href="#como-funciona">Cómo funciona</a><a href="#regalar">Un regalo especial</a><a href="#formatos">Los formatos</a></nav><div className="nav-actions"><button className="theme-button" aria-label={dark?'Activar modo claro':'Activar modo oscuro'} onClick={()=>{setDark(!dark);try{localStorage.setItem('alma-theme',!dark?'dark':'light');}catch{}}}>{dark?<Sun size={18}/>:<Moon size={18}/>}</button><AuthNav /><button className="nav-start" onClick={()=>openComposer()}>Comenzar <ArrowUpRight size={16}/></button></div></div></header>
 <main>
 <section className="hero" aria-labelledby="hero-title"><video className="hero-video" autoPlay loop muted playsInline preload="metadata" aria-hidden="true" tabIndex={-1}><source src="/videos/hero-background.mp4" type="video/mp4"/></video><div className="hero-veil" aria-hidden="true"/><div className="hero-content"><div className="hero-copy"><div className="eyebrow"><span className="tiny-line"/> LAS PALABRAS QUE NOS ACERCAN</div><h1 id="hero-title">Hay palabras que<br/>merecen llegar<br/><span>al alma.</span><svg viewBox="0 0 270 22" aria-hidden="true"><path d="M5 14 Q120 -2 260 12 M15 20 Q145 6 250 17"/></svg></h1><p className="hero-description">Eso que siempre quisiste decir.<br/>Ese gracias, ese te quiero, ese acá estoy.<br/>Dale un lugar. Y hacelo llegar.</p><button className="button primary" onClick={()=>openComposer()}>Regalá tus primeros 3 mensajes gratis <ArrowRight size={18}/></button><div className="hero-note"><Check size={14}/> Sin tarjeta. Sin apuro. Con todo tu corazón.</div><div className="hero-bottom"><span className="little-heart"><Heart size={16}/></span><span>Para alguien especial.<br/><strong>Para hoy, o para cuando estés listo.</strong></span></div></div>
 <div className="hero-art"><span className="art-spark spark-one">✳</span><div className="message-card"><div className="card-top"><span className="card-heart"><Heart size={19} strokeWidth={1.5}/></span><span>UN MENSAJE PARA VOS</span><Sparkles size={15}/></div><p>“A veces me olvido de decirte<br/>lo importante que sos para mí.<br/><em>Hoy no quería olvidarme.”</em></p><div className="card-bottom"><span className="avatar">M</span><span>Con amor, mamá</span><Heart size={13}/></div></div><div className="floating-note"><span><Mail size={17}/></span>Un pequeño mensaje.<br/><strong>Un abrazo enorme.</strong></div><span className="art-spark spark-two">✧</span></div>
 </div></section>
 <section className="how section shell" id="como-funciona"><div className="section-heading"><div><span className="eyebrow">SIMPLE, COMO EL CARIÑO</span><h2>Del corazón a su bandeja de entrada.</h2></div><p>No necesitás las palabras perfectas.<br/>Solo las tuyas.</p></div><div className="steps"><article><div className="step-icon"><Users size={25} strokeWidth={1.3}/><span>01</span></div><h3>Pensá en esa persona</h3><p>Elegí a quien querés regalarle{' '}<br/>un poquito de vos.</p></article><span className="step-connector" aria-hidden="true">··················· <ArrowRight size={16}/></span><article><div className="step-icon"><Feather size={25} strokeWidth={1.3}/><span>02</span></div><h3>Encontrá tu forma de decirlo</h3><p>Escribí, grabá tu voz o compartí{' '}<br/>un recuerdo. Lo que te salga.</p></article><span className="step-connector" aria-hidden="true">··················· <ArrowRight size={16}/></span><article><div className="step-icon"><Send size={25} strokeWidth={1.3}/><span>03</span></div><h3>Elegí el momento</h3><p>Envialo ahora o guardalo para después.{' '}<br/>Vos marcás el ritmo.</p></article></div></section>
 <section className="gift-section shell" id="regalar"><div className="gift-art"><div className="gift-circle"/><div className="gift-envelope"><div className="gift-letter"><span>PARA ALGUIEN MUY ESPECIAL</span><Heart size={27} strokeWidth={1.2}/><p>Te regalo un espacio<br/>para lo que llevás<br/><em>en el corazón.</em></p><span>mensaje al alma.</span></div><div className="envelope-front"/><div className="envelope-seal"><Gift size={23} strokeWidth={1.3}/></div></div><span className="gift-star">✧</span><span className="gift-star second">✳</span></div><div className="gift-copy"><span className="eyebrow"><Gift size={14}/> UN REGALO QUE ABRE CONVERSACIONES</span><h2>No todo regalo<br/>se envuelve.<br/><span>Algunos se sienten.</span></h2><p>Regalale a alguien que querés un espacio para sus palabras, sus recuerdos y su voz. Una invitación a compartir eso que importa de verdad.</p><button className="button secondary" onClick={()=>setPanel('gift')}>Regalar un Mensaje al Alma <ArrowUpRight size={17}/></button><small>Para un cumpleaños. Para agradecer. Porque sí.</small></div></section>
 <section className="formats section shell" id="formatos"><div className="section-heading"><div><span className="eyebrow">TU CARIÑO, A TU MANERA</span><h2>Hay más de una forma de estar cerca.</h2></div><span className="format-hint">Elegí la que más se parezca a vos <ArrowDownHint/></span></div><div className="format-grid">{formats.map(({name,icon:Icon,label,description})=><button key={name} className={`format-card format-${name.toLowerCase()}`} onClick={()=>openComposer(name)}><div className="format-visual">{name==='Texto'?<div className="mini-paper"><span>Querida mamá,</span><i/><i/><i/><Heart size={13}/></div>:name==='Audio'?<div className="waveform">{[14,24,38,22,48,34,56,25,43,60,34,48,22,36,16,26,12].map((h,i)=><i key={i} style={{height:h}}/>)}<span><Play size={12} fill="currentColor"/></span></div>:name==='Video'?<div className="mini-video"><Image src="https://images.unsplash.com/photo-1511895426328-dc8714191300?auto=format&fit=crop&w=500&q=80" alt="Una familia compartiendo un momento al aire libre" fill unoptimized sizes="250px"/><span><Play size={18} fill="currentColor"/></span><small>00:30</small></div>:<div className="polaroids"><div className="polaroid back"/><div className="polaroid"><Image src="https://images.unsplash.com/photo-1475924156734-496f6cac6ec1?auto=format&fit=crop&w=400&q=80" alt="Recuerdo de un atardecer en el mar" width={110} height={90} unoptimized/><Heart size={12}/></div></div>}</div><div className="format-title"><span><Icon size={16}/>{name}</span><ArrowUpRight size={17}/></div><h3>{label}</h3><p>{description}</p></button>)}</div><p className="format-footnote">Pequeños mensajes, grandes emociones. <span>Videos breves de hasta 45 segundos.</span></p></section>
 <section className="trust shell"><div className="trust-badge"><ShieldCheck size={30} strokeWidth={1.3}/></div><div><span className="eyebrow">UN ESPACIO PARA LO QUE IMPORTA</span><h2>Tus palabras. Tus tiempos. Tu decisión.</h2><p>Vos elegís qué compartir y con quién. Podés pausar y editar tu borrador<br className="desktop-break"/> cuando lo necesites. Con tu sesión iniciada, tus palabras se guardan en tu cuenta.</p></div><button onClick={()=>setPanel('privacy')}>Conocé cómo cuidamos tu espacio <ArrowUpRight size={16}/></button></section>
 <div className="footer-ambient relative w-full overflow-hidden bg-black flex flex-col justify-between min-h-[640px] md:min-h-[720px]"><video src="/videos/colibri.mp4" autoPlay loop muted playsInline preload="auto" aria-hidden="true" tabIndex={-1} className="footer-ambient-video absolute inset-0 w-full h-full object-cover object-[center_30%] pointer-events-none"/><div className="footer-ambient-overlay absolute inset-0 bg-gradient-to-b from-black/20 via-transparent to-black/60 pointer-events-none" aria-hidden="true"/><section className="footer-cta relative z-10 flex-1 flex items-center justify-center"><div className="footer-cta-content relative z-10 flex-1 flex flex-col items-center justify-center text-center px-6 py-16 max-w-3xl mx-auto space-y-4"><span className="eyebrow text-emerald-200 text-xs sm:text-sm tracking-widest uppercase font-medium drop-shadow">QUIZÁS HOY SEA UN BUEN DÍA</span><h2 className="text-white font-serif text-3xl sm:text-5xl md:text-6xl leading-tight drop-shadow-lg">Alguien está esperando<br/><span>esas palabras tuyas.</span></h2><button className="button primary mt-2 bg-[#1b3328] hover:bg-[#14261e] text-white px-8 py-4 rounded-full font-medium transition-all shadow-xl hover:scale-105" onClick={()=>openComposer()}>Comenzá con tus 3 mensajes gratis <ArrowRight size={18}/></button><p className="text-white/90 text-sm sm:text-base drop-shadow mt-1">Un pequeño gesto puede quedarse para siempre.</p></div></section><footer className="footer-bottom relative z-10 w-full border-t border-white/10 bg-black/20 backdrop-blur-sm py-6 px-6 sm:px-12"><a href="#" className="brand text-white/80" aria-label="Mensaje al Alma, inicio"><BrandMark size={20}/>mensaje al alma<span className="brand-dot">.</span></a><span className="text-white/80">Hecho para acercarnos.</span><div><button className="text-white/70 hover:text-white transition-colors text-xs sm:text-sm" onClick={()=>setPanel('privacy')}>Privacidad</button><button className="text-white/70 hover:text-white transition-colors text-xs sm:text-sm" onClick={()=>setPanel('terms')}>Términos</button><button className="text-white/70 hover:text-white transition-colors text-xs sm:text-sm" onClick={()=>setPanel('support')}>Ayuda</button></div><small className="text-white/70 text-xs sm:text-sm">© {new Date().getFullYear()} Mensaje al Alma</small></footer></div>
 </main>
 <dialog aria-label="Mensaje al Alma" ref={dialog} onCancel={event=>{event.preventDefault();closePanel();}} onClick={event=>{if(event.target===dialog.current)closePanel();}}>
  <button className="close-dialog" aria-label="Cerrar" onClick={closePanel}><X size={21}/></button>
  {panel==='message' ? <>
   <span className="eyebrow">A TU RITMO</span>
   <h2>Un espacio para tus palabras.</h2>
   <p className="dialog-intro">No hace falta decirlo todo hoy. Podés empezar por algo pequeño.</p>
   <div className="format-lock" aria-label={`Formato seleccionado: ${format}`}><SelectedFormatIcon size={17}/><span>{format}</span></div>
   <form onSubmit={saveDraft} aria-busy={loading || saving}>
    {loading && <p role="status">Estamos recuperando tu borrador…</p>}
    {blocked && <button className="button secondary" type="button" onClick={retry}>Reintentar conexión</button>}
    <fieldset disabled={loading || saving || blocked} className="draft-fields">
     <label htmlFor="recipient">Email del destinatario</label>
     <input id="recipient" type="email" autoComplete="email" required maxLength={254} placeholder="alguien@ejemplo.com" value={recipient} onChange={event=>{setRecipient(event.target.value);setSaved(false);}}/>
     {format==='Texto' ? <>
      <label htmlFor="message">¿Qué te gustaría decirle?</label>
      <textarea id="message" required maxLength={5000} rows={6} placeholder="Podés empezar con: «Gracias por…»" value={message} onChange={event=>{setMessage(event.target.value);setSaved(false);}}/>
      <div className="character-count">{message.length} / 5000</div>
     </> : <>
      <label htmlFor="message">Texto acompañante o explicativo</label>
      <textarea id="message" maxLength={5000} rows={5} placeholder="Contá qué querés acompañar con este recuerdo…" value={message} onChange={event=>{setMessage(event.target.value);setSaved(false);}}/>
      <div className="character-count">{message.length} / 5000</div>
      <div className="attachment-panel">
       <p>{format==='Audio'?'Tu voz también puede ser un abrazo.':format==='Video'?'Un momento para compartir, con todo tu cariño.':'Un recuerdo que vale la pena guardar.'}</p>
       {format==='Video' && <>
        <label htmlFor="video-duration">Duración del video</label>
        <select id="video-duration" value={videoLimit} onChange={event=>{setVideoLimit(Number(event.target.value) as 45|900);setAttachment('');setNotice('');}}>
         <option value={45}>Breve · hasta 45 segundos</option>
         <option value={900}>Extendido · hasta 15 minutos</option>
        </select>
       </>}
       <label className="file-label">Elegir {format==='Fotos'?'fotos':format==='Audio'?'audio':'video'}
        <input type="file" accept={format==='Fotos'?'image/*':format==='Audio'?'audio/*':'video/*'} capture={format==='Audio'||format==='Video'?'user':undefined} onChange={handleAttachmentChange}/>
       </label>
       {attachment && <small>{attachment}</small>}
       <p className="muted">Podés subir un archivo o grabarlo desde un dispositivo compatible. En este editor sólo se prepara una vista previa; para guardarlo de forma privada, abrí Mis mensajes.</p>
      </div>
     </>}
     <div className="local-note"><LockKeyhole size={15}/> {source === 'cloud' ? 'Con sesión iniciada: el borrador se guarda en tu cuenta. No se envían emails.' : source === 'local' ? 'Sin sesión iniciada: el borrador se guarda en este navegador. No se envían emails.' : 'Necesitamos comprobar tu sesión antes de guardar.'}</div>
     {format==='Texto' && <button className="button primary full" type="submit">{saving ? 'Guardando…' : saved ? <><Check size={17}/> Borrador guardado</> : <>Guardar borrador <ArrowRight size={17}/></>}</button>}
     <button className="button secondary full" type="button" onClick={()=>void continueToMessages()}>Continuar en Mis mensajes <ArrowRight size={17}/></button>
     <p className="local-note">{source === 'cloud' ? 'Guardamos tu borrador antes de abrir el editor completo. Allí podés revisar y confirmar el envío.' : 'Guardamos tu borrador en este navegador antes de ir al editor completo, que requiere sesión.'}</p>
    </fieldset>
   </form>
  </> : panel==='gift' ? <>
   <span className="dialog-gift"><Gift size={29}/></span><span className="eyebrow">UNA INVITACIÓN CON SENTIDO</span><h2>Invitá a conocer Mensaje al Alma.</h2>
   <p className="dialog-intro">Creá una tarjeta cálida y personalizada para compartir este espacio con alguien especial.</p>
   <div className="gift-how"><p><strong>¿Cómo funciona?</strong></p><ol><li>Completá los nombres.</li><li>Compartí la tarjeta o copiá la invitación.</li><li>La persona invitada puede entrar a conocer Mensaje al Alma.</li></ol></div>
   <form onSubmit={event=>{event.preventDefault();void copyInvitation();}}>
    <label htmlFor="gift-name">¿A quién querés invitar?</label><input id="gift-name" name="name" placeholder="Su nombre" required maxLength={100} value={giftName} onChange={event=>{setGiftName(event.target.value);setGiftFallbackText('');}}/>
    <label htmlFor="gift-from">¿Quién invita?</label><input id="gift-from" name="from" placeholder="Tu nombre" required maxLength={100} value={giftFrom} onChange={event=>{setGiftFrom(event.target.value);setGiftFallbackText('');}}/>
    <div className="gift-card-preview" aria-label="Vista previa de la tarjeta de invitación" style={{backgroundImage:"url('/images/hero-background-still.webp')"}}><div className="gift-card-preview-overlay"><span>UNA INVITACIÓN PARA VOS</span><strong>Mensaje al Alma</strong><p>{giftName.trim() || 'Tu nombre invitado'}, te invito a conocer un espacio para compartir lo que importa.</p><a href={invitationUrl} target="_blank" rel="noreferrer">{invitationUrl}</a><small>Con cariño, {giftFrom.trim() || 'tu nombre'}</small></div></div>
    <div className="gift-actions"><button className="button primary full" type="button" onClick={()=>void shareGiftCard()}>Compartir tarjeta <Send size={17}/></button><button className="button secondary full" type="submit">Copiar invitación <Gift size={17}/></button></div>
    {giftFallbackText ? <textarea className="gift-fallback-text" aria-label="Texto de la invitación para copiar manualmente" readOnly value={giftFallbackText} onFocus={event=>event.currentTarget.select()}/> : null}
    <p className="local-note">La invitación es gratuita y no incluye la compra de un mensaje.</p>
    <p className="local-note">No realiza una compra ni envía correos automáticamente. Si tu navegador no puede compartir imagen y texto juntos, se descarga la tarjeta y se copia el texto para que los adjuntes vos.</p>
   </form>
  </> : panel==='privacy' ? <>
   <span className="eyebrow">TU ESPACIO PERSONAL</span><h2>Privacidad en esta versión</h2>
   <p>Con una sesión iniciada, tu borrador se guarda en Supabase asociado a tu cuenta. Sin sesión, se guarda en este navegador.</p>
   <p>Los archivos seleccionados en este editor no se suben ni se conservan al cerrar la ventana. En Mis mensajes podés guardar multimedia privada.</p>
  </> : panel==='terms' ? <>
   <span className="eyebrow">CON CLARIDAD</span><h2>Sobre este prototipo</h2>
   <p>Esta versión permite explorar los formatos, guardar un borrador y preparar una invitación para compartir.</p>
   <p>Guardar un borrador no envía ni programa nada: primero revisás el envío y después lo confirmás.</p>
  </> : <>
   <span className="eyebrow">ESTAMOS PARA ACOMPAÑARTE</span><h2>Un poquito de ayuda</h2>
   <p>Agregá el email, tus palabras y, si elegís un formato multimedia, el archivo que querés acompañar. Para guardar multimedia o enviar, continuá en Mis mensajes.</p>
   <p>Si no podés guardar, conservá el texto en el editor y reintentá.</p>
  </>}
  {notice && <p className="notice" role="status">{notice}</p>}
 </dialog>
 </>;
}
function ArrowDownHint(){return <ChevronRight size={15} style={{transform:'rotate(90deg)'}}/>;}
