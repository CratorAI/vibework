import {invoke} from '@tauri-apps/api/core';
export interface MotionStatus {installed:boolean;ffmpeg:boolean;browser:boolean;skills:boolean;running:boolean;busy:boolean;job:string;url:string|null;lines:string[];error:string|null;outputs:string[]}
export const motionAction=(sessionId:string,path:string,action='status',quality?:string)=>invoke<MotionStatus>('motion_action',{sessionId,path,action,quality});
