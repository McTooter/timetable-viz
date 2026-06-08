export function PageSkeleton() {
  return (
    <main
      className="blueprint-bg relative min-h-screen overflow-hidden"
      aria-busy="true"
      aria-live="polite"
    >
      {/* Sweep line */}
      <div className="sweep-line" aria-hidden />

      <div className="relative mx-auto max-w-7xl px-4 py-8 md:px-8 md:py-12">
        {/* Title skeleton */}
        <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
          <div>
            <div className="h-4 w-44 rounded-sm border border-blueprint-line/40 bg-blueprint-line/10" />
            <div className="mt-3 h-12 w-64 border border-blueprint-line/40 bg-blueprint-line/10" />
            <div className="mt-3 h-3 w-96 max-w-full border border-blueprint-line/30 bg-blueprint-line/10" />
          </div>
          <div className="flex flex-col items-end gap-2">
            <div className="h-8 w-28 border border-blueprint-line/40 bg-blueprint-line/10" />
            <div className="h-3 w-32 border border-blueprint-line/30 bg-blueprint-line/10" />
          </div>
        </div>

        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-6">
            <SceneSkeleton />
            <GridSkeleton />
          </div>
          <div className="space-y-6">
            <CardSkeleton />
            <CardSkeleton />
            <CardSkeleton />
          </div>
        </div>

        <p className="mt-10 text-center font-mono text-[10px] uppercase tracking-widest text-blueprint-line/70">
          ▸ loading register · bot status · 3d map ▸
        </p>
      </div>
    </main>
  );
}

export function SceneSkeleton() {
  return (
    <div className="relative h-[460px] w-full overflow-hidden rounded-md border border-blueprint-line/40 bg-blueprint-bg">
      <div className="pointer-events-none absolute left-3 top-3 flex items-center gap-2 font-mono text-[10px] uppercase tracking-widest text-blueprint-line/60">
        <span className="inline-block size-1.5 rounded-full bg-blueprint-line" />
        3d · weekly map
      </div>
      {/* Faux 3D scene: faux day platforms as solid bars */}
      <div className="absolute inset-x-6 bottom-12 top-12 flex items-end justify-around">
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div
            key={i}
            className="h-2/3 w-1/8 border border-blueprint-line/40"
            style={{
              width: `${100 / 7 - 2}%`,
              height: `${30 + ((i * 17) % 50)}%`,
              background: `linear-gradient(180deg, color-mix(in oklch, var(--blueprint-line) 8%, transparent), transparent)`,
            }}
          />
        ))}
      </div>
      {/* Faux slabs */}
      <div className="absolute inset-x-6 top-20 bottom-16">
        <div
          className="absolute h-3 w-1/5 border border-blueprint-line/40 bg-blueprint-line/15"
          style={{ left: "8%", top: "30%" }}
        />
        <div
          className="absolute h-3 w-1/6 border border-blueprint-line/40 bg-blueprint-line/15"
          style={{ left: "22%", top: "55%" }}
        />
        <div
          className="absolute h-3 w-1/4 border border-blueprint-line/40 bg-blueprint-line/15"
          style={{ left: "44%", top: "20%" }}
        />
        <div
          className="absolute h-3 w-1/5 border border-blueprint-line/40 bg-blueprint-line/15"
          style={{ left: "70%", top: "45%" }}
        />
      </div>
    </div>
  );
}

export function GridSkeleton() {
  return (
    <div className="overflow-hidden rounded-md border border-blueprint-line/40 bg-blueprint-bg">
      <div
        className="grid h-9 border-b border-blueprint-line/40"
        style={{ gridTemplateColumns: "68px repeat(7, 1fr)" }}
      >
        <div className="border-r border-blueprint-line/40" />
        {[0, 1, 2, 3, 4, 5, 6].map((i) => (
          <div key={i} className="border-r border-blueprint-line/30 px-3 py-2">
            <div className="h-3 w-12 border border-blueprint-line/40 bg-blueprint-line/10" />
          </div>
        ))}
      </div>
      {Array.from({ length: 13 }).map((_, i) => (
        <div
          key={i}
          className="grid border-b border-blueprint-line/20"
          style={{
            gridTemplateColumns: "68px repeat(7, 1fr)",
            minHeight: 38,
          }}
        >
          <div className="border-r border-blueprint-line/40 p-1 text-right">
            <div className="ml-auto h-2.5 w-8 border border-blueprint-line/30 bg-blueprint-line/10" />
          </div>
          {Array.from({ length: 7 }).map((_, j) => (
            <div key={j} className="border-r border-blueprint-line/20 p-1">
              {i % 3 === j % 3 && i % 2 === 0 ? (
                <div className="h-3/4 w-full border border-blueprint-line/40 bg-blueprint-line/10" />
              ) : null}
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="rounded-md border border-blueprint-line/40 bg-blueprint-bg p-5">
      <div className="h-3 w-32 border border-blueprint-line/40 bg-blueprint-line/10" />
      <div className="mt-2 h-2.5 w-3/4 border border-blueprint-line/30 bg-blueprint-line/10" />
      <div className="mt-4 h-24 w-full border border-blueprint-line/30 bg-blueprint-line/5" />
      <div className="mt-3 flex gap-2">
        <div className="h-6 w-24 border border-blueprint-line/40 bg-blueprint-line/10" />
        <div className="h-6 w-20 border border-blueprint-line/40 bg-blueprint-line/10" />
      </div>
    </div>
  );
}
