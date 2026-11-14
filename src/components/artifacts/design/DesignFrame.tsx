import { useMemo } from "react";
import { type Design, type Node } from "./model";
import { framePage } from "./page";
/** Host-readable rendering copy. Never add allow-scripts to this sandbox. */
export function DesignFrame({
  design,
  frame,
  onReady,
}: {
  design: Design;
  frame: Node;
  onReady?: (element: HTMLIFrameElement) => void;
}) {
  const html = useMemo(() => framePage(design, frame), [design, frame]);
  return (
    <iframe
      className="block size-full border-0"
      title={frame.attrs["data-name"] || "Design frame"}
      sandbox="allow-same-origin"
      referrerPolicy="no-referrer"
      srcDoc={html}
      onLoad={(e) => onReady?.(e.currentTarget)}
    />
  );
}
