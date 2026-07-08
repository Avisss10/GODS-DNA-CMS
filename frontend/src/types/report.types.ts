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

export interface JemaatReportParams {
  format: ReportFormat;
}

export interface EventReportParams {
  eventId?: number;
  startDate?: string;
  endDate?: string;
  format: ReportFormat;
}

export interface CgReportParams {
  cgId?: number;
  jemaatId?: number;
  startDate?: string;
  endDate?: string;
  format: ReportFormat;
}

export interface VolunteerReportParams {
  jemaatId?: number;
  eventId?: number;
  startDate?: string;
  endDate?: string;
  format: ReportFormat;
}

export interface AnalyticsReportParams {
  bulan: number;
  format: ReportFormat;
}