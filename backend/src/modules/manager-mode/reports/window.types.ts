export interface WindowTeamSnapshot {teamId:string;teamName:string;managerName:string;openingBudgetUnits:number;closingBudgetUnits:number|null}
export interface TransferWindow {id:string;number:number;seasonId:string|null;seasonNumber:number|null;status:'OPEN'|'CLOSED';openedAt:number;closedAt:number|null;auditAvailable:boolean;teams:WindowTeamSnapshot[]}
