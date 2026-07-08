import { useState } from 'react';
import { Bookmark, Plus, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SavedFilterChip } from '@/hooks/useSavedFilters';

interface SavedFiltersBarProps<T> {
  savedFilters: SavedFilterChip<T>[];
  hasActiveFilter: boolean;
  onSave: (name: string) => void;
  onApply: (filters: T) => void;
  onRemove: (id: string) => void;
}

export default function SavedFiltersBar<T>({
  savedFilters,
  hasActiveFilter,
  onSave,
  onApply,
  onRemove,
}: SavedFiltersBarProps<T>) {
  const [saveDialogOpen, setSaveDialogOpen] = useState(false);
  const [name, setName] = useState('');

  function handleSave() {
    const trimmed = name.trim();
    if (!trimmed) return;
    onSave(trimmed);
    setName('');
    setSaveDialogOpen(false);
  }

  if (savedFilters.length === 0 && !hasActiveFilter) return null;

  return (
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Button variant="outline" size="sm" onClick={() => setSaveDialogOpen(true)} disabled={!hasActiveFilter}>
        <Bookmark className="h-3.5 w-3.5" />
        Simpan Filter Ini
      </Button>

      {savedFilters.map((f) => (
        <span
          key={f.id}
          className="flex items-center gap-1 rounded-pill border border-slate-200 bg-card py-1 pl-3 pr-1.5 text-xs"
        >
          <button
            type="button"
            onClick={() => onApply(f.filters)}
            className="font-medium text-slate-700 hover:text-accent-from"
          >
            {f.name}
          </button>
          <button
            type="button"
            onClick={() => onRemove(f.id)}
            className="rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-red-600"
            aria-label={`Hapus filter ${f.name}`}
          >
            <X className="h-3 w-3" />
          </button>
        </span>
      ))}

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Simpan Filter Ini</DialogTitle>
          </DialogHeader>
          <div>
            <Label htmlFor="filter-name">Nama Pintasan</Label>
            <Input
              id="filter-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="mis. Jemaat Kurang Aktif"
              className="mt-1"
              onKeyDown={(e) => e.key === 'Enter' && handleSave()}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSaveDialogOpen(false)}>
              Batal
            </Button>
            <Button onClick={handleSave} disabled={!name.trim()}>
              <Plus className="h-4 w-4" />
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}