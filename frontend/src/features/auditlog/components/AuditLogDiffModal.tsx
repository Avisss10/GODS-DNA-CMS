import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';
import type { AuditLogItem } from '../auditlog.api';

interface AuditLogDiffModalProps {
  item: AuditLogItem | null;
  onOpenChange: (open: boolean) => void;
}

type DiffKind = 'same' | 'changed' | 'added' | 'removed';

interface DiffRow {
  key: string;
  beforeVal: unknown;
  afterVal: unknown;
  hasBefore: boolean;
  hasAfter: boolean;
  kind: DiffKind;
}

// Field sensitif jemaat yang di-flag backend dikirim sebagai string literal
// 'diubah' (bukan nilai asli) — ditampilkan apa adanya, tidak didekode lebih jauh.
function formatValue(value: unknown, has: boolean): string {
  if (!has) return '—';
  if (value === null) return 'null';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function computeDiffRows(
  before: Record<string, unknown> | null,
  after: Record<string, unknown> | null,
): DiffRow[] {
  const beforeObj = before ?? {};
  const afterObj = after ?? {};
  const keys = Array.from(new Set([...Object.keys(beforeObj), ...Object.keys(afterObj)])).sort();

  return keys.map((key) => {
    const hasBefore = Object.prototype.hasOwnProperty.call(beforeObj, key);
    const hasAfter = Object.prototype.hasOwnProperty.call(afterObj, key);
    const beforeVal = beforeObj[key];
    const afterVal = afterObj[key];

    let kind: DiffKind = 'same';
    if (hasBefore && !hasAfter) kind = 'removed';
    else if (!hasBefore && hasAfter) kind = 'added';
    else if (JSON.stringify(beforeVal) !== JSON.stringify(afterVal)) kind = 'changed';

    return { key, beforeVal, afterVal, hasBefore, hasAfter, kind };
  });
}

const ROW_CLASSES: Record<DiffKind, string> = {
  same: '',
  changed: 'bg-amber-50',
  added: 'bg-green-50',
  removed: 'bg-red-50',
};

const CELL_HIGHLIGHT: Record<DiffKind, string> = {
  same: 'text-slate-600',
  changed: 'font-medium text-amber-800',
  added: 'font-medium text-green-800',
  removed: 'font-medium text-red-800',
};

export default function AuditLogDiffModal({ item, onOpenChange }: AuditLogDiffModalProps) {
  const rows = item ? computeDiffRows(item.data_sebelum, item.data_sesudah) : [];
  const isCreateOnly = !!item && !item.data_sebelum && !!item.data_sesudah;
  const isDeleteOnly = !!item && !!item.data_sebelum && !item.data_sesudah;

  return (
    <Dialog open={!!item} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Detail Audit Log #{item?.id}</DialogTitle>
        </DialogHeader>

        {item && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2 text-sm">
              <Badge variant="secondary">{item.modul}</Badge>
              <Badge variant="secondary">{item.aksi}</Badge>
              {item.object_id != null && <Badge variant="outline">object_id: {item.object_id}</Badge>}
              <Badge variant={item.hmac_status === 'OK' ? 'secondary' : 'destructive'}>
                HMAC: {item.hmac_status}
              </Badge>
            </div>
            <p className="text-xs text-slate-500">
              User ID: {item.user_id ?? '—'} • {new Date(item.created_at).toLocaleString('id-ID')}
            </p>

            {isCreateOnly && (
              <p className="text-xs text-slate-500">Baris ini adalah data baru (belum ada data_sebelum).</p>
            )}
            {isDeleteOnly && (
              <p className="text-xs text-slate-500">Baris ini adalah penghapusan (tidak ada data_sesudah).</p>
            )}

            {rows.length === 0 ? (
              <p className="text-sm text-slate-500">Tidak ada detail data_sebelum/data_sesudah untuk baris ini.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="text-xs hover:bg-transparent">
                    <TableHead className="py-2">Field</TableHead>
                    <TableHead className="py-2">Sebelum</TableHead>
                    <TableHead className="py-2">Sesudah</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {rows.map((row) => (
                    <TableRow key={row.key} className={cn('text-xs', ROW_CLASSES[row.kind])}>
                      <TableCell className="whitespace-nowrap py-2 font-mono text-slate-700">{row.key}</TableCell>
                      <TableCell className={cn('max-w-xs whitespace-pre-wrap break-words py-2', CELL_HIGHLIGHT[row.kind])}>
                        {formatValue(row.beforeVal, row.hasBefore)}
                      </TableCell>
                      <TableCell className={cn('max-w-xs whitespace-pre-wrap break-words py-2', CELL_HIGHLIGHT[row.kind])}>
                        {formatValue(row.afterVal, row.hasAfter)}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}