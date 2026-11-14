import { evaluate, waitFor } from "../client.mjs";
import { execFileSync } from "node:child_process";
const pause = (ms) => new Promise((r) => setTimeout(r, ms)),
  id = process.env.DESIGN_WINDOW_ID;
if (!id) throw Error("Set DESIGN_WINDOW_ID to isolated dev window");
for (const theme of ["light", "dark"]) {
  await evaluate(
    `(await import('/src/lib/theme.ts')).setThemePreference('${theme}');`,
  );
  for (const name of ["poster", "brief", "social"]) {
    await evaluate(
      `(await import('/src/components/workspace/actions.ts')).openArtifactInPanel('design-check','/tmp/vibework-design/fixtures/${name}-${theme}-1.pdf');`,
    );
    await waitFor('button[title="Zoom out"]');
    await pause(1500);
    for (let i = 0; i < 3; i++) {
      const fits = await evaluate(
        `const c=document.querySelector('canvas').getBoundingClientRect();return c.height<innerHeight-140;`,
      );
      if (fits) break;
      await evaluate(
        `document.querySelector('button[title="Zoom out"]').click();`,
      );
      await pause(600);
    }
    const pages = name === "social" ? 3 : 1;
    for (let page = 1; page <= pages; page++) {
      if (page > 1) {
        await evaluate(
          `document.querySelector('button[title="Next page"]').click();`,
        );
        await pause(900);
      }
      execFileSync("screencapture", [
        "-x",
        "-l",
        id,
        `/tmp/vibework-design/shots-2/${name}-${theme}-pdf-page-${page}.png`,
      ]);
    }
  }
}
