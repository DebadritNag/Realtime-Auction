import {decodeJwt} from 'jose';
import type {AuthContext} from '../../domain/types.js';
import type {AuthService} from './auth.service.js';
import {DomainError} from '../../domain/errors.js';
/** Online validation supports the project's current signing keys and session policy. */
export class SupabaseAuthService implements AuthService{
 constructor(private url:string,private anonKey:string){}
 async verifyAccessToken(token:string):Promise<AuthContext>{
  let response:Response;
  try{response=await fetch(this.url.replace(/\/$/,'')+'/auth/v1/user',{headers:{apikey:this.anonKey,Authorization:'Bearer '+token},signal:AbortSignal.timeout(10000)});}
  catch{throw new DomainError('AUTH_UNAVAILABLE','Authentication service is temporarily unavailable.',503);}
  if(!response.ok)throw new DomainError('UNAUTHENTICATED','Invalid or expired access token.',401);
  const user=await response.json() as {id?:string;user_metadata?:Record<string,unknown>};
  if(!user.id)throw new DomainError('UNAUTHENTICATED','Invalid access token.',401);
  const claims=decodeJwt(token);
  // Metadata is display-only. Permissions use only the verified subject.
  return {userId:user.id,username:typeof user.user_metadata?.username==='string'?user.user_metadata.username:undefined,expiresAt:claims.exp?claims.exp*1000:undefined};
 }
}
