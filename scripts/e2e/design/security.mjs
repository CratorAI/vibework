// Runs against the isolated debug WebKit window; never controls the desktop.
import assert from "node:assert/strict";
import { evaluate } from "../client.mjs";
const result = await evaluate(`
 const {parseDesign}=await import('/src/components/artifacts/design/model.ts');
 const {framePage}=await import('/src/components/artifacts/design/page.ts');
 const source='<html><body><section data-design-frame="security" style="width:100px;height:100px"><script>parent.__designAttack=1<\\/script><img src="data:image/png;base64,bad" onerror="parent.__designAttack=2"><a href="javascript:parent.__designAttack=3">test</a></section></body></html>';
 const design=parseDesign(source),frame=document.createElement('iframe');
 frame.sandbox='allow-same-origin';frame.srcdoc=framePage(design,design.frames[0]);frame.style.cssText='position:fixed;left:-200px;width:100px;height:100px';
 const ready=new Promise(resolve=>frame.onload=resolve);document.body.append(frame);await ready;
 const doc=frame.contentDocument;if(!doc)throw Error('Frame is not host-readable');doc.querySelector('a')?.click();
 await new Promise(r=>setTimeout(r,150));const result={executed:window.__designAttack??null,script:!!doc.querySelector('script'),handler:doc.querySelector('img')?.hasAttribute('onerror'),url:doc.querySelector('a')?.getAttribute('href'),sandbox:frame.sandbox.value,csp:doc.querySelector('meta[http-equiv]')?.content,sourcePreserved:design.source===source};frame.remove();return result;
`);
assert.equal(result.executed, null);
assert.equal(result.script, false);
assert.equal(result.handler, false);
assert.equal(result.url, null);
assert.equal(result.sandbox, "allow-same-origin");
assert.equal(result.sourcePreserved, true);
assert.match(result.csp, /script-src 'none'/);
assert.match(result.csp, /frame-src 'none'/);
console.log(JSON.stringify(result, null, 2));
// Defence-in-depth check: even if sanitization missed active markup, the
// scriptless sandbox and CSP must independently keep it inert.
const raw = await evaluate(
  `const f=document.createElement('iframe');f.sandbox='allow-same-origin';f.style='position:fixed;left:-500px;width:100px;height:100px';f.srcdoc=${JSON.stringify(`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; object-src 'none'; frame-src 'none'; child-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'"><script>parent.__rawDesignAttack=1<\/script><img src="data:image/png;base64,bad" onerror="parent.__rawDesignAttack=2"><a href="javascript:parent.__rawDesignAttack=3">attack</a>`)};const ready=new Promise(r=>f.onload=r);document.body.append(f);await ready;f.contentDocument.querySelector('a').click();await new Promise(r=>setTimeout(r,150));const r={scriptPresent:!!f.contentDocument.querySelector('script'),executed:window.__rawDesignAttack??null};f.remove();return r;`,
);
assert.equal(raw.scriptPresent, true);
assert.equal(raw.executed, null);
console.log(JSON.stringify({ rawMarkupBoundary: raw }, null, 2));
