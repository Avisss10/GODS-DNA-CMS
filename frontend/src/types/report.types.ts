export type ReportFormat = 'xlsx' | 'pdf';

export type ReportJenis = 'jemaat' | 'event' | 'cg' | 'volunteer' | 'analytics';

// Hasil generate laporan: dua bentuk, dibedakan lewat properti `async`.
export interface ReportSyncResult {
  async: false;
}

export interface ReportAsyncResult {
  async: true;
  token: string;
  message: string;
}

export type ReportGenerateResult = ReportSyncResult | ReportAsyncResult;

export type JemaatReportMode = 'ringkas' | 'detail';

export interface JemaatReportParams {
  format: ReportFormat;
  // Kalau diisi: hanya jemaat dengan ID ini yang di-export (dari checkbox
  // terpilih di JemaatListPage atau tombol export di JemaatDetailPage).
  // Kosong/undefined = export semua jemaat (perilaku lama).
  ids?: number[];
  // 'ringkas' (default) = field jemaat saja; 'detail' = tambah kolom
  // Cell Group & Volunteer, sama seperti info di JemaatDetailPage.
  mode?: JemaatReportMode;
  // Ringkasan filter yang sedang aktif saat export ditekan (mis. "Status:
  // Aktif; Pencarian: \"budi\"") — dicetak di blok metadata file, backend
  // tidak perlu paham semantiknya.
  filterDescription?: string;
}

export interface EventReportParams {
  eventId?: number;
  startDate?: string;
  endDate?: string;
  format: ReportFormat;
  filterDescription?: string;
}

export interface CgReportParams {
  cgId?: number;
  jemaatId?: number;
  startDate?: string;
  endDate?: string;
  format: ReportFormat;
  filterDescription?: string;
}

export interface VolunteerReportParams {
  jemaatId?: number;
  eventId?: number;
  startDate?: string;
  endDate?: string;
  format: ReportFormat;
  filterDescription?: string;
}

export interface AnalyticsReportParams {
  bulan: number;
  format: ReportFormat;
  filterDescription?: string;
}

export interface ReportColumnDef {
  header: string;
  key: string;
}

// Bentuk respons endpoint /reports/{jenis}/preview — kolom & isi baris
// identik dengan yang akan diexport (backend memakai formatter yang
// sama), hanya dibatasi PREVIEW_LIMIT baris; `total` tetap mencerminkan
// seluruh data yang match filter.
export interface ReportPreviewResult {
  columns: ReportColumnDef[];
  rows: Record<string, string | number | boolean | null>[];
  total: number;
}