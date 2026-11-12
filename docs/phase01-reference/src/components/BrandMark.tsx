export default function BrandMark({ size = 'md' }: { size?: 'sm' | 'md' | 'lg' }) {
  const box =
    size === 'sm' ? 'h-9 w-9 text-sm' : size === 'lg' ? 'h-14 w-14 text-xl' : 'h-11 w-11 text-base'
  return (
    <div className="flex flex-col items-center gap-2">
      <div
        className={`flex ${box} items-center justify-center rounded-2xl bg-bronee-600 font-bold text-white shadow-soft`}
      >
        B
      </div>
      <div className="text-center">
        <div className="text-[15px] font-semibold tracking-tight text-ink">BRONEE Limited</div>
        <div className="text-[12px] text-ink-muted">HRMS · Employee Portal</div>
      </div>
    </div>
  )
}
