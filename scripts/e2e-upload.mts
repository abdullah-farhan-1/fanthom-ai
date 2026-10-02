// End-to-end browser test of the real upload flow: dialog -> upload -> processing -> meeting view.
// Usage: BASE=https://fanthom-ai-cyan.vercel.app npm run e2e   (deletes the meeting it creates)
import puppeteer from "puppeteer-core";
const BASE = process.env.BASE ?? "https://fanthom-ai-cyan.vercel.app";
const browser = await puppeteer.launch({ executablePath: "/usr/bin/google-chrome", headless: true, args: ["--no-sandbox"] });
const page = await browser.newPage();
await page.setViewport({ width: 1280, height: 900 });
const t0 = Date.now();
const ts = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
let id = "";
page.on("console", (m) => console.log(ts(), "console", m.type(), m.text().slice(0, 200)));
page.on("pageerror", (e) => console.log(ts(), "PAGEERROR", String(e).slice(0, 300)));
page.on("response", async (r) => {
  const u = r.url().replace(BASE, "");
  if (/\/api\/meetings\/[0-9a-f-]{36}$/.test(u)) console.log(ts(), "poll", r.status(), (await r.text().catch(() => "")).slice(0, 110));
  else if (u.startsWith("/api/meetings") && r.request().method() === "POST") { const j = await r.json().catch(() => ({})); id = j.id ?? id; console.log(ts(), "created", id); }
  else if (u.includes("_rsc")) console.log(ts(), "rsc", r.status(), u.slice(0, 90));
});
await page.goto(BASE, { waitUntil: "networkidle2" });
await page.locator("button ::-p-text(New meeting)").click();
const input = await page.waitForSelector('input[type="file"]');
await (input as any).uploadFile("samples/messy-meeting.wav");
await page.type("#title", "REPRO upload flow");
await page.locator("button ::-p-text(Create notes)").click();
for (let i = 0; i < 45; i++) {
  await new Promise((r) => setTimeout(r, 2000));
  const state = await page.evaluate(() => {
    const t = document.querySelector("main")?.textContent ?? "";
    return t.includes("Decisions & questions") ? "MEETING VIEW" : (t.match(/\{ processing \}.{0,80}/)?.[0] ?? location.pathname);
  });
  if (state === "MEETING VIEW") { console.log(ts(), "SWITCHED to meeting view"); break; }
  if (i % 4 === 0) console.log(ts(), "page:", state);
}
await browser.close();
if (id) await fetch(`${BASE}/api/meetings/${id}`, { method: "DELETE" });
process.exit(0);
