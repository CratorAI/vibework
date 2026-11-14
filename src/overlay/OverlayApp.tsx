import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import OverlayNotification from "./OverlayNotification";
import type { OverlayStatus } from "../types/overlay";

export default function OverlayApp() {
  const [notification, setNotification] = useState<{ status: OverlayStatus; revision: number } | null>(null);
  useEffect(() => {
    let revision = 0;
    const status = listen<OverlayStatus>("overlay:status", event => {
      setNotification({ status: event.payload, revision: ++revision });
    });
    const hide = listen("overlay:hide", () => setNotification(null));
    return () => { void status.then(fn => fn()); void hide.then(fn => fn()); };
  }, []);
  return notification ? <OverlayNotification key={notification.revision} status={notification.status} /> : null;
}
