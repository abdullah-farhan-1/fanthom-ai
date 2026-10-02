import type { Metadata } from "next";
import Link from "next/link";
import { db } from "@/lib/supabase";
import { formatDate, formatTime, speakerLabel } from "@/lib/format";

export const dynamic = "force-dynamic";
export const metadata: Metadata = { title: "Search" };

interface Hit {
  meeting_id: string;
  idx: number;
  speaker: string;
  start_s: number;
  text: string;
}

function Marked({ text, terms }: { text: string; terms: string[] }) {
  if (!terms.length) return <>{text}</>;
  const re = new RegExp(`(${terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})`, "gi");
  return (
    <>
      {text.split(re).map((part, i) =>
        i % 2 ? (
          <mark key={i} className="rounded bg-warn-soft px-0.5 text-foreground">
            {part}
          </mark>
        ) : (
          part
        ),
      )}
    </>
  );
}

export default async function SearchPage({ searchParams }: PageProps<"/search">) {
  const { q: raw } = await searchParams;
  const q = (Array.isArray(raw) ? raw[0] : raw)?.trim() ?? "";
  const terms = q.split(/\s+/).filter((t) => t.length > 1 && !/^(or|and|not)$/i.test(t)).map((t) => t.replace(/^[-"]+|"+$/g, ""));

  let hits: Hit[] = [];
  let meetings: { id: string; title: string; meeting_date: string; speakers: Record<string, string> }[] = [];
  if (q) {
    const { data } = await db()
      .from("segments")
      .select("meeting_id, idx, speaker, start_s, text")
      .textSearch("tsv", q, { type: "websearch", config: "english" })
      .limit(200);
    hits = (data ?? []).map((h) => ({ ...h, start_s: Number(h.start_s) }));
    const ids = [...new Set(hits.map((h) => h.meeting_id))];
    const titleMatches = await db().from("meetings").select("id").eq("status", "ready").ilike("title", `%${q}%`);
    for (const m of titleMatches.data ?? []) if (!ids.includes(m.id)) ids.push(m.id);
    if (ids.length) {
      const res = await db().from("meetings").select("id, title, meeting_date, speakers").in("id", ids).order("meeting_date", { ascending: false });
      meetings = res.data ?? [];
    }
  }

  return (
    <div className="rise mx-auto max-w-4xl px-4 py-10 sm:px-6">
      <p className="label-mono">Search · all transcripts</p>
      <h1 className="mt-2 font-display text-2xl font-medium tracking-tight sm:text-3xl">{q ? <>Results for “{q}”</> : "Search"}</h1>
      <p className="mt-1 text-sm text-muted-foreground">
        {q
          ? `${hits.length} ${hits.length === 1 ? "moment" : "moments"} in ${meetings.length} ${meetings.length === 1 ? "meeting" : "meetings"}. Matches word forms too, so “decide” finds “decided”.`
          : "Search every transcript at once."}
      </p>

      <div className="mt-6 space-y-6">
        {meetings.map((m) => {
          const mine = hits.filter((h) => h.meeting_id === m.id).sort((a, b) => a.idx - b.idx);
          return (
            <section key={m.id} className="panel p-4 sm:p-5">
              <Link href={`/meetings/${m.id}`} className="font-medium hover:text-brand">
                {m.title}
              </Link>
              <span className="ml-2 font-mono text-[11px] uppercase tracking-wider text-muted-foreground">{formatDate(m.meeting_date)}</span>
              {mine.length === 0 && <p className="mt-2 text-sm text-muted-foreground">Title matches.</p>}
              <ul className="mt-2 space-y-1">
                {mine.slice(0, 12).map((h) => (
                  <li key={h.idx}>
                    <Link
                      href={`/meetings/${m.id}?t=${h.start_s}`}
                      className="flex gap-3 rounded-lg border-l-2 border-transparent px-2 py-1.5 text-sm hover:border-brand hover:bg-brand-soft"
                    >
                      <span className="w-14 shrink-0 font-mono text-xs leading-6 text-brand">{formatTime(h.start_s)}</span>
                      <span>
                        <span className="font-medium">{speakerLabel(h.speaker, m.speakers ?? {})}:</span> <Marked text={h.text} terms={terms} />
                      </span>
                    </Link>
                  </li>
                ))}
                {mine.length > 12 && <li className="px-2 text-xs text-muted-foreground">+{mine.length - 12} more in this meeting</li>}
              </ul>
            </section>
          );
        })}
      </div>
    </div>
  );
}
