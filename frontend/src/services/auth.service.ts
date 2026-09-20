import type { User as SupabaseUser } from '@supabase/supabase-js';
import type { User } from '@/types';
import { getSupabase } from '@/lib/supabase';
export interface SignInCredentials {email:string;password?:string;rememberMe?:boolean}
export interface SignUpCredentials {username:string;email:string;password?:string}
export function mapUser(user:SupabaseUser):User {
 const data:Record<string,unknown>=user.user_metadata;
 const text=(key:string,fallback='')=>typeof data[key]==='string'?data[key] as string:fallback;
 return {id:user.id,email:user.email??'',username:text('username',user.email?.split('@')[0]??'Manager'),
 displayName:text('display_name',text('username',user.email?.split('@')[0]??'Manager')),avatarUrl:text('avatar_url'),
 defaultTeamName:text('default_team_name',''),defaultTeamLogo:text('default_team_logo','⚽')};
}
export const authService={
 async signIn(credentials:SignInCredentials) {
  const {data,error}=await getSupabase().auth.signInWithPassword({email:credentials.email,password:credentials.password??''});
  if(error) throw error; return {user:mapUser(data.user),token:data.session.access_token};
 },
 async signUp(credentials:SignUpCredentials) {
  const {data,error}=await getSupabase().auth.signUp({email:credentials.email,password:credentials.password??'',
   options:{data:{username:credentials.username,display_name:credentials.username},emailRedirectTo:window.location.origin+'/home'}});
  if(error) throw error;
  return {user:data.session&&data.user?mapUser(data.user):null,needsConfirmation:!data.session};
 },
 async getSession():Promise<User|null> {const {data,error}=await getSupabase().auth.getSession();if(error)throw error;return data.session?mapUser(data.session.user):null;},
 async getAccessToken():Promise<string|null> {
  const {data,error}=await getSupabase().auth.getSession();
  if(error||!data.session)return null;
  return data.session.access_token;
 },
 async signOut(){const {error}=await getSupabase().auth.signOut();if(error)throw error;},
 async updateProfile(input:Partial<User>):Promise<User>{
  const {data,error}=await getSupabase().auth.updateUser({data:{display_name:input.displayName,default_team_name:input.defaultTeamName,default_team_logo:input.defaultTeamLogo}});
  if(error)throw error;return mapUser(data.user);
 },
};
