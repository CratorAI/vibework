import { useEffect, useState } from "react";
import { skillsApi } from "@/tauri/skills";

export function PersonalSkillsNotice() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (localStorage.getItem("personal-skills-notice-dismissed")) return;
    void skillsApi.summary().then(({ sources }) => {
      setCount(sources.filter(s => s.id === "claude" || s.id === "agents").reduce((n, s) => n + s.count, 0));
    }).catch(() => {});
  }, []);
  if (count <= 50) return null;
  return <div className="mb-3 flex items-center gap-3 text-meta text-muted-foreground">
    <p>Vibework found {count} of your skills. Manage them in Settings → Skills.</p>
    <button aria-label="Dismiss skills notice" className="hover:text-foreground" onClick={() => {
      localStorage.setItem("personal-skills-notice-dismissed", "1");
      setCount(0);
    }}>Dismiss</button>
  </div>;
}
