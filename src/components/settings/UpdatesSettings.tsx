import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Button } from "@/components/ui/button";
import { settingsCardClass, settingsRowClass, SettingsSectionHeading } from "./settingsUi";
type Status = {currentVersion: string; version?: string; notes?: string; ready: boolean; message: string};
export function UpdatesSettings() {
  const [status, setStatus] = useState<Status>();
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    let mounted = true;
    invoke<Status>("update_status").then(s => { if (mounted) setStatus(s); }).catch(() => setError("Version information is unavailable."));
    const listener = listen<Status>("update-status", e => { if (mounted) setStatus(e.payload); });
    return () => { mounted = false; void listener.then(stop => stop()); };
  }, []);
  async function action(install: boolean) {
    setBusy(true); setError("");
    try {
      if (install) await invoke("update_install", {restart: true});
      else setStatus(await invoke<Status>("update_check"));
    } catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  return <section aria-labelledby="updates-heading">
    <SettingsSectionHeading title="Updates" id="updates-heading" />
    <div className={settingsCardClass}><div className={settingsRowClass}>
      <p className="text-sm font-medium">Vibework {status?.currentVersion}</p>
      {status?.version && <p>New version: {status.version}</p>}
      {status?.notes && <pre className="whitespace-pre-wrap text-sm">{status.notes}</pre>}
      <p role="status" className="my-2 text-sm text-muted-foreground">{error || status?.message}</p>
      <Button variant="outline" disabled={busy} onClick={() => action(false)}>{busy ? "Working…" : "Check for updates"}</Button>
      {status?.ready && <Button disabled={busy} onClick={() => action(true)}>Restart to update</Button>}
    </div></div>
  </section>;
}
