import type {User,UserCareerStats,Achievement,AuctionHistoryRecord} from '@/types';
import {api} from './api';
import {authService} from './auth.service';
export const profileService={
 async getProfile():Promise<User>{const user=await authService.getSession();if(!user)throw new Error('Sign in required.');return {...user,...await api.get<Partial<User>>('/profile')};},
 async updateProfile(input:Partial<User>):Promise<User>{
  const saved=await api.patch<Partial<User>>('/profile',{displayName:input.displayName,defaultTeamName:input.defaultTeamName,defaultTeamLogo:input.defaultTeamLogo});
  const user=await authService.updateProfile(input);return {...user,...saved};
 },
 getCareerStats:()=>api.get<UserCareerStats>('/profile/stats'),
 getAchievements:()=>api.get<Achievement[]>('/profile/achievements'),
 getAuctionHistory:()=>api.get<AuctionHistoryRecord[]>('/profile/history'),
};
