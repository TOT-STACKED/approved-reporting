// Shown the instant a Field link is tapped, while the server builds the page,
// so a tap always visibly does something. Same header bar and spacing as the
// real pages, so nothing jumps when they arrive.

export default function FieldLoading({ title = '' }: { title?: string }) {
  return (
    <div aria-busy="true" aria-label="Loading">
      <header className="sticky top-0 z-20 bg-ink text-white" style={{ paddingTop: 'env(safe-area-inset-top)' }}>
        <div className="mx-auto flex h-14 max-w-5xl items-center gap-2 px-4">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-primary text-[13px] font-bold">F</span>
          <h1 className="flex-1 truncate font-display text-lg uppercase tracking-tight">{title}</h1>
          <span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
        </div>
      </header>
      <main className="mx-auto w-full max-w-md animate-pulse px-4 pt-5 md:max-w-2xl">
        <div className="mb-4 grid grid-cols-2 gap-3">
          <div className="h-20 rounded-2xl bg-surface" />
          <div className="h-20 rounded-2xl bg-surface" />
        </div>
        <div className="mb-4 h-56 rounded-2xl bg-surface" />
        <div className="mb-2 h-16 rounded-2xl bg-surface" />
        <div className="mb-2 h-16 rounded-2xl bg-surface" />
        <div className="h-16 rounded-2xl bg-surface" />
      </main>
    </div>
  );
}
