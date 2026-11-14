import fs from "node:fs";
let turn = 0;
const root =
  process.env.DESIGN_FIXTURE_DIR ?? "/private/tmp/vibework-design/fixtures";
Bun.serve({
  hostname: "127.0.0.1",
  port: 1479,
  async fetch(req) {
    if (req.method === "GET")
      return Response.json({
        data: { is_free_tier: false, limit_remaining: 1000 },
      });
    const body = await req.json(),
      tools = body.tools ?? [],
      names = tools.map((t) => t.function?.name);
    if (names.length)
      fs.writeFileSync(
        "/tmp/vibework-design/fake-tool-schemas.json",
        JSON.stringify(
          tools.map((t) => ({
            name: t.function?.name,
            parameters: t.function?.parameters,
          })),
          null,
          2,
        ),
      );
    let delta,
      finish = "stop";
    const call = (name, args) => {
      delta = {
        tool_calls: [
          {
            index: 0,
            id: "design-" + turn,
            type: "function",
            function: { name, arguments: JSON.stringify(args) },
          },
        ],
      };
      finish = "tool_calls";
    };
    if (names.length) {
      if (turn === 0 && names.includes("skill"))
        call("skill", { id: "vibework-design" });
      else if (turn <= 2 && names.includes("write")) {
        const name = turn === 1 ? "poster" : "social";
        call("write", {
          path: `${root}/agent-${name}.design.html`,
          content: fs.readFileSync(`${root}/${name}.design.html`, "utf8"),
        });
      } else if (turn <= 4 && names.some((n) => n.includes("present_file"))) {
        const name = turn === 3 ? "poster" : "social";
        call(
          names.find((n) => n.includes("present_file")),
          {
            file_path: `${root}/agent-${name}.design.html`,
            file_name: `agent-${name}.design.html`,
          },
        );
      } else
        delta = {
          content:
            "Created the Fieldnotes exhibition poster and the three-frame Gather social set using the vibework-design conventions. Local browser visual checks were not run in this scripted model turn; the implementation harness inspects them in the app.",
        };
      fs.appendFileSync(
        "/tmp/vibework-design/fake-2-events.jsonl",
        JSON.stringify({
          turn,
          tool: delta.tool_calls?.[0]?.function.name ?? "complete",
          skillSeen: JSON.stringify(body.messages ?? []).includes(
            "vibework-design",
          ),
        }) + "\n",
      );
      turn++;
    } else delta = { content: "Design studio checks" };
    const chunk = (d, f) =>
      JSON.stringify({
        id: "fake-design-2",
        object: "chat.completion.chunk",
        created: 1,
        model: body.model,
        choices: [{ index: 0, delta: d, finish_reason: f }],
      });
    return new Response(
      `data: ${chunk(delta, null)}\n\ndata: ${chunk({}, finish)}\n\ndata: [DONE]\n\n`,
      { headers: { "Content-Type": "text/event-stream" } },
    );
  },
});
