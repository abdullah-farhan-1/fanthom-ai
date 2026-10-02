"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useState } from "react";
import { Search } from "lucide-react";
import { Input } from "@/components/ui/input";

function SearchInput() {
  const router = useRouter();
  const params = useSearchParams();
  const [q, setQ] = useState(params.get("q") ?? "");
  return (
    <form
      role="search"
      className="relative mx-auto max-w-md"
      onSubmit={(e) => {
        e.preventDefault();
        if (q.trim()) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
      }}
    >
      <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search every meeting…"
        aria-label="Search all meetings"
        className="h-9 rounded-full border-border bg-panel-2/70 pl-9 pr-14 placeholder:text-muted-foreground/70 focus-visible:border-brand/50 focus-visible:ring-brand/20"
      />
      <kbd className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 font-mono text-[10px] text-muted-foreground max-sm:hidden">
        ↵
      </kbd>
    </form>
  );
}

export function SearchBox() {
  return (
    <Suspense fallback={<div className="mx-auto h-9 max-w-md rounded-full bg-panel-2/70" />}>
      <SearchInput />
    </Suspense>
  );
}
