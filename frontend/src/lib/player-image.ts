export interface PlayerImageSource {id?:string;externalId?:string;name?:string;imageUrl?:string;photoUrl?:string;localImagePath?:string;source?:string;isSecretHero?:boolean;metadata?:Record<string,unknown>}
export const DEFAULT_PLAYER_IMAGE='/images/players/default-player.webp';

/** Matches the slug used by the image download script for heroes: name.toLowerCase().replace(/[^a-z0-9]/g,'_') */
export function heroImageSlug(name:string):string{
 return 'hero_'+name.toLowerCase().replace(/[^a-z0-9]/g,'_')+'.webp';
}

export function getPlayerImageCandidates(player:PlayerImageSource):string[]{
 const raw=[player.externalId,player.metadata?.externalSourceKey,player.metadata?.externalId,player.id].find(x=>typeof x==='string'&&/^\d+$/.test(x));
 const local=player.localImagePath;
 const isHero=player.isSecretHero||player.source==='SECRET_HERO';
 return [...new Set([
  local?.startsWith('/images/players/')?local:null,
  raw?`/images/players/${raw}.webp`:null,
  // Heroes have no numeric id — resolve by name slug
  isHero&&player.name?`/images/players/${heroImageSlug(player.name)}`:null,
  ...[player.imageUrl,player.photoUrl].filter((url):url is string=>Boolean(url&&(/^(https?:\/\/|\/images\/players\/)/.test(url)))),
  DEFAULT_PLAYER_IMAGE
 ].filter((url):url is string=>Boolean(url)))];
}
export const getPlayerImageUrl=(player:PlayerImageSource)=>getPlayerImageCandidates(player)[0]!;
