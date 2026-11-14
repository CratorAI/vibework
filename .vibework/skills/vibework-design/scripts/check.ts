/** Render a design in an isolated headless browser. All output lives in scratch. */
import {
  readFileSync,
  mkdirSync,
  mkdtempSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { findChrome, launch } from "./browser";
const file = process.argv[2];
if (!file || file === "--help") {
  console.log(
    "Usage: vibework-js check.ts /absolute/file.design.html\nScreenshots and report are written under $VIBEWORK_SCRATCH, never beside the design.",
  );
  process.exit(file ? 0 : 1);
}
const chrome = findChrome();
if (!chrome)
  throw Error(
    "No local Chromium found. Install the browser in Vibework Settings, then check again. No visual check was performed.",
  );
const source = readFileSync(file, "utf8"),
  scratch =
    process.env.VIBEWORK_SCRATCH ||
    path.join(tmpdir(), "vibework-design-check");
mkdirSync(scratch, { recursive: true });
const work = mkdtempSync(path.join(scratch, "check-")),
  browser = await launch(chrome, work);
try {
  await browser.send("Network.enable");
  await browser.send("Network.setBlockedURLs", {
    urls: ["http://*", "https://*", "file://*", "ftp://*"],
  });
  await browser.send("Page.enable");
  // Parse in a detached document, strip active markup, then mount in a scriptless
  // sandbox. The checker evaluates only its own trusted inspection code.
  await browser.eval(
    `(()=>{const d=new DOMParser().parseFromString(${JSON.stringify(source)},'text/html');d.querySelectorAll('script,iframe,object,embed,base,meta,link,form,portal,template,foreignObject,animate,set,animateTransform').forEach(n=>n.remove());d.querySelectorAll('*').forEach(n=>{for(const a of [...n.attributes])if(/^on/i.test(a.name)||['href','xlink:href','srcdoc','action','formaction','contenteditable','autofocus'].includes(a.name))n.removeAttribute(a.name)});const f=document.createElement('iframe');f.sandbox='allow-same-origin';f.style='border:0;display:block';f.srcdoc='<meta http-equiv="Content-Security-Policy" content="default-src &apos;none&apos;; script-src &apos;none&apos;; style-src &apos;unsafe-inline&apos;; img-src data:; font-src data:; frame-src &apos;none&apos;; object-src &apos;none&apos;; connect-src &apos;none&apos;; form-action &apos;none&apos;; base-uri &apos;none&apos;">'+d.documentElement.outerHTML;document.body.style.margin='0';document.body.append(f);return new Promise(r=>f.onload=r)})()`,
  );
  const frames = await browser.eval(
    `(()=>{const d=document.querySelector('iframe').contentDocument;return [...d.querySelectorAll('[data-design-frame]')].map(f=>({id:f.dataset.designFrame,name:f.dataset.name,w:f.offsetWidth,h:f.offsetHeight}))})()`,
  );
  if (!frames.length)
    throw Error(
      "No frames found. Use data-design-frame on fixed-size artboards.",
    );
  const issues = [];
  for (const [i, frame] of frames.entries()) {
    if (frame.w * frame.h > 32000000) {
      issues.push({
        frame: frame.name,
        issue: "Frame exceeds 32 million pixels.",
      });
      continue;
    }
    await browser.send("Emulation.setDeviceMetricsOverride", {
      width: Math.ceil(frame.w),
      height: Math.ceil(frame.h),
      deviceScaleFactor: 1,
      mobile: false,
    });
    const found = await browser.eval(
      `(async()=>{const iframe=document.querySelector('iframe'),d=iframe.contentDocument;iframe.width=${frame.w};iframe.height=${frame.h};d.documentElement.style='margin:0;padding:0;overflow:hidden';d.body.style='margin:0;padding:0;display:block';const frames=[...d.querySelectorAll('[data-design-frame]')];frames.forEach((f,i)=>{f.style.display=i===${i}?'block':'none';f.style.margin='0'});await d.fonts.ready;await Promise.all([...d.images].map(im=>im.decode().catch(()=>{})));const f=frames[${i}],out=[];for(const el of f.querySelectorAll('[data-design-id]')){if(getComputedStyle(el).display==='none')continue;if(el.scrollHeight>el.clientHeight+2||el.scrollWidth>el.clientWidth+2)out.push({id:el.dataset.designId,issue:'Content overflows its bounds'});}for(const im of f.querySelectorAll('img'))if(!im.naturalWidth)out.push({id:im.dataset.designId,issue:'Image did not load'});return out})()`,
    );
    issues.push(...found.map((x) => ({ frame: frame.name, ...x })));
    const shot = await browser.send("Page.captureScreenshot", {
      format: "png",
      captureBeyondViewport: false,
    });
    writeFileSync(
      path.join(work, `frame-${i + 1}.png`),
      Buffer.from(shot.data, "base64"),
    );
  }
  writeFileSync(
    path.join(work, "report.json"),
    JSON.stringify({ file, frames, issues }, null, 2),
  );
  console.log(
    JSON.stringify(
      { screenshots: work, frames: frames.length, issues },
      null,
      2,
    ),
  );
  if (issues.length) process.exitCode = 1;
} finally {
  await browser.close();
  rmSync(path.join(work, "profile"), { recursive: true, force: true });
}
