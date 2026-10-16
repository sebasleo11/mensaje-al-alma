import RecipientMessage from '@/components/messages/RecipientMessage';
export const metadata={title:'Un mensaje para vos — Mensaje al Alma',robots:{index:false,follow:false},referrer:'no-referrer' as const};
export default async function RecipientPage({params}:{params:Promise<{id:string}>}){return <RecipientMessage id={(await params).id}/>;}
