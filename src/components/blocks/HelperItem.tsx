import { useState } from "react";
import type { ToolBlock } from "@/types/agent";
import { ChevronRight } from "@/lib/icons";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { toolInputRecord } from "@/utils/toolDisplayUtils";
import { Duration } from "./Duration";
import { ToolItem } from "./ToolItem";
import { TextBlockView } from "./TextBlockView";

/** A native child session, kept inside the task that started it. */
export function HelperItem({ block, isLive = false }: { block: ToolBlock; isLive?: boolean }) {
  const [open, setOpen] = useState(false);
  const { call } = block;
  const running = isLive && call.isExecuting;
  const input = toolInputRecord(call.input);
  const title = typeof input.description === "string" ? input.description : "Helper";
  const failure = call.result?.error || call.helper?.error;
  const stopped = call.helper?.status === "stopped" || failure?.startsWith("Stopped") || failure?.includes("interrupted");
  const answer = call.result?.output || call.helper?.text;
  return <Collapsible open={open} onOpenChange={setOpen} data-testid="helper-step">
    <CollapsibleTrigger className="flex w-full items-center gap-2 text-left text-sm leading-5 text-muted-foreground">
      <ChevronRight className={`size-4 shrink-0 transition-transform ${open ? "rotate-90" : ""}`} />
      <span className={`min-w-0 flex-1 ${running ? "text-shimmer" : ""}`}>{title}</span>
      <span className="text-meta">{running ? "Working" : stopped ? "Stopped" : failure ? "Failed" : !call.result ? "Stopped" : "Done"}</span>
      <Duration timings={[block.timing]} live={running} />
    </CollapsibleTrigger>
    {failure && <p className={`mt-1 ml-6 text-meta ${stopped ? "text-muted-foreground" : "text-destructive"}`}>{failure}</p>}
    <CollapsibleContent className="ml-6 mt-3 space-y-3">
      {call.helper?.steps.map(step => <ToolItem key={step.id} block={step} isLive={running} />)}
      {answer && <TextBlockView text={answer} isStreaming={running} />}
    </CollapsibleContent>
  </Collapsible>;
}
