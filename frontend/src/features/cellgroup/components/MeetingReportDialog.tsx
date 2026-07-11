import { useEffect, useRef, useState } from 'react';
import { isAxiosError } from 'axios';
import { toast } from '@/lib/toast';
import { Loader2, Paperclip, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import ConfirmDialog from '@/components/ConfirmDialog';
import { getActiveMembersAtMeetingTime, getAbsensi, submitAbsensi, uploadMeetingPhotos } from '../cellgroup.api';
import type { ActiveMemberAtMeeting } from '@/types/cellgroup.types';

const MAX_PHOTOS = 5;
const ALLOWED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

interface MeetingReportDialogProps {
  open: boolean;
  meetingId: number;
  existingPhotoCount: number;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

// Absensi & foto meeting digabung jadi SATU alur (dikonfirmasi user):
// keduanya sama-sama "sekali setelah meeting selesai", isi lalu cek ulang
// di dialog konfirmasi sebelum benar-benar tersimpan. Dialog ini
// menggantikan AbsensiDialog + tombol unggah-foto terpisah yang lama.
export default function MeetingReportDialog({
  open,
  meetingId,
  existingPhotoCount,
  onOpenChange,
  onSuccess,
}: MeetingReportDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [members, setMembers] = useState<ActiveMemberAtMeeting[]>([]);
  const [hadirMap, setHadirMap] = useState<Record<number, boolean>>({});
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);

  const remainingSlots = Math.max(0, MAX_PHOTOS - existingPhotoCount - selectedFiles.length);

  // Pre-fill dari absensi yang sudah tersimpan (bukan selalu form kosong) —
  // ini akar bug "absensi tersimpan hilang begitu dialog dibuka lagi".
  useEffect(() => {
    if (!open) return;
    setSelectedFiles([]);
    setIsLoading(true);
    setLoadError(false);
    Promise.all([getActiveMembersAtMeetingTime(meetingId), getAbsensi(meetingId)])
      .then(([memberData, absensiData]) => {
        setMembers(memberData);
        const initial: Record<number, boolean> = {};
        memberData.forEach((m) => (initial[m.id] = false));
        absensiData.forEach((a) => {
          initial[a.jemaat_id] = a.hadir;
        });
        setHadirMap(initial);
      })
      .catch(() => setLoadError(true))
      .finally(() => setIsLoading(false));
  }, [open, meetingId]);

  function toggle(jemaatId: number) {
    setHadirMap((prev) => ({ ...prev, [jemaatId]: !prev[jemaatId] }));
  }

  function handleFilesSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    e.target.value = '';
    if (files.length === 0) return;

    const accepted: File[] = [];
    for (const file of files) {
      if (!ALLOWED_TYPES.includes(file.type)) {
        toast.error(`${file.name}: tipe file tidak didukung (hanya JPEG/PNG/WebP)`);
        continue;
      }
      if (file.size > 10 * 1024 * 1024) {
        toast.error(`${file.name}: ukuran terlalu besar (maksimal 10MB)`);
        continue;
      }
      accepted.push(file);
    }

    const overflow = accepted.length - remainingSlots;
    const toAdd = overflow > 0 ? accepted.slice(0, remainingSlots) : accepted;
    if (overflow > 0) {
      toast.error(`Hanya ${remainingSlots} slot foto tersisa — sebagian file tidak ditambahkan`);
    }
    setSelectedFiles((prev) => [...prev, ...toAdd]);
  }

  function removeSelectedFile(index: number) {
    setSelectedFiles((prev) => prev.filter((_, i) => i !== index));
  }

  const hadirCount = members.filter((m) => hadirMap[m.id]).length;
  const canSave = !isLoading && !loadError && (members.length > 0 || selectedFiles.length > 0);

  async function handleConfirmSave() {
    setIsSubmitting(true);
    try {
      if (members.length > 0) {
        const absensi = members.map((m) => ({ jemaatId: m.id, hadir: !!hadirMap[m.id] }));
        await submitAbsensi(meetingId, absensi);
      }
      if (selectedFiles.length > 0) {
        await uploadMeetingPhotos(meetingId, selectedFiles, setUploadProgress);
      }
      toast.success('Laporan meeting berhasil disimpan');
      setConfirmOpen(false);
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      const message = isAxiosError<{ message?: string }>(err) ? err.response?.data?.message : undefined;
      toast.error(message || 'Gagal menyimpan laporan meeting');
    } finally {
      setIsSubmitting(false);
      setUploadProgress(0);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Laporkan Meeting</DialogTitle>
            <DialogDescription>
              Tandai jemaat yang hadir dan lampirkan foto dokumentasi. Setelah disimpan &amp; dikonfirmasi, hanya
              Leader yang bisa mengubahnya lagi.
            </DialogDescription>
          </DialogHeader>

          {isLoading && (
            <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" /> Memuat data...
            </div>
          )}

          {!isLoading && loadError && (
            <p className="py-4 text-center text-sm text-destructive">Gagal memuat data meeting.</p>
          )}

          {!isLoading && !loadError && (
            <div className="space-y-4">
              <div>
                <p className="mb-1.5 text-sm font-medium text-slate-700">Absensi</p>
                {members.length === 0 ? (
                  <p className="py-2 text-sm text-slate-500">Tidak ada anggota pada saat meeting ini.</p>
                ) : (
                  <ul className="max-h-56 space-y-1 overflow-y-auto rounded-card border border-slate-200 p-1">
                    {members.map((m) => (
                      <li key={m.id}>
                        <label className="flex items-center justify-between gap-2 rounded-md px-2 py-2 text-sm hover:bg-slate-50">
                          <span className="flex items-center gap-2">
                            {m.nama}
                            {m.is_leader && <Badge className="text-[10px]">Leader</Badge>}
                          </span>
                          <input
                            type="checkbox"
                            checked={!!hadirMap[m.id]}
                            onChange={() => toggle(m.id)}
                            className="h-4 w-4"
                          />
                        </label>
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div>
                <div className="mb-1.5 flex items-center justify-between">
                  <p className="text-sm font-medium text-slate-700">Foto Dokumentasi</p>
                  <span className="text-xs text-slate-500">
                    {existingPhotoCount + selectedFiles.length}/{MAX_PHOTOS} foto
                  </span>
                </div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept="image/jpeg,image/png,image/webp"
                  className="hidden"
                  onChange={handleFilesSelected}
                />
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  disabled={remainingSlots === 0}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <Paperclip className="h-4 w-4" />
                  {remainingSlots === 0 ? 'Kuota foto penuh' : 'Pilih Foto'}
                </Button>

                {selectedFiles.length > 0 && (
                  <ul className="mt-2 space-y-1">
                    {selectedFiles.map((file, i) => (
                      <li
                        key={`${file.name}-${i}`}
                        className="flex items-center justify-between rounded-md bg-slate-50 px-2 py-1.5 text-xs text-slate-600"
                      >
                        <span className="truncate">{file.name}</span>
                        <button
                          type="button"
                          onClick={() => removeSelectedFile(i)}
                          className="shrink-0 text-slate-400 hover:text-destructive"
                          aria-label={`Hapus ${file.name} dari daftar unggah`}
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isSubmitting}>
              Batal
            </Button>
            <Button onClick={() => setConfirmOpen(true)} disabled={!canSave || isSubmitting}>
              Simpan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        open={confirmOpen}
        variant="default"
        title="Cek ulang sebelum simpan"
        description={`${hadirCount} dari ${members.length} anggota ditandai hadir.${
          selectedFiles.length > 0 ? ` ${selectedFiles.length} foto baru akan diunggah.` : ''
        } Data akan tersimpan dan hanya bisa diubah oleh Leader setelah ini. Yakin sudah benar?`}
        confirmLabel={isSubmitting ? `Menyimpan${uploadProgress > 0 ? ` (${uploadProgress}%)` : '...'}` : 'Ya, Simpan'}
        isSubmitting={isSubmitting}
        onOpenChange={setConfirmOpen}
        onConfirm={handleConfirmSave}
      />
    </>
  );
}
