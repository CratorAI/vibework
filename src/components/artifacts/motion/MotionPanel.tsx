import { PresentFile } from "@/components/PresentFile";
import {useCallback,useEffect,useLayoutEffect,useRef,useState} from 'react';
import {Film,ExternalLink,FolderOpen,Square,Download,ChevronDown} from '@/lib/icons';
import {Button} from '@/components/ui/button';
import {DropdownMenu,DropdownMenuTrigger,DropdownMenuContent,DropdownMenuItem} from '@/components/ui/dropdown-menu';
import {browserOpen,browserClose,browserSetBounds,browserSetVisible,browserOpenExternal} from '@/tauri/browser';
import {revealInFinder} from '@/tauri/files';
import {useOverlayOverlap} from '@/components/workspace/browser/useOverlayOverlap';
import {errorMessage} from '@/lib/utils';
import type {ArtifactViewProps} from '../types';
import {motionAction,type MotionStatus} from './api';
function renderProgress(lines:string[]) {
 const line=[...lines].reverse().find(l=>l.startsWith('@hf-progress '));
 if(!line)return '';
 try {const p=JSON.parse(line.slice(13));const phase:Record<string,string>={capture:'Drawing frames',encode:'Encoding',assemble:'Finishing'};return `${p.pct}% · ${phase[p.code]??'Preparing'}`;}catch{return ''}
}
export default function MotionPanel({artifact,allowNative=true,onOpenArtifact}:ArtifactViewProps){
 const {sessionId,path,name}=artifact;
 const [status,setStatus]=useState<MotionStatus|null>(null),[error,setError]=useState(''),[working,setWorking]=useState(false),[stopped,setStopped]=useState(false),[native,setNative]=useState(false);
 const viewport=useRef<HTMLDivElement>(null),overlap=useOverlayOverlap(viewport),id=useRef(`motion-${crypto.randomUUID()}`).current;
 const auto=useRef(false);
 const act=useCallback(async(action:string,quality?:string)=>{setWorking(true);setError('');try{setStatus(await motionAction(sessionId,path,action,quality))}catch(e){setError(errorMessage(e))}finally{setWorking(false)}},[sessionId,path]);
 useEffect(()=>{let live=true;const refresh=()=>motionAction(sessionId,path).then(s=>{if(live)setStatus(s)}).catch(e=>{if(live)setError(errorMessage(e))});void motionAction(sessionId,path,'attach').then(s=>{if(live)setStatus(s)}).catch(e=>{if(live)setError(errorMessage(e))});const timer=setInterval(refresh,1000);return()=>{live=false;clearInterval(timer)}},[sessionId,path]);
 useEffect(()=>{if(status?.installed&&status.browser&&status.ffmpeg&&!status.busy&&!status.running&&!status.error&&!stopped&&!auto.current){auto.current=true;void act('start')}},[status,stopped,act]);
 useEffect(()=>{if(!status?.url)return;let live=true;const el=viewport.current;if(!el)return;const r=el.getBoundingClientRect();void browserOpen(id,`${status.url}/#project/${encodeURIComponent(name)}`,{x:r.x,y:r.y,width:r.width,height:r.height},status.url).then(()=>{if(live)setNative(true);else void browserClose(id)}).catch(e=>setError(errorMessage(e)));return()=>{live=false;setNative(false);void browserClose(id)}},[status?.url,id,name]);
 useLayoutEffect(()=>{const el=viewport.current;if(!native||!el)return;let frame=0;const sync=()=>{cancelAnimationFrame(frame);frame=requestAnimationFrame(()=>{const r=el.getBoundingClientRect();void browserSetBounds(id,{x:r.x,y:r.y,width:r.width,height:r.height}).then(()=>browserSetVisible(id,allowNative&&!overlap&&r.width>0&&r.height>0)).catch(()=>{})})};sync();const observer=new ResizeObserver(sync);observer.observe(el);window.addEventListener('resize',sync);return()=>{cancelAnimationFrame(frame);observer.disconnect();window.removeEventListener('resize',sync);void browserSetVisible(id,false)}},[id,native,allowNative,overlap]);
 const stop=()=>{setStopped(true);void act('stop')};
 return <div className="flex h-full min-h-0 flex-col bg-background text-foreground" data-motion-panel>
  <div className="flex h-10 shrink-0 items-center gap-1 border-b px-2 text-xs">
   <Film className="size-4 shrink-0 text-file-motion"/><span className="min-w-0 flex-1 truncate" title={path}>{name}<span className="ml-2 text-muted-foreground">HyperFrames</span></span>
   <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="ghost" disabled={!status?.installed||status.busy||working}><Download className="size-3.5"/>Render<ChevronDown className="size-3"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{(['draft','looks','delivery'] as const).map(q=><DropdownMenuItem key={q} onClick={()=>void act('render',q)}>{q==='draft'?'Draft':q==='looks'?'Review':'Delivery'} MP4</DropdownMenuItem>)}</DropdownMenuContent></DropdownMenu>
   <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="ghost">Outputs<ChevronDown className="size-3"/></Button></DropdownMenuTrigger><DropdownMenuContent align="end">{status?.outputs.length?status.outputs.map(p=><div key={p} className="p-1"><PresentFile filePath={p} fileName={p.split('/').pop()??'Rendered video'}/><button className="px-3 py-1 text-xs text-muted-foreground" onClick={()=>onOpenArtifact?.(p)}>Open video in panel</button></div>):<DropdownMenuItem disabled>No renders yet</DropdownMenuItem>}</DropdownMenuContent></DropdownMenu>
   <Button size="icon" variant="ghost" title="Open Studio in browser" disabled={!native} onClick={()=>void browserOpenExternal(id)}><ExternalLink className="size-3.5"/></Button>
   <Button size="icon" variant="ghost" title="Reveal project in Finder" onClick={()=>void revealInFinder(path)}><FolderOpen className="size-3.5"/></Button>
   <Button size="icon" variant="ghost" title="Stop preview" disabled={!status?.running} onClick={stop}><Square className="size-3.5"/></Button>
  </div>
  {status?.busy&&status.job!=='preview'&&<div className="flex items-center gap-2 border-b px-3 py-2 text-xs"><span className="min-w-0 flex-1 truncate" role="status">{status.job==='render'?'Rendering locally…':'Preparing Motion…'} {renderProgress(status.lines)}</span><Button size="sm" variant="ghost" onClick={()=>void act('cancel')}>Cancel</Button></div>}
  {(error||status?.error)&&<div className="border-b p-3 text-xs"><p>{error||status?.error}</p><details className="mt-2"><summary>Tool output</summary><pre className="max-h-32 overflow-auto whitespace-pre-wrap">{status?.lines.join('\n')}</pre></details><Button size="sm" variant="outline" className="mt-2" onClick={()=>{setStopped(false);void act('start')}}>Retry</Button></div>}
  {status?.installed&&!status.skills&&<div className="flex items-center gap-2 border-b px-3 py-2 text-xs text-muted-foreground"><span>The agent needs the official HyperFrames skills.</span><Button size="sm" variant="outline" onClick={()=>void navigator.clipboard.writeText('HYPERFRAMES_NO_TELEMETRY=1 npx hyperframes@0.9.41 skills')}>Copy install command</Button></div>}
  <div ref={viewport} className="relative min-h-0 flex-1">
   {!status?.url&&<div className="mx-auto flex h-full max-w-sm flex-col justify-center gap-3 p-6 text-sm">
    {!status?<p className="text-muted-foreground">Checking Motion…</p>:!status.installed?<><Film className="size-6 text-file-motion"/><h3>Open this Motion project</h3><p className="text-xs leading-relaxed text-muted-foreground">Download HyperFrames 0.9.41 to edit and render locally. About 420 MB including its package cache, kept in Vibework’s runtime folder. No account is needed.</p><p className="text-xs text-muted-foreground"><a href="https://github.com/heygen-com/hyperframes/blob/main/LICENSE" target="_blank" rel="noreferrer" className="underline">HyperFrames licence</a> · Includes GSAP under <a href="https://gsap.com/community/standard-license/" target="_blank" rel="noreferrer" className="underline">GSAP’s own licence</a>.</p><Button size="sm" disabled={working||status.busy} onClick={()=>void act('install')}>Download HyperFrames</Button></>:!status.browser||!status.ffmpeg?<><h3>Set up local rendering</h3><p className="text-xs text-muted-foreground">Chrome draws the frames and FFmpeg makes the MP4. Use the controls below to finish setup.</p></>:stopped?<><p>Preview stopped.</p><Button size="sm" onClick={()=>{setStopped(false);void act('start')}}>Start preview</Button></>:<p role="status" className="text-muted-foreground">Starting preview… The first start can take a minute.</p>}
   </div>}
  </div>
  {status?.installed&&(!status.browser||!status.ffmpeg)&&<div className="flex shrink-0 flex-wrap items-center gap-2 border-t px-3 py-2 text-xs text-muted-foreground"><span>Local rendering needs {!status.browser?'Chrome':''}{!status.browser&&!status.ffmpeg?' and ':''}{!status.ffmpeg?'FFmpeg':''}.</span>{!status.browser&&<Button size="sm" variant="outline" disabled={status.busy} onClick={()=>void act('browser')}>Download headless Chrome</Button>}{!status.ffmpeg&&<Button size="sm" variant="outline" onClick={()=>void navigator.clipboard.writeText('brew install ffmpeg')}>Copy: brew install ffmpeg</Button>}</div>}
 </div>
}
