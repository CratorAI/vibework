import { type Design, type Node } from "./model";
/** CSP + same-origin, scriptless sandbox are the security boundary. Strip active
 * navigation and embedded browsing contexts as additional defence in depth. */
export function safeMarkup(html: string): string {
  const doc = new DOMParser().parseFromString(html, "text/html");
  doc
    .querySelectorAll(
      "script,iframe,object,embed,base,meta,link,form,portal,template,foreignObject,animate,set,animateTransform",
    )
    .forEach((n) => n.remove());
  doc.querySelectorAll("*").forEach((n) => {
    for (const a of [...n.attributes])
      if (
        /^on/i.test(a.name) ||
        [
          "href",
          "xlink:href",
          "srcdoc",
          "action",
          "formaction",
          "contenteditable",
          "autofocus",
        ].includes(a.name)
      )
        n.removeAttribute(a.name);
  });
  // Mark unsupported children in the rendering copy only. Source spans remain untouched.
  let unknown = 0;
  doc
    .querySelectorAll('[data-design-frame],[data-design-kind="group"]')
    .forEach((parent) => {
      for (const child of parent.children)
        if (
          !child.hasAttribute("data-design-id") &&
          child.tagName.toLowerCase() !== "style"
        )
          child.setAttribute("data-design-readonly", String(unknown++));
    });
  return doc.body.innerHTML;
}
export function framePage(d: Design, n: Node) {
  const styles = d.nodes
    .filter((x) => x.tag === "style")
    .map((x) => d.source.slice(x.start, x.end))
    .join("");
  return `<!doctype html><html><head><meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:; font-src data:; object-src 'none'; frame-src 'none'; child-src 'none'; connect-src 'none'; form-action 'none'; base-uri 'none'">${styles}<style>html,body{margin:0;padding:0;overflow:hidden;color-scheme:light} [data-design-frame]{margin:0!important;box-sizing:border-box} *{animation:none!important;transition:none!important;caret-color:auto} [data-hidden="true"]{display:none!important}</style></head><body>${safeMarkup(d.source.slice(n.start, n.end))}</body></html>`;
}
