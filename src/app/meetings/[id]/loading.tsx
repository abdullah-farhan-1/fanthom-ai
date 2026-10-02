import { SignalLoader, Skeleton } from "@/components/signal-loader";

// Shown instantly when a meeting is opened, while its transcript and notes load.
export default function LoadingMeeting() {
  return (
    <div className="mx-auto grid max-w-[1400px] gap-5 px-4 py-6 sm:px-6 lg:grid-cols-[minmax(0,1fr)_440px]">
      <header className="space-y-3 lg:col-span-2">
        <Skeleton className="h-3 w-80 max-w-full" />
        <Skeleton className="h-9 w-[28rem] max-w-full" />
      </header>

      <div className="min-w-0 space-y-5">
        <section className="panel p-5">
          <SignalLoader label="Loading meeting" className="py-6" />
          <div className="mt-4 flex items-center gap-3">
            <Skeleton className="size-11 rounded-full" />
            <Skeleton className="h-4 w-28" />
          </div>
          <div className="mt-6 flex gap-2">
            {[0, 1, 2].map((i) => (
              <Skeleton key={i} className="h-12 w-44" />
            ))}
          </div>
        </section>
        <section className="panel space-y-3 p-5">
          <div className="flex gap-5">
            {["w-20", "w-28", "w-36", "w-14"].map((w) => (
              <Skeleton key={w} className={`h-4 ${w}`} />
            ))}
          </div>
          <Skeleton className="mt-4 h-20 w-full" />
          {[0, 1, 2, 3].map((i) => (
            <Skeleton key={i} className="h-4" />
          ))}
        </section>
      </div>

      <aside className="panel space-y-4 p-4 lg:h-[calc(100dvh-6rem)]">
        <Skeleton className="h-8 w-full" />
        {Array.from({ length: 7 }, (_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-4 w-4/5" />
          </div>
        ))}
      </aside>
    </div>
  );
}
