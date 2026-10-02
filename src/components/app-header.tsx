"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Logo } from "./logo";
import { NewMeetingDialog } from "./new-meeting-dialog";
import { SearchBox } from "./search-box";

// Workspace header. Shared clip pages are for people outside the workspace, so they get only the brand.
export function AppHeader() {
  const shared = usePathname().startsWith("/share/");
  return (
    <header className="sticky top-0 z-40 border-b border-border/60 bg-background/70 backdrop-blur-xl">
      <div className="mx-auto flex h-14 max-w-[1400px] items-center gap-4 px-4 sm:px-6">
        {shared ? (
          <Logo />
        ) : (
          <>
            <Link href="/" className="shrink-0" aria-label="Fanthom home">
              <Logo />
            </Link>
            <div className="flex-1">
              <SearchBox />
            </div>
            <NewMeetingDialog />
          </>
        )}
      </div>
    </header>
  );
}
