import type {TournamentState,ManagerPlayer} from '@/types/manager-mode';
import type {TeamSheet} from '@/types/manager-squad';
import {getFormation} from '@/lib/formations';
import {getPlayerImageCandidates} from '@/lib/player-image';
const plain=(text:string)=>text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'');
async function portrait(player:ManagerPlayer):Promise<string|null>{
 for(const url of getPlayerImageCandidates(player)){
  const result=await new Promise<string|null>(resolve=>{const img=new Image();img.crossOrigin='anonymous';let done=false;const finish=(value:string|null)=>{if(done)return;done=true;clearTimeout(timer);img.onload=null;img.onerror=null;resolve(value);};const timer=setTimeout(()=>{finish(null);img.src='';},1500);img.onerror=()=>finish(null);img.onload=()=>{try{const canvas=document.createElement('canvas');canvas.width=256;canvas.height=256;const ctx=canvas.getContext('2d');if(!ctx){finish(null);return;}const scale=Math.min(256/img.naturalWidth,256/img.naturalHeight),w=img.naturalWidth*scale,h=img.naturalHeight*scale;ctx.drawImage(img,(256-w)/2,(256-h)/2,w,h);finish(canvas.toDataURL('image/png'));}catch{finish(null);}};img.src=url;});
  if(result)return result;
 }
 return null;
}
export async function createTeamSheetPdf(state:TournamentState,sheet:TeamSheet){
 const {default:jsPDF}=await import('jspdf');
 const team=state.teams.find(t=>t.id===sheet.teamId);if(!team)throw Error('Team not found');
 const owned=state.players.filter(p=>p.currentTeamId===sheet.teamId),byId=new Map(owned.map(p=>[p.id,p]));
 const images=new Map<string,string|null>();let cursor=0;
 await Promise.all(Array.from({length:Math.min(6,owned.length)},async()=>{while(cursor<owned.length){const p=owned[cursor++]!;images.set(p.id,await portrait(p));}}));
 const season=state.seasonData?.seasons.find(s=>s.id===state.seasonData?.currentSeasonId)?.number??1;
 const formation=getFormation(sheet.formation),doc=new jsPDF({orientation:'landscape',format:'a4'});
 const fit=(text:string,width:number,size=9)=>{doc.setFontSize(size);const clean=plain(text);if(doc.getTextWidth(clean)<=width)return clean;let value=clean;while(value.length&&doc.getTextWidth(value+'...')>width)value=value.slice(0,-1);return value+'...';};
 function header(){doc.setFillColor(8,20,31);doc.rect(0,0,297,210,'F');doc.setTextColor(79,225,168);doc.setFontSize(9);doc.text('ARENA AUCTION / TEAM SHEET',10,10);doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.text(fit(team!.name,170,20),10,21);doc.setFont('helvetica','normal');doc.setTextColor(191,207,219);doc.setFontSize(9);doc.text(fit('Manager: '+(team!.managerUsername??'Manager')+'  |  Season '+season+'  |  '+state.name,270,9),10,28);doc.setTextColor(79,225,168);doc.text(formation.label,287,20,{align:'right'});}
 function card(p:ManagerPlayer|undefined,x:number,y:number,w:number,h:number,role:string){
  doc.setFillColor(12,37,41);doc.setDrawColor(66,126,113);doc.roundedRect(x,y,w,h,1.5,1.5,'FD');
  const img=p?images.get(p.id):null,portraitSize=Math.min(14,h-11);
  if(img)doc.addImage(img,'PNG',x+(w-portraitSize)/2,y+1,portraitSize,portraitSize,undefined,'FAST');
  else{doc.setFillColor(106,146,143);doc.circle(x+w/2,y+5,2,'F');doc.roundedRect(x+w/2-4,y+8,8,4,1,1,'F');}
  doc.setTextColor(255,255,255);doc.setFont('helvetica','bold');doc.text(fit(p?.name??'Unassigned',w-3,8),x+w/2,y+h-6,{align:'center'});doc.setFont('helvetica','normal');doc.setTextColor(141,230,196);doc.setFontSize(7);doc.text(role+(p?' | '+p.overall+' OVR':'')+(p?.id===sheet.captainId?' | C':''),x+w/2,y+h-2,{align:'center'});
 }
 header();const pitch={x:10,y:36,w:177,h:161};
 doc.setFillColor(17,77,57);doc.roundedRect(pitch.x,pitch.y,pitch.w,pitch.h,2,2,'F');doc.setDrawColor(98,164,125);doc.setLineWidth(0.3);
 doc.rect(pitch.x+3,pitch.y+3,pitch.w-6,pitch.h-6);doc.line(pitch.x+3,pitch.y+pitch.h/2,pitch.x+pitch.w-3,pitch.y+pitch.h/2);doc.circle(pitch.x+pitch.w/2,pitch.y+pitch.h/2,16);
 for(const top of [true,false]){const y=top?pitch.y+3:pitch.y+pitch.h-27;doc.rect(pitch.x+pitch.w*.25,y,pitch.w*.5,24);doc.rect(pitch.x+pitch.w*.38,top?pitch.y+3:pitch.y+pitch.h-12,pitch.w*.24,9);}
 formation.slots.forEach((slot,i)=>card(byId.get(sheet.slots[i]??''),pitch.x+pitch.w*slot.x/100-15,pitch.y+pitch.h*slot.y/100-11.5,30,23,slot.role));
 let y=36;const x=195,w=44,gap=4;
 function section(title:string,players:ManagerPlayer[]){
  if(y+18>196){doc.addPage();header();y=38;}
  doc.setTextColor(220,237,231);doc.setFontSize(11);doc.text(title+' / '+players.length,x,y+4);y+=9;
  if(!players.length){doc.setTextColor(159,181,188);doc.setFontSize(9);doc.text('None selected',x,y+4);y+=13;return;}
  for(let i=0;i<players.length;i+=2){
   if(y+27>196){doc.addPage();header();y=38;doc.setFontSize(11);doc.setTextColor(220,237,231);doc.text(title+' / continued',x,y);y+=5;}
   for(let c=0;c<2;c++){const p=players[i+c];if(p)card(p,x+c*(w+gap),y,w,25,p.position);}
   y+=29;
  }
  y+=5;
 }
 section('SUBSTITUTES',sheet.bench.map(id=>byId.get(id)).filter((p):p is ManagerPlayer=>!!p));
 section('RESERVES',owned.filter(p=>!sheet.slots.includes(p.id)&&!sheet.bench.includes(p.id)));
 for(let i=1;i<=doc.getNumberOfPages();i++){doc.setPage(i);doc.setFontSize(8);doc.setTextColor(159,181,188);doc.text('Saved '+new Date(sheet.updatedAt).toISOString().slice(0,10)+' | '+i+'/'+doc.getNumberOfPages(),10,205);}
 return doc;
}
export async function downloadTeamSheetPdf(state:TournamentState,sheet:TeamSheet){
 const doc=await createTeamSheetPdf(state,sheet),team=state.teams.find(t=>t.id===sheet.teamId),season=state.seasonData?.seasons.find(s=>s.id===state.seasonData?.currentSeasonId)?.number??1;
 const safe=(s:string)=>plain(s).replace(/[^a-zA-Z0-9-]+/g,'-').replace(/^-|-$/g,'').slice(0,80)||'Team';
 doc.save(`${safe(team?.name??'Team')}_Season-${season}_${safe(getFormation(sheet.formation).label)}_Team-Sheet.pdf`);
}
