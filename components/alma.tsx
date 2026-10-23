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
 <footer><div className="footer-cta shell"><span className="eyebrow">QUIZÁS HOY SEA UN BUEN DÍA</span><h2>Alguien está esperando<br/><span>esas palabras tuyas.</span></h2><button className="button primary" onClick={()=>openComposer()}>Comenzá con tus 3 mensajes gratis <ArrowRight size={18}/></button><p>Un pequeño gesto puede quedarse para siempre.</p></div><div className="footer-bottom shell"><a href="#" className="brand" aria-label="Mensaje al Alma, inicio"><BrandMark size={20}/>mensaje al alma<span className="brand-dot">.</span></a><span>Hecho para acercarnos.</span><div><button onClick={()=>setPanel('privacy')}>Privacidad</button><button onClick={()=>setPanel('terms')}>Términos</button><button onClick={()=>setPanel('support')}>Ayuda</button></div><small>© {new Date().getFullYear()} Mensaje al Alma</small></div></footer>
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
   <span className="dialog-gift"><Gift size={29}/></span><span className="eyebrow">UN REGALO CON SENTIDO</span><h2>Una invitación al corazón.</h2>
   <p className="dialog-intro">Prepará una tarjeta para alguien especial. Podés copiarla y compartirla como prefieras.</p>
   <form onSubmit={async event=>{event.preventDefault();const form=new FormData(event.currentTarget);const text=`${form.get('name')}, te regalo una invitación a Mensaje al Alma: un espacio para esas palabras, recuerdos y afectos que merecen compartirse. Con cariño, ${form.get('from')}.`;try{await navigator.clipboard.writeText(text);setNotice('Tu invitación está copiada. Ya podés compartirla.');}catch{setNotice(text);}}}>
    <label htmlFor="gift-name">¿A quién querés invitar?</label><input id="gift-name" name="name" placeholder="Su nombre" required maxLength={100}/>
    <label htmlFor="gift-from">Tu nombre</label><input id="gift-from" name="from" placeholder="De parte de…" required maxLength={100}/>
    <button className="button primary full" type="submit">Copiar mi invitación <Gift size={17}/></button>
    <p className="local-note">Esta tarjeta es una invitación de texto. No realiza una compra ni envía un correo.</p>
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
