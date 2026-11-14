// Vite config for the performance harness: the app's own config plus a separate
// cache folder and, in dev mode, a React commit hook installed before React loads
// (window.__perfRenders counts renders per component while it is a Map). Never
// used for shipped builds.
import base from "../../vite.config.ts";

const hook = `
(() => {
  const named = (t) => t && (t.displayName || t.name || (t.render && (t.render.displayName || t.render.name)) || (t.type && named(t.type)));
  const visit = (fiber, counts) => {
    // Walk only where children were re-created this commit (a bailed-out subtree
    // keeps the same child pointer), counting components that performed work.
    const stack = [fiber];
    while (stack.length) {
      const f = stack.pop();
      if ((f.tag === 0 || f.tag === 1 || f.tag === 11 || f.tag === 14 || f.tag === 15) && (f.flags & 1)) {
        const n = named(f.type) || "anonymous";
        counts.set(n, (counts.get(n) || 0) + 1);
      }
      if (f.child && (!f.alternate || f.child !== f.alternate.child)) {
        for (let c = f.child; c; c = c.sibling) stack.push(c);
      }
    }
  };
  window.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
    __perf: true, supportsFiber: true, renderers: new Map(),
    inject() { return 1; }, checkDCE() {}, onScheduleFiberRoot() {}, onPostCommitFiberRoot() {}, onCommitFiberUnmount() {},
    onCommitFiberRoot(_id, root) {
      if (!window.__perfRenders) return;
      window.__perfCommits = (window.__perfCommits || 0) + 1;
      visit(root.current, window.__perfRenders);
    },
  };
})();`;

export default async (env) => {
  const cfg = await base(env);
  return {
    ...cfg,
    cacheDir: "/tmp/vibework-perf/vite-cache",
    plugins: [
      ...cfg.plugins,
      {
        name: "perf-react-hook",
        apply: "serve",
        transformIndexHtml: (html, ctx) => (ctx.filename.endsWith("index.html") && process.env.PERF_HOOK !== "0"
          ? html.replace("<head>", `<head><script>${hook}</script>`) : html),
      },
    ],
  };
};
