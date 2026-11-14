/**
 * Mounts the active artifact's editor/viewer (or its source view), feeds it
 * the live modifiedMs, and contains its failures.
 */

import React, { Suspense, useCallback } from "react";
import { RotateCw } from "@/lib/icons";
import type { ArtifactRef, ArtifactType } from "@/components/artifacts/types";
import { SourceViewer } from "@/components/artifacts/viewers/all";
import {
  NoPreviewCard,
  ViewerError,
  ViewerLoading,
  ViewerMessage,
} from "@/components/artifacts/viewers/ViewerStates";
import { Button } from "@/components/ui/button";
import type { ArtifactLiveState } from "./useArtifactWatch";

class ViewerBoundary extends React.Component<
  { children: React.ReactNode; resetKey: string },
  { error: Error | null; resetKey: string }
> {
  state = { error: null as Error | null, resetKey: this.props.resetKey };

  static getDerivedStateFromError(error: Error) {
    return { error };
  }

  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { error: Error | null; resetKey: string },
  ) {
    return props.resetKey !== state.resetKey ? { error: null, resetKey: props.resetKey } : null;
  }

  componentDidCatch(error: Error) {
    console.error("[workspace] artifact view crashed:", error);
  }

  render() {
    if (this.state.error) {
      return (
        <ViewerMessage title="This view stopped working" detail={this.state.error.message} tone="error" />
      );
    }
    return this.props.children;
  }
}

export function ArtifactHost({
  allowNative,
  artifact,
  type,
  mode,
  live,
  agentBusy,
  reloadKey,
  onRetry,
  onDirtyChange,
  onConflict,
  onConflictResolved,
  onOpenArtifact,
}: {
  allowNative?: boolean;
  artifact: ArtifactRef;
  type: ArtifactType | null;
  mode: "preview" | "code";
  live: ArtifactLiveState;
  agentBusy: boolean;
  reloadKey: number;
  onRetry: () => void;
  onDirtyChange: (dirty: boolean) => void;
  onConflict: (info: { diskModifiedMs: number }) => void;
  onConflictResolved?: () => void;
  onOpenArtifact: (path: string) => void;
}) {
  const dirtyChange = useCallback((dirty: boolean) => onDirtyChange(dirty), [onDirtyChange]);

  if (live.error) {
    return (
      <ViewerError error={live.error} path={artifact.path} name={artifact.name} />
    );
  }
  if (!live.stat) return <ViewerLoading />;
  if (live.deleted) {
    return (
      <ViewerMessage title="This file was deleted" detail="It may come back if the agent writes it again.">
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RotateCw />
          Check again
        </Button>
      </ViewerMessage>
    );
  }
  if (!type) {
    return <NoPreviewCard path={live.stat.path} name={live.stat.name} size={live.stat.size} />;
  }

  const Component = mode === "code" ? SourceViewer : type.component;
  const key = `${artifact.path}:${mode}:${reloadKey}`;
  return (
    <ViewerBoundary resetKey={key}>
      <Suspense fallback={<ViewerLoading />}>
        <Component allowNative={allowNative}
          key={key}
          artifact={artifact}
          modifiedMs={live.modifiedMs}
          agentBusy={agentBusy}
          onDirtyChange={dirtyChange}
          onConflict={onConflict}
          onConflictResolved={onConflictResolved}
          onOpenArtifact={onOpenArtifact}
        />
      </Suspense>
    </ViewerBoundary>
  );
}
