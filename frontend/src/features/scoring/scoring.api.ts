import { api } from '@/api/client';

export interface RunScoringResult {
  message: string;
  processed: number;
  skipped: number;
}

export async function runScoring(): Promise<RunScoringResult> {
  const { data } = await api.post<RunScoringResult>('/scoring/run');
  return data;
}   