/**
 * Small building blocks shared by the Settings tabs, so every tab uses the
 * same header, section headings, list cards, inputs, and inline error/link
 * styles. Colours come from the theme tokens in index.css only, so light and
 * dark both follow the OS appearance.
 */

import React from "react";
import { ExternalLink } from "@/lib/icons";
import { openUrl } from "@/tauri/files";
import { cn } from "@/lib/utils";

/** Page title, with the page's actions on the right. Title only: the page explains itself by its contents. */
export const SettingsPageHeader: React.FC<{
  title: string;
  actions?: React.ReactNode;
}> = ({ title, actions }) => (
  <section className="flex min-h-8 flex-wrap items-center justify-between gap-x-6 gap-y-3">
    <h2 className="min-w-0 text-xl leading-7 font-semibold text-foreground">{title}</h2>
    {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
  </section>
);

/** Heading + optional description above a settings card or list. */
export const SettingsSectionHeading: React.FC<{
  id?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  className?: string;
}> = ({ id, title, description, className }) => (
  <div className={cn("mb-2", className)}>
    <h3 id={id} className="text-sm font-medium text-foreground">
      {title}
    </h3>
    {description && <p className="mt-0.5 text-meta text-muted-foreground">{description}</p>}
  </div>
);

/** List / card container: flat, one hairline around and between rows (no shadow). */
export const settingsCardClass = "rounded-xl border bg-card divide-y";

/** One row inside a settings card: label left, state or one action right. */
export const settingsRowClass = "px-4 py-3";

/** Text input / textarea styled like the shared Input primitive. */
export function settingsInputClass(invalid?: boolean, className?: string): string {
  return cn(
    "min-w-0 rounded-lg border border-input bg-transparent dark:bg-input/30 px-2.5 py-1.5 text-sm text-foreground placeholder:text-muted-foreground outline-none transition-colors focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:opacity-50",
    invalid && "border-destructive focus-visible:border-destructive focus-visible:ring-destructive/20",
    className,
  );
}

/** Footer line under a settings page: where things are stored, with its actions. */
export const SettingsFooter: React.FC<{ children: React.ReactNode; actions?: React.ReactNode }> = ({
  children,
  actions,
}) => (
  <div className="flex items-center gap-2 border-t pt-4">
    <p className="min-w-0 flex-1 truncate text-meta text-muted-foreground">{children}</p>
    {actions}
  </div>
);

export const InlineError: React.FC<{ id?: string; children: React.ReactNode; className?: string }> = ({
  id,
  children,
  className,
}) => (
  <p id={id} role="alert" className={cn("text-sm text-destructive select-text", className)}>
    {children}
  </p>
);

export const ExternalLinkButton: React.FC<{ href: string; children: React.ReactNode }> = ({ href, children }) => (
  <button
    type="button"
    onClick={() => openUrl(href).catch((err) => console.error("Failed to open URL:", err))}
    className="self-start inline-flex items-center gap-1 text-meta text-muted-foreground hover:text-foreground hover:underline underline-offset-2 cursor-pointer rounded-sm outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
  >
    {children}
    <ExternalLink className="size-3" />
  </button>
);
