import assert from 'node:assert/strict';
import { quotaSummary } from '../lib/messages/quota';
export function verifyQuota(){
 assert.equal(quotaSummary({limit:53,additional:50,used:3,remaining:50}).remaining,50);
 assert.equal(quotaSummary({limit:3,additional:0,used:3,remaining:0}).remaining,0);
 assert.equal(quotaSummary({limit:53,additional:50,used:53,remaining:0}).remaining,0);
 for(const q of [null,{limit:53,additional:0,used:3,remaining:50},{limit:53,additional:50,used:3,remaining:53},{limit:3,additional:0,used:-1,remaining:4}])assert.throws(()=>quotaSummary(q));
 console.log('OK: saldo recibido del servidor, 50 adicionales sin reiniciar uso, saldo agotado y rechazo de respuestas incoherentes. SQL no ejecutado.');
}
