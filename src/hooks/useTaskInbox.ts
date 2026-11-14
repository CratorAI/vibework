import { useCallback, useEffect, useRef, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { inboxFeedback } from './inboxFeedback';
export interface QueuedMessage { id: string; text: string; createdAt: number; note?: string; draft: { snapshot?: unknown; attachments?: unknown[] } | null }
export function useTaskInbox(sessionId?: string) {
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [items, setItems] = useState<QueuedMessage[]>([]);
  const generation = useRef(0);
  const currentSession = useRef(sessionId);
  currentSession.current = sessionId;
  const refresh = useCallback(async () => {
    if (!sessionId || currentSession.current !== sessionId) return;
    const request = ++generation.current;
    try {
      const rows = await invoke<QueuedMessage[]>('agent_inbox', { sessionId });
      // An older enqueued snapshot must not overwrite the later delivered snapshot.
      if (generation.current === request && currentSession.current === sessionId) setItems(rows);
    }
    catch (error) { console.warn('Could not refresh queued messages', error); }
  }, [sessionId]);
  useEffect(() => {
    setItems([]); setNotes({}); if (!sessionId) return;
    void refresh();
    const listener = listen<{ sessionId: string }>('agent:inbox', e => { if (e.payload.sessionId === sessionId) void refresh(); });
    return () => { ++generation.current; void listener.then(stop => stop()); };
  }, [sessionId, refresh]);
  const action = async (itemId: string, action: 'send' | 'edit' | 'remove') => {
    try {
      const item = await invoke<QueuedMessage>('agent_inbox_action', { sessionId, itemId, action });
      setNotes(n => ({ ...n, [itemId]: '' }));
      return item;
    } catch (error) {
      console.warn('Queue action failed', error);
      if (action === 'send') setNotes(n => ({ ...n, [itemId]: inboxFeedback(error) }));
      throw new Error(action === 'send' ? 'Your message is still queued.' : 'Could not update this queued message. Please try again.');
    } finally { await refresh(); }
  };
  const enqueue = async (text: string, draft: unknown, now: boolean) => {
    const item = await invoke<QueuedMessage>('agent_enqueue', { sessionId, text, draft });
    await refresh();
    // The draft is safely in the durable inbox even if steering is refused.
    if (now) await action(item.id, 'send').catch(() => {});
  };
  return { items: items.map(item => ({ ...item, note: notes[item.id] })), enqueue, action };
}
