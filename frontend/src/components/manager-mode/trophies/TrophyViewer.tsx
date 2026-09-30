'use client';
import {Suspense,useCallback,useEffect,useMemo,useState} from 'react';
import {Canvas,useThree} from '@react-three/fiber';
import {Environment,Lightformer,OrbitControls,useGLTF} from '@react-three/drei';
import {Box3,Vector3} from 'three';
import {TrophyFallback} from './TrophyFallback';

function Model({onReady}:{onReady:()=>void}){
 const {scene}=useGLTF('/models/trophies/cup.glb');
 useEffect(onReady,[onReady]);
 const model=useMemo(()=>{
  const clone=scene.clone(true),box=new Box3().setFromObject(clone),size=box.getSize(new Vector3()),center=box.getCenter(new Vector3());
  const scale=2.8/Math.max(size.x,size.y,size.z);
  clone.scale.multiplyScalar(scale);clone.position.addScaledVector(center,-scale);
  return clone;
 },[scene]);
 return <primitive object={model} dispose={null}/>;
}
function ContextGuard({onFailure}:{onFailure:()=>void}){
 const canvas=useThree(s=>s.gl.domElement);
 useEffect(()=>{const fail=(e:Event)=>{e.preventDefault();onFailure();};canvas.addEventListener('webglcontextlost',fail);return()=>canvas.removeEventListener('webglcontextlost',fail);},[canvas,onFailure]);
 return null;
}
export default function TrophyViewer({active,rotate}:{active:boolean;rotate:boolean}){
 const [failed,setFailed]=useState(false),[ready,setReady]=useState(false);
 const onReady=useCallback(()=>setReady(true),[]),onFailure=useCallback(()=>setFailed(true),[]);
 useEffect(()=>{if(ready)return;const timeout=setTimeout(()=>setFailed(true),20000);return()=>clearTimeout(timeout);},[ready]);
 if(failed)return <TrophyFallback/>;
 return <Suspense fallback={<TrophyFallback loading/>}><Canvas dpr={[1,1.5]} frameloop={active&&rotate?'always':'demand'} camera={{position:[0,.45,5.8],fov:38}} gl={{alpha:true,antialias:true,powerPreference:'low-power'}} fallback={<TrophyFallback/>}>
  <ContextGuard onFailure={onFailure}/>
  <ambientLight intensity={.5}/><spotLight position={[3,6,4]} intensity={55} angle={.5} penumbra={1}/><directionalLight position={[-3,2,2]} intensity={2} color="#ffe2a0"/>
  <Environment resolution={128} frames={1}><Lightformer position={[0,4,2]} intensity={3} scale={[5,3,1]}/><Lightformer position={[-4,1,0]} rotation={[0,Math.PI/2,0]} intensity={2} scale={[2,5,1]}/><Lightformer position={[4,1,0]} rotation={[0,-Math.PI/2,0]} intensity={3} color="#e2bc6a" scale={[2,4,1]}/></Environment>
  <Model onReady={onReady}/>
  <mesh position={[0,-1.48,0]}><cylinderGeometry args={[.78,.86,.15,48]}/><meshStandardMaterial color="#172339" metalness={.6} roughness={.4}/></mesh>
  <mesh position={[0,-1.57,0]} rotation={[-Math.PI/2,0,0]}><circleGeometry args={[1.05,48]}/><meshBasicMaterial color="#000000" transparent opacity={.22}/></mesh>
  <OrbitControls makeDefault enablePan={false} enableDamping autoRotate={active&&rotate} autoRotateSpeed={.65} minDistance={4.6} maxDistance={7.5} minPolarAngle={Math.PI/3} maxPolarAngle={Math.PI*.57}/>
 </Canvas></Suspense>;
}
