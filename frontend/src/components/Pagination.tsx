import { Button } from '@/components/ui/button';

interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  itemLabel: string;
  totalItems: number;
}

export default function Pagination({ page, totalPages, onPageChange, itemLabel, totalItems }: PaginationProps) {
  return (
    <div className="flex items-center justify-between pt-2 text-sm text-slate-600 print:hidden">
      <span>
        Halaman {page} dari {totalPages} ({totalItems} {itemLabel})
      </span>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => onPageChange(page - 1)}>
          Sebelumnya
        </Button>
        <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => onPageChange(page + 1)}>
          Berikutnya
        </Button>
      </div>
    </div>
  );
}
