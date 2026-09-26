import type {TournamentState} from '@/types/manager-mode';
import type {TeamSheet} from '@/types/manager-squad';
export async function createTeamSheetPdf(state:TournamentState,sheet:TeamSheet){
 const {default:jsPDF}=await import('jspdf');const {default:autoTable}=await import('jspdf-autotable');
 const team=state.teams.find(t=>t.id===sheet.teamId)!;const plain=(text:string)=>text.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').replace(/[^\x20-\x7e]/g,'');
 const doc=new jsPDF();doc.setFontSize(24);doc.text(plain(team.name),14,22);doc.setFontSize(11);doc.text(plain(state.name)+' | Team Sheet',14,31);doc.text('Manager: '+plain(team.managerUsername??'Manager')+' | Formation: '+sheet.formation,14,39);
 const rows=(ids:(string|null)[])=>ids.map((id,i)=>{const p=state.players.find(p=>p.id===id);return [String(i+1),p?plain(p.name):'Unassigned',p?.position??'-',p?String(p.overall):'-',id&&id===sheet.captainId?'Captain':''];});
 doc.setFontSize(14);doc.text('Starting XI',14,51);autoTable(doc,{startY:55,head:[['Slot','Player','Position','OVR','Role']],body:rows(sheet.slots),theme:'striped',headStyles:{fillColor:[15,118,110]},styles:{fontSize:10}});
 const last=(doc as typeof doc&{lastAutoTable:{finalY:number}}).lastAutoTable.finalY;doc.text('Bench',14,last+12);autoTable(doc,{startY:last+16,head:[['Slot','Player','Position','OVR','Role']],body:rows(sheet.bench),theme:'striped',headStyles:{fillColor:[15,118,110]},styles:{fontSize:10}});
 for(let i=1;i<=doc.getNumberOfPages();i++){doc.setPage(i);doc.setFontSize(8);doc.text('ArenaAuction | Saved '+new Date(sheet.updatedAt).toISOString().slice(0,10)+' | '+i+'/'+doc.getNumberOfPages(),14,288);}
 return doc;
}
export async function downloadTeamSheetPdf(state:TournamentState,sheet:TeamSheet){const doc=await createTeamSheetPdf(state,sheet);doc.save('team-sheet-'+sheet.teamId+'.pdf');}
