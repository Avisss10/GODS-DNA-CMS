import { Label } from '@/components/ui/label';
import type { ReportFormat } from '@/types/report.types';

interface FormatSelectProps {
  value: ReportFormat;
  onChange: (format: ReportFormat) => void;
  disabled?: boolean;
}

export default function FormatSelect({ value, onChange, disabled }: FormatSelectProps) {
  return (
    <div className="space-y-1.5">
      <Label>Format</Label>
      <select
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value as ReportFormat)}
        className="h-9 w-full rounded-md border border-input bg-transparent px-3 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
      >
        <option value="xlsx">Excel (.xlsx)</option>
        <option value="pdf">PDF (.pdf)</option>
      </select>
    </div>
  );
}