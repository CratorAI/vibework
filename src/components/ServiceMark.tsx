import React from "react";
import { cn } from "@/lib/utils";

/**
 * Logo marks for services people connect (public/service-icons, simple-icons,
 * CC0). Drawn as a mask so the mark takes the surrounding text colour and
 * follows light and dark like any icon.
 */
const SERVICES = [
  "airtable",
  "asana",
  "atlassian",
  "brave",
  "clickup",
  "confluence",
  "discord",
  "dropbox",
  "figma",
  "github",
  "gitlab",
  "gmail",
  "googlecalendar",
  "googledocs",
  "googledrive",
  "googlesheets",
  "hubspot",
  "intercom",
  "jira",
  "linear",
  "notion",
  "obsidian",
  "postgresql",
  "sentry",
  "shopify",
  "stripe",
  "supabase",
  "todoist",
  "trello",
  "vercel",
  "zapier",
  "zendesk",
] as const;

const ALIASES: Record<string, (typeof SERVICES)[number]> = {
  postgres: "postgresql",
  gdrive: "googledrive",
  googlesheet: "googlesheets",
  gcal: "googlecalendar",
};

/** The service a connector name or URL refers to, if we have its mark. */
export function resolveService(...hints: (string | null | undefined)[]): string | null {
  for (const hint of hints) {
    if (!hint) continue;
    let text = hint.toLowerCase();
    try {
      if (/^https?:\/\//.test(text)) text = new URL(text).host;
    } catch {
      // not a URL; match the text itself
    }
    const compact = text.replace(/[^a-z0-9]/g, "");
    for (const [alias, service] of Object.entries(ALIASES)) {
      if (compact.includes(alias)) return service;
    }
    // Longest first, so "googledocs" wins over a shorter accidental match
    const found = [...SERVICES].sort((a, b) => b.length - a.length).find((s) => compact.includes(s));
    if (found) return found;
  }
  return null;
}

export const ServiceMark: React.FC<{ service: string; className?: string }> = ({ service, className }) => {
  const url = `/service-icons/${service}.svg`;
  return (
    <span
      aria-hidden
      className={cn("inline-block size-4 shrink-0 bg-current", className)}
      style={{
        maskImage: `url(${url})`,
        WebkitMaskImage: `url(${url})`,
        maskSize: "contain",
        WebkitMaskSize: "contain",
        maskRepeat: "no-repeat",
        WebkitMaskRepeat: "no-repeat",
        maskPosition: "center",
        WebkitMaskPosition: "center",
      }}
    />
  );
};
