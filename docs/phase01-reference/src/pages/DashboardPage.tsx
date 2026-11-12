export default function DashboardPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-4">
      <section className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-card">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h1 className="text-lg font-semibold text-ink">Dashboard</h1>
            <p className="mt-0.5 text-[13px] text-ink-muted">Your live attendance and daily summary will appear here.</p>
          </div>
          <span className="rounded-full bg-zinc-100 px-2.5 py-1 text-[11px] font-medium text-ink-muted">UI phase</span>
        </div>
      </section>
      <section className="rounded-2xl border border-zinc-100 bg-white p-5 shadow-card">
        <div className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Live attendance</div>
        <div className="mt-3 text-center">
          <div className="text-[11px] font-medium text-ink-faint">Working time</div>
          <div className="mt-1 font-mono text-3xl font-semibold tracking-tight text-ink">00:00:00</div>
          <div className="mt-1 text-[12px] text-ink-muted">Status: Not clocked in</div>
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
          <button type="button" className="btn-primary !py-2.5 text-[13px]">Clock in</button>
          <button type="button" className="btn-ghost !py-2.5 text-[13px]" disabled>Break</button>
          <button type="button" className="btn-ghost !py-2.5 text-[13px]" disabled>Clock out</button>
          <button type="button" className="btn-ghost !py-2.5 text-[13px]" disabled>OT out</button>
        </div>
        <p className="mt-3 text-center text-[11px] text-ink-faint">Attendance engine connects in a later phase. Buttons are layout only.</p>
      </section>
      <div className="grid gap-3 sm:grid-cols-2">
        <section className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-card">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">Today</h2>
          <dl className="mt-3 space-y-2 text-[13px]">
            <div className="flex justify-between"><dt className="text-ink-muted">Work</dt><dd className="font-medium text-ink">—</dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">Break</dt><dd className="font-medium text-ink">—</dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">Breaks</dt><dd className="font-medium text-ink">0</dd></div>
          </dl>
        </section>
        <section className="rounded-2xl border border-zinc-100 bg-white p-4 shadow-card">
          <h2 className="text-[12px] font-semibold uppercase tracking-wide text-ink-muted">This month</h2>
          <dl className="mt-3 space-y-2 text-[13px]">
            <div className="flex justify-between"><dt className="text-ink-muted">Work hours</dt><dd className="font-medium text-ink">—</dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">Break hours</dt><dd className="font-medium text-ink">—</dd></div>
            <div className="flex justify-between"><dt className="text-ink-muted">Late days</dt><dd className="font-medium text-ink">0</dd></div>
          </dl>
        </section>
      </div>
      <p className="text-center text-[11px] text-ink-faint">Attendance bonus amount is never shown here — only late days, per policy.</p>
    </div>
  )
}
