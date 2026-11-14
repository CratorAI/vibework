import { lazy } from 'react';
import { Shapes } from '@/lib/icons';
import type { ArtifactType } from '../types';
import { blankDesign } from './model';
export default { id: 'design', label: 'Design', icon: Shapes, priority: 30, matches: (name: string) => name.endsWith('.design.html'), component: lazy(() => import('./DesignEditor')), blank: { extension: '.design.html', contents: blankDesign } } satisfies ArtifactType;
