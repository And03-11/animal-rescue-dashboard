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
