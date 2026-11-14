# Scripted OpenAI-compatible fake model for the performance harness (never a real
# model, never a key): point a debug or dev-release-probe build at it with
# VIBEWORK_DEV_OPENROUTER_ORIGIN=http://127.0.0.1:<port>.
#   python3 scripts/perf/fake_model.py <port> <log.jsonl>
# Markers in the latest user message (a helper's first message for children):
#   FIX <n>             a fixture turn: a shell step, then a long markdown reply
#                       (paragraphs, a table, a code block, a list)
#   FIXFILE <path>      also presents <path> (vibework_present_file) in that turn
#   FIXHELPER           the turn starts a helper (subagent) that runs a shell step
#   STREAM <n> <rate>   streams a long markdown reply of about <n> tokens at <rate>
#                       deltas per second (one delta ~ one token, ~4 characters)
#   anything else       "ok"
# Requests without tools (title generation) get the first words of the message.
import json, sys, time, random
from http.server import ThreadingHTTPServer, BaseHTTPRequestHandler

LOG = open(sys.argv[2], "a")
WORDS = ("quarterly revenue forecast region supplier invoice margin churn cohort pipeline "
         "renewal contract headcount budget variance roadmap launch pricing tier retention "
         "inventory shipment warehouse audit compliance summary memo draft slide chart").split()


def text_of(c):
    if isinstance(c, str):
        return c
    return " ".join((p.get("text") or "") for p in (c or []) if isinstance(p, dict))


def reply_markdown(n, rng):
    w = lambda k: " ".join(rng.choice(WORDS) for _ in range(k))
    rows = "\n".join(f"| {w(2)} | {rng.randint(10, 9999):,} | {rng.randint(-40, 80)}% | {w(3)} |" for _ in range(6))
    code = "\n".join(f"    total_{i} = sum(row['{rng.choice(WORDS)}'] for row in rows if row['n'] > {i})  # {w(3)}" for i in range(14))
    items = "\n".join(f"- **{w(2).capitalize()}**: {w(12)}." for _ in range(5))
    return (
        f"## Step {n}: {w(3)}\n\n{w(40).capitalize()}. {w(30).capitalize()}.\n\n"
        f"| Item | Amount | Change | Note |\n|---|---:|---:|---|\n{rows}\n\n"
        f"```python\ndef summarise(rows):\n{code}\n    return locals()\n```\n\n{items}\n\n"
        f"{w(25).capitalize()}, so {w(20)}."
    )


def long_markdown(tokens, rng):
    out, n = [], 0
    while sum(len(p) for p in out) < tokens * 4:
        n += 1
        out.append(reply_markdown(n, rng) + "\n\n")
    return "".join(out)[: tokens * 4]


class H(BaseHTTPRequestHandler):
    def log_message(self, *a):
        pass

    def do_GET(self):
        self.send_response(404)
        self.end_headers()

    def do_POST(self):
        n = int(self.headers.get("content-length") or 0)
        body = json.loads(self.rfile.read(n) or b"{}")
        msgs = body.get("messages", [])
        last = msgs[-1] if msgs else {}
        users = [m for m in msgs if m.get("role") == "user"]
        lu = text_of(users[-1].get("content")) if users else ""
        first_u = text_of(users[0].get("content")) if users else ""
        child = "You are a subagent spawned" in first_u or first_u.startswith("CHILD")
        LOG.write(json.dumps({"t": time.time(), "last_role": last.get("role"), "last_user": lu[-120:], "child": child, "n_msgs": len(msgs)}) + "\n")
        LOG.flush()
        self.send_response(200)
        self.send_header("content-type", "text/event-stream")
        self.end_headers()
        base = {"id": "x", "object": "chat.completion.chunk", "created": 1, "model": "fake"}

        def chunk(d):
            self.wfile.write(b"data: " + json.dumps(d).encode() + b"\n\n")
            self.wfile.flush()

        def calls(*items):
            for i, (tool, args) in enumerate(items):
                chunk({**base, "choices": [{"index": 0, "delta": {"role": "assistant", "tool_calls": [{"index": i, "id": "call_%d_%d" % (time.time_ns(), i), "type": "function", "function": {"name": tool, "arguments": json.dumps(args)}}]}, "finish_reason": None}]})
            end("tool_calls")

        def end(reason):
            chunk({**base, "choices": [{"index": 0, "delta": {}, "finish_reason": reason}], "usage": {"prompt_tokens": 1, "completion_tokens": 1, "total_tokens": 2}})

        def say(text, step=48, rate=0.0):
            for i in range(0, len(text), step):
                chunk({**base, "choices": [{"index": 0, "delta": {"role": "assistant", "content": text[i:i + step]}, "finish_reason": None}]})
                if rate:
                    time.sleep(1.0 / rate)
            end("stop")

        rng = random.Random(lu)
        try:
            if not body.get("tools"):
                m = lu.split("<message>", 1)[-1].split("</message>", 1)[0]
                say(" ".join(m.replace("FIX", "").split()[:6]).rstrip(".") or "Fake task")
            elif child:
                if last.get("role") == "tool":
                    say("Helper finished: " + text_of(last.get("content"))[:200])
                else:
                    calls(("shell", {"command": "echo helper-step && ls | head -5", "description": "Look around the folder"}))
            elif last.get("role") == "tool":
                if "STREAM" in lu:
                    say("Done.")
                else:
                    n = lu.split("FIX", 1)[1].split()[0] if "FIX" in lu else "1"
                    say(reply_markdown(n, rng))
            elif "STREAM" in lu:
                parts = lu.split("STREAM", 1)[1].split()
                tokens, rate = int(parts[0]), float(parts[1])
                say(long_markdown(tokens, rng), step=4, rate=rate)
            elif "FIXHELPER" in lu:
                calls(("subagent", {"agent": "general", "description": "Check the folder", "prompt": "CHILD look: list the folder"}))
            elif "FIX" in lu:
                n = lu.split("FIX", 1)[1].split()[0]
                steps = [("shell", {"command": f"echo step {n} && date", "description": f"Check step {n}"})]
                if "FIXFILE" in lu:
                    path = lu.split("FIXFILE", 1)[1].split()[0]
                    steps.append(("vibework_present_file", {"file_path": path, "file_name": path.rsplit("/", 1)[-1]}))
                calls(*steps)
            else:
                say("ok")
            self.wfile.write(b"data: [DONE]\n\n")
            self.wfile.flush()
        except (BrokenPipeError, ConnectionResetError):
            pass


ThreadingHTTPServer(("127.0.0.1", int(sys.argv[1])), H).serve_forever()
