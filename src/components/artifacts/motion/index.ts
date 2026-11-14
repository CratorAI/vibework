import { lazy } from 'react';
import { Film } from '@/lib/icons';
import type { ArtifactType } from '../types';
// Project identity comes from scoped filesystem metadata, never a fake extension.
export default {id:'motion',label:'Motion',icon:Film,priority:40,matches:()=>false,component:lazy(()=>import('./MotionPanel'))} satisfies ArtifactType;
