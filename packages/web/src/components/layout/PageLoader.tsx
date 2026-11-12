export function PageLoader({ label = 'Loading BRONEE HRMS' }: { label?: string }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-4 bg-canvas">
      <span className="relative flex h-12 w-12 items-center justify-center">
        <span className="absolute inset-0 animate-ping rounded-2xl bg-brand-200 opacity-60" />
        <span className="relative flex h-11 w-11 items-center justify-center rounded-2xl bg-brand-600 text-white shadow-glow">
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 19V7l8-4 8 4v12" />
            <path d="M9 19v-5h6v5" />
          </svg>
        </span>
      </span>
      <p className="text-[13px] font-semibold text-ink-muted">{label}</p>
    </div>
  );
}
