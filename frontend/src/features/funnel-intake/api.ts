import apiClient from '../../api/axiosConfig';
import type {
  FunnelReviewAction,
  FunnelReviewEvidence,
  FunnelReviewItem,
} from './types';

export async function getPendingFunnelReviews(): Promise<{
  items: FunnelReviewItem[];
  total: number;
}> {
  const { data } = await apiClient.get('/funnel-intake/pending', {
    params: { limit: 100, offset: 0 },
  });
  return data;
}

export async function getFunnelReviewOptions(): Promise<{ stage_options: string[] }> {
  const { data } = await apiClient.get('/funnel-intake/options');
  return data;
}

export async function getFunnelReviewEvidence(
  recordId: string,
): Promise<FunnelReviewEvidence> {
  const { data } = await apiClient.get(`/funnel-intake/${recordId}/evidence`);
  return data;
}

export async function applyFunnelReviewAction(
  recordId: string,
  action: FunnelReviewAction,
): Promise<{ updated: FunnelReviewItem }> {
  const { data } = await apiClient.patch(`/funnel-intake/${recordId}`, action);
  return data;
}
