import {ManagerWorkspace} from '@/components/manager-mode/ManagerWorkspace';
import {ManagerDeletedRedirect} from '@/components/manager-mode/ManagerDeletedRedirect';
export default async function Page({params}:{params:Promise<{tournamentId:string;section?:string[]}>}){
  const {tournamentId,section}=await params;
  return <>
    <ManagerDeletedRedirect tournamentId={tournamentId}/>
    <ManagerWorkspace section={section?.join('/')??'dashboard'}/>
  </>;
}
