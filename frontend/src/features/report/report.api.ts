import { api } from '@/api/client';
import { isAxiosError } from 'axios';
import type {
  AnalyticsReportParams,
  CgReportParams,
  EventReportParams,
  JemaatReportMode,
  JemaatReportParams,
  ReportGenerateResult,
  ReportPreviewResult,
  VolunteerReportParams,
} from '@/types/report.types';

// Nama file fallback kalau header Content-Disposition tidak ada/tidak bisa
// diparse (seharusnya selalu ada dari backend, ini hanya jaga-jaga).
function fallbackFileName(ext: string) {
  return `laporan-${Date.now()}.${ext}`;
}

// Backend selalu mengirim attachment; filename asli (UUID.ext) ada di
// header Content-Disposition, mis: attachment; filename="xxxx.xlsx"
function extractFileName(contentDisposition: string | undefined, fallbackExt: string): string {
  if (!contentDisposition) return fallbackFileName(fallbackExt);
  const match = /filename="?([^"]+)"?/.exec(contentDisposition);
  return match?.[1] ?? fallbackFileName(fallbackExt);
}

// Trigger download browser dari Blob, memakai elemen <a> sementara.
function triggerBlobDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

// Inti dari kontrak BAGIAN 7: kita TIDAK tahu apakah response akan berupa
// file stream (sync) atau JSON { async, token, message } (async) sebelum
// response datang — jadi request SELALU pakai responseType: 'blob', lalu
// dibedakan lewat Content-Type response:
// - application/json → parse blob jadi JSON manual (kasus async)
// - xlsx/pdf content-type → treat sebagai file, trigger download (kasus sync)
async function requestReport(
  url: string,
  params: Record<string, string | number | undefined>,
  format: string,
): Promise<ReportGenerateResult> {
  const response = await api.get(url, {
    params,
    responseType: 'blob',
  });

  const contentType = String(response.headers['content-type'] ?? '');

  if (contentType.includes('application/json')) {
    const text = await (response.data as Blob).text();
    const json = JSON.parse(text) as { async: true; token: string; message: string };
    return json;
  }

  const contentDisposition = response.headers['content-disposition'];
  const fileName = extractFileName(
    contentDisposition ? String(contentDisposition) : undefined,
    format,
  );
  triggerBlobDownload(response.data as Blob, fileName);
  return { async: false };
}

function cleanParams<T extends object>(params: T): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  for (const [key, value] of Object.entries(params as Record<string, unknown>)) {
    if (value !== undefined && value !== null && value !== '') {
      out[key] = value as string | number;
    }
  }
  return out;
}

export async function generateJemaatReport(params: JemaatReportParams): Promise<ReportGenerateResult> {
  const { ids, ...rest } = params;
  const cleaned = cleanParams(rest);
  if (ids && ids.length > 0) {
    cleaned.ids = ids.join(',');
  }
  return requestReport('/reports/jemaat', cleaned, params.format);
}

export async function generateEventReport(params: EventReportParams): Promise<ReportGenerateResult> {
  return requestReport('/reports/event', cleanParams(params), params.format);
}

export async function generateCgReport(params: CgReportParams): Promise<ReportGenerateResult> {
  return requestReport('/reports/cg', cleanParams(params), params.format);
}

export async function generateVolunteerReport(params: VolunteerReportParams): Promise<ReportGenerateResult> {
  return requestReport('/reports/volunteer', cleanParams(params), params.format);
}

export async function generateAnalyticsReport(params: AnalyticsReportParams): Promise<ReportGenerateResult> {
  return requestReport('/reports/analytics', cleanParams(params), params.format);
}

// ── Preview (dry-run) — kolom & data identik dengan hasil generate,
// tapi hanya PREVIEW_LIMIT baris & tidak memicu audit log/notifikasi/
// file. Respons JSON biasa (bukan blob), dipakai untuk review sebelum
// user benar-benar klik Export.
export async function previewJemaatReport(params: { ids?: number[]; mode?: JemaatReportMode }): Promise<ReportPreviewResult> {
  const cleaned = cleanParams({ mode: params.mode });
  if (params.ids && params.ids.length > 0) {
    cleaned.ids = params.ids.join(',');
  }
  const { data } = await api.get<ReportPreviewResult>('/reports/jemaat/preview', { params: cleaned });
  return data;
}

export async function previewEventReport(
  params: { eventId?: number; startDate?: string; endDate?: string },
): Promise<ReportPreviewResult> {
  const { data } = await api.get<ReportPreviewResult>('/reports/event/preview', { params: cleanParams(params) });
  return data;
}

export async function previewCgReport(
  params: { cgId?: number; jemaatId?: number; startDate?: string; endDate?: string },
): Promise<ReportPreviewResult> {
  const { data } = await api.get<ReportPreviewResult>('/reports/cg/preview', { params: cleanParams(params) });
  return data;
}

export async function previewVolunteerReport(
  params: { jemaatId?: number; eventId?: number; startDate?: string; endDate?: string },
): Promise<ReportPreviewResult> {
  const { data } = await api.get<ReportPreviewResult>('/reports/volunteer/preview', { params: cleanParams(params) });
  return data;
}

export async function previewAnalyticsReport(params: { bulan: number }): Promise<ReportPreviewResult> {
  const { data } = await api.get<ReportPreviewResult>('/reports/analytics/preview', { params: cleanParams(params) });
  return data;
}

// Karena semua request report pakai responseType: 'blob', error dari
// backend (mis. 400 format invalid, 404 token invalid) juga datang
// sebagai Blob JSON di err.response.data, BUKAN objek biasa — perlu
// diparse manual untuk mendapatkan pesan error asli backend.
export async function extractErrorMessage(err: unknown, fallback: string): Promise<string> {
  if (isAxiosError(err) && err.response?.data instanceof Blob) {
    try {
      const text = await err.response.data.text();
      const json = JSON.parse(text) as { message?: string };
      return json.message ?? fallback;
    } catch {
      return fallback;
    }
  }
  if (isAxiosError(err) && typeof err.response?.data === 'object') {
    const msg = (err.response?.data as { message?: string })?.message;
    if (msg) return msg;
  }
  return fallback;
}

// GET /api/reports/download/:token — publik (tidak perlu withCredentials
// khusus), token sekali pakai & berlaku 15 menit. 404 kalau token
// tidak valid/sudah dipakai/kadaluarsa — dilempar sebagai AxiosError,
// caller tangani via isAxiosError.
export async function downloadReport(token: string): Promise<void> {
  const response = await api.get(`/reports/download/${token}`, {
    responseType: 'blob',
  });
  const contentDisposition = response.headers['content-disposition'];
  const fileName = extractFileName(
    contentDisposition ? String(contentDisposition) : undefined,
    'xlsx',
  );
  triggerBlobDownload(response.data as Blob, fileName);
}