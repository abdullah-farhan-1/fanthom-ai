import { SignalLoader, Skeleton } from "@/components/signal-loader";

export default function LoadingHome() {
  return (
    <div className="mx-auto max-w-[1100px] px-4 py-10 sm:px-6 sm:py-14">
      <Skeleton className="h-3 w-64" />
      <Skeleton className="mt-5 h-12 w-[32rem] max-w-full" />
      <Skeleton className="mt-6 h-4 w-[36rem] max-w-full" />
      <div className="mt-10 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <Skeleton key={i} className="h-24" />
        ))}
      </div>
      <div className="panel mt-10 p-6">
        <SignalLoader label="Loading meetings" className="py-8" />
      </div>
    </div>
  );
}
