import { redirect } from 'next/navigation';
import { createClient } from '@/utils/supabase/server';
import MessagesPanel from '@/components/messages/MessagesPanel';
import { listEnabledPaymentPackages } from '@/lib/payments/packages';
export const dynamic='force-dynamic';
export default async function MessagesPage(){const client=await createClient();const {data,error}=await client.auth.getUser();if(error||!data.user)redirect('/login');return <MessagesPanel userId={data.user.id} paymentPackages={listEnabledPaymentPackages()}/>;}
