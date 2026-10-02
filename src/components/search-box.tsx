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
      <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
      <Input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Search all meetings…"
        aria-label="Search all meetings"
        className="h-9 pl-8 bg-muted/50"
      />
    </form>
  );
}

export function SearchBox() {
  return (
    <Suspense fallback={<div className="mx-auto h-9 max-w-md rounded-lg bg-muted/50" />}>
      <SearchInput />
    </Suspense>
  );
}
