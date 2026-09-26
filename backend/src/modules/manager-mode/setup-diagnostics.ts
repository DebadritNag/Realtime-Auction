import {ZodError} from 'zod';
import {DomainError} from '../../domain/errors.js';
export interface SetupLogger {info(data:object,message:string):void;error?(data:object,message:string):void}
function safeMessage(error:unknown){let message=error instanceof Error?error.message:'Unknown failure';for(const [key,value] of Object.entries(process.env))if(value&&value.length>5&&/(KEY|SECRET|TOKEN|PASSWORD|DATABASE_URL)/.test(key))message=message.split(value).join('[redacted]');return message.replace(/Bearer\s+\S+/gi,'Bearer [redacted]').replace(/postgres(?:ql)?:\/\/\S+/gi,'[database URL redacted]').slice(0,400);}
export async function setupStep<T>(logger:SetupLogger|undefined,auctionId:string,step:string,run:()=>Promise<T>|T):Promise<T>{
 logger?.info({event:'MANAGER_MODE_SETUP',auctionId,step},'Manager Mode setup step');
 try{return await run();}catch(error){const e=error as {code?:string;constraint_name?:string;constraint?:string};logger?.error?.({event:'MANAGER_MODE_SETUP_FAILED',auctionId,step,message:safeMessage(error),code:e.code,postgresCode:error instanceof DomainError?error.details.postgresCode:undefined,constraint:e.constraint_name??e.constraint??(error instanceof DomainError?error.details.constraint:undefined)},'Manager Mode setup failed');
 if(error instanceof ZodError)throw new DomainError('INVALID_AUCTION_SNAPSHOT','The stored auction contains invalid settings or player data.',409,{step});
 if(error instanceof DomainError)throw new DomainError(error.code,error.message,error.statusCode,{step,...error.details});
 const known:Record<string,[string,string,number]>={'23505':['DUPLICATE_MANAGER_RESOURCE','This Manager Mode resource already exists.',409],'23503':['INVALID_MANAGER_REFERENCE','A required auction team, player or profile is missing.',409],'23514':['INVALID_MANAGER_DATA','Auction data does not match the database rules.',409],'23502':['INCOMPLETE_MANAGER_DATA','Required auction data is missing.',409],'22P02':['INVALID_AUCTION_ID','The auction identifier is invalid.',400]};
 const mapped=e.code?known[e.code]:undefined;
 if(mapped)throw new DomainError(...mapped,{step});
 throw new DomainError('MANAGER_MODE_SETUP_FAILED','Failed to load completed auction at '+step+'. Retry or check the backend setup logs.',500,{step});
 }
}
