import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { escapeTaken } from '@/lib/shortcuts';
import { useNavigate } from 'react-router-dom';
import { listen } from '@tauri-apps/api/event';
import { toast } from 'sonner';
import { FileText, MoreHorizontal, Filter, Search, Presentation, Table, BarChart, Shapes, Film } from '@/lib/icons';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from '@/components/ui/dropdown-menu';
import { GalleryPreview } from './GalleryPreview';
import { ArtifactTypeChip, artifactHueClass } from '@/components/artifacts/typeColor';
import { artifactTypeById, resolveArtifactType } from '@/components/artifacts/registry';
import { artifactsIndex, type GalleryItem } from '@/tauri/gallery';
import { statArtifact } from '@/tauri/artifacts';
import { openFile, revealInFinder } from '@/tauri/files';
import { openArtifactInPanel } from '@/components/workspace/actions';
import { useAgentSessionsContext } from '@/contexts/AgentSessionsContext';

const starters = [
  { label: "Motion", title: "Motion", hint: "Animated title, social clip", file: "motion-project", icon: Film, prompt: "Make a Motion project with HyperFrames for " },
  { label: 'Doc', title: 'Docs', hint: 'Report, brief, proposal', file: 'new.md', icon: FileText, prompt: 'Write a document about ' },
  { label: 'Slides', title: 'Slides', hint: 'Deck you can present', file: 'new.slides.md', icon: Presentation, prompt: 'Make a deck about ' },
  { label: 'Sheet', title: 'Sheets', hint: 'Budget, tracker, model', file: 'new.xlsx', icon: Table, prompt: 'Make a spreadsheet for ' },
  { label: 'Dashboard', title: 'Dashboards', hint: 'Charts from your numbers', file: 'new.dashboard.md', icon: BarChart, prompt: 'Make a dashboard for ' },
  { label: 'Design', title: 'Designs', hint: 'Poster, social post, mock-up', file: 'new.design.html', icon: Shapes, prompt: 'Make a design for ' },
  { label: 'Whiteboard', title: 'Whiteboards', hint: 'Diagram or flow', file: 'new.excalidraw', icon: Shapes, prompt: 'Make a whiteboard about ' },
];
const groups: Record<string,string> = { motion: 'Motion', design: 'Designs', doc: 'Docs', markdown: 'Docs', sheet: 'Sheets', csv: 'Sheets', slides: 'Slides', docx: 'Docs', pptx: 'Slides', whiteboard: 'Whiteboards', data: 'Dashboards', html: 'Pages', react: 'Pages', image: 'Images', svg: 'Images', pdf: 'PDFs' };
const group = (item: GalleryItem) => groups[item.typeHint === 'motion' ? 'motion' : resolveArtifactType(item.name)?.id ?? ''] ?? 'Other';
function relative(time: string) {
  const days = Math.max(0, Math.floor((Date.now() - Date.parse(time)) / 86400000));
  return days === 0 ? 'Today' : days === 1 ? 'Yesterday' : `${days} days ago`;
}
// Keep the page position while a card's task is open. No previews are retained here.
const page = { query: '', filter: 'All', sort: 'recent', top: 0, pitch: 200 };
export function Gallery() {
  const navigate = useNavigate();
  const { openSession, clearActiveSession } = useAgentSessionsContext();
  const [items, setItems] = useState<GalleryItem[] | null>(null);
  const [error, setError] = useState('');
  const [query, setQuery] = useState(page.query);
  const [filter, setFilter] = useState(page.filter);
  const [sort, setSort] = useState(page.sort);
  const search = useRef<HTMLInputElement>(null);
  const grid = useRef<HTMLDivElement>(null);
  const scroller = useRef<HTMLElement>(null);
  const pendingFocus = useRef<number | null>(null);
  const restored = useRef(false);
  const [viewport, setViewport] = useState({ top: page.top, height: 800, gridTop: 260, pitch: page.pitch });
  const measure = useCallback(() => {
    const root = scroller.current, el = grid.current;
    if (!root || !el) return;
    // Four columns, 12px gaps, 1px card border, 16:10 preview and 40px footer.
    const pitch = ((el.clientWidth - 36) / 4 - 2) * 10 / 16 + 42 + 12;
    const gridTop = el.getBoundingClientRect().top - root.getBoundingClientRect().top + root.scrollTop;
    page.top = root.scrollTop; page.pitch = pitch;
    setViewport(old => old.top === root.scrollTop && old.height === root.clientHeight && old.gridTop === gridTop && old.pitch === pitch ? old : { top: root.scrollTop, height: root.clientHeight, gridTop, pitch });
  }, []);
  const refresh = useCallback(async () => {
    try { setItems(await artifactsIndex()); setError(''); }
    catch { setError('Couldn’t load artifacts. Try again.'); }
  }, []);
  useEffect(() => {
    void refresh();
    const subscription = listen('gallery:changed', () => void refresh());
    window.addEventListener('focus', refresh);
    return () => { void subscription.then(unlisten => unlisten()); window.removeEventListener('focus', refresh); };
  }, [refresh]);
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key === '/' && !(e.target instanceof HTMLInputElement)) || ((e.metaKey || e.ctrlKey) && e.key === 'f')) { e.preventDefault(); search.current?.focus(); }
      // One Escape closes one thing: a dialog, menu or popover over the page first
      if (e.key === 'Escape' && !escapeTaken(e)) { e.preventDefault(); if (query) setQuery(''); else navigate('/'); }
    };
    window.addEventListener('keydown', key); return () => window.removeEventListener('keydown', key);
  }, [navigate, query]);
  const open = async (item: GalleryItem) => {
    try { await openSession(item.sessionId); if (item.exists) openArtifactInPanel(item.sessionId, item.path); navigate('/'); }
    catch { toast.error('Couldn’t open the task. Try again.'); }
  };
  const action = async (item: GalleryItem, fn: (path: string) => Promise<unknown>) => {
    try { const stat = await statArtifact(item.sessionId, item.path); await fn(stat.path); }
    catch { toast.error('Couldn’t open the file. It may have been moved or is outside the task folder.'); }
  };
  const visible = useMemo(() => (items ?? []).filter(i => (filter === 'All' || group(i) === filter) && `${i.name} ${i.taskName}`.toLowerCase().includes(query.toLowerCase())).sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name) : Date.parse(b.lastTouchedAt) - Date.parse(a.lastTouchedAt)), [items, filter, query, sort]);
  const filters = ['All', ...['Docs','Sheets','Slides','Designs','Whiteboards','Dashboards','Pages','Images','PDFs','Other'].filter(g => items?.some(i => group(i) === g))];
  const rowCount = Math.ceil(visible.length / 4);
  const startRow = Math.max(0, Math.min(rowCount - 1, Math.floor((viewport.top - viewport.gridTop) / viewport.pitch) - 2));
  const endRow = Math.min(rowCount, Math.max(startRow + 1, Math.ceil((viewport.top + viewport.height - viewport.gridTop) / viewport.pitch) + 2));
  useLayoutEffect(() => {
    if (!grid.current || !scroller.current) return;
    if (!restored.current) { scroller.current.scrollTop = page.top; restored.current = true; }
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(scroller.current); observer.observe(grid.current);
    return () => observer.disconnect();
  }, [measure, items !== null, visible.length > 0]);
  useLayoutEffect(() => {
    const index = pendingFocus.current;
    if (index === null) return;
    const button = grid.current?.querySelector<HTMLButtonElement>(`[data-gallery-index="${index}"]`);
    if (button) { button.focus({ preventScroll: true }); pendingFocus.current = null; }
  }, [startRow, endRow, viewport]);
  useLayoutEffect(() => {
    if (query === page.query && filter === page.filter && sort === page.sort) return;
    pendingFocus.current = null;
    Object.assign(page, { query, filter, sort, top: 0 });
    if (scroller.current) scroller.current.scrollTop = 0;
    measure();
  }, [query, filter, sort, measure]);
  return <section ref={scroller} onScroll={measure} aria-label="Artifacts gallery" className="absolute inset-0 z-30 overflow-y-auto bg-background px-8 pb-10 pt-(--titlebar-height)">
    <div className="mx-auto max-w-[1040px] pt-2">
      <div className="mb-6 flex items-center justify-between gap-4">
        <h1 className="text-xl font-semibold">Artifacts</h1>
        <div className="flex items-center gap-2">
          <div className="relative"><Search className="pointer-events-none absolute left-2.5 top-2 size-4 text-muted-foreground" /><Input ref={search} aria-label="Search artifacts" placeholder="Search artifacts" value={query} onChange={e => setQuery(e.target.value)} className="h-8 w-52 pl-8 text-meta" /></div>
          <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="ghost" aria-label="Filter artifact types" className="h-8 gap-1.5"><Filter className="size-4" />{filter === 'All' ? 'All types' : filter}</Button></DropdownMenuTrigger><DropdownMenuContent align="end" aria-label="Artifact types">{filters.map(g => {
            const Icon = resolveArtifactType(items?.find(i => group(i) === g)?.name ?? '')?.icon;
            return <DropdownMenuItem key={g} onSelect={() => setFilter(g)}>{Icon && <Icon className="size-4" />}{g}{filter === g && <span className="ml-auto text-muted-foreground">✓</span>}</DropdownMenuItem>;
          })}</DropdownMenuContent></DropdownMenu>
          <DropdownMenu><DropdownMenuTrigger asChild><Button size="sm" variant="ghost" className="h-8">{sort === 'recent' ? 'Recent' : 'Name'}</Button></DropdownMenuTrigger><DropdownMenuContent align="end"><DropdownMenuItem onSelect={() => setSort('recent')}>Recent</DropdownMenuItem><DropdownMenuItem onSelect={() => setSort('name')}>Name</DropdownMenuItem></DropdownMenuContent></DropdownMenu>
        </div>
      </div>
      {/* Make something new: one coloured tile per kind, its name underneath */}
      <h2 className="mb-2 text-meta text-muted-foreground">Make something new</h2>
      <div className="mb-8 grid grid-cols-7 gap-1.5">
        {starters.map(({label, title, hint, file, icon: Icon, prompt}) => <button key={label} type="button" aria-label={`New ${label}`} title={hint} onClick={() => { clearActiveSession(); navigate('/', { state: { artifactStarter: prompt } }); }} className="group/starter pressable rounded-lg text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50">
          <span className={`relative grid h-[72px] place-items-center overflow-hidden rounded-lg transition-[filter] group-hover/starter:brightness-[0.96] ${artifactHueClass(file,file === 'motion-project' ? 'motion' : undefined)}`}>
            {/* A large, faint copy of the icon gives the tile some texture */}
            <Icon aria-hidden className="pointer-events-none absolute -right-3 -bottom-4 size-16 -rotate-12 opacity-[0.13]" />
            <Icon className="size-6" />
          </span>
          <span className="mt-1.5 block truncate px-0.5 text-meta text-foreground">{title}</span>
        </button>)}
      </div>
      {error ? <div role="alert" className="py-12 text-center"><p className="mb-4 text-sm">{error}</p><Button onClick={() => void refresh()}>Retry</Button></div> : items === null ? <div className="grid grid-cols-4 gap-3" aria-label="Loading artifacts">{Array.from({ length: 12 }, (_, i) => <Skeleton key={i} className="aspect-[4/3] rounded-lg" />)}</div> : items.length === 0 ? <div className="py-20 text-center"><p className="mb-4 text-sm text-muted-foreground">Documents, sheets, pages and other files your agent makes will appear here.</p><Button onClick={() => { clearActiveSession(); navigate('/'); }}>Start a task</Button></div> : visible.length === 0 ? <div className="py-20 text-center"><p className="mb-4 text-sm text-muted-foreground">No matching artifacts</p><Button variant="outline" onClick={() => { setQuery(''); setFilter('All'); }}>Clear</Button></div> : <div ref={grid} role="list" aria-label={`${visible.length} artifacts`} className="grid grid-cols-4 gap-3" style={{ paddingTop: startRow * viewport.pitch, paddingBottom: (rowCount - endRow) * viewport.pitch }} onKeyDown={e => {
        if (!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(e.key) || !(e.target as HTMLElement).hasAttribute('data-gallery-card')) return;
        const index = Number((e.target as HTMLElement).dataset.galleryIndex);
        const offset = e.key === 'ArrowLeft' ? -1 : e.key === 'ArrowRight' ? 1 : e.key === 'ArrowUp' ? -4 : 4;
        e.preventDefault();
        const next = Math.max(0, Math.min(visible.length - 1, index + offset));
        pendingFocus.current = next;
        const root = scroller.current!;
        const top = viewport.gridTop + Math.floor(next / 4) * viewport.pitch;
        if (top < root.scrollTop) root.scrollTop = top;
        else if (top + viewport.pitch - 12 > root.scrollTop + root.clientHeight) root.scrollTop = top + viewport.pitch - 12 - root.clientHeight;
        const button = grid.current?.querySelector<HTMLButtonElement>(`[data-gallery-index="${next}"]`);
        if (button) { button.focus({ preventScroll: true }); pendingFocus.current = null; }
        measure();
      }}>{visible.slice(startRow * 4, endRow * 4).map((item, offset) => {
        const type = item.typeHint === 'motion' ? artifactTypeById('motion') : resolveArtifactType(item.name);
        return <article role="listitem" aria-setsize={visible.length} aria-posinset={startRow * 4 + offset + 1} key={`${item.sessionId}:${item.path}`} className={`group/card relative rounded-lg border bg-card ${item.exists ? '' : 'opacity-50'}`}>
          <button data-gallery-card data-gallery-index={startRow * 4 + offset} type="button" onClick={() => void open(item)} title={`${item.name}\n${type?.label ?? 'File'}, from “${item.taskName}”${item.taskSettled ? ' (settled)' : ''}\n${item.path}`} className="w-full rounded-lg text-left transition-colors hover:bg-muted/30 focus-visible:ring-3 focus-visible:ring-ring/50 outline-none">
            <GalleryPreview item={item} />
            <div className="flex h-10 items-center gap-2 border-t px-2.5">
              <ArtifactTypeChip typeId={item.typeHint === 'motion' ? 'motion' : undefined} fileName={item.name} icon={type?.icon ?? FileText} size="sm" />
              <span className="min-w-0 flex-1 truncate text-meta font-medium">{item.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground transition-opacity group-hover/card:opacity-0 group-focus-within/card:opacity-0" title={item.touchTimeEstimated ? 'Estimated from task history modification time' : item.lastTouchedAt}>{item.exists ? relative(item.lastTouchedAt) : 'Missing'}</span>
            </div>
          </button>
          <DropdownMenu><DropdownMenuTrigger asChild><Button size="icon" variant="ghost" aria-label={`Actions for ${item.name}`} className="absolute bottom-1.5 right-1.5 size-7 opacity-0 transition-opacity group-hover/card:opacity-100 group-focus-within/card:opacity-100 data-[state=open]:opacity-100"><MoreHorizontal className="size-4" /></Button></DropdownMenuTrigger><DropdownMenuContent align="end">
            <DropdownMenuItem onSelect={() => void open(item)}>{item.exists ? 'Open in task' : 'Open task'}</DropdownMenuItem>
            {item.exists && <><DropdownMenuItem onSelect={() => void action(item, revealInFinder)}>Reveal in Finder</DropdownMenuItem><DropdownMenuItem onSelect={() => void action(item, openFile)}>Open in default app</DropdownMenuItem><DropdownMenuItem onSelect={() => void navigator.clipboard.writeText(item.path).then(() => toast('Path copied'), () => toast.error('Couldn’t copy the path.'))}>Copy path</DropdownMenuItem></>}
          </DropdownMenuContent></DropdownMenu>
        </article>;
      })}</div>}
    </div>
  </section>;
}
