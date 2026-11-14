import React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/** Small ghost icon button with a native tooltip (Radix tooltips would sit under the native browser view) */
export function IconButton({
  label,
  className,
  children,
  ...props
}: Omit<React.ComponentProps<typeof Button>, "size" | "variant"> & { label: string }) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon-sm"
      title={label}
      aria-label={label}
      className={cn("text-muted-foreground hover:text-foreground", className)}
      {...props}
    >
      {children}
    </Button>
  );
}
