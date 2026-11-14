/**
 * One terminal: an xterm.js view attached to a backend shell by id.
 *
 * Mount: subscribe to output first, then open (or re-attach to) the shell;
 * a shell that was already running is repainted from its snapshot. Output
 * that arrives meanwhile is queued and written after the snapshot (a few
 * bytes may repeat). The shell keeps running when this view unmounts.
 */

import { useEffect, useRef, useState } from "react";
import { Terminal } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import "@xterm/xterm/css/xterm.css";
import { RotateCw } from "@/lib/icons";
import type { UnlistenFn } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import {
  decodeBase64Bytes,
  onTerminalData,
  onTerminalExit,
  terminalList,
  terminalOpen,
  terminalResize,
  terminalSnapshot,
  terminalWrite,
  type TerminalInfo,
} from "@/tauri/terminal";
import { errorMessage } from "@/lib/utils";
import { buildXtermTheme, monoFontFamily } from "./xtermTheme";

const isMac = navigator.userAgent.includes("Mac");

export function TerminalView({
  id,
  cwd,
  active,
  onInfo,
  onTitle,
  onOpenLink,
}: {
  id: string;
  /** Working folder for a new shell (null: home) */
  cwd: string | null;
  /** The visible terminal: takes focus */
  active: boolean;
  onInfo: (info: TerminalInfo) => void;
  onTitle: (title: string) => void;
  onOpenLink: (url: string) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const termRef = useRef<Terminal | null>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const [exited, setExited] = useState<{ code: number | null } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const exitedRef = useRef(false);
  exitedRef.current = exited !== null;

  // Latest callbacks without re-running the mount effect
  const callbacks = useRef({ onInfo, onTitle, onOpenLink });
  callbacks.current = { onInfo, onTitle, onOpenLink };

  useEffect(() => {
    const el = container.current;
    if (!el) return;
    let disposed = false;
    const unlisteners: UnlistenFn[] = [];
    let ready = false;
    const queue: Uint8Array[] = [];

    const term = new Terminal({
      fontFamily: monoFontFamily(),
      fontSize: 13,
      lineHeight: 1.2,
      cursorBlink: true,
      scrollback: 5000,
      theme: buildXtermTheme(),
      allowProposedApi: false,
      macOptionIsMeta: false,
      rightClickSelectsWord: isMac,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon((event, uri) => {
      event.preventDefault();
      callbacks.current.onOpenLink(uri);
    }));
    term.open(el);
    termRef.current = term;
    fitRef.current = fit;
    try {
      fit.fit();
    } catch {
      /* not laid out yet */
    }

    // Copy / paste / clear. Native paste (the Edit menu's Cmd+V, or
    // Ctrl+Shift+V) reaches xterm's own paste handler; here we only make
    // copy explicit and stop the keys from also reaching the shell.
    term.attachCustomKeyEventHandler((e) => {
      if (e.type !== "keydown") return true;
      const key = e.key.toLowerCase();
      const copyCombo = isMac ? e.metaKey && !e.ctrlKey && key === "c" : e.ctrlKey && e.shiftKey && key === "c";
      const pasteCombo = isMac ? e.metaKey && !e.ctrlKey && key === "v" : e.ctrlKey && e.shiftKey && key === "v";
      if (copyCombo) {
        if (term.hasSelection()) navigator.clipboard.writeText(term.getSelection()).catch(() => {});
        return false;
      }
      if (pasteCombo) return false;
      if (isMac && e.metaKey && key === "k") {
        e.preventDefault();
        term.clear();
        return false;
      }
      if (isMac && e.metaKey && key === "a") {
        e.preventDefault();
        term.selectAll();
        return false;
      }
      return true;
    });

    term.onData((data) => {
      if (!exitedRef.current) terminalWrite(id, data).catch(() => {});
    });
    term.onTitleChange((title) => title && callbacks.current.onTitle(title));

    const write = (bytes: Uint8Array) => {
      if (ready) term.write(bytes);
      else queue.push(bytes);
    };

    (async () => {
      try {
        unlisteners.push(await onTerminalData((e) => e.id === id && write(decodeBase64Bytes(e.data))));
        unlisteners.push(
          await onTerminalExit((e) => {
            if (e.id === id) setExited({ code: e.exitCode });
          }),
        );
        if (disposed) return;

        const existing = (await terminalList()).find((t) => t.id === id);
        if (disposed) return;
        if (existing && !existing.alive) {
          // Exited while no view was attached: show what it printed, offer Restart
          const snap = await terminalSnapshot(id).catch(() => "");
          if (disposed) return;
          if (snap) term.write(decodeBase64Bytes(snap));
          setExited({ code: null });
        } else {
          const info = await terminalOpen({ id, cwd, cols: term.cols, rows: term.rows });
          if (disposed) return;
          callbacks.current.onInfo(info);
          if (existing) {
            const snap = await terminalSnapshot(id).catch(() => "");
            if (disposed) return;
            if (snap) term.write(decodeBase64Bytes(snap));
          }
        }
        ready = true;
        for (const chunk of queue.splice(0)) term.write(chunk);
      } catch (err) {
        if (!disposed) setError(errorMessage(err, "Could not start the terminal"));
      }
    })();

    // Re-fit on size changes (rAF-throttled); tell the shell about new sizes
    let frame = 0;
    let resizeTimer: ReturnType<typeof setTimeout> | null = null;
    let lastSize = `${term.cols}x${term.rows}`;
    const ro = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        if (!el.offsetWidth || !el.offsetHeight) return;
        try {
          fit.fit();
        } catch {
          return;
        }
        const size = `${term.cols}x${term.rows}`;
        if (size === lastSize) return;
        lastSize = size;
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(() => {
          if (ready && !exitedRef.current) terminalResize(id, term.cols, term.rows).catch(() => {});
        }, 60);
      });
    });
    ro.observe(el);

    // Follow the app's light/dark switch
    const themeObserver = new MutationObserver(() => {
      term.options.theme = buildXtermTheme();
    });
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] });

    return () => {
      disposed = true;
      cancelAnimationFrame(frame);
      if (resizeTimer) clearTimeout(resizeTimer);
      ro.disconnect();
      themeObserver.disconnect();
      unlisteners.forEach((u) => u());
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
  }, [id, cwd]);

  useEffect(() => {
    if (active) termRef.current?.focus();
  }, [active]);

  const restart = async () => {
    const term = termRef.current;
    if (!term) return;
    term.reset();
    setExited(null);
    setError(null);
    try {
      const info = await terminalOpen({ id, cwd, cols: term.cols, rows: term.rows });
      onInfo(info);
      term.focus();
    } catch (err) {
      setError(errorMessage(err, "Could not restart the terminal"));
    }
  };

  return (
    <div className="flex h-full min-h-0 flex-col bg-background">
      <div className="terminal-host min-h-0 flex-1 py-2 pl-3" onMouseDown={() => termRef.current?.focus()}>
        <div ref={container} className="size-full" />
      </div>
      {(exited || error) && (
        <div className="flex h-10 shrink-0 items-center gap-3 border-t px-3 text-meta">
          <span className={error ? "min-w-0 flex-1 truncate text-destructive" : "min-w-0 flex-1 truncate text-muted-foreground"}>
            {error ??
              (exited?.code !== null && exited?.code !== undefined
                ? `Process exited with code ${exited.code}`
                : "Process exited")}
          </span>
          <Button variant="outline" size="sm" onClick={restart}>
            <RotateCw />
            Restart
          </Button>
        </div>
      )}
    </div>
  );
}
