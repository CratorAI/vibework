/**
 * Whiteboard editor: an Excalidraw canvas bound to a `.excalidraw` file.
 *
 * Autosaves ~800 ms after the board changes (never on selection or pan/zoom), on blur and
 * on unmount; reloads in place when the file changes on disk, keeping the viewport and
 * selection; with unsaved edits it keeps the person's version and offers a choice.
 */

// Must come before Excalidraw: points its font loading at our bundled assets.
import "./excalidrawAssets";
import {
  CaptureUpdateAction,
  Excalidraw,
  MainMenu,
  WelcomeScreen,
  exportToBlob,
  exportToSvg,
  getSceneVersion,
  isElementLink,
  restore,
  serializeAsJSON,
} from "@excalidraw/excalidraw";
import type { AppState, BinaryFiles, ExcalidrawImperativeAPI, ExcalidrawInitialDataState, UIOptions } from "@excalidraw/excalidraw/types";
import type { NonDeletedExcalidrawElement, OrderedExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import "@excalidraw/excalidraw/index.css";
import "./whiteboard.css";

import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ChevronDown, Copy, FileImage, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";

import type { ArtifactViewProps } from "../types";
import { readArtifact, writeArtifact } from "@/tauri/artifacts";
import { openUrl } from "@/tauri/files";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { BoardSession } from "./session";
import {
  type BoardData,
  BoardParseError,
  DEFAULT_BACKGROUND,
  baseName,
  isExternalLink,
  parseBoard,
  resolveFileLink,
  siblingPath,
} from "./scene";

const UI_OPTIONS: Partial<UIOptions> = {
  canvasActions: {
    changeViewBackgroundColor: true,
    clearCanvas: true,
    export: false,
    loadScene: false,
    saveToActiveFile: false,
    saveAsImage: false,
    toggleTheme: false,
  },
  tools: { image: true },
};

/** The file's default white canvas is shown as our own surface colour (transparent canvas). */
function displayBackground(fileBg: unknown): string {
  return typeof fileBg !== "string" || fileBg === DEFAULT_BACKGROUND || fileBg === "transparent" ? "transparent" : fileBg;
}
function savedBackground(shown: string): string {
  return shown === "transparent" ? DEFAULT_BACKGROUND : shown;
}

function useAppTheme(): "light" | "dark" {
  const read = () => (document.documentElement.classList.contains("dark") ? "dark" : "light");
  const [theme, setTheme] = useState<"light" | "dark">(read);
  useEffect(() => {
    const obs = new MutationObserver(() => setTheme(read()));
    obs.observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme"] });
    return () => obs.disconnect();
  }, []);
  return theme;
}

function usedFiles(elements: readonly NonDeletedExcalidrawElement[], files: BinaryFiles): BinaryFiles {
  const ids = new Set<string>();
  for (const el of elements) if (el.type === "image" && el.fileId) ids.add(el.fileId);
  const out: BinaryFiles = {};
  for (const id of ids) if (files[id]) out[id] = files[id];
  return out;
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result).replace(/^data:[^,]*,/, ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function errorMessage(e: unknown): string {
  if (e && typeof e === "object" && "message" in e) return String((e as { message: unknown }).message);
  return String(e);
}

export default function WhiteboardEditor(props: ArtifactViewProps) {
  const { artifact, modifiedMs, agentBusy } = props;
  const theme = useAppTheme();
  const [initial, setInitial] = useState<ExcalidrawInitialDataState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [, rerender] = useReducer((n: number) => n + 1, 0);

  const propsRef = useRef(props);
  propsRef.current = props;
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  /** Settings the skill keeps in the file (direction, style), preserved on save */
  const metaRef = useRef<BoardData["vibework"]>(undefined);
  const userActedRef = useRef(false);
  const sceneKeyRef = useRef("");
  const seenModifiedRef = useRef<number | null>(null);
  const fittedRef = useRef(false);
  const warnedSizeRef = useRef(false);

  const serialize = useCallback((): string | null => {
    const api = apiRef.current;
    if (!api) return null;
    const elements = api.getSceneElements();
    const appState = api.getAppState();
    const json = serializeAsJSON(
      elements,
      { ...appState, viewBackgroundColor: savedBackground(appState.viewBackgroundColor) },
      usedFiles(elements, api.getFiles()),
      "local",
    );
    if (!metaRef.current) return json;
    const data = JSON.parse(json) as BoardData;
    data.vibework = metaRef.current;
    return JSON.stringify(data, null, 2);
  }, []);

  const apply = useCallback((text: string) => {
    const api = apiRef.current;
    if (!api) return;
    const data = parseBoard(text);
    metaRef.current = data.vibework;
    const restored = restore(
      { elements: data.elements as never, appState: data.appState as never, files: data.files as never },
      null,
      api.getSceneElementsIncludingDeleted(),
      { repairBindings: true },
    );
    const ids = new Set(restored.elements.map((e) => e.id));
    const selected = Object.fromEntries(Object.entries(api.getAppState().selectedElementIds).filter(([id]) => ids.has(id)));
    userActedRef.current = false;
    const files = Object.values(restored.files);
    if (files.length) api.addFiles(files);
    api.updateScene({
      elements: restored.elements,
      appState: {
        viewBackgroundColor: displayBackground(data.appState?.viewBackgroundColor),
        selectedElementIds: selected,
      },
      captureUpdate: CaptureUpdateAction.NEVER,
    });
  }, []);

  const session = useMemo(
    () =>
      new BoardSession({
        read: async () => {
          const f = await readArtifact(artifact.sessionId, artifact.path);
          return { text: f.text ?? (f.base64 ? atob(f.base64) : ""), modifiedMs: f.modifiedMs };
        },
        write: async (text) => {
          const stat = await writeArtifact(artifact.sessionId, artifact.path, { text });
          // Text files above 2 MB cannot be read back by the app (embedded images make boards big).
          if (text.length > 2 * 1024 * 1024 && !warnedSizeRef.current) {
            warnedSizeRef.current = true;
            toast.warning("This board is over 2 MB, mostly images. It saved, but may not reopen; use smaller images.");
          }
          seenModifiedRef.current = stat.modifiedMs;
          return stat;
        },
        serialize,
        apply,
        onDirty: (d) => propsRef.current.onDirtyChange?.(d),
        onConflict: (info) => propsRef.current.onConflict?.(info),
        onState: () => rerender(),
      }),
    [artifact.sessionId, artifact.path, serialize, apply],
  );

  // Initial load (and retry after a load error when the file changes).
  const load = useCallback(async () => {
    try {
      const f = await readArtifact(artifact.sessionId, artifact.path);
      const text = f.text ?? (f.base64 ? atob(f.base64) : "");
      const data = parseBoard(text);
      metaRef.current = data.vibework;
      seenModifiedRef.current = f.modifiedMs;
      session.loaded(text);
      setLoadError(null);
      setInitial({
        elements: data.elements as never,
        appState: {
          ...(data.appState as Partial<AppState>),
          viewBackgroundColor: displayBackground(data.appState?.viewBackgroundColor),
        },
        files: (data.files ?? {}) as BinaryFiles,
      });
    } catch (e) {
      setLoadError(e instanceof BoardParseError ? e.message : `Couldn't open this board: ${errorMessage(e)}`);
    }
  }, [artifact.sessionId, artifact.path, session]);

  useEffect(() => {
    void load();
    return () => {
      void session.flush().finally(() => session.dispose());
    };
  }, [load, session]);

  // Outside changes to the file.
  useEffect(() => {
    if (seenModifiedRef.current === modifiedMs) return;
    seenModifiedRef.current = modifiedMs;
    if (loadError || !initial) {
      if (loadError) void load();
      return;
    }
    void session.externalChange(modifiedMs);
  }, [modifiedMs, initial, loadError, load, session]);

  // Save before the agent starts a turn, so its tools see the person's latest arrangement.
  useEffect(() => {
    if (agentBusy) void session.flush();
  }, [agentBusy, session]);

  // Save when the app loses focus or is hidden.
  useEffect(() => {
    const flush = () => void session.flush();
    const onVisibility = () => document.visibilityState === "hidden" && flush();
    window.addEventListener("blur", flush);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", flush);
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, [session]);

  // Anything the person does inside the editor marks later scene changes as theirs.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const acted = () => {
      userActedRef.current = true;
    };
    const onKey = (e: KeyboardEvent) => {
      acted();
      if ((e.metaKey || e.ctrlKey) && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "s") {
        e.preventDefault();
        e.stopPropagation();
        void session.flush();
      }
    };
    const onFocusOut = (e: FocusEvent) => {
      if (!el.contains(e.relatedTarget as Node | null)) void session.flush();
    };
    el.addEventListener("pointerdown", acted, true);
    el.addEventListener("keydown", onKey, true);
    el.addEventListener("paste", acted, true);
    el.addEventListener("drop", acted, true);
    el.addEventListener("focusout", onFocusOut);
    return () => {
      el.removeEventListener("pointerdown", acted, true);
      el.removeEventListener("keydown", onKey, true);
      el.removeEventListener("paste", acted, true);
      el.removeEventListener("drop", acted, true);
      el.removeEventListener("focusout", onFocusOut);
    };
  }, [session, initial]);

  const onChange = useCallback(
    (elements: readonly OrderedExcalidrawElement[], appState: AppState, files: BinaryFiles) => {
      // Selection, hover, pan and zoom do not change this key.
      const key = `${getSceneVersion(elements)}|${Object.keys(files).length}|${appState.viewBackgroundColor}`;
      if (key === sceneKeyRef.current) return;
      const first = sceneKeyRef.current === "";
      sceneKeyRef.current = key;
      if (first || !userActedRef.current) session.absorb();
      else session.changed();
    },
    [session],
  );

  const onApi = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
    // For scripted UI checks only; release builds (mode "production") leave it out.
    if (import.meta.env.MODE !== "production") (window as { __whiteboardApi?: unknown }).__whiteboardApi = api;
  }, []);

  // Fit the board to the panel once, without magnifying small boards.
  useEffect(() => {
    if (!initial || fittedRef.current) return;
    let frames = 0;
    let raf = 0;
    const tick = () => {
      const api = apiRef.current;
      if (!api || ++frames < 2) {
        raf = requestAnimationFrame(tick);
        return;
      }
      fittedRef.current = true;
      if (api.getSceneElements().length) {
        // Keep the board clear of the toolbar and hint line above and the zoom bar below.
        api.scrollToContent(undefined, {
          fitToViewport: true,
          viewportZoomFactor: 0.95,
          maxZoom: 1,
          animate: false,
          canvasOffsets: { top: 104, bottom: 72, left: 16, right: 16 },
        });
      }
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [initial]);

  const exportImage = useCallback(
    async (kind: "png" | "svg" | "copy") => {
      const api = apiRef.current;
      if (!api) return;
      const elements = api.getSceneElements();
      if (!elements.length) {
        toast("The board is empty");
        return;
      }
      const shown = api.getAppState();
      const appState: Partial<AppState> = {
        ...shown,
        exportBackground: true,
        exportWithDarkMode: false,
        exportEmbedScene: false,
        viewBackgroundColor: savedBackground(shown.viewBackgroundColor),
      };
      const files = api.getFiles();
      try {
        if (kind === "svg") {
          const svg = await exportToSvg({ elements, appState, files, exportPadding: 24 });
          const path = siblingPath(artifact.path, "svg");
          await writeArtifact(artifact.sessionId, path, { text: svg.outerHTML });
          toast.success(`Saved ${baseName(path)}`);
          return;
        }
        const blob = exportToBlob({
          elements,
          appState,
          files,
          mimeType: "image/png",
          exportPadding: 24,
          getDimensions: (width: number, height: number) => ({ width: width * 2, height: height * 2, scale: 2 }),
        });
        if (kind === "copy") {
          await navigator.clipboard.write([new ClipboardItem({ "image/png": blob })]);
          toast.success("Copied the board as an image");
          return;
        }
        const path = siblingPath(artifact.path, "png");
        await writeArtifact(artifact.sessionId, path, { base64: await blobToBase64(await blob) });
        toast.success(`Saved ${baseName(path)}`);
      } catch (e) {
        toast.error(kind === "copy" ? `Couldn't copy: ${errorMessage(e)}` : `Couldn't export: ${errorMessage(e)}`);
      }
    },
    [artifact.path, artifact.sessionId],
  );

  const onLinkOpen = useCallback(
    (element: NonDeletedExcalidrawElement, event: CustomEvent<{ nativeEvent: MouseEvent | React.PointerEvent<HTMLCanvasElement> }>) => {
      const link = element.link;
      if (!link || isElementLink(link)) return; // links to other shapes stay inside the board
      event.preventDefault();
      if (isExternalLink(link)) void openUrl(link);
      else propsRef.current.onOpenArtifact?.(resolveFileLink(artifact.path, link));
    },
    [artifact.path],
  );

  const renderTopRightUI = useCallback(
    (isMobile: boolean) => (isMobile ? null : <ExportMenu onExport={exportImage} />),
    [exportImage],
  );

  if (loadError) {
    return (
      <div className="flex h-full w-full items-center justify-center bg-background p-6">
        <p className="max-w-sm text-center text-meta text-muted-foreground">{loadError}</p>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="vw-whiteboard flex h-full min-h-0 w-full min-w-0 flex-col bg-background">
      {session.conflict && (
        <StatusBar
          message="This board changed on disk while you were editing."
          actions={[
            { label: "Reload from disk", onClick: () => session.reloadFromDisk() },
            { label: "Keep mine", onClick: () => void session.keepMine() },
          ]}
        />
      )}
      {!session.conflict && session.error && (
        <StatusBar
          tone="error"
          message={`Couldn't save: ${session.error}`}
          actions={[{ label: "Try again", onClick: () => void session.flush() }]}
        />
      )}
      <div className="relative min-h-0 flex-1">
        {initial && (
          <Excalidraw
            excalidrawAPI={onApi}
            initialData={initial}
            onChange={onChange}
            theme={theme}
            name={artifact.name.replace(/\.excalidraw$/i, "")}
            UIOptions={UI_OPTIONS}
            aiEnabled={false}
            autoFocus={false}
            handleKeyboardGlobally={false}
            validateEmbeddable={false}
            renderTopRightUI={renderTopRightUI}
            onLinkOpen={onLinkOpen}
          >
            <MainMenu>
              <MainMenu.Item icon={<ImageIcon className="size-4" />} onSelect={() => void exportImage("png")}>
                Export PNG
              </MainMenu.Item>
              <MainMenu.Item icon={<FileImage className="size-4" />} onSelect={() => void exportImage("svg")}>
                Export SVG
              </MainMenu.Item>
              <MainMenu.Item icon={<Copy className="size-4" />} onSelect={() => void exportImage("copy")}>
                Copy as PNG
              </MainMenu.Item>
              <MainMenu.Separator />
              <MainMenu.DefaultItems.SearchMenu />
              <MainMenu.DefaultItems.Help />
              <MainMenu.DefaultItems.ClearCanvas />
              <MainMenu.Separator />
              <MainMenu.DefaultItems.ChangeCanvasBackground />
            </MainMenu>
            <WelcomeScreen>
              <WelcomeScreen.Hints.ToolbarHint />
              <WelcomeScreen.Center>
                <WelcomeScreen.Center.Heading>
                  Draw here, or ask the agent to sketch a diagram on this board.
                </WelcomeScreen.Center.Heading>
              </WelcomeScreen.Center>
            </WelcomeScreen>
          </Excalidraw>
        )}
      </div>
    </div>
  );
}

function ExportMenu({ onExport }: { onExport: (kind: "png" | "svg" | "copy") => void }) {
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="vw-whiteboard-export h-9 gap-1 bg-popover">
          Export
          <ChevronDown className="size-3.5 opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-40">
        <DropdownMenuItem onSelect={() => onExport("png")}>
          <ImageIcon /> Export PNG
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport("svg")}>
          <FileImage /> Export SVG
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onExport("copy")}>
          <Copy /> Copy as PNG
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function StatusBar({
  message,
  actions,
  tone = "warning",
}: {
  message: string;
  actions: { label: string; onClick: () => void }[];
  tone?: "warning" | "error";
}) {
  return (
    <div
      role="status"
      className={
        "flex min-h-10 flex-wrap items-center gap-x-3 gap-y-1 border-b px-3 py-1.5 text-meta " +
        (tone === "error" ? "bg-destructive-muted text-foreground" : "bg-warning-muted text-foreground")
      }
    >
      <span className="min-w-0 flex-1">{message}</span>
      <div className="flex shrink-0 items-center gap-1.5">
        {actions.map((a, i) => (
          <Button key={a.label} size="sm" variant={i === 0 ? "secondary" : "ghost"} onClick={a.onClick}>
            {a.label}
          </Button>
        ))}
      </div>
    </div>
  );
}
