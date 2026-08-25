import type { CampaignSource } from './types.ts';

export type CampaignSaveOperation =
  | 'create-campaign'
  | 'update-campaign'
  | 'upload-csv'
  | 'save-mapping';

export interface CampaignSavePlanInput {
  existingCampaignId?: string | null;
  sourceType: CampaignSource;
  hasCsvFile: boolean;
  hasMapping: boolean;
}

/** Return the ordered API operations for one complete campaign save. */
export function planCampaignSave(input: CampaignSavePlanInput): CampaignSaveOperation[] {
  const operations: CampaignSaveOperation[] = [
    input.existingCampaignId ? 'update-campaign' : 'create-campaign',
  ];
  if (input.sourceType === 'csv' && input.hasCsvFile) operations.push('upload-csv');
  if (input.sourceType === 'csv' && input.hasMapping) operations.push('save-mapping');
  return operations;
}

export interface CampaignSaveExecutionContext {
  operation: CampaignSaveOperation;
  campaignId: string | null;
  signal: AbortSignal;
}

export interface CampaignSaveExecutionInput {
  operations: readonly CampaignSaveOperation[];
  initialCampaignId?: string | null;
  signal: AbortSignal;
  runOperation: (context: CampaignSaveExecutionContext) => Promise<string | void>;
  publishCampaignId?: (campaignId: string) => void;
}

function throwIfSaveAborted(signal: AbortSignal): void {
  if (!signal.aborted) return;
  throw signal.reason instanceof Error
    ? signal.reason
    : new DOMException('Campaign save was aborted.', 'AbortError');
}

/**
 * Execute one save as an atomic wizard session. A newly created ID stays local
 * until upload/mapping complete, so a parent ID publisher cannot abort mid-flow.
 */
export async function executeCampaignSavePlan(
  input: CampaignSaveExecutionInput,
): Promise<string> {
  let campaignId = input.initialCampaignId ?? null;

  for (const operation of input.operations) {
    throwIfSaveAborted(input.signal);
    if (operation !== 'create-campaign' && !campaignId) {
      throw new Error('Campaign ID is required to complete this save.');
    }

    const createdCampaignId = await input.runOperation({
      operation,
      campaignId,
      signal: input.signal,
    });
    throwIfSaveAborted(input.signal);

    if (operation === 'create-campaign') {
      if (typeof createdCampaignId !== 'string' || !createdCampaignId.trim()) {
        throw new Error('Campaign save did not return an ID.');
      }
      campaignId = createdCampaignId;
    }
  }

  if (!campaignId) throw new Error('Campaign save did not return an ID.');
  input.publishCampaignId?.(campaignId);
  return campaignId;
}
export interface WizardSessionHandle {
  generation: number;
  signal: AbortSignal;
}

/** Own one abortable wizard generation and reject every obsolete async completion. */
export class WizardSessionLifecycle {
  private generation = 0;
  private controller: AbortController | null = null;

  begin(): WizardSessionHandle {
    this.controller?.abort();
    this.generation += 1;
    this.controller = new AbortController();
    return { generation: this.generation, signal: this.controller.signal };
  }

  abort(): void {
    this.controller?.abort();
    this.controller = null;
    this.generation += 1;
  }

  isCurrent(handle: WizardSessionHandle): boolean {
    return !handle.signal.aborted
      && handle.generation === this.generation
      && handle.signal === this.controller?.signal;
  }
}
