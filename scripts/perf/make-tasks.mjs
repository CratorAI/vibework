#!/usr/bin/env bun
// Builds the task fixtures in a running harness app (PERF_DATA) through the fake
// model: one long task (LONG_TURNS turns: a shell step, a long markdown reply with a
// table and a code block, a file card every 10th turn, one helper step) and TASKS
// short tasks, the first 320 of which present one gallery file each.
//   PERF_DATA=/tmp/vibework-perf/data-fixture bun scripts/perf/make-tasks.mjs
import fs from "node:fs";
import { evaluate, invoke, OUT, trackDone, turn } from "./lib.mjs";

const WORK = fs.realpathSync(`${OUT}/work`);
const MANY = `${WORK}/many`;
const LONG_TURNS = Number(process.env.LONG_TURNS || 160);
const TASKS = Number(process.env.TASKS || 500);
const MODEL = "openai/gpt-4o-mini";
const files = fs.readdirSync(MANY).sort();
const WORDS = "quarterly revenue forecast supplier invoice margin churn cohort pipeline renewal contract headcount budget variance roadmap launch pricing retention inventory shipment warehouse audit compliance".split(" ");
const pick = (i, k) => Array.from({ length: k }, (_, j) => WORDS[(i * 7 + j * 13) % WORDS.length]).join(" ");

async function create(name, folder = WORK) {
  const sessionId = crypto.randomUUID();
  await invoke("agent_create_session", { sessionId, name, workingFolder: folder, model: MODEL, permissionMode: "auto" });
  return sessionId;
}

await trackDone();
const t0 = Date.now();
if (process.env.SKIP_LONG !== "1") {
  const long = await create("Long fixture task");
  fs.writeFileSync(`${OUT}/long-session-id.txt`, long);
  for (let i = 1; i <= LONG_TURNS; i++) {
    let msg = `Work through the ${pick(i, 4)} numbers and summarise them. FIX ${i}`;
    if (i % 10 === 0) msg += ` FIXFILE ${MANY}/${files[i % files.length]}`;
    if (i === Math.floor(LONG_TURNS / 2)) msg = "Ask a helper to look through the folder. FIXHELPER";
    await turn(long, msg);
    if (i % 20 === 0) console.log(`long: ${i}/${LONG_TURNS} turns (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
}

let next = 1;
async function worker() {
  while (next <= TASKS) {
    const j = next++;
    const id = await create(`Task ${j}`);
    let msg = `Prepare the ${pick(j, 3)} report for client ${j}. FIX ${j}`;
    if (j <= files.length) msg += ` FIXFILE ${MANY}/${files[j - 1]}`;
    await turn(id, msg);
    if (j % 50 === 0) console.log(`tasks: ${j}/${TASKS} (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
}
await Promise.all(Array.from({ length: Number(process.env.CONCURRENCY || 6) }, worker));
const sessions = await invoke("agent_list_sessions");
console.log(`done in ${((Date.now() - t0) / 1000).toFixed(0)} s; ${sessions.length} tasks`);
await evaluate("return true");

// One task whose turns present each large fixture (opened from its file cards).
if (process.env.SKIP_BIG !== "1") {
  const big = await create("Big files");
  fs.writeFileSync(`${OUT}/big-session-id.txt`, big);
  for (const f of fs.readdirSync(`${WORK}/big`).sort()) await turn(big, `Show ${f}. FIX 1 FIXFILE ${WORK}/big/${f}`);
  console.log("big files task", big);
}
process.exit(0);
