// Same local Chromium/CDP route as vibework-slides. No packages or downloads.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { homedir, platform } from "node:os";
import path from "node:path";
export function findChrome(): string | null {
  const env = process.env.VIBEWORK_CHROME || process.env.CHROME_PATH;
  if (env && existsSync(env)) return env;
  const os = platform();
  const candidates: string[] = [];
  const pw =
    process.env.PLAYWRIGHT_BROWSERS_PATH ||
    (os === "darwin"
      ? path.join(homedir(), "Library/Caches/ms-playwright")
      : os === "win32"
        ? path.join(process.env.LOCALAPPDATA || "", "ms-playwright")
        : path.join(homedir(), ".cache/ms-playwright"));
  if (existsSync(pw)) {
    const dirs = readdirSync(pw)
      .filter((d) => /^chromium(_headless_shell)?-\d+$/.test(d))
      .sort((a, b) => +b.split("-").pop()! - +a.split("-").pop()!);
    for (const d of dirs) {
      const base = path.join(pw, d);
      for (const sub of readdirSync(base)) {
        const s = path.join(base, sub);
        candidates.push(
          path.join(s, "Chromium.app/Contents/MacOS/Chromium"),
          path.join(
            s,
            "Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
          ),
          path.join(s, "chrome-headless-shell"),
          path.join(s, "chrome-headless-shell.exe"),
          path.join(s, "chrome.exe"),
          path.join(s, "chrome"),
        );
      }
    }
  }
  if (os === "darwin") {
    candidates.push(
      "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
      "/Applications/Chromium.app/Contents/MacOS/Chromium",
      "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
      "/Applications/Brave Browser.app/Contents/MacOS/Brave Browser",
    );
  } else if (os === "win32") {
    for (const root of [
      process.env["PROGRAMFILES"],
      process.env["PROGRAMFILES(X86)"],
      process.env.LOCALAPPDATA,
    ]) {
      if (!root) continue;
      candidates.push(
        path.join(root, "Google/Chrome/Application/chrome.exe"),
        path.join(root, "Microsoft/Edge/Application/msedge.exe"),
      );
    }
  } else {
    candidates.push(
      "/usr/bin/google-chrome",
      "/usr/bin/chromium",
      "/usr/bin/chromium-browser",
      "/usr/bin/microsoft-edge",
    );
  }
  return candidates.find((c) => existsSync(c)) ?? null;
}

export async function launch(bin: string, work: string) {
  const profile = path.join(work, "profile");
  const headless = /headless-shell/.test(bin) ? [] : ["--headless=new"];
  const proc = Bun.spawn(
    [
      bin,
      ...headless,
      "--remote-debugging-port=0",
      `--user-data-dir=${profile}`,
      "--no-first-run",
      "--no-default-browser-check",
      "--hide-scrollbars",
      "--allow-file-access-from-files",
      "about:blank",
    ],
    { stdout: "ignore", stderr: "ignore" },
  );
  const portFile = path.join(profile, "DevToolsActivePort");
  let port = 0;
  for (let t = 0; t < 100 && !port; t++) {
    await Bun.sleep(100);
    if (existsSync(portFile))
      port = parseInt(readFileSync(portFile, "utf8").split("\n")[0], 10) || 0;
  }
  if (!port) {
    proc.kill();
    throw new Error(`could not start ${bin}`);
  }
  let page: { webSocketDebuggerUrl: string } | undefined;
  for (let t = 0; t < 50 && !page; t++) {
    const list = (await (
      await fetch(`http://127.0.0.1:${port}/json/list`)
    ).json()) as { type: string; webSocketDebuggerUrl: string }[];
    page = list.find((x) => x.type === "page");
    if (!page) await Bun.sleep(100);
  }
  if (!page) {
    proc.kill();
    await proc.exited;
    throw new Error("no browser page");
  }
  const ws = new WebSocket(page.webSocketDebuggerUrl);
  await new Promise((r, j) => {
    ws.onopen = r;
    ws.onerror = (error) => {
      proc.kill();
      j(error);
    };
  });
  let id = 0;
  const pending = new Map<
    number,
    { res: (v: any) => void; rej: (e: Error) => void }
  >();
  const loadWaiters: (() => void)[] = [];
  ws.onmessage = (ev) => {
    const msg = JSON.parse(String(ev.data));
    if (msg.id && pending.has(msg.id)) {
      const p = pending.get(msg.id)!;
      pending.delete(msg.id);
      if (msg.error) p.rej(new Error(msg.error.message));
      else p.res(msg.result);
    } else if (msg.method === "Page.loadEventFired")
      loadWaiters.splice(0).forEach((f) => f());
  };
  const send = (method: string, params: object = {}) =>
    new Promise<any>((res, rej) => {
      const i = ++id;
      pending.set(i, { res, rej });
      ws.send(JSON.stringify({ id: i, method, params }));
    });
  return {
    send,
    waitLoad: () =>
      new Promise<void>((r) => {
        const timer = setTimeout(r, 15000);
        loadWaiters.push(() => {
          clearTimeout(timer);
          r();
        });
      }),
    eval: async (expression: string) => {
      const r = await send("Runtime.evaluate", {
        expression,
        returnByValue: true,
        awaitPromise: true,
      });
      if (r.exceptionDetails) throw new Error(r.exceptionDetails.text);
      return r.result.value;
    },
    close: async () => {
      try {
        ws.close();
      } catch {}
      proc.kill();
      await proc.exited;
    },
  };
}
