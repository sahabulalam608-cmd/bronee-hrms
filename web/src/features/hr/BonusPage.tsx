import { useMemo, useState } from 'react';
import { Award, BadgeDollarSign, CircleDollarSign, Gift, TrendingDown, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import { useAsync } from '@/lib/hooks';
import { currentMonthKey, formatMonthKey } from '@/lib/time';
import { formatMoney, formatNumber } from '@/lib/format';
import { Alert, Select } from '@/components/ui/forms';
import { Badge, PageHeader, SectionCard, StatCard } from '@/components/ui/primitives';
import { DataTable, DistributionBar, FilterBar } from '@/components/ui/data';
import { ATTENDANCE_BONUS_TIERS } from '@shared/constants';

type BonusRow = {
  employeeId: string;
  employeeName: string;
  departmentName: string;
  lateDays: number;
  amount: number;
  tier: string;
};

export function BonusPage() {
  const [month, setMonth] = useState(currentMonthKey());

  const { data, loading, error } = useAsync(() => api.hrBonus(month), [month]);

  const months = useMemo(() => {
    const list: string[] = [];
    const base = new Date();
    for (let i = 0; i < 12; i += 1) {
      const date = new Date(base.getFullYear(), base.getMonth() - i, 1);
      list.push(`${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`);
    }
    return list;
  }, []);

  const rows = useMemo<BonusRow[]>(() => (data ?? []) as BonusRow[], [data]);

  const stats = useMemo(() => {
    const total = rows.reduce((sum, row) => sum + row.amount, 0);
    return {
      total,
      perfect: rows.filter((row) => row.lateDays === 0).length,
      zeroBonus: rows.filter((row) => row.lateDays >= 3).length,
      average: rows.length ? Math.round(total / rows.length) : 0,
    };
  }, [rows]);

  const tierDistribution = useMemo(
    () =>
      ATTENDANCE_BONUS_TIERS.map((tier) => ({
        label: tier.label,
        value: rows.filter((row) => row.tier === tier.label).length,
      })).filter((entry) => entry.value > 0),
    [rows],
  );

  const columns = [
    {
      key: 'employeeName',
      header: 'Employee',
      render: (row: BonusRow) => (
        <span className="text-[13.5px] font-medium text-ink">{row.employeeName}</span>
      ),
    },
    { key: 'departmentName', header: 'Department' },
    {
      key: 'lateDays',
      header: 'Late days',
      align: 'right' as const,
      render: (row: BonusRow) => (
        <span className="text-[13px] text-ink-muted">{row.lateDays}</span>
      ),
    },
    {
      key: 'tier',
      header: 'Bonus tier',
      render: (row: BonusRow) => (
        <Badge tone={row.lateDays === 0 ? 'ok' : row.lateDays >= 3 ? 'bad' : 'warn'}>{row.tier}</Badge>
      ),
    },
    {
      key: 'amount',
      header: 'Bonus amount',
      align: 'right' as const,
      render: (row: BonusRow) => (
        <span className="font-mono text-[13.5px] font-semibold tabular-nums text-ink">
          {formatMoney(row.amount)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Attendance Bonus Calculation"
        subtitle="Monthly attendance bonus calculated from HR approved attendance records."
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          label="Total bonus payout"
          value={formatMoney(stats.total)}
          tone="brand"
          icon={<CircleDollarSign size={17} />}
          hint={`${formatMonthKey(month)} · ${rows.length} employees`}
        />
        <StatCard
          label="Perfect attendance"
          value={formatNumber(stats.perfect)}
          tone="ok"
          icon={<Award size={17} />}
          hint="Zero late days this month"
        />
        <StatCard
          label="Average bonus"
          value={formatMoney(stats.average)}
          tone="info"
          icon={<BadgeDollarSign size={17} />}
        />
        <StatCard
          label="Three or more late days"
          value={formatNumber(stats.zeroBonus)}
          tone="bad"
          icon={<TrendingDown size={17} />}
          hint="Bonus eligibility lost"
        />
      </div>

      {error && (
        <Alert tone="bad" title="Could not load the bonus calculation">
          {error}
        </Alert>
      )}

      <SectionCard
        title="Bonus calculation"
        subtitle={`${formatMonthKey(month)} · calculated from approved attendance records`}
        padded={false}
      >
        <div className="border-b border-line p-4">
          <FilterBar>
            <div className="w-[175px]">
              <Select
                label="Month"
                value={month}
                options={months.map((value) => ({ value, label: formatMonthKey(value) }))}
                onChange={(e) => setMonth(e.target.value)}
              />
            </div>
          </FilterBar>
        </div>
        <DataTable<BonusRow>
          columns={columns}
          rows={rows}
          rowKey={(row) => row.employeeId}
          loading={loading}
          emptyTitle="No bonus records for this month"
          emptyDescription="The bonus is calculated automatically once attendance records are approved."
          emptyIcon={<Gift size={22} />}
        />
      </SectionCard>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        <SectionCard title="Bonus policy" subtitle="BRONEE Limited attendance bonus tiers">
          <table className="w-full border-collapse">
            <thead>
              <tr className="table-head">
                <th className="px-4 py-3 text-left">Monthly late days</th>
                <th className="px-4 py-3 text-left">Tier</th>
                <th className="px-4 py-3 text-right">Attendance bonus</th>
              </tr>
            </thead>
            <tbody>
              {ATTENDANCE_BONUS_TIERS.map((tier) => (
                <tr key={tier.label} className="table-row">
                  <td className="table-cell">
                    {tier.maxLateDays === 0
                      ? '0 days'
                      : tier.maxLateDays >= 9999
                        ? '3 or more days'
                        : `${tier.minLateDays} day${tier.minLateDays === 1 ? '' : 's'}`}
                  </td>
                  <td className="table-cell">{tier.label}</td>
                  <td className="table-cell text-right font-mono font-semibold tabular-nums">
                    {formatMoney(tier.amount)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </SectionCard>

        <SectionCard
          title="Employees per tier"
          subtitle="Distribution of the monthly bonus calculation"
        >
          {tierDistribution.length === 0 ? (
            <p className="py-6 text-center text-[13px] text-ink-faint">
              No tier data available for this month.
            </p>
          ) : (
            <DistributionBar items={tierDistribution} />
          )}
          <p className="mt-5 flex items-center gap-1.5 text-[12px] text-ink-faint">
            <TrendingUp size={13} />
            A single late day reduces the bonus sharply — three or more late days mean no attendance bonus.
          </p>
        </SectionCard>
      </div>
    </div>
  );
}
