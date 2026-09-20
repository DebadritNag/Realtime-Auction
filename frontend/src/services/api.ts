import { authService } from './auth.service';
export class ApiError extends Error {
 constructor(message:string,public code='REQUEST_FAILED',public status?:number){super(message);this.name='ApiError';}
}
export function normalizeError(error:unknown):ApiError {
 return error instanceof ApiError?error:new ApiError(error instanceof Error?error.message:'Unable to complete the request.');
}
export async function apiFetch<T>(path:string,options:RequestInit={}):Promise<T>{
 const base=process.env.NEXT_PUBLIC_API_URL?.replace(/\/$/,'').replace(/\/api$/,'');
 if(!base)throw new ApiError('Backend URL is not configured.','CONFIGURATION_ERROR');
 const token=await authService.getAccessToken();
 const headers=new Headers(options.headers);headers.set('Content-Type','application/json');headers.set('Authorization','Bearer '+token);
 let response:Response;
 try{response=await fetch(base+'/api'+(path.startsWith('/')?path:'/'+path),{...options,headers,cache:'no-store'});}
 catch{throw new ApiError('Cannot reach the auction server. Check your connection.','NETWORK_ERROR');}
 const text=await response.text();
 let body:unknown=null;
 if(text){try{body=JSON.parse(text);}catch{throw new ApiError('The server returned an invalid response.','INVALID_RESPONSE',response.status);}}
 if(!response.ok){
  const envelope=body as {error?:{code?:string;message?:string;issues?:{message:string}[]}}|null;
  const error=envelope?.error;
  throw new ApiError(error?.issues?.map(i=>i.message).join('; ')||error?.message||'Request rejected.',error?.code,response.status);
 }
 return body as T;
}
export const api={
 get:<T>(path:string,options?:RequestInit)=>apiFetch<T>(path,options),
 post:<T>(path:string,body?:unknown)=>apiFetch<T>(path,{method:'POST',body:JSON.stringify(body??{})}),
 patch:<T>(path:string,body:unknown)=>apiFetch<T>(path,{method:'PATCH',body:JSON.stringify(body)}),
};
