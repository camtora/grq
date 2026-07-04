import { Card } from "@/components/ui";

// Route-level loading skeletons (app/**/loading.tsx). These paint INSTANTLY on
// navigation while the force-dynamic server render runs — before them, a click
// from quick search gave zero feedback for the whole render (~2-3s cold).
// Pure shimmer, no copy: tinted teal blocks per docs/DESIGN.md (no gray ramps).

function Bar({ className = "" }: { className?: string }) {
  return <div className={`animate-pulse rounded bg-teal-400/10 ${className}`} />;
}

/** Generic list-page skeleton: page title + sub, then a card of table-ish rows. */
export function TablePageSkeleton({ rows = 8 }: { rows?: number }) {
  return (
    <main>
      <div className="mb-8">
        <Bar className="mb-2 h-8 w-44" />
        <Bar className="h-4 w-80 max-w-full" />
      </div>
      <Card>
        {Array.from({ length: rows }, (_, i) => (
          <div key={i} className={`flex items-center gap-4 p-4 ${i > 0 ? "border-t border-teal-400/10" : ""}`}>
            <Bar className="h-8 w-8 rounded-full" />
            <Bar className="h-4 w-32" />
            <Bar className="hidden h-4 w-48 sm:block" />
            <Bar className="ml-auto h-4 w-16" />
            <Bar className="hidden h-4 w-20 md:block" />
          </div>
        ))}
      </Card>
    </main>
  );
}

/** Stock-page skeleton: back link, logo + name header, price, then panel cards. */
export function StockPageSkeleton() {
  return (
    <main>
      <Bar className="mb-4 h-4 w-28" />
      <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <Bar className="h-12 w-12 rounded-full" />
          <div>
            <Bar className="mb-2 h-7 w-48" />
            <Bar className="h-4 w-32" />
          </div>
        </div>
        <div className="text-right">
          <Bar className="mb-2 ml-auto h-8 w-28" />
          <Bar className="ml-auto h-4 w-20" />
        </div>
      </div>
      <Card className="mb-4 p-5">
        <Bar className="h-14 w-full" />
      </Card>
      <div className="grid gap-4 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Card key={i} className="p-5">
            <Bar className="mb-3 h-4 w-36" />
            <Bar className="mb-2 h-4 w-full" />
            <Bar className="mb-2 h-4 w-5/6" />
            <Bar className="h-4 w-2/3" />
          </Card>
        ))}
      </div>
    </main>
  );
}
