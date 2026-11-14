import { useEffect, useMemo, useRef, useState } from "react";
import { DesignFrame } from "@/components/artifacts/design/DesignFrame";
import { parseDesign, box } from "@/components/artifacts/design/model";
export function DesignThumbnail({ source }: { source: string }) {
  const design = useMemo(() => parseDesign(source), [source]),
    frame = design.frames[0],
    host = useRef<HTMLDivElement>(null),
    [size, setSize] = useState({ w: 0, h: 0 });
  useEffect(() => {
    const el = host.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) =>
      setSize({ w: e.contentRect.width, h: e.contentRect.height }),
    );
    obs.observe(el);
    return () => obs.disconnect();
  }, []);
  const b = frame ? box(frame) : null,
    scale = b ? Math.min(size.w / b.w, size.h / b.h) : 0;
  return (
    <div
      ref={host}
      data-preview="design"
      className="pointer-events-none relative size-full overflow-hidden"
    >
      {frame && b && scale > 0 && (
        <div
          style={{
            position: "absolute",
            left: (size.w - b.w * scale) / 2,
            top: (size.h - b.h * scale) / 2,
            width: b.w,
            height: b.h,
            transform: `scale(${scale})`,
            transformOrigin: "0 0",
            colorScheme: "light",
          }}
        >
          <DesignFrame design={design} frame={frame} />
        </div>
      )}
    </div>
  );
}
