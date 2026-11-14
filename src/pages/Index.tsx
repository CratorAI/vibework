import { HelperItem } from "@/components/blocks/HelperItem";
import { QUEUED_SLOT_ID } from "@/components/QueuedMessages";
import { useExternalStatus } from "@/hooks/useExternalStatus";
import { useLocation } from "react-router-dom";
import { messageReveal } from "@/stores/messageReveal";
import { Duration } from "@/components/blocks/Duration";
import { CreditNotice, addCredits } from "@/components/TaskTelemetry";
import { isOutOfCredit } from "@/utils/telemetry";
import React, {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useCallback,
  useMemo,
} from "react";
import { ArrowDown, Square, TriangleAlert } from "@/lib/icons";
import { toast } from "sonner";
import { useAgentSessionsContext } from "../contexts/AgentSessionsContext";
import { AskUserQuestion } from "@/components/AskUserQuestion";
import { AskUserQuestionResult } from "@/components/AskUserQuestionResult";
import { PresentFile } from "@/components/PresentFile";
import { PermissionPrompt } from "@/components/PermissionPrompt";
import { TextBlockView } from "@/components/blocks/TextBlockView";
import { GroupView } from "@/components/blocks/ToolGroupView";
import { ReplyActions, replyText } from "@/components/blocks/ReplyActions";
import {
  ChatMessage,
  ThinkingBlock,
  ToolBlock,
  TextBlock,
  MessageBlock,
  Question,
  TurnEnd,
} from "@/types/agent";
import { MessageInput } from "@/components/MessageInput";
import { UserMessageView } from "@/components/blocks/UserMessageView";
import { HomeView } from "@/components/views/HomeView";
import { cn, pathBaseName } from "@/lib/utils";
import { EASE_DRAWER_CSS, prefersReducedMotion, slideFrom, useArrival, useArrivedKey, useHomeHandoff } from "@/lib/motion";
import { WorkspaceDock } from "@/components/workspace/WorkspaceDock";
import { WorkspaceToggle } from "@/components/workspace/WorkspaceToggle";
import { WorkspaceActionsProvider } from "@/components/workspace/WorkspaceContext";
import { workspaceStore } from "@/components/workspace/store";
import { ConversationTitle } from "@/components/ConversationTitle";
import { openArtifactInPanel } from "@/components/workspace/actions";
import { isPreviewable } from "@/components/artifacts/registry";
import { latestPresentedFile } from "@/utils/presentedFiles";


/** Turn errors from the engine dying or restarting (engine/mod.rs): shown inline, not as a toast. */
const ENGINE_GONE = ["The agent restarted and this turn stopped", "Vibework lost its connection to the agent"];
/** Distance from the bottom within which scrolling down resumes following. */
const FOLLOW_RESUME_PX = 40;
/** Distance from the bottom that counts as being at the bottom (subpixel
 * scroll positions, and the clamp after content above the fold shrinks). */
const AT_BOTTOM_PX = 2;
/** Distance from the bottom beyond which "Jump to latest" shows. */
const JUMP_BUTTON_PX = 150;
/** How long after a wheel, scroll key or touch a scroll counts as the reader's. */
const USER_SCROLL_MS = 600;
/** Keys that scroll the conversation when it (or something in it) has focus. */
const SCROLL_KEYS = new Set(["ArrowUp", "ArrowDown", "PageUp", "PageDown", "Home", "End", " "]);

/**
 * Grouping: Consecutive tools/thinking are grouped together, but groups
 * are kept in sequential order with text blocks.
 * Special tools (PresentFile, AskUserQuestion) rendered outside dropdown.
 */
type BlockGroup =
  | { type: "group"; items: (ToolBlock | ThinkingBlock)[] }
  | { type: "text"; block: TextBlock }
  | { type: "present-file"; block: ToolBlock }
  | { type: "helper"; block: ToolBlock }
  | { type: "ask-question"; block: ToolBlock };

function groupBlocks(blocks: MessageBlock[]): BlockGroup[] {
  const result: BlockGroup[] = [];
  let pendingToolsAndThinking: (ToolBlock | ThinkingBlock)[] = [];

  // Helper to flush pending tools/thinking as a group
  const flushPending = () => {
    if (pendingToolsAndThinking.length > 0) {
      result.push({ type: "group", items: pendingToolsAndThinking });
      pendingToolsAndThinking = [];
    }
  };

  for (const block of blocks) {
    if (block.type === "tool") {
      // Check for special tools - these break the group
      if (block.call.name === "Helper") {
        flushPending();
        result.push({ type: "helper", block });
      } else if (block.call.name === "PresentFile") {
        flushPending();
        result.push({ type: "present-file", block });
      } else if (block.call.name === "AskUserQuestion") {
        flushPending();
        result.push({ type: "ask-question", block });
      } else {
        // Regular tool - add to pending group
        pendingToolsAndThinking.push(block);
      }
    } else if (block.type === "thinking") {
      // Empty reasoning (a signature-only block) has nothing to show, and the
      // stream never carries it while history can: skip it in both so they
      // group identically.
      if (!block.content.trim()) continue;
      pendingToolsAndThinking.push(block);
    } else if (block.type === "text") {
      // Whitespace-only text must not split activity groups: the stream
      // carries it between tool calls but the reloaded history drops it, and
      // the two must group identically for the end-of-turn handover.
      if (!block.content.trim()) continue;
      flushPending();
      result.push({ type: "text", block });
    }
  }

  // Flush any remaining tools/thinking at the end
  flushPending();

  return result;
}

/** Whether a streaming assistant message has anything to show yet. */
function hasVisibleContent(msg: ChatMessage): boolean {
  return msg.blocks.some(
    (b) =>
      (b.type === "thinking" && b.content.trim() !== "") ||
      (b.type === "text" && b.content.trim() !== "") ||
      (b.type === "tool" && b.call.name !== "AskUserQuestion"),
  );
}

/**
 * One assistant message. Memoized: settled messages keep their object
 * identity across stream flushes, so only the live message re-renders while
 * a reply streams.
 */
/**
 * When a turn settles, its file cards move under the final text. The move is
 * one FLIP (transform only, the drawer curve, 280ms) so the card and the text
 * visibly trade places; positions are read only at that moment, never per
 * stream flush. History (already settled when it mounts) does not animate.
 */
function useCardSettleMove(
  containerRef: React.RefObject<HTMLDivElement | null>,
  settled: boolean,
  ordered: { group: BlockGroup; idx: number }[],
) {
  const wasSettled = useRef(settled);
  const before = useRef<Map<string, number> | null>(null);
  const moves = !wasSettled.current && settled && ordered.some((g, i) => g.idx !== i);
  // Read positions during the render that reorders, while the DOM still has
  // the old order (the layout effect below runs after the new one).
  if (moves && before.current === null && containerRef.current && !prefersReducedMotion()) {
    const tops = new Map<string, number>();
    for (const el of containerRef.current.querySelectorAll<HTMLElement>(":scope > [data-reply-group]")) {
      tops.set(el.dataset.replyGroup!, el.getBoundingClientRect().top);
    }
    before.current = tops;
  }
  useLayoutEffect(() => {
    wasSettled.current = settled;
    const tops = before.current;
    before.current = null;
    if (!tops || !containerRef.current) return;
    for (const el of containerRef.current.querySelectorAll<HTMLElement>(":scope > [data-reply-group]")) {
      const from = tops.get(el.dataset.replyGroup!);
      if (from === undefined) continue;
      const dy = from - el.getBoundingClientRect().top;
      if (Math.abs(dy) < 1) continue;
      el.animate([{ transform: `translateY(${dy}px)` }, { transform: "none" }], { duration: 280, easing: EASE_DRAWER_CSS });
    }
  }, [settled, containerRef]);
}

const AssistantMessageView = React.memo(function AssistantMessageView({
  message,
  isLive,
  isLatest,
  waiting = null,
}: {
  message: ChatMessage;
  /** This is the running turn's message: its last group is in progress. */
  isLive: boolean;
  /** The turn is paused on the user; its last step waits on the docked prompt */
  waiting?: "approval" | "answer" | null;
  /** The last message in the conversation: its actions stay visible. */
  isLatest: boolean;
}) {
  const groups = useMemo(() => groupBlocks(message.blocks), [message.blocks]);
  // A settled reply shows its file cards after everything else, under the
  // final text (as Claude does). While the turn runs a card stays where it
  // was presented, so nothing jumps as text streams in after it.
  const settled = !isLive && !message.isStreaming;
  const ordered = useMemo(() => {
    const indexed = groups.map((group, idx) => ({ group, idx }));
    if (!settled) return indexed;
    return [...indexed.filter((g) => g.group.type !== "present-file"), ...indexed.filter((g) => g.group.type === "present-file")];
  }, [groups, settled]);
  const containerRef = useRef<HTMLDivElement>(null);
  useCardSettleMove(containerRef, settled, ordered);
  if (groups.length === 0 && !message.end) return null;
  // Copy appears once the reply has finished and has prose to copy
  const showActions = !isLive && !message.isStreaming && replyText(message) !== "";

  const renderGroup = (group: BlockGroup, idx: number): React.ReactNode => {
    const isLastGroup = idx === groups.length - 1;
    if (group.type === "helper") return <HelperItem block={group.block} isLive={isLive} />;
    if (group.type === "group") {
      return <GroupView items={group.items} isLive={isLive && isLastGroup} waiting={isLastGroup ? waiting : null} />;
    }
    if (group.type === "text") {
      return <TextBlockView text={group.block.content} isStreaming={isLive && isLastGroup} />;
    }
    if (group.type === "present-file") {
      const input = group.block.call.input as Record<string, unknown>;
      const filePath = typeof input?.file_path === "string" ? input.file_path : "";
      // Prefer the tool's own file_name; fall back to the path (either separator)
      const fileName =
        (typeof input?.file_name === "string" && input.file_name.trim()) ||
        (filePath ? pathBaseName(filePath) : "") ||
        "File";
      const description = (input?.description as string) || "";
      const call = group.block.call;
      return (
        <PresentFile
          filePath={filePath}
          fileName={fileName}
          description={description}
          // Opens the workspace panel on the file once, when it is
          // presented during a live turn (never from loaded history).
          presentation={{
            key: `${call.id}|${filePath}`,
            live: isLive,
            ready: !call.isExecuting && call.result?.success !== false,
          }}
        />
      );
    }
    if (group.type === "ask-question") {
      // Only show result when tool has completed (not still executing)
      // and has actual results
      const isExecuting = group.block.call.isExecuting;
      const result = group.block.call.result;

      // The question itself is docked in the message box; the timeline
      // says the turn is waiting on it (as it does for an approval).
      if (isExecuting && isLastGroup && waiting === "answer") {
        return <GroupView items={[group.block]} isLive={false} waiting="answer" />;
      }
      // Don't render anything while waiting for user input
      if (isExecuting || !result?.output) {
        return null;
      }
      const input = group.block.call.input as Record<string, unknown>;
      const questions = (input?.questions as Question[]) || [];
      // Parse answers from result output
      // Format is: "User responded with the following answers:\n{...JSON...}"
      let answers: Record<string, string> = {};
      try {
        // Find the JSON object in the output (starts with {)
        const jsonStart = result.output.indexOf("{");
        if (jsonStart !== -1) {
          const jsonStr = result.output.slice(jsonStart);
          answers = JSON.parse(jsonStr);
        }
      } catch {
        // If parsing fails, leave answers empty
      }
      // OpenCode's question tool returns a human-readable answer summary.
      const questionOutput = result.output;
      if (questionOutput.startsWith("User has answered your questions:")) {
        questions.forEach((question, index) => {
          const prefix = `"${question.question}"="`;
          const start = questionOutput.indexOf(prefix);
          if (start < 0) return;
          const tail = questionOutput.slice(start + prefix.length);
          const next = questions[index + 1];
          const end = next ? tail.indexOf(`", "${next.question}"="`) : tail.lastIndexOf('". You can now continue');
          if (end >= 0) answers[question.header] = tail.slice(0, end);
        });
      }
      return (
        <AskUserQuestionResult
          questions={questions}
          answers={answers}
        />
      );
    }
    return null;
  };

  let shown = 0;
  return (
    <div className="group/reply" ref={containerRef} data-source-ids={message.sourceIds?.join(" ")}>
      {ordered.map(({ group, idx }) => {
        const content = renderGroup(group, idx);
        if (content === null) return null;
        const gap = shown++ > 0 ? (group.type === "ask-question" ? "mt-2" : "mt-3") : "";
        // Keys are the group's place in the reply (type + original index),
        // never block ids: streamed and reloaded blocks have different ids,
        // and neither the end-of-turn handover nor moving a file card under
        // the text may remount a view.
        const key = `${group.type}-${idx}`;
        return (
          <div key={key} data-reply-group={key} className={gap}>
            {content}
          </div>
        );
      })}
      {!isLive && message.end && <TurnEndRow end={message.end} first={shown === 0} />}
      {/* One quiet row under the reply: copy, then how long the turn took */}
      {!isLive && (showActions || message.turnTiming?.durationMs != null) && (
        <div className="mt-2 flex h-7 items-center gap-1.5" data-testid="reply-footer">
          {showActions && <ReplyActions message={message} isLatest={isLatest} />}
          {message.turnTiming?.durationMs != null && <Duration timings={[message.turnTiming]} prefix="Worked for " />}
        </div>
      )}
    </div>
  );
});

/**
 * How an unfinished turn ended, inline after its reply: a quiet "Stopped"
 * when the user pressed Stop; the reason when the engine died or restarted
 * (errors stay inline, with what to do next).
 */
function TurnEndRow({ end, first }: { end: TurnEnd; first: boolean }) {
  if (end.kind === "stopped") {
    return (
      <div className={cn("flex h-5 items-center gap-1.5 text-meta text-muted-foreground", !first && "mt-3")} data-testid="turn-stopped">
        <Square className="size-3 shrink-0 fill-current" />
        <span>Stopped</span>
      </div>
    );
  }
  return (
    <div className={cn("flex items-start gap-1.5 text-meta text-foreground", !first && "mt-3")} role="status" data-testid="turn-failed">
      <TriangleAlert className="size-3.5 shrink-0 mt-[3px] text-destructive" />
      <span className="select-text">{end.text}</span>
    </div>
  );
}

export const Index: React.FC = () => {
  const galleryOpen = useLocation().pathname === "/artifacts";
  const scrollRef = useRef<HTMLDivElement>(null);
  // The row holding the chat column and the workspace dock (its width is the
  // content area the dock sizes against).
  const layoutRowRef = useRef<HTMLDivElement>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLDivElement>(null);
  // Follow the bottom as content grows, unless the reader has scrolled up.
  const followRef = useRef(true);
  const lastScrollTopRef = useRef(0);
  // When the reader last scrolled (wheel, keys, touch), and whether they are
  // dragging the scrollbar: only their scrolling stops the follow.
  const scrollIntentRef = useRef(0);
  const draggingRef = useRef(false);
  const prevLoadingRef = useRef<boolean>(false);
  const [showJumpButton, setShowJumpButton] = useState(false);

  // Get session state from context
  const {
    activeSession,
    activeSessionId,
    activeSessions,
    sessions,
    refreshSessions,
    clearActiveSession,
    consumeRevealLatestFile,
  } = useAgentSessionsContext();

  // Extract state and handlers from active session
  const messages = activeSession?.state.messages ?? [];
  const agentLoading = activeSession?.state.isLoading ?? false;
  const permissionRequest = activeSession?.state.permissionRequest ?? null;
  const questionRequest = activeSession?.state.questionRequest ?? null;
  const agentError = activeSession?.state.error ?? null;
  // The plan bar belongs to the running turn: once the turn has ended it
  // goes (the reply says what was done), so it never lingers after the
  // reply and then vanishes on reopen.
  const todos = (agentLoading && activeSession?.state.todos) || [];

  const sendMessage = activeSession?.handlers.sendMessage;
  const interrupt = activeSession?.handlers.interrupt;
  const respondToPermission = activeSession?.handlers.respondToPermission;
  const respondToQuestion = activeSession?.handlers.respondToQuestion;

  const lastMessage = messages[messages.length - 1];

  // A task that finished while the reader was elsewhere shows its result
  // when opened: its latest presented file opens in the panel, once (the
  // same thing that happens when the file is presented live).
  const revealLatestFile = activeSessionId ? activeSessions.get(activeSessionId)?.revealLatestFile ?? false : false;
  useEffect(() => {
    if (!revealLatestFile || !activeSessionId || messages.length === 0) return;
    consumeRevealLatestFile(activeSessionId);
    const path = latestPresentedFile(messages);
    if (path && isPreviewable(pathBaseName(path))) openArtifactInPanel(activeSessionId, path);
  }, [revealLatestFile, activeSessionId, messages, consumeRevealLatestFile]);

  // The turn is producing output. Not while it waits on the user (a
  // permission or question prompt): nothing is running then, so nothing
  // should shimmer or pace.
  const turnLive = agentLoading && !permissionRequest && !questionRequest;

  // In-thread "working" cue for the gap between sending and the first
  // visible output. It sits where the reply will appear and has the same
  // height as an activity header, so the first content replaces it in place.
  // Later gaps are covered by the composer's "Agent Running" ribbon.
  // A Claude Code or Codex task says what it is waiting on ("Starting Codex…")
  const [externalStatus] = useExternalStatus(activeSessionId);
  const startingLabel = externalStatus?.message && !externalStatus.retry ? externalStatus.message : null;
  const showWorking =
    turnLive &&
    (lastMessage?.role === "user" ||
      (lastMessage?.role === "assistant" && !hasVisibleContent(lastMessage)));

  // Scroll position per conversation, so switching away mid-stream and back
  // returns the reader to where they were (or to the live bottom).
  const scrollMemoryRef = useRef(
    new Map<string, { top: number; follow: boolean }>(),
  );
  const sessionIdRef = useRef(activeSessionId);
  sessionIdRef.current = activeSessionId;

  const updateJumpButton = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
    setShowJumpButton(distance > JUMP_BUTTON_PX);
  }, []);

  // Moving up stops following. Following resumes at the very bottom, or
  // when the reader scrolls down into the last few pixels. Programmatic
  // follow-scrolls always land at the bottom, and content shrinking under a
  // pinned view clamps it to the bottom, so neither reads as "scrolled up".
  const handleScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const top = el.scrollTop;
    const distance = el.scrollHeight - top - el.clientHeight;
    // Only the reader stops following. The view also moves up on its own
    // when the message box swaps for a docked prompt (and back), and that
    // must not leave the rest of the reply below the fold.
    const byReader = draggingRef.current || performance.now() - scrollIntentRef.current < USER_SCROLL_MS;
    if (distance <= AT_BOTTOM_PX) {
      followRef.current = true;
    } else if (top < lastScrollTopRef.current - 1) {
      if (byReader) followRef.current = false;
      else if (followRef.current) {
        el.scrollTop = el.scrollHeight;
        lastScrollTopRef.current = el.scrollTop;
        setShowJumpButton(false);
        return;
      }
    } else if (top > lastScrollTopRef.current && distance <= FOLLOW_RESUME_PX) {
      followRef.current = true;
    }
    lastScrollTopRef.current = top;
    if (sessionIdRef.current) {
      scrollMemoryRef.current.set(sessionIdRef.current, {
        top,
        follow: followRef.current,
      });
    }
    setShowJumpButton(distance > JUMP_BUTTON_PX);
  }, []);

  // Wheel-up stops following before the next growth can pull the view back
  // (only when there is somewhere to scroll to).
  const handleWheel = useCallback((e: React.WheelEvent) => {
    scrollIntentRef.current = performance.now();
    if (e.deltaY < 0 && (scrollRef.current?.scrollTop ?? 0) > 0) {
      followRef.current = false;
    }
  }, []);
  // Other ways the reader scrolls: keys, touch, and dragging the scrollbar.
  const handleScrollKey = useCallback((e: React.KeyboardEvent) => {
    if (SCROLL_KEYS.has(e.key)) scrollIntentRef.current = performance.now();
  }, []);
  const handleTouch = useCallback(() => {
    scrollIntentRef.current = performance.now();
  }, []);
  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    if (e.target !== e.currentTarget) return; // the scrollbar, not the content
    draggingRef.current = true;
    const release = () => {
      draggingRef.current = false;
      scrollIntentRef.current = performance.now();
      window.removeEventListener("pointerup", release);
      window.removeEventListener("pointercancel", release);
    };
    window.addEventListener("pointerup", release);
    window.addEventListener("pointercancel", release);
  }, []);

  const pinToBottom = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
    lastScrollTopRef.current = el.scrollTop;
  }, []);

  // Follow the bottom as CONTENT grows (paced text keeps growing between
  // event flushes; cards and images resize the column too), not as state
  // updates land. Each step is a few pixels, so an instant scroll reads as
  // smooth. Also watches the viewport, which shrinks when the composer or a
  // permission prompt grows.
  useEffect(() => {
    const el = scrollRef.current;
    const content = contentRef.current;
    if (!el || !content) return;
    const observer = new ResizeObserver(() => {
      if (followRef.current) pinToBottom();
      updateJumpButton();
    });
    observer.observe(content);
    observer.observe(el);
    return () => observer.disconnect();
  }, [activeSessionId, pinToBottom, updateJumpButton]);

  // Opening a conversation starts at the latest message; coming back to one
  // the reader had scrolled up in returns them to where they were. Layout
  // effect, so the swapped-in conversation never paints at the old offset.
  useLayoutEffect(() => {
    const el = scrollRef.current;
    const saved = activeSessionId
      ? scrollMemoryRef.current.get(activeSessionId)
      : undefined;
    if (el && saved && !saved.follow) {
      followRef.current = false;
      el.scrollTop = saved.top;
      lastScrollTopRef.current = el.scrollTop;
      updateJumpButton();
      return;
    }
    followRef.current = true;
    pinToBottom();
    updateJumpButton();
  }, [activeSessionId, pinToBottom, updateJumpButton]);

  // A message found by search: once its task's history is on screen, scroll
  // it to the middle of the view and highlight it briefly (the reader is
  // then where they asked to be, so the view stops following the bottom).
  const [revealTick, setRevealTick] = useState(0);
  useEffect(() => {
    const unsubscribe = messageReveal.subscribe(() => setRevealTick((n) => n + 1));
    return () => void unsubscribe();
  }, []);
  useEffect(() => {
    const wanted = messageReveal.peek(activeSessionId);
    const el = scrollRef.current;
    if (!wanted || !el) return;
    const target = contentRef.current?.querySelector<HTMLElement>(`[data-source-ids~="${CSS.escape(wanted.messageId)}"]`);
    if (!target) return;
    // In a long message, the paragraph, list item or cell with the match
    const word = wanted.word?.toLocaleLowerCase();
    const spot = () =>
      (word && [...target.querySelectorAll<HTMLElement>("p, li, td, th, h1, h2, h3, h4, blockquote")].find((b) => b.textContent?.toLocaleLowerCase().includes(word))) || target;
    messageReveal.done();
    // Counts as the reader moving the view, so following the bottom (and
    // its snap back after a programmatic scroll) stays off.
    const reveal = () => {
      followRef.current = false;
      scrollIntentRef.current = performance.now();
      const box = (target.getBoundingClientRect().height > el.clientHeight * 0.6 ? spot() : target).getBoundingClientRect();
      const view = el.getBoundingClientRect();
      // Centred when it fits, else its top a third of the way down
      const offset = box.height < view.height * 0.6 ? (view.height - box.height) / 2 : view.height / 3;
      el.scrollTop = Math.max(0, el.scrollTop + box.top - view.top - offset);
      lastScrollTopRef.current = el.scrollTop;
      if (activeSessionId) scrollMemoryRef.current.set(activeSessionId, { top: el.scrollTop, follow: false });
      updateJumpButton();
    };
    // Not cancelled when the history updates again: the request is taken.
    requestAnimationFrame(() => {
      if (!target.isConnected) return;
      reveal();
      target.classList.add("search-hit");
      window.setTimeout(() => target.classList.remove("search-hit"), 1600);
    });
    // The opened task may still settle (its view pinned once more as it
    // finishes opening): put the message back in view if it moved out.
    window.setTimeout(() => {
      if (!target.isConnected) return;
      const box = target.getBoundingClientRect();
      const view = el.getBoundingClientRect();
      if (box.bottom < view.top || box.top > view.bottom) reveal();
    }, 300);
  }, [activeSessionId, messages, revealTick, updateJumpButton]);

  // Sending a message brings the view back to the bottom and follows the
  // reply, even if the reader had scrolled up. Only for a message sent from
  // this window (optimistic): a history reload that happens to end on a user
  // message is not a send and must not move the view.
  const sentMessageId =
    lastMessage?.role === "user" && lastMessage.userOrdinal !== undefined
      ? lastMessage.id
      : null;
  useEffect(() => {
    if (!sentMessageId) return;
    followRef.current = true;
    pinToBottom();
  }, [sentMessageId, pinToBottom]);

  // ── Motion: only what arrives while the reader watches ─────────────────
  // A conversation just started from home: its composer travels down from
  // where the home composer sat, and its first message and "Working…" arrive.
  const handoffTop = useHomeHandoff(activeSessionId);
  const startedHere = handoffTop !== null;
  useLayoutEffect(() => {
    if (handoffTop === null || !composerRef.current) return;
    const anim = slideFrom(composerRef.current, handoffTop, 380);
    return () => anim?.cancel();
  }, [activeSessionId, handoffTop]);
  // Sent from this window, not loaded: the history copy that replaces it at
  // the end of the turn has another id, so the class drops without replaying.
  const arrivedUserMessageId = useArrivedKey(sentMessageId, activeSessionId, startedHere);
  const workingArrived = useArrival(showWorking ? "working" : null, activeSessionId, startedHere);
  // A pending permission or question takes the message box's place (one at
  // a time; permissions first, as the backend shows one request at a time)
  const dockedPrompt =
    permissionRequest && respondToPermission
      ? {
          key: `permission:${permissionRequest.requestId}`,
          node: (
            <PermissionPrompt
              permissionRequest={permissionRequest}
              allowRemember={!sessions.find(session => session.sessionId === activeSessionId)?.agentType.startsWith("agent:")}
              onRespond={respondToPermission}
              onStop={interrupt}
            />
          ),
        }
      : questionRequest && respondToQuestion
        ? {
            key: `question:${questionRequest.requestId}`,
            node: <AskUserQuestion request={questionRequest} onRespond={respondToQuestion} onStop={interrupt} docked />,
          }
        : null;

  // Scroll to bottom handler for the button
  const scrollToBottom = useCallback(() => {
    followRef.current = true;
    scrollRef.current?.scrollTo({
      top: scrollRef.current.scrollHeight,
      behavior: "smooth",
    });
  }, []);

  // The workspace panel's auto-open rules need to know when a turn runs
  useEffect(() => {
    if (activeSessionId) workspaceStore.setTurnLive(activeSessionId, agentLoading);
  }, [activeSessionId, agentLoading]);

  // Refresh session list when agent finishes a turn (to get updated conversationName)
  useEffect(() => {
    // Only refresh when loading transitions from true to false (turn completed)
    if (prevLoadingRef.current && !agentLoading && activeSessionId) {
      console.log(
        `[Index] Turn completed for ${activeSessionId}, refreshing session list`,
      );
      refreshSessions();
    }
    prevLoadingRef.current = agentLoading;
  }, [agentLoading, activeSessionId, refreshSessions]);

  // Show toast when agent error occurs. A turn the engine could not finish
  // (it died or restarted) says so inline after its reply instead.
  useEffect(() => {
    if (agentError && !ENGINE_GONE.some((start) => agentError.startsWith(start))) {
      // Parse error message for cleaner display
      let errorMessage = agentError;

      // Try to extract message from JSON error format
      const jsonMatch = agentError.match(/\{.*"message":\s*"([^"]+)".*\}/);
      if (jsonMatch) {
        errorMessage = jsonMatch[1];
      }
      errorMessage = errorMessage.replace(/^(?:Error:\s*)+/i, "");
      toast.error(isOutOfCredit(agentError) ? "Your OpenRouter account is out of credit." : errorMessage, {
        id: "agent-error",
        duration: Infinity,
        closeButton: true,
        // Out of credit has a way forward here; for other errors the
        // message says what to do (a new task was never it).
        ...(isOutOfCredit(agentError) ? { action: { label: "Add credits", onClick: () => addCredits() } } : {}),
      });
    } else {
      toast.dismiss("agent-error");
    }
  }, [agentError, clearActiveSession]);

  return (
    <div inert={galleryOpen || undefined} aria-hidden={galleryOpen || undefined} style={galleryOpen ? { visibility: "hidden" } : undefined} className={cn(
        // The title bar band: window-drag space in the page's own background
        // (scrolled content passes under it). One surface with the page, on
        // home and in a task alike.
        "relative flex h-full flex-col overflow-hidden bg-background before:pointer-events-none before:absolute before:inset-x-0 before:top-0 before:z-40 before:h-(--titlebar-height) before:bg-background",
        // No rule under the band: scrolled content fades out beneath it instead
        activeSessionId && "after:pointer-events-none after:absolute after:inset-x-0 after:top-(--titlebar-height) after:z-40 after:h-5 after:bg-gradient-to-b after:from-background after:to-transparent",
      )}>
      <div ref={layoutRowRef} className="flex min-h-0 flex-1">
        <div className="relative flex min-h-0 min-w-0 flex-1 flex-col">
          {!activeSessionId ? (
            <HomeView />
          ) : (
            <WorkspaceActionsProvider sessionId={activeSessionId}>
              {/* Messages */}
              <div className="relative flex-1 min-h-0">
                {/* Scroll to bottom button - floating above messages */}
                {/* Always mounted so it can leave as well as arrive */}
                <div
                  className={cn(
                    "absolute bottom-4 left-1/2 z-10 -translate-x-1/2 transition-[opacity,scale,translate] ease-(--ease-out)",
                    showJumpButton
                      ? "duration-200"
                      : "pointer-events-none translate-y-1 scale-95 opacity-0 duration-150",
                  )}
                  aria-hidden={!showJumpButton}
                  inert={!showJumpButton ? true : undefined}
                  data-testid="jump-to-latest"
                >
                  <button
                    onClick={scrollToBottom}
                    className="pressable flex h-8 items-center gap-1.5 rounded-full bg-popover px-3.5 text-meta text-muted-foreground shadow-popover transition-[color,background-color,scale] outline-none hover:bg-muted hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
                  >
                    <ArrowDown className="size-3.5" />
                    Jump to latest
                  </button>
                </div>
                <div
                  ref={scrollRef}
                  onScroll={handleScroll}
                  onWheel={handleWheel}
                  onKeyDown={handleScrollKey}
                  onTouchMove={handleTouch}
                  onPointerDown={handlePointerDown}
                  className="h-full overflow-y-auto"
                >
                  {/* Conversation column: same width as the docked composer */}
                  <div
                    // Keyed by session: message views are keyed by position,
                    // which must not carry state from one conversation to
                    // another.
                    key={activeSessionId}
                    ref={contentRef}
                    className="mx-auto w-full max-w-[816px] space-y-4 px-6 pt-[calc(var(--titlebar-height)+16px)] pb-6"
                  >
                  {messages.length === 0 ? (
                    <div className="flex items-center justify-center py-24">
                      <p className="text-ui text-muted-foreground">
                        No messages yet
                      </p>
                    </div>
                  ) : (
                    messages.map((msg, index) => {
                      // Positional keys: the streamed turn and the history
                      // that replaces it at the end of the turn occupy the
                      // same positions, so the swap updates in place.
                      const key = `${msg.role}-${index}`;
                      if (msg.role === "user") {
                        return (
                          <div
                            key={key}
                            className={msg.id === arrivedUserMessageId ? "motion-arrive" : undefined}
                            data-source-ids={msg.sourceIds?.join(" ")}
                          >
                            <UserMessageView message={msg} />
                          </div>
                        );
                      }
                      return (
                        <AssistantMessageView
                          key={key}
                          message={msg}
                          isLive={turnLive && index === messages.length - 1}
                          waiting={index === messages.length - 1 ? (permissionRequest ? "approval" : questionRequest ? "answer" : null) : null}
                          isLatest={index === messages.length - 1}
                        />
                      );
                    })
                  )}

                  {showWorking && (
                    <div
                      className={cn("flex h-7 items-center text-sm", workingArrived && "motion-fade-in [animation-delay:120ms]")}
                      aria-live="polite"
                    >
                      <span className="text-shimmer">{startingLabel ?? "Working…"}</span>
                    </div>
                  )}

                  {/* Messages queued while the agent works appear here, as not-yet-sent messages */}
                  <div id={QUEUED_SLOT_ID} className="empty:hidden" />

                  </div>
                </div>
              </div>

              {/* Input area */}
              {sendMessage && interrupt && activeSessionId && (
                <div ref={composerRef} className="mx-auto w-full max-w-[816px] px-6 pb-3">
                  <CreditNotice error={agentError} />
                  <MessageInput
                    sessionId={activeSessionId}
                    onSend={sendMessage}
                    onInterrupt={interrupt}
                    isLoading={agentLoading}
                    agentState={activeSession?.state.agentState}
                    todos={todos}
                    prompt={dockedPrompt}
                  />
                </div>
              )}
            </WorkspaceActionsProvider>
          )}
          {/* The task's title in the titlebar band (absolutely placed) */}
          {activeSessionId && <ConversationTitle sessionId={activeSessionId} />}
        </div>

        {/* Workspace panel (artifacts, terminal, browser); not on the home screen */}
        {activeSessionId && (
          <WorkspaceDock
            sessionId={activeSessionId}
            agentBusy={agentLoading}
            containerRef={layoutRowRef}
          />
        )}
      </div>

      {activeSessionId && <WorkspaceToggle sessionId={activeSessionId} />}
    </div>
  );
};
