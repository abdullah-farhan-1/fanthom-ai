"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { CornerDownLeft, Search } from "lucide-react";
import { BrandSpinner, SignalLoader } from "@/components/signal-loader";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function SearchBox() {
  const router = useRouter();
  const pathname = usePathname();
  // Starts empty (also after a reload); the results page shows the query in its heading.
  const [q, setQ] = useState("");
  const [pending, startTransition] = useTransition();

  // Leaving search results (logo, a meeting, home) clears the box.
  const [lastPath, setLastPath] = useState(pathname);
  if (pathname !== lastPath) {
    setLastPath(pathname);
    if (!pathname.startsWith("/search")) setQ("");
  }

  // A new query on the results page doesn't show the route's loading screen, so show progress here.
  useEffect(() => {
    document.body.style.cursor = pending ? "progress" : "";
  }, [pending]);

  const query = q.trim();

  return (
    <form
      role="search"
      className="relative mx-auto max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        if (query) startTransition(() => router.push(`/search?q=${encodeURIComponent(query)}`));
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search every meeting…"
        aria-label="Search all meetings"
        className="h-9 rounded-full border-border bg-panel-2/70 pl-9 pr-12 placeholder:text-muted-foreground/70 focus-visible:border-brand/50 focus-visible:ring-brand/20"
      />
      {pending ? (
        <BrandSpinner size="sm" className="absolute right-3 top-1/2 -translate-y-1/2 text-brand" />
      ) : (
        <button
          type="submit"
          disabled={!query}
          aria-label="Search"
          title="Search (Enter)"
          className={cn(
            "absolute right-1.5 top-1/2 grid h-6 w-8 -translate-y-1/2 place-items-center rounded-full border transition",
            query
              ? "border-brand/50 bg-brand-soft text-brand hover:bg-brand hover:text-brand-foreground"
              : "border-border text-muted-foreground",
          )}
        >
          <CornerDownLeft className="size-3.5" />
        </button>
      )}

      {/* Portal to <body>: the header's backdrop blur would otherwise confine position:fixed to the header. */}
      {pending &&
        createPortal(
        <>
          {/* Thin progress bar along the bottom of the header */}
          <span className="pointer-events-none fixed inset-x-0 top-14 z-50 h-0.5 overflow-hidden" role="progressbar" aria-label="Searching">
            <span className="search-progress block h-full w-1/3 rounded-full bg-brand shadow-[0_0_10px_var(--brand)]" />
          </span>
          {/* Brand loader over the page while results load */}
          <div className="fixed inset-x-0 bottom-0 top-14 z-40 grid place-items-center bg-background/45 backdrop-blur-sm">
            <SignalLoader label={`Searching every transcript for “${query}”`} className="-mt-[10vh]" />
          </div>
        </>,
          document.body,
        )}
    </form>
  );
}
