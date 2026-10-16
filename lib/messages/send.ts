import type { SendAttempt } from '@/utils/supabase/database.types';
import type { CreateEmailOptions, CreateEmailResponse } from 'resend';
import { confirmedProviderRejection } from '@/lib/email/message';
export type SendDependencies={
 reserve:()=>Promise<SendAttempt>; prepare:(a:SendAttempt)=>Promise<void>;
 claim:(id:string)=>Promise<{attempt:SendAttempt;replay:boolean;payload:CreateEmailOptions}|null>;
 finish:(id:string,state:'accepted'|'failed'|'uncertain',provider?:string)=>Promise<void>;
 send:(payload:CreateEmailOptions,key:string)=>Promise<CreateEmailResponse>;
};
export async function sendMessage(deps:SendDependencies){
 const attempt=await deps.reserve();
 if(['accepted','delivered','bounced'].includes(attempt.state))return {state:attempt.state,attemptId:attempt.id};
 await deps.prepare(attempt);
 const claim=await deps.claim(attempt.id);
 if(!claim)return {state:attempt.state==='prepared'?'sending':attempt.state,attemptId:attempt.id};
 try{
  const result=await deps.send(claim.payload,`alma-message/${attempt.id}/v1`);
  if(result.data?.id&&!result.error){await deps.finish(attempt.id,'accepted',result.data.id);return {state:'accepted',attemptId:attempt.id};}
  const state=confirmedProviderRejection(result.error?.statusCode,claim.replay)?'failed':'uncertain';
  await deps.finish(attempt.id,state);
  return {state,attemptId:attempt.id};
 }catch{
  // Includes provider acceptance followed by a DB failure. Never unlock blindly.
  try{await deps.finish(attempt.id,'uncertain');}catch{}
  return {state:'uncertain',attemptId:attempt.id};
 }
}
