import {
  Table,
  TableBody,
  TableCell,
  TableEmpty,
  TableHead,
  TableHeader,
  TableRow,
  TableSkeletonRows,
} from '@/components/ui/table';
import type { ReportColumnDef } from '@/types/report.types';

interface ReportPreviewTableProps {
  columns: ReportColumnDef[];
  rows: Record<string, string | number | boolean | null>[];
  isLoading: boolean;
  isError: boolean;
  total: number;
}

// Preview data laporan sebelum diexport — kolom & isi baris identik
// dengan hasil export (backend memakai formatter yang sama), hanya
// dibatasi beberapa baris pertama supaya user bisa review dulu.
export default function ReportPreviewTable({ columns, rows, isLoading, isError, total }: ReportPreviewTableProps) {
  const skeletonCols = columns.length || 4;

  return (
    <div className="space-y-1.5">
      <Table>
        {columns.length > 0 && (
          <TableHeader>
            <TableRow className="hover:bg-transparent">
              {columns.map((col) => (
                <TableHead key={col.key}>{col.header}</TableHead>
              ))}
            </TableRow>
          </TableHeader>
        )}
        <TableBody>
          {isLoading && <TableSkeletonRows rows={5} columns={skeletonCols} />}

          {!isLoading && isError && (
            <TableEmpty
              colSpan={skeletonCols}
              title="Gagal memuat pratinjau data"
              description="Coba ubah filter atau muat ulang halaman."
            />
          )}

          {!isLoading && !isError && rows.length === 0 && (
            <TableEmpty colSpan={skeletonCols} title="Tidak ada data yang cocok dengan filter ini" />
          )}

          {!isLoading &&
            !isError &&
            rows.map((row, i) => (
              <TableRow key={i}>
                {columns.map((col) => (
                  <TableCell key={col.key}>{String(row[col.key] ?? '-')}</TableCell>
                ))}
              </TableRow>
            ))}
        </TableBody>
      </Table>

      {!isLoading && !isError && total > 0 && (
        <p className="text-xs text-slate-500">
          Menampilkan {rows.length} dari {total} data — export untuk mengunduh semua data sesuai filter.
        </p>
      )}
    </div>
  );
}
