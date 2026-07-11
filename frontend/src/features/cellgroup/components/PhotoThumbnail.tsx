import { useEffect, useState } from 'react';
import { Loader2, Trash2 } from 'lucide-react';
import { getPhotoBlobUrl } from '../cellgroup.api';

interface PhotoThumbnailProps {
  photoId: number;
  onClick: (url: string) => void;
  onDelete: () => void;
  isDeleting: boolean;
  /** Hapus foto tersimpan = mengedit laporan meeting — hanya Leader (backend 403 kalau tidak). */
  canDelete?: boolean;
}

// Foto diambil lewat fetch+blob (bukan <img src> langsung ke endpoint API) —
// lihat catatan di cellgroup.api.ts soal cookie cross-origin.
export default function PhotoThumbnail({ photoId, onClick, onDelete, isDeleting, canDelete = true }: PhotoThumbnailProps) {
  const [url, setUrl] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    let objectUrl: string | null = null;
    setIsLoading(true);
    setFailed(false);

    getPhotoBlobUrl(photoId)
      .then((u) => {
        if (cancelled) {
          URL.revokeObjectURL(u);
          return;
        }
        objectUrl = u;
        setUrl(u);
      })
      .catch(() => setFailed(true))
      .finally(() => setIsLoading(false));

    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [photoId]);

  return (
    <div className="group relative aspect-square overflow-hidden rounded-card border border-slate-200 bg-slate-50">
      {isLoading && (
        <div className="flex h-full w-full items-center justify-center">
          <Loader2 className="h-5 w-5 animate-spin text-slate-300" />
        </div>
      )}
      {!isLoading && failed && (
        <div className="flex h-full w-full items-center justify-center text-center text-xs text-slate-400">
          Gagal memuat
        </div>
      )}
      {!isLoading && !failed && url && (
        <>
          <button type="button" onClick={() => onClick(url)} className="h-full w-full">
            <img src={url} alt="Foto meeting" className="h-full w-full object-cover" />
          </button>
          {canDelete && (
            <button
              type="button"
              onClick={onDelete}
              disabled={isDeleting}
              className="absolute right-1 top-1 rounded-full bg-black/60 p-1.5 text-white opacity-0 transition-opacity group-hover:opacity-100 disabled:opacity-50"
              aria-label="Hapus foto"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </>
      )}
    </div>
  );
}