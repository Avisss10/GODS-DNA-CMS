import { cn } from '@/lib/utils';
import { EVENT_STATUS_LABELS } from '../event.utils';
import type { EventStatus } from '@/types/event.types';

interface StatusPipelineProps {
  currentStatus: EventStatus;
}

interface Node {
  key: EventStatus;
  x: number;
  y: number;
}

// Posisi node jalur utama (DRAFT -> PUBLISHED -> AKTIF -> SELESAI -> DIARSIPKAN).
// PUBLISHED->DIARSIPKAN digambar terpisah sebagai lengkungan di atas jalur
// utama, supaya terlihat sebagai jalur alternatif, bukan langkah ke-6.
const NODES: Node[] = [
  { key: 'DRAFT', x: 70, y: 130 },
  { key: 'PUBLISHED', x: 250, y: 130 },
  { key: 'AKTIF', x: 430, y: 130 },
  { key: 'SELESAI', x: 610, y: 130 },
  { key: 'DIARSIPKAN', x: 790, y: 130 },
];

const STRAIGHT_EDGES: [EventStatus, EventStatus][] = [
  ['DRAFT', 'PUBLISHED'],
  ['PUBLISHED', 'AKTIF'],
  ['AKTIF', 'SELESAI'],
  ['SELESAI', 'DIARSIPKAN'],
];

export default function StatusPipeline({ currentStatus }: StatusPipelineProps) {
  const nodeByKey = new Map(NODES.map((n) => [n.key, n]));
  const published = nodeByKey.get('PUBLISHED')!;
  const diarsipkan = nodeByKey.get('DIARSIPKAN')!;

  return (
    <div className="overflow-x-auto">
      <svg viewBox="0 0 860 190" className="h-auto min-w-[720px] w-full">
        <defs>
          <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="fill-slate-300" />
          </marker>
          <marker id="arrow-active" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
            <path d="M0,0 L10,5 L0,10 z" className="fill-modul-event" />
          </marker>
        </defs>

        {/* Jalur lurus utama */}
        {STRAIGHT_EDGES.map(([from, to]) => {
          const a = nodeByKey.get(from)!;
          const b = nodeByKey.get(to)!;
          const passed = NODES.findIndex((n) => n.key === currentStatus) > NODES.findIndex((n) => n.key === from);
          return (
            <line
              key={`${from}-${to}`}
              x1={a.x + 32}
              y1={a.y}
              x2={b.x - 32}
              y2={b.y}
              className={passed || currentStatus === to ? 'stroke-modul-event' : 'stroke-slate-300'}
              strokeWidth={2}
              markerEnd={passed || currentStatus === to ? 'url(#arrow-active)' : 'url(#arrow)'}
            />
          );
        })}

        {/* Jalur cabang: PUBLISHED -> DIARSIPKAN, melengkung di atas jalur utama */}
        <path
          d={`M ${published.x + 10} ${published.y - 28} C ${published.x + 120} 10, ${diarsipkan.x - 120} 10, ${diarsipkan.x - 10} ${diarsipkan.y - 28}`}
          fill="none"
          className="stroke-slate-300"
          strokeDasharray="5 4"
          strokeWidth={2}
          markerEnd="url(#arrow)"
        />
        <text x={(published.x + diarsipkan.x) / 2} y={20} textAnchor="middle" className="fill-slate-400 text-[11px]">
          Arsip langsung (dilewati)
        </text>

        {/* Node */}
        {NODES.map((n) => {
          const isCurrent = n.key === currentStatus;
          return (
            <g key={n.key}>
              <circle
                cx={n.x}
                cy={n.y}
                r={30}
                className={cn(
                  isCurrent ? 'fill-modul-event/10 stroke-modul-event' : 'fill-white stroke-slate-300',
                )}
                strokeWidth={isCurrent ? 3 : 2}
              />
              <text
                x={n.x}
                y={n.y + 4}
                textAnchor="middle"
                className={cn('text-[11px] font-semibold', isCurrent ? 'fill-modul-event' : 'fill-slate-500')}
              >
                {n.key.slice(0, 4)}
              </text>
              <text x={n.x} y={n.y + 48} textAnchor="middle" className="fill-slate-600 text-xs font-medium">
                {EVENT_STATUS_LABELS[n.key]}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}