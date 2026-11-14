import { useEffect, useRef, useState, type ComponentType } from "react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
export function IconButton({
  icon: Icon,
  label,
  onClick,
  pressed = false,
  className = "",
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  className?: string;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          className={`design-icon ${className}`}
          aria-label={label}
          aria-pressed={pressed}
          onClick={onClick}
        >
          <Icon className="size-4" />
        </button>
      </TooltipTrigger>
      <TooltipContent side="bottom">{label}</TooltipContent>
    </Tooltip>
  );
}
export function NumberField({
  label,
  value,
  onChange,
  min = -100000,
  max = 100000,
  unit = "",
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min?: number;
  max?: number;
  unit?: string;
}) {
  const [draft, setDraft] = useState(String(Math.round(value * 100) / 100));
  const dragging = useRef(false);
  useEffect(() => {
    if (!dragging.current) setDraft(String(Math.round(value * 100) / 100));
  }, [value]);
  const finish = () => {
    const n = Number(draft);
    if (Number.isFinite(n) && draft.trim())
      onChange(Math.max(min, Math.min(max, n)));
    else setDraft(String(value));
  };
  return (
    <label className="design-number">
      <span
        title={`Drag to change ${label}`}
        onPointerDown={(e) => {
          e.preventDefault();
          const start = e.clientX;
          let next = value;
          dragging.current = true;
          const move = (ev: PointerEvent) => {
            next = Math.max(
              min,
              Math.min(
                max,
                value + (ev.clientX - start) * (ev.shiftKey ? 10 : 1),
              ),
            );
            setDraft(String(Math.round(next * 100) / 100));
          };
          const up = () => {
            dragging.current = false;
            window.removeEventListener("pointermove", move);
            window.removeEventListener("pointerup", up);
            onChange(next);
          };
          window.addEventListener("pointermove", move);
          window.addEventListener("pointerup", up);
        }}
      >
        {label === "Opacity"
          ? "α"
          : label === "Leading"
            ? "Line"
            : label === "Tracking"
              ? "Track"
              : label}
      </span>
      <input
        aria-label={label}
        inputMode="decimal"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={finish}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            finish();
            e.currentTarget.blur();
          }
          if (e.key === "Escape") {
            setDraft(String(value));
            e.currentTarget.blur();
          }
        }}
      />
      {unit && <small>{unit}</small>}
    </label>
  );
}
export function ColorField({
  label,
  value,
  onChange,
  colors,
}: {
  label: string;
  value: string;
  onChange: (s: string) => void;
  colors: string[];
}) {
  const hex = /^#[0-9a-f]{6}$/i.test(value) ? value : "#ffffff";
  const [draft, setDraft] = useState(value);
  useEffect(() => setDraft(value), [value]);
  return (
    <div className="design-color-field">
      <span className="design-section-title">{label}</span>
      <div className="design-color-row">
        <input
          aria-label={`${label} colour`}
          type="color"
          value={hex}
          onChange={(e) => onChange(e.target.value)}
        />
        <input
          aria-label={`${label} hex`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={() => {
            if (CSS.supports("color", draft)) onChange(draft);
            else setDraft(value);
          }}
        />
      </div>
      <div className="design-swatches">
        {colors.slice(0, 8).map((c) => (
          <button
            key={c}
            aria-label={`Use ${c}`}
            title={c}
            style={{ background: c }}
            onClick={() => onChange(c)}
          />
        ))}
      </div>
    </div>
  );
}
