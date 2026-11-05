'use client';
import { useEffect,useState } from 'react';
import LetterPaper,{ AudioLetter,VideoLetter } from '@/components/letters/LetterPaper';
export default function RecipientMessage({id}:{id:string}){
 const [data,setData]=useState<{content:string;format:string;mediaUrl:string|null;style?:{paper?:string;font?:string}}|null>(null);const [error,setError]=useState('');const [revision,setRevision]=useState(0);
 useEffect(()=>{let active=true;const controller=new AbortController();const token=location.hash.slice(1);setError('');void fetch('/api/recipient',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,token}),signal:controller.signal}).then(async r=>{const value=await r.json();if(!r.ok)throw new Error(value.error);if(active)setData(value);}).catch(()=>{if(active)setError('No pudimos abrir este mensaje. El enlace puede no estar disponible.');});return()=>{active=false;controller.abort();};},[id,revision]);
 return <main className="recipient-page recipient-letter"><span className="eyebrow">MENSAJE AL ALMA</span><h1>Unas palabras para vos.</h1>{error?<p className="notice">{error}</p>:!data?<p role="status">Estamos abriendo tu mensaje…</p>:<>
  {data.format==='audio'&&data.mediaUrl?<AudioLetter src={data.mediaUrl} text={data.content} style={data.style}/>
  :data.format==='video'&&data.mediaUrl?<VideoLetter src={data.mediaUrl} text={data.content} style={data.style}/>
  :<><LetterPaper text={data.content} style={data.style}/>{data.mediaUrl&&data.format==='photo'&&<img src={data.mediaUrl} alt="Un recuerdo compartido con vos"/>}</>}
  {data.mediaUrl&&<button className="auth-nav-link" onClick={()=>setRevision(n=>n+1)}>Renovar acceso al archivo</button>}<p>A tu ritmo, con todo el corazón.</p></>}</main>;
}
