import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { ArrowUp, Pencil, X } from '@/lib/icons';
import { toast } from 'sonner';
import type { QueuedMessage } from '@/hooks/useTaskInbox';
/** Where the conversation shows queued messages; rendered by the task page. */
export const QUEUED_SLOT_ID = 'queued-messages-slot';

export function QueuedMessages({ items, waiting, onAction }: { items: QueuedMessage[]; waiting: boolean; onAction: (item: QueuedMessage, action: 'send' | 'edit' | 'remove') => Promise<void> }) {
  const [pending, setPending] = useState<string[]>([]);
  async function act(item: QueuedMessage, action: 'send' | 'edit' | 'remove') {
    setPending(p => [...p, item.id]);
    try { await onAction(item, action); } catch (e) { console.warn('Queue action failed', e); if(action !== 'send') toast.error('Could not update this queued message. Please try again.'); }
    finally { setPending(p => p.filter(id => id !== item.id)); }
  }
  // Queued messages live in the conversation, after the latest reply, as
  // messages that have not been sent yet; the slot is rendered by the page.
  const [slot, setSlot] = useState<HTMLElement | null>(null);
  const count = items.length;
  useEffect(() => {
    const el = document.getElementById(QUEUED_SLOT_ID);
    setSlot(prev => (prev === el ? prev : el));
  });
  const shown = useRef(0);
  useEffect(() => {
    // A newly queued message is brought into view, like one just sent
    if (count > shown.current) slot?.scrollIntoView({ block: 'end', behavior: 'smooth' });
    shown.current = count;
  }, [count, slot]);
  if (!items.length || !slot) return null;
  const control = 'pressable grid size-6 place-items-center rounded-md text-muted-foreground outline-none transition-[color,background-color,scale] hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40';
  return createPortal(
    <div className="flex flex-col gap-3" aria-label="Queued messages">
      {items.map(item => {
        const busy = pending.includes(item.id);
        const text = item.text.replace(/<vibe-work-attachment>(.*?)<\/vibe-work-attachment>/g, (_, path: string) => path.split('/').pop() ?? path);
        return (
          <div key={item.id} className="flex flex-col items-end" data-queued-message={item.id}>
            {/* The same bubble as a sent message, outlined and muted until it goes */}
            <div className="max-w-[75%] rounded-2xl border border-dashed border-foreground/20 px-4 py-2.5 text-prose text-muted-foreground">
              <span className="whitespace-pre-wrap break-words">{text}</span>
            </div>
            {item.note && <p className="mt-1 max-w-[75%] text-meta text-muted-foreground" role="status">{item.note}</p>}
            {/* The outlined bubble says it is waiting; under it only icons: send now, edit, remove */}
            <div className="mt-1 flex items-center gap-0.5">
              <span title={waiting ? 'Answer the pending prompt first.' : 'Send now'}>
                <button type="button" className={control} aria-label="Send now" disabled={waiting || busy} onClick={() => void act(item, 'send')}><ArrowUp className="size-3.5" /></button>
              </span>
              <button type="button" className={control} aria-label="Edit queued message" title="Edit" disabled={busy} onClick={() => void act(item, 'edit')}><Pencil className="size-3.5" /></button>
              <button type="button" className={control} aria-label="Remove queued message" title="Remove" disabled={busy} onClick={() => void act(item, 'remove')}><X className="size-3.5" /></button>
            </div>
          </div>
        );
      })}
    </div>,
    slot,
  );
}
