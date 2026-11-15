import { Loader2 } from 'lucide-react';

export function PageLoader() {
  return (
    <div className="grid min-h-screen place-items-center bg-surface-sunken">
      <div className="flex flex-col items-center gap-3">
        <Loader2 size={26} className="animate-spin text-brand-600" />
        <p className="text-[12.5px] text-ink-faint">Loading BRONEE HRMS…</p>
      </div>
    </div>
  );
}

export function InlineLoader({ label = 'Loading…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2.5 py-12 text-ink-faint">
      <Loader2 size={16} className="animate-spin" />
      <span className="text-[12.5px]">{label}</span>
    </div>
  );
}
