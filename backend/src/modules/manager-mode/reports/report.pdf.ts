import {readFileSync} from 'node:fs';
import {jsPDF} from 'jspdf';
import {autoTable} from 'jspdf-autotable';
import {getFormation} from '../../../domain/formations.js';
import type {Tournament} from '../manager.types.js';
import type {TransferAuditReport,AuditRow} from './report.service.js';
let font:string|undefined;
function document(){const doc=new jsPDF({orientation:'landscape',format:'a4'});font??=readFileSync(new URL('../../../../assets/fonts/NotoSans-Regular.ttf',import.meta.url)).toString('base64');doc.addFileToVFS('NotoSans.ttf',font);doc.addFont('NotoSans.ttf','NotoSans','normal');doc.setFont('NotoSans','normal');return doc;}
const money=(units:number)=>'₹'+(units/2).toLocaleString('en-IN',{maximumFractionDigits:1})+' Cr';
const date=(value:number|null)=>value===null?'—':new Date(value).toISOString().replace('T',' ').slice(0,19)+' UTC';
function header(doc:jsPDF,title:string,subtitle:string){doc.setFillColor(10,26,44);doc.rect(0,0,297,31,'F');doc.setTextColor(90,228,178);doc.setFontSize(9);doc.text('ARENA AUCTION / MANAGER MODE',12,9);doc.setTextColor(255,255,255);doc.setFontSize(17);doc.text(doc.splitTextToSize(title,270)[0],12,18);doc.setFontSize(8);doc.text(doc.splitTextToSize(subtitle,270)[0],12,26);doc.setTextColor(20,37,51);}
function footer(doc:jsPDF,generated:number){for(let i=1;i<=doc.getNumberOfPages();i++){doc.setPage(i);doc.setFontSize(8);doc.setTextColor(90,105,120);doc.text('Generated '+date(generated),12,204);doc.text(i+' / '+doc.getNumberOfPages(),285,204,{align:'right'});}return Buffer.from(doc.output('arraybuffer'));}
export function transferAuditPdf(report:TransferAuditReport,generated=Date.now()){
 const doc=document(),title='Transfer Window '+report.window.number+' Audit',subtitle=report.tournamentName+' | Season '+(report.window.seasonNumber??'—')+' | Opened '+date(report.window.openedAt)+' | Closed '+date(report.window.closedAt);
 report.teams.forEach((team,index)=>{
  if(index)doc.addPage();header(doc,title,subtitle);let y=40;doc.setFontSize(16);doc.text(team.teamName,12,y);doc.setFontSize(9);doc.text('Manager: '+team.managerName,12,y+7);y+=17;
  function table(label:string,head:string[],rows:string[][]){
   if(y>165){doc.addPage();header(doc,title,subtitle);y=40;}
   doc.setTextColor(20,37,51);doc.setFontSize(11);doc.text(label,12,y);y+=4;
   autoTable(doc,{startY:y,head:[head],body:rows.length?rows:[['No activity during this transfer window.',...head.slice(1).map(()=>'')]],margin:{top:38,bottom:17,left:12,right:12},styles:{font:'NotoSans',fontStyle:'normal',fontSize:9,cellPadding:2.5,overflow:'linebreak'},headStyles:{fillColor:[16,57,75],fontStyle:'normal'},alternateRowStyles:{fillColor:[241,246,248]},rowPageBreak:'avoid',didDrawPage:()=>header(doc,title,subtitle)});
   y=(doc as jsPDF&{lastAutoTable:{finalY:number}}).lastAutoTable.finalY+10;
  }
  const rows=(items:AuditRow[])=>items.map(r=>[r.player,r.counterpart,r.type,money(r.amountUnits)+(r.detail?' '+r.detail:'')]);
  table('BOUGHT / ACQUIRED',['Player','From','Transfer type','Amount / consideration'],rows(team.bought));
  table('SOLD / RELEASED',['Player','Destination','Transfer type','Amount received / consideration'],rows(team.sold));
  table('TRADES / PLAYER EXCHANGES',['Out','In','Traded with','Cash component'],team.trades.map(r=>[r.out,r.in,r.with,'Paid '+money(r.cashPaidUnits)+' / received '+money(r.cashReceivedUnits)]));
  table('FINANCIAL SUMMARY',['Opening budget','Money spent','Money received','Net transfer spend','Closing budget'],[[money(team.openingBudgetUnits),money(team.spentUnits),money(team.receivedUnits),money(team.netSpendUnits),money(team.closingBudgetUnits!)]]);
 });return footer(doc,generated);
}
export function allTeamLineupsPdf(t:Tournament,generated=Date.now()){
 const doc=document(),season=t.seasonData?.seasons.find(s=>s.id===t.seasonData?.currentSeasonId)?.number??1;
 t.teams.slice().sort((a,b)=>a.name.localeCompare(b.name)).forEach((team,index)=>{
  if(index)doc.addPage();const sheet=t.squadData?.sheets.find(s=>s.teamId===team.id);
  header(doc,team.name+' / Team Sheet',t.name+' | Season '+season+' | Manager: '+(team.managerUsername??'Manager'));
  if(!sheet){doc.setFontSize(20);doc.text('LINEUP NOT SUBMITTED',20,70);return;}
  const layout=getFormation(sheet.formation);doc.setFontSize(10);doc.text(layout.label+' | Last saved: '+date(sheet.updatedAt),12,39);
  const pitch={x:12,y:45,w:177,h:149};doc.setFillColor(20,79,60);doc.roundedRect(pitch.x,pitch.y,pitch.w,pitch.h,2,2,'F');doc.setDrawColor(120,176,148);doc.setLineWidth(.3);doc.rect(15,48,171,143);doc.line(15,119.5,186,119.5);doc.circle(100.5,119.5,15);doc.rect(56,48,89,22);doc.rect(56,169,89,22);doc.rect(79,48,43,8);doc.rect(79,183,43,8);
  const fit=(value:string,width:number,size:number)=>{doc.setFontSize(size);let text=value;while(doc.getTextWidth(text)>width&&text.length>1)text=text.slice(0,-1);return text===value?text:text.slice(0,-1)+'…';};
  layout.slots.forEach((slot,i)=>{const p=t.players.find(p=>p.id===sheet.slots[i]&&p.currentTeamId===team.id),x=pitch.x+pitch.w*slot.x/100-15,y=pitch.y+pitch.h*slot.y/100-8;
   doc.setFillColor(10,32,43);doc.roundedRect(x,y,30,16,1.5,1.5,'F');doc.setTextColor(255,255,255);doc.text(fit(p?.name??'Unassigned',27,8),x+15,y+6,{align:'center'});doc.setTextColor(130,240,198);doc.setFontSize(7);doc.text(slot.role+(p?(p.overall!==null?' | '+p.overall+' OVR':' | HERO'):'')+(p?.id===sheet.captainId?' | C':''),x+15,y+12,{align:'center'});
  });
  doc.setTextColor(20,37,51);doc.setFontSize(12);doc.text('STARTING XI',12,43);doc.text('BENCH / '+sheet.bench.length,197,48);
  sheet.bench.forEach((id,i)=>{const p=t.players.find(p=>p.id===id&&p.currentTeamId===team.id);if(!p)return;const x=197+(i%2)*44,y=55+Math.floor(i/2)*23;doc.setFillColor(237,244,243);doc.roundedRect(x,y,41,20,1.5,1.5,'F');doc.setTextColor(20,37,51);doc.text(fit(p.name,37,9),x+2,y+8);doc.setFontSize(8);doc.text(p.position+(p.overall!==null?' | '+p.overall+' OVR':' | HERO'),x+2,y+15);});
  if(!sheet.bench.length){doc.setFontSize(9);doc.text('No substitutes selected.',197,61);}
 });return footer(doc,generated);
}
