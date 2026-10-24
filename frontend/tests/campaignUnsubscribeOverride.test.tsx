import React, { act, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CampaignSetupStep } from '../src/features/email-sender/CampaignSetupStep';
import { ContentReviewStep } from '../src/features/email-sender/ContentReviewStep';
import { hydrateCampaignWizardDraft } from '../src/features/email-sender/campaignWizardState';
import type { CampaignWizardDraft } from '../src/features/email-sender/campaignWizardState';

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });
const theme = createTheme();
let root: Root;
let container: HTMLDivElement;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('campaign-only unsubscribe override', () => {
  it('defaults unchecked, retains the recording notice, and shows a warning only when enabled', () => {
    const onChange = vi.fn();
    function Setup() {
      const [draft, setDraft] = useState(hydrateCampaignWizardDraft({ source_type: 'csv' }));
      return (
        <CampaignSetupStep
          draft={draft}
          senderOptions={{ groups: [], accounts: [] }}
          loadingSenders={false}
          onDraftChange={(patch) => {
            onChange(patch);
            setDraft((current) => ({ ...current, ...patch }));
          }}
        />
      );
    }
    act(() => root.render(<ThemeProvider theme={theme}><Setup /></ThemeProvider>));
    const label = Array.from(container.querySelectorAll('label')).find((node) => (
      node.textContent?.includes('Send to unsubscribed contacts (this campaign only)')
    ));
    expect(label).toBeTruthy();
    const checkbox = label!.querySelector<HTMLInputElement>('input[type="checkbox"]')!;
    expect(checkbox.checked).toBe(false);
    expect(container.textContent).toContain('Unsubscribe requests are still recorded.');
    expect(container.querySelector('[role="alert"]')).toBeNull();
    act(() => checkbox.click());
    expect(onChange).toHaveBeenLastCalledWith({ sendToUnsubscribed: true });
    expect(checkbox.checked).toBe(true);
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('ignore unsubscribe requests');
    expect(container.querySelector('#unsubscribe-override-help')).not.toBeNull();
    act(() => checkbox.click());
    expect(onChange).toHaveBeenLastCalledWith({ sendToUnsubscribed: false });
    expect(container.querySelector('[role="alert"]')).toBeNull();
  });

  it.each([false, true])('review surfaces the actual override state: %s', (enabled) => {
    const draft: CampaignWizardDraft = hydrateCampaignWizardDraft({
      source_type: 'csv', id: 'Campaign_review', send_to_unsubscribed: enabled,
    });
    act(() => root.render(
      <ThemeProvider theme={theme}>
        <ContentReviewStep
          draft={draft}
          templates={[]}
          viewMode="code"
          sendingTest={false}
          onDraftChange={vi.fn()}
          onViewModeChange={vi.fn()}
          onLoadTemplate={vi.fn()}
          onSaveTemplate={vi.fn().mockResolvedValue(undefined)}
          onSendTest={vi.fn().mockResolvedValue(undefined)}
        />
      </ThemeProvider>,
    ));
    expect(container.textContent).toContain(enabled
      ? 'Send anyway — records retained'
      : 'Excluded from sending');
    expect(Boolean(container.querySelector('[role="alert"]'))).toBe(enabled);
  });
});
