export interface PlayerImageSource {id?:string;externalId?:string;imageUrl?:string;photoUrl?:string;localImagePath?:string;metadata?:Record<string,unknown>}
export const DEFAULT_PLAYER_IMAGE='/images/players/default-player.webp';
export function getPlayerImageCandidates(player:PlayerImageSource):string[]{
 const raw=[player.externalId,player.metadata?.externalSourceKey,player.metadata?.externalId,player.id].find(x=>typeof x==='string'&&/^\d+$/.test(x));
 const local=player.localImagePath;
 return [...new Set([local?.startsWith('/images/players/')?local:null,raw?`/images/players/${raw}.webp`:null,...[player.imageUrl,player.photoUrl].filter((url):url is string=>Boolean(url&&(/^(https?:\/\/|\/images\/players\/)/.test(url)))),DEFAULT_PLAYER_IMAGE].filter((url):url is string=>Boolean(url)))];
}
export const getPlayerImageUrl=(player:PlayerImageSource)=>getPlayerImageCandidates(player)[0]!;
