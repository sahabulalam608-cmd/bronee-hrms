import { useState } from 'react';
import { motion } from 'framer-motion';
import {
  Banknote,
  CalendarDays,
  ChevronRight,
  Coins,
  Gift,
  Printer,
  Receipt,
  TrendingUp,
} from 'lucide-react';
import { banglaMonthLabel, formatBanglaDate } from '@bronee/shared';
import { useMyPayslips } from '@/lib/queries';
import {
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  Drawer,
  EmptyState,
  Skeleton,
} from '@/components/ui';
import { cn, formatBDT, formatNumber } from '@/lib/utils';

type Payslip = {
  id: string;
  year: number;
  month: number;
  basicSalary: number;
  allowances: number;
  overtimeAmount: number;
  bonusAmount: number | null;
  attendanceBonusApplied: boolean;
  deductions: number;
  netPayable: number;
  workingDays: number;
  presentDays: number;
  lateDays: number;
  publishedAt: string | null;
};

export default function SalaryPage() {
  const { data, isLoading } = useMyPayslips();
  const [openId, setOpenId] = useState<string | null>(null);

  const items = (data?.items ?? []) as unknown as Payslip[];
  const latest = items[0];
  const selected = items.find((i) => i.id === openId);

  return (
    <div className="space-y-5">
      {/* Latest payslip summary */}
      {isLoading ? (
        <div className="skeleton h-40 w-full rounded-2xl" />
      ) : latest ? (
        <Card className="overflow-hidden">
          <div className="relative bg-gradient-to-br from-brand-600 via-brand-600 to-brand-700 p-5 text-white sm:p-6">
            <div className="pointer-events-none absolute -right-10 -top-14 h-48 w-48 rounded-full bg-white/10 blur-2xl" />
            <div className="relative flex flex-wrap items-end justify-between gap-4">
              <div>
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-white/70">
                  Latest payslip
                </p>
                <p className="mt-1 text-[22px] font-extrabold tracking-[-0.03em]">
                  {banglaMonthLabel(latest.year, latest.month)}
                </p>
                <p className="mt-0.5 text-[12.5px] text-white/75">
                  Published {latest.publishedAt ? formatBanglaDate(latest.publishedAt.slice(0, 10)) : ''}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11.5px] font-semibold uppercase tracking-[0.1em] text-white/70">
                  Net payable
                </p>
                <p className="mt-1 text-[30px] font-extrabold leading-none tracking-[-0.035em] tabular-nums">
                  {formatBDT(latest.netPayable)}
                </p>
              </div>
            </div>
          </div>
          <CardBody>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Line icon={<Banknote className="h-3.5 w-3.5" />} label="Basic salary" value={formatBDT(latest.basicSalary)} />
              <Line icon={<TrendingUp className="h-3.5 w-3.5" />} label="Allowances" value={formatBDT(latest.allowances)} />
              <Line icon={<Coins className="h-3.5 w-3.5" />} label="Overtime" value={formatBDT(latest.overtimeAmount)} />
              <Line
                icon={<Gift className="h-3.5 w-3.5" />}
                label="Attendance bonus"
                value={latest.attendanceBonusApplied ? 'Applied' : '—'}
                muted={latest.attendanceBonusApplied}
              />
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-line pt-4">
              <p className="text-[12.5px] text-ink-muted">
                Present {latest.presentDays} of {latest.workingDays} scheduled days · {latest.lateDays} late
                {latest.lateDays === 1 ? '' : 's'}
              </p>
              <Button size="sm" variant="soft" onClick={() => setOpenId(latest.id)} icon={<Receipt className="h-3.5 w-3.5" />}>
                View payslip
              </Button>
            </div>
          </CardBody>
        </Card>
      ) : null}

      {/* History */}
      <Card>
        <CardHeader
          title="Payslip history"
          subtitle={`${items.length} published payslip${items.length === 1 ? '' : 's'}`}
          icon={<CalendarDays className="h-4 w-4" />}
        />
        <CardBody className="px-0 pb-0 sm:px-0">
          {isLoading ? (
            <div className="space-y-2 px-5 pb-5">
              {[0, 1, 2].map((i) => (
                <div key={i} className="skeleton h-14 w-full" />
              ))}
            </div>
          ) : !items.length ? (
            <EmptyState
              title="No payslips published yet"
              description="Your monthly payslip appears here as soon as HR publishes payroll."
              icon={<Receipt className="h-5 w-5" />}
            />
          ) : (
            <ul className="divide-y divide-line/70">
              {items.map((payslip) => (
                <motion.li key={payslip.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
                  <button
                    type="button"
                    onClick={() => setOpenId(payslip.id)}
                    className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition-colors hover:bg-canvas/60"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                      <Receipt className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block text-[13.5px] font-bold text-ink">
                        {banglaMonthLabel(payslip.year, payslip.month)}
                      </span>
                      <span className="block text-[12px] text-ink-muted">
                        {payslip.presentDays}/{payslip.workingDays} present · {payslip.lateDays} late
                      </span>
                    </span>
                    <span className="shrink-0 text-right">
                      <span className="block text-[14px] font-bold text-ink tabular-nums">
                        {formatBDT(payslip.netPayable)}
                      </span>
                      <span className="block text-[11px] text-ink-muted">Net payable</span>
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0 text-ink-faint" />
                  </button>
                </motion.li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      {/* Detail drawer */}
      <Drawer open={Boolean(openId)} onClose={() => setOpenId(null)} title="Payslip">
        {selected ? (
          <div className="space-y-5">
            <div className="rounded-2xl bg-brand-50 px-4 py-4 text-center">
              <p className="text-[12px] font-semibold uppercase tracking-[0.08em] text-brand-700">
                {banglaMonthLabel(selected.year, selected.month)}
              </p>
              <p className="mt-1.5 text-[28px] font-extrabold tracking-[-0.03em] text-brand-900 tabular-nums">
                {formatBDT(selected.netPayable)}
              </p>
              <p className="text-[12px] text-brand-700">Net payable</p>
            </div>

            <div className="overflow-hidden rounded-2xl border border-line">
              <Row label="Basic salary" value={formatBDT(selected.basicSalary)} />
              <Row label="Allowances" value={formatBDT(selected.allowances)} />
              <Row label="Approved overtime payment" value={formatBDT(selected.overtimeAmount)} />
              {selected.attendanceBonusApplied ? (
                <Row
                  label="Attendance bonus"
                  value="Applied · disclosed by HR"
                  muted
                />
              ) : null}
              <Row label="Deductions" value={`− ${formatBDT(selected.deductions)}`} negative />
              <Row label="Net payable" value={formatBDT(selected.netPayable)} strong />
            </div>

            <div className="grid grid-cols-3 gap-3">
              <MiniStat label="Scheduled days" value={String(selected.workingDays)} />
              <MiniStat label="Present" value={String(selected.presentDays)} />
              <MiniStat label="Late days" value={String(selected.lateDays)} />
            </div>

            <Button
              block
              variant="outline"
              onClick={() => window.print()}
              icon={<Printer className="h-4 w-4" />}
            >
              Print payslip
            </Button>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}

function Line({
  icon,
  label,
  value,
  muted = false,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className="rounded-xl border border-line/80 bg-canvas/50 px-3.5 py-3">
      <p className="flex items-center gap-1.5 text-[11.5px] font-semibold uppercase tracking-[0.05em] text-ink-muted">
        {icon}
        {label}
      </p>
      <p className={cn('mt-1 text-[16px] font-bold tracking-[-0.02em] text-ink tabular-nums', muted && 'text-[13px] font-semibold text-ink-soft')}>
        {value}
      </p>
    </div>
  );
}

function Row({
  label,
  value,
  strong = false,
  negative = false,
  muted = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
  negative?: boolean;
  muted?: boolean;
}) {
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0',
        strong && 'bg-canvas/70',
      )}
    >
      <span className={cn('text-[13px]', strong ? 'font-bold text-ink' : 'text-ink-soft')}>{label}</span>
      <span
        className={cn(
          'text-[13.5px] tabular-nums',
          strong ? 'font-extrabold text-ink' : muted ? 'font-semibold text-ink-muted' : negative ? 'font-bold text-danger' : 'font-semibold text-ink',
        )}
      >
        {value}
      </span>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-line px-3 py-2.5 text-center">
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.07em] text-ink-muted">{label}</p>
      <p className="mt-1 text-[17px] font-extrabold text-ink tabular-nums">{value}</p>
    </div>
  );
}
