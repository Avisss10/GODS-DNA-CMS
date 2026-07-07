import { Cell, Pie, PieChart, ResponsiveContainer, Tooltip } from 'recharts';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
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
    <div className="rounded-md border bg-white px-3 py-2 text-xs shadow-md">
      <p className="font-semibold text-slate-800">{name}</p>
      <p className="text-slate-600">
        {value} jemaat ({percent}%)
      </p>
    </div>
  );
}

export default function StatusChart({ data, isLoading, isError }: StatusChartProps) {
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
          <p className="py-8 text-center text-sm text-destructive">Gagal memuat data distribusi status</p>
        ) : total === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">Belum ada data jemaat</p>
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
                      <Cell key={entry.status} fill={STATUS_COLORS[entry.status]} />
                    ))}
                  </Pie>
                  <Tooltip content={<CustomTooltip />} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="mt-4 flex flex-wrap justify-center gap-3">
              {chartData.map((entry) => (
                <div key={entry.status} className="flex items-center gap-1.5 text-xs text-slate-600">
                  <span
                    className="h-2.5 w-2.5 rounded-full"
                    style={{ backgroundColor: STATUS_COLORS[entry.status] }}
                  />
                  {entry.name} ({entry.value})
                </div>
              ))}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}