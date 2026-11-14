/**
 * Connectors offered in one click under "Popular" when adding a connector.
 *
 * Each address is the vendor's official remote MCP server, checked against
 * the vendor's own documentation on 13 November 2026 (`source`). To add one:
 * confirm the address in the vendor's docs (not a blog or a directory), put
 * the page in `source`, and set `auth`:
 * - "browser": the server signs in with OAuth and lets new apps register
 *   (dynamic client registration or a client metadata document), so Vibework
 *   adds it and offers Sign in;
 * - "key": the server needs a key in a header (or its OAuth needs an app
 *   registered in advance), so the form opens with that header to fill in.
 * Leave a vendor out rather than guess its address. Keep the list short.
 *
 * The list itself is popularConnectors.json, which the backend reads too
 * (src-tauri/src/connectors/launcher.rs) for plain prompt titles.
 *
 * Checked and left out: Hugging Face (https://huggingface.co/mcp; its docs
 * don't say how clients sign in), Canva (its docs give no address and need a
 * client registered in its developer portal), Asana (its docs say its V2
 * server does not support dynamic client registration).
 */

import popular from "./popularConnectors.json";

export type PopularAuth =
  | { kind: "browser" }
  | { kind: "key"; header: string; placeholder: string };

export interface PopularConnector {
  /** The connector's name (and the ServiceMark it shows). */
  name: string;
  label: string;
  url: string;
  auth: PopularAuth;
  source: string;
  /** Anything else worth knowing about the address. */
  note?: string;
}

export const POPULAR_CONNECTORS: readonly PopularConnector[] = popular as PopularConnector[];

/** How a connector is called in prose: the Popular label ("Granola"), else its own name. */
export function connectorLabel(name: string): string {
  const key = name.trim().toLowerCase();
  return POPULAR_CONNECTORS.find((c) => c.name === key || c.label.toLowerCase() === key)?.label ?? name.trim();
}

/** The Popular entry for a name or label, if any. */
export function popularConnector(name: string): PopularConnector | undefined {
  const key = name.trim().toLowerCase();
  return POPULAR_CONNECTORS.find((c) => c.name === key || c.label.toLowerCase() === key);
}
