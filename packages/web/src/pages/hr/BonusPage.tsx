import { useMemo, useState } from 'react';
import { Award, CheckCircle2, Coins, RefreshCw, XCircle } from 'lucide-react';
import { PageHeader } from '@/components/layout/TopBar';
import {
  Avatar,
  Badge,
  Button,
  Card,
  CardBody,
  CardHeader,
  EmptyState,
  Select,
  Skeleton,
  Table,
  TBody,
  TD,
  TH,
  THead,
  TR,
  useToast,
  type BadgeTone,
} from '@/components/ui';
import { api, ApiError } from '@/lib/api';
import { useHrBonus, useInvalidate } from '@/lib/queries';
import { banglaMonthLabel, dhakaDateKey } from '@bronee/shared';
import { formatBDT, formatNumber } from '@/lib/utils';

const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

export default function HrBonusPage() {
  const toast = useToast();
  const invalidate = useInvalidate();

  const todayKey = dhakaDateKey(new Date());
  const [year, setYear] = useState(Number(todayKey.slice(0, 4)));
  const [month, setMonth] = useState(Number(todayKey.slice(5, 7)));
  const [busy, setBusy] = useState(false);

  const bonusQuery = useHrBonus(year, month);

  const items = bonusQuery.data?.items ?? [];
  const policy = bonusQuery.data?.policy ?? [];
  const totalAmount = bonusQuery.data?.totalAmount ?? 0;

  const yearOptions = useMemo(() => {
    const current = new Date().getFullYear();
    const list: number[] = [];
    for (let offset = -3; offset <= 1; offset += 1) list.push(current + offset);
    return list;
  }, []);

  const monthOptions = useMemo(
    () => MONTH_NAMES.map((label, index) => ({ value: String(index + 1), label })),
    [],
  );

  async function recalculate() {
    setBusy(true);
    try {
      const response = await api.post<{ calculated: number }>('/hr/compensation/bonus/calculate', {
        year,
        month,
      });
      toast.success(
        'Bonus recalculated',
        `${response.calculated ?? 0} employee record${
          (response.calculated ?? 0) === 1 ? '' : 's'
        } updated for ${banglaMonthLabel(year, month)}.`,
      );
      invalidate([['hr', 'bonus'], ['hr', 'dashboard']]);
    } catch (caught) {
      const message =
        caught instanceof ApiError ? caught.message : 'The attendance bonus could not be recalculated.';
      toast.error('Recalculation failed', message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <PageHeader
        title="Attendance Bonus"
        description="The BRONEE attendance bonus ladder — how many late days cost an employee their bonus."
        action={
          <Button icon={<RefreshCw className="h-4 w-4" />} loading={busy} onClick={recalculate}>
            Recalculate
          </Button>
        }
      />

      <Card>
        <CardBody>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
            <div className="sm:w-48">
              <Select
                label="Month"
                value={String(month)}
                onChange={(event) => setMonth(Number(event.target.value))}
                options={monthOptions}
              />
            </div>
            <div className="sm:w-32">
              <Select
                label="Year"
                value={String(year)}
                onChange={(event) => setYear(Number(event.target.value))}
                options={yearOptions.map((value) => ({ value: String(value), label: String(value) }))}
              />
            </div>
            <p className="pb-2.5 text-[13px] font-semibold text-ink-soft">
              {banglaMonthLabel(year, month)}
            </p>
          </div>
        </CardBody>
      </Card>

      {/* ----------------------------------------------------------- policy ladder */}
      <div className="mt-4">
        <h2 className="mb-3 text-[13px] font-bold uppercase tracking-[0.08em] text-ink-muted">
          Policy ladder
        </h2>
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {(policy.length
            ? policy
            : [
                { maxLateDays: 0, amount: 2000, label: '0 late days' },
                { maxLateDays: 1, amount: 1500, label: '1 late day' },
                { maxLateDays: 2, amount: 1000, label: '2 late days' },
                { maxLateDays: 3, amount: 0, label: '3+ late days' },
              ]
          ).map((tier, index) => (
            <Card key={tier.label} className="p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink-muted">
                    {tier.label}
                  </p>
                  <p className="mt-1.5 text-[20px] font-extrabold tracking-[-0.02em] text-ink">
                    {formatBDT(tier.amount)}
                  </p>
                </div>
                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                  <Award className="h-4 w-4" />
                </span>
              </div>
              <p className="mt-2 text-[11.5px] text-ink-muted">
                {tier.amount > 0
                  ? `Still paid with up to ${tier.maxLateDays} late day${
                      tier.maxLateDays === 1 ? '' : 's'
                    }.`
                  : 'No bonus is paid once three late days are recorded.'}
              </p>
              {index === 0 ? (
                <Badge tone="brand" className="mt-2">
                  Best case
                </Badge>
              ) : null}
            </Card>
          ))}
        </div>
      </div>

      <Card className="mt-4">
        <CardHeader
          title={`Bonus snapshot · ${banglaMonthLabel(year, month)}`}
          subtitle="Recalculate to refresh late-day counts from the attendance records."
          icon={<Coins className="h-4 w-4" />}
          action={
            <span className="text-[13px] font-bold text-ink">
              Total {formatBDT(totalAmount)}
            </span>
          }
        />
        {bonusQuery.isLoading ? (
          <div className="space-y-3 p-5">
            {Array.from({ length: 6 }).map((_, index) => (
              <Skeleton key={index} className="h-12" />
            ))}
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            title="No bonus snapshot for this month"
            description="Recalculate to build the attendance bonus snapshot for every employee."
            icon={<Coins className="h-5 w-5" />}
            action={
              <Button icon={<RefreshCw className="h-4 w-4" />} loading={busy} onClick={recalculate}>
                Recalculate
              </Button>
            }
          />
        ) : (
          <Table>
            <THead>
              <TH>Employee</TH>
              <TH align="right">Late days</TH>
              <TH align="right">Bonus amount</TH>
              <TH>Eligibility</TH>
            </THead>
            <TBody>
              {items.map((row) => (
                <TR key={row.id}>
                  <TD>
                    <div className="flex items-center gap-3">
                      <Avatar name={row.employeeName} size="sm" />
                      <div className="min-w-0">
                        <p className="truncate font-semibold text-ink">{row.employeeName}</p>
                        <p className="text-[11.5px] text-ink-muted">{row.employeeCode}</p>
                      </div>
                    </div>
                  </TD>
                  <TD align="right">{formatNumber(row.lateDays)}</TD>
                  <TD align="right" className="whitespace-nowrap font-semibold text-ink">
                    {formatBDT(row.bonusAmount)}
                  </TD>
                  <TD>
                    <Badge tone={row.eligible ? ('success' as BadgeTone) : ('neutral' as BadgeTone)}>
                      {row.eligible ? (
                        <>
                          <CheckCircle2 className="h-3 w-3" />
                          Eligible
                        </>
                      ) : (
                        <>
                          <XCircle className="h-3 w-3" />
                          Not eligible
                        </>
                      )}
                    </Badge>
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
      </Card>

      <Card className="mt-4 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="text-[11.5px] font-bold uppercase tracking-[0.07em] text-ink-muted">
              Total bonus payout
            </p>
            <p className="mt-1 text-[24px] font-extrabold tracking-[-0.025em] text-ink">
              {formatBDT(totalAmount)}
            </p>
          </div>
          <p className="text-[12.5px] text-ink-muted">
            {formatNumber(items.filter((row) => row.eligible).length)} of {formatNumber(items.length)}{' '}
            employees qualify for the {banglaMonthLabel(year, month)} bonus.
          </p>
        </div>
      </Card>
    </div>
  );
}
