/** Wire response for GET /manager-mode/:id/seasons/:seasonId/stats/golden-boot. */
export interface GoldenBootRow {rank:number;playerId:string;name:string;position:string;imageUrl:string;teamId:string|null;teamName:string;teamLogoUrl:string;scoringTeams:{teamId:string;teamName:string;goals:number}[];matchesPlayed:number;goals:number;goalsPerMatch:number}
export interface GoldenBootState {seasonId:string;rows:GoldenBootRow[];completedFixtures:number;missingScorerFixtures:number;missingLineupFixtures:number;}
