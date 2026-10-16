import type { MessageQuota } from '@/utils/supabase/database.types';
export function quotaSummary(value:unknown):MessageQuota {
 const q=value as MessageQuota|null;
 if(!q||![q.limit,q.additional,q.used,q.remaining].every(n=>Number.isSafeInteger(n)&&n>=0)||q.limit!==3+q.additional||q.remaining!==Math.max(0,q.limit-q.used))throw new Error('Quota unavailable');
 return q;
}
