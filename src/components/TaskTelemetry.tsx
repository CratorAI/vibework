import { useState } from "react";
import { useAccountUsage } from "@/tauri/usage";
import { openUrl } from "@/tauri/files";
import { formatCost, isOutOfCredit, lowCredit } from "@/utils/telemetry";
import { Button } from "@/components/ui/button";

export const addCredits = () => { void openUrl("https://openrouter.ai/settings/credits").catch(() => {}); };
let dismissedThisSession = false;
export function CreditNotice({ error }: { error?: string | null }) {
  const remaining = lowCredit(useAccountUsage());
  const [dismissed, setDismissed] = useState(dismissedThisSession);
  const exhausted = !!error && isOutOfCredit(error);
  return <CreditNoticeView remaining={remaining} exhausted={exhausted} dismissed={dismissed} onDismiss={() => { dismissedThisSession = true; setDismissed(true); }} />;
}

export function CreditNoticeView({ remaining, exhausted, dismissed, onDismiss }: {
  remaining: number | null; exhausted: boolean; dismissed: boolean; onDismiss: () => void;
}) {
  if (!exhausted && (remaining == null || dismissed)) return null;
  return <div className="mb-2 flex items-center gap-2 text-meta text-muted-foreground" role="status">
    <span>{exhausted ? "Your OpenRouter account is out of credit." : `${formatCost(remaining)} credit remaining`}</span>
    <Button variant="link" size="sm" className="h-auto p-0 text-meta" onClick={addCredits}>Add credits</Button>
    {!exhausted && <Button variant="ghost" size="sm" className="ml-auto h-7 text-meta" onClick={onDismiss}>Dismiss</Button>}
  </div>;
}
