import { useState } from 'react';
import { PieChart as PieChartIcon } from 'lucide-react';
import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import EmptyState from '@/components/EmptyState';
import ErrorState from '@/components/ErrorState';
import { cn } from '@/lib/utils';
import type { JemaatListItem, StatusKeaktifan } from '@/features/jemaat/jemaat.api';
import { STATUS_COLORS, STATUS_LABELS, countByStatusKeaktifan } from './dashboard.utils';

interface StatusChartProps {
  data: JemaatListItem[] | undefined;
  isLoading: boolean;
  isError: boolean;
}

interface ChartDatum {
  status: StatusKeaktifan;
  name: string;
  value: number;
  total: number;
}

interface CustomTooltipProps {
  active?: boolean;
  payload?: { payload: ChartDatum }[];
}

function CustomTooltip({ active, payload }: CustomTooltipProps) {
  if (!active || !payload?.length) return null;
  const { name, value, total } = payload[0].payload;
  const percent = total > 0 ? Math.round((value / total) * 100) : 0;
  return (
    <div className="rounded-md border border-slate-200/70 bg-white px-3 py-2 text-xs shadow-popover">
      <p className="font-semibold text-slate-800">{name}</p>
      <p className="text-slate-600">
        {value} jemaat ({percent}%)
      </p>
    </div>
  );
}

export default function StatusChart({ data, isLoading, isError }: StatusChartProps) {
  const [hoveredStatus, setHoveredStatus] = useState<StatusKeaktifan | null>(null);
  const counts = data ? countByStatusKeaktifan(data) : null;
  const total = counts ? Object.values(counts).reduce((a, b) => a + b, 0) : 0;
  const statuses = Object.keys(STATUS_LABELS) as StatusKeaktifan[];
  const chartData: ChartDatum[] = counts
    ? statuses.map((status) => ({
        status,
        name: STATUS_LABELS[status],
        value: counts[status],
        total,
      }))
    : [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Distribusi Status Keaktifan Jemaat</CardTitle>
      </CardHeader>
      <CardContent>
        {isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : isError ? (
          <ErrorState message="Gagal memuat data distribusi status" className="border-none bg-transparent py-8" />
        ) : total === 0 ? (
          <EmptyState icon={PieChartIcon} title="Belum ada data jemaat" className="border-none py-8" />
        ) : (
          <>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={chartData}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    innerRadius={55}
                    outerRadius={85}
                    paddingAngle={2}
                  >
                    {chartData.map((entry) => (
                      <Cell
                        key={entry.status}
                        fill={STATUS_COLORS[entry.status]}
                        opacity={hoveredStatus && hoveredStatus !== entry.status ? 0.3 : 1}
                        className="transition-smooth"
                      />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              {chartData.map((entry) => (
                <button
                  type="button"
                  key={entry.status}
                  onMouseEnter={() => setHoveredStatus(entry.status)}
                  onMouseLeave={() => setHoveredStatus(null)}
                  className={cn(
                    'flex items-center gap-1.5 rounded-pill px-2 py-1 text-xs text-slate-600 transition-smooth',
                    hoveredStatus === entry.status ? 'bg-slate-100 font-medium text-slate-800' : 'hover:bg-slate-50',
                  )}
                >
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: STATUS_COLORS[entry.status] }}
                  />
                  {entry.name} ({entry.value})
                </button>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}