#!/usr/bin/env node
// 8x agent capture: appends each prompt and each final response to .agent-logs/<session>.md.
// Wired in .claude/settings.json:  UserPromptSubmit -> `capture.mjs prompt`,  Stop -> `capture.mjs response`.
// Never blocks or fails the agent: every error is swallowed and the hook exits 0.
import { readFileSync, writeFileSync, appendFileSync, readdirSync, mkdirSync, existsSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const AUTHOR = "abdullah-farhan-1";
const TOOL = "claude-code";
const PROJECT = "fanthom-ai";

const event = process.argv[2]; // "prompt" | "response"

function readStdin() {
  try {
    return readFileSync(0, "utf8");
  } catch {
    return "";
  }
}

// Last model name and the final response text of the current turn, from the session transcript.
function fromTranscript(path) {
  const out = { model: null, finalText: null };
  if (!path || !existsSync(path)) return out;
  const entries = readFileSync(path, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);

  const isRealPrompt = (e) => {
    if (e.type !== "user" || e.isMeta) return false;
    const c = e.message?.content;
    if (typeof c === "string") return true;
    return Array.isArray(c) && c.some((b) => b.type === "text") && !c.some((b) => b.type === "tool_result");
  };

  let turnStart = -1;
  entries.forEach((e, i) => {
    if (e.type === "assistant" && e.message?.model && e.message.model !== "<synthetic>") out.model = e.message.model;
    if (isRealPrompt(e)) turnStart = i;
  });

  // Final response = assistant text blocks after the last tool call of the turn.
  let texts = [];
  for (const e of entries.slice(turnStart + 1)) {
    if (e.type !== "assistant" || !Array.isArray(e.message?.content)) continue;
    for (const block of e.message.content) {
      if (block.type === "tool_use") texts = [];
      else if (block.type === "text" && block.text.trim()) texts.push(block.text);
    }
  }
  if (texts.length) out.finalText = texts.join("\n\n");
  return out;
}

function logFileFor(dir, sessionId, now) {
  mkdirSync(dir, { recursive: true });
  const existing = readdirSync(dir).find((f) => f.endsWith(`_${sessionId}.md`));
  if (existing) return join(dir, existing);
  const stamp = now.toISOString().slice(0, 19).replace("T", "_").replaceAll(":", "-");
  return join(dir, `${stamp}_${sessionId}.md`);
}

// Rebuild the front matter from the entries so counts and times always match the body.
function writeHeader(file, sessionId, model) {
  const current = existsSync(file) ? readFileSync(file, "utf8") : "";
  if (model === "unknown") model = /^model: (.+)$/m.exec(current)?.[1] ?? model;
  const body = current.replace(/^---\n[\s\S]*?\n---\n/, "");
  const promptTimes = [...body.matchAll(/\[LOG_ENTRY type=PROMPT [^\]]*\]\ntimestamp: (\S+)/g)].map((m) => m[1]);
  const short = sessionId.slice(0, 8);
  const first = promptTimes[0] ?? new Date().toISOString();
  const header = [
    "---",
    `session_id: ${sessionId}`,
    `date: ${first.slice(0, 10)}`,
    `author: ${AUTHOR}`,
    `model: ${model}`,
    `tool: ${TOOL}`,
    `project: ${PROJECT}`,
    `total_exchanges: ${promptTimes.length}`,
    `first_prompt_time: ${first}`,
    `last_prompt_time: ${promptTimes.at(-1) ?? first}`,
    "---",
    "",
  ].join("\n");
  const title = `\n# Session Log - ${first.slice(0, 10)}\n\nSession: \`${short}\` | Project: \`${PROJECT}\` | Author: \`${AUTHOR}\`\n\n---\n`;
  writeFileSync(file, header + (body || title));
}

function main() {
  const raw = readStdin();
  const input = raw ? JSON.parse(raw) : {};
  // Raw hook input, kept outside the repo, for debugging field names.
  writeFileSync(join(tmpdir(), `8x-capture-last-${event}.json`), raw);

  const sessionId = input.session_id ?? "unknown-session";
  const projectDir = process.env.CLAUDE_PROJECT_DIR ?? input.cwd ?? process.cwd();
  const now = new Date();
  const file = logFileFor(join(projectDir, ".agent-logs"), sessionId, now);
  const transcript = fromTranscript(input.transcript_path);
  const model = transcript.model ?? input.model ?? "unknown";
  const short = sessionId.slice(0, 8);

  if (!existsSync(file)) {
    if (event !== "prompt") return; // only a prompt starts a session log, so the filename time is the first prompt
    writeHeader(file, sessionId, model);
  }
  const promptCount = (readFileSync(file, "utf8").match(/\[LOG_ENTRY type=PROMPT /g) ?? []).length;

  if (event === "prompt") {
    const prompt = input.prompt ?? input.user_prompt;
    if (typeof prompt !== "string" || !prompt.trim()) return;
    appendFileSync(
      file,
      `\n[LOG_ENTRY type=PROMPT num=${promptCount + 1} session=${short}]\ntimestamp: ${now.toISOString()}\nmodel: ${model}\n\n${prompt}\n\n`,
    );
  } else if (event === "response") {
    if (promptCount === 0) return; // response with no logged prompt (e.g. hook installed mid-turn)
    const text = transcript.finalText ?? input.last_assistant_message ?? "(no response text captured)";
    appendFileSync(
      file,
      `\n[LOG_ENTRY type=RESPONSE num=${promptCount} session=${short}]\ntimestamp: ${now.toISOString()}\nmodel: ${model}\n\n${text}\n\n`,
    );
  }
  writeHeader(file, sessionId, model);
}

try {
  main();
} catch (err) {
  try {
    appendFileSync(join(tmpdir(), "8x-capture-errors.log"), `${new Date().toISOString()} ${event} ${err?.stack ?? err}\n`);
  } catch {}
}
process.exit(0);
