import { cn } from "@/lib/utils";
import { ChevronDown, Check } from "@/lib/icons";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
} from "@/components/ui/dropdown-menu";

/** `detail` is the longer explanation, shown as the row's tooltip and in Settings. */
export const permissionModes = [
  {
    value: "ask",
    label: "Ask",
    description: "Asks before every edit and command.",
    detail: "Reads freely. Asks before every file edit and every command.",
  },
  {
    value: "auto",
    label: "Auto",
    description: "Works on its own in the task folder and asks before anything risky.",
    detail:
      "Works freely inside the task folder. Asks before leaving it, deleting, installing software or publishing. Judged from the command text, not enforced by macOS.",
  },
  {
    value: "skip",
    label: "Yolo",
    description: "Never asks. For work you fully trust.",
    detail: "Never asks. Only sudo and changes to the app’s own data are refused.",
  },
];

export function PermissionModePicker({
  value,
  onChange,
  side = "top",
  className,
}: {
  value: string;
  onChange: (mode: string) => void;
  side?: "top" | "bottom";
  /** Extra classes for the trigger (Settings gives it the outlined control look). */
  className?: string;
}) {
  const selected = permissionModes.find((m) => m.value === value) ?? permissionModes[1];
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          data-testid="permission-mode"
          aria-label={`Permission mode: ${selected.label}`}
          title={selected.detail}
          className={cn(
            "pressable flex h-8 min-w-0 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset outline-none",
            className,
          )}
        >
          <span>{selected.label}</span>
          <ChevronDown className="size-3.5" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent side={side} align="end" className="max-h-none w-[272px] overflow-visible p-1.5">
        <DropdownMenuLabel className="px-2 pt-1 pb-1.5 text-meta font-normal text-muted-foreground">
          Permission mode
        </DropdownMenuLabel>
        {permissionModes.map((mode) => (
          <DropdownMenuItem
            key={mode.value}
            onSelect={() => onChange(mode.value)}
            title={mode.detail}
            className="h-auto items-start gap-3 px-2 py-2 whitespace-normal"
          >
            <span className="min-w-0 flex-1">
              <span className="block text-sm leading-5 text-foreground">{mode.label}</span>
              <span className="mt-0.5 block text-meta leading-[18px] text-muted-foreground">{mode.description}</span>
            </span>
            <Check className={`mt-0.5 size-4 shrink-0 !text-info ${value === mode.value ? "" : "invisible"}`} />
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
