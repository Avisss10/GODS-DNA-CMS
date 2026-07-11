import { Label } from '@/components/ui/label';
import type { JemaatReportMode } from '@/types/report.types';

interface JemaatReportFieldsProps {
  mode: JemaatReportMode;
  onModeChange: (mode: JemaatReportMode) => void;
  disabled?: boolean;
}

// Field 'mode' bersama, dipakai JemaatReportForm (entry point umum,
// tanpa ids) dan JemaatExportDialog (entry point bulk-selection dari
// JemaatListPage, dengan ids) — supaya keduanya konsisten.
export default function JemaatReportFields({ mode, onModeChange, disabled }: JemaatReportFieldsProps) {
  return (
    <div className="space-y-1.5">
      <Label>Cakupan Data</Label>
      <select
        value={mode}
        disabled={disabled}
        onChange={(e) => onModeChange(e.target.value as JemaatReportMode)}
        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="ringkas">Data jemaat saja</option>
        <option value="detail">Detail lengkap (termasuk Cell Group & Volunteer)</option>
      </select>
    </div>
  );
}
