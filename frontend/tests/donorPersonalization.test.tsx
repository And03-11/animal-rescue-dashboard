import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DonorPersonalizationSection } from '../src/components/DonorPersonalizationSection';
import {
  DONOR_PLURAL_PRESETS, DONOR_SINGULAR_PRESETS,
  defaultDonorPhrases, donorSamplePhrase, previewDonorHtml, validateDonorPhrases,
} from '../src/features/email-sender/donorPersonalization';
import type { DonorPhraseSettings } from '../src/features/email-sender/donorPersonalization';
import { buildCampaignPayload, hydrateCampaignWizardDraft, validateWizardStep } from '../src/features/email-sender/campaignWizardState';

describe('donor template personalization', () => {
  it('renders singular, plural and custom wording without changing other HTML', () => {
    const html = '<table style="width:600px"><tr><td>{{Day}} / {{day}}</td></tr></table>';
    expect(previewDonorHtml(html, defaultDonorPhrases)).toBe(
      '<table style="width:600px"><tr><td>donation you made three days ago / donation you made three days ago</td></tr></table>',
    );
    expect(donorSamplePhrase(defaultDonorPhrases, 3)).toBe('three donations you’ve made over the past week');
    expect(donorSamplePhrase({ ...defaultDonorPhrases, donor_singular_phrase: 'gift you gave {{when}}' }, 1, 1)).toBe('gift you gave yesterday');
    expect(donorSamplePhrase(defaultDonorPhrases, 1, 0)).toBe('donation you made today');
    const templateForm = { ...defaultDonorPhrases, id: 1, name: 'Thanks', content: '<p>{{Day}}</p>' };
    expect(previewDonorHtml(templateForm.content, templateForm)).toBe('<p>donation you made three days ago</p>');
  });

  it('escapes phrase text and rejects unknown or incomplete variables', () => {
    expect(previewDonorHtml('<b>{{Day}}</b>', { ...defaultDonorPhrases, donor_singular_phrase: 'gift <3 & love' })).toBe('<b>gift &lt;3 &amp; love</b>');
    expect(validateDonorPhrases({ ...defaultDonorPhrases, donor_plural_phrase: '{{Day}}' })).toContain('only');
    expect(validateDonorPhrases({ ...defaultDonorPhrases, donor_plural_phrase: '{{count}' })).toContain('braces');
  });

  it('renders every selectable phrase through the existing campaign payload and HTML renderer', () => {
    for (const singular of DONOR_SINGULAR_PRESETS) {
      for (const plural of DONOR_PLURAL_PRESETS) {
        const settings = { donor_singular_phrase: singular.phrase, donor_plural_phrase: plural.phrase };
        expect(validateDonorPhrases(settings)).toBeNull();
        const draft = hydrateCampaignWizardDraft({ source_type: 'airtable', segment: 'dnr', html_body: '<b>{{Day}}</b>', ...settings });
        const payload = buildCampaignPayload(draft);
        expect(payload.donor_singular_phrase).toBe(singular.phrase);
        expect(payload.donor_plural_phrase).toBe(plural.phrase);
        expect(previewDonorHtml(draft.htmlBody, settings, 1)).not.toMatch(/{{/);
        expect(previewDonorHtml(draft.htmlBody, settings, 3)).not.toMatch(/{{/);
      }
    }
  });

  it('persists the template phrase snapshot in campaign payloads and edit hydration', () => {
    const draft = hydrateCampaignWizardDraft({ source_type: 'airtable', segment: 'dnr', html_body: '{{Day}}',
      donor_singular_phrase: 'gift you gave {{when}}', donor_plural_phrase: '{{count}} gifts' });
    const payload = buildCampaignPayload(draft);
    expect(payload.donor_singular_phrase).toBe('gift you gave {{when}}');
    expect(payload.donor_plural_phrase).toBe('{{count}} gifts');
    expect(validateWizardStep(2, draft)).toBeNull();
    expect(validateWizardStep(2, { ...draft, segment: 'standard' })).toContain('Donors');
    expect(validateWizardStep(2, { ...draft, sourceType: 'csv' })).toContain('Donors');
    expect(validateWizardStep(2, { ...draft, htmlBody: '{{count}}' })).toContain('Put {{Day}}');
  });
});

describe('donor personalization form', () => {
  let container: HTMLDivElement;
  let root: ReturnType<typeof createRoot>;
  beforeEach(() => {
    globalThis.IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
  });
  afterEach(() => { act(() => root.unmount()); container.remove(); });

  function selectOption(index: number, text: string) {
    const field = container.querySelectorAll('[role="combobox"]')[index];
    act(() => field.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: 0 })));
    const option = Array.from(document.querySelectorAll<HTMLElement>('[role="option"]'))
      .find((item) => item.textContent === text);
    expect(option, `Option ${text}`).toBeTruthy();
    act(() => option!.click());
  }

  function editCustomPhrase(index: number, value: string) {
    const field = container.querySelectorAll<HTMLTextAreaElement>('textarea:not([aria-hidden="true"])')[index];
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!;
    act(() => {
      setter.call(field, value);
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
  }

  function mountForm(initial: DonorPhraseSettings = defaultDonorPhrases) {
    const onChange = vi.fn();
    function Form() {
      const [settings, setSettings] = useState(initial);
      const [count, setCount] = useState(1);
      return <DonorPersonalizationSection settings={settings} sampleCount={count} onSampleCountChange={setCount}
        onChange={(patch) => { onChange(patch); setSettings((current) => ({ ...current, ...patch })); }} />;
    }
    act(() => root.render(<ThemeProvider theme={createTheme()}><Form /></ThemeProvider>));
    return onChange;
  }

  it('selects singular and plural wording independently and updates the preview', () => {
    const onChange = mountForm();
    expect(container.textContent).toContain('Phrase for one donation');
    expect(container.textContent).toContain('Phrase for multiple donations');
    expect(container.querySelectorAll('[role="combobox"]').length).toBe(2);
    expect(container.querySelectorAll('textarea:not([aria-hidden="true"])').length).toBe(0);
    expect(container.textContent).toContain('donation you made three days ago');
    selectOption(0, 'gift {{when}}');
    expect(onChange).toHaveBeenLastCalledWith({ donor_singular_phrase: 'gift {{when}}' });
    selectOption(1, '{{count}} gifts in the past week');
    expect(onChange).toHaveBeenLastCalledWith({ donor_plural_phrase: '{{count}} gifts in the past week' });
    const plural = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Three donations')!;
    act(() => plural.click());
    expect(container.textContent).toContain('three gifts in the past week');
    expect(plural.getAttribute('aria-pressed')).toBe('true');
  });

  it('keeps a manual draft when switching to a preset and back to Other', () => {
    const onChange = mountForm();
    selectOption(0, 'Other — write your own');
    expect(container.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe(defaultDonorPhrases.donor_singular_phrase);
    editCustomPhrase(0, 'gift you gave {{when}}');
    expect(onChange).toHaveBeenLastCalledWith({ donor_singular_phrase: 'gift you gave {{when}}' });
    expect(container.textContent).toContain('gift you gave three days ago');
    selectOption(0, 'donation {{when}}');
    expect(container.querySelector('textarea')).toBeNull();
    selectOption(0, 'Other — write your own');
    expect(container.querySelector<HTMLTextAreaElement>('textarea')!.value).toBe('gift you gave {{when}}');
    expect(onChange).toHaveBeenLastCalledWith({ donor_singular_phrase: 'gift you gave {{when}}' });
    editCustomPhrase(0, '{{unknown}}');
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Use only');
  });

  it('loads custom wording as Other without rewriting it, then follows a different template', () => {
    const onChange = vi.fn();
    const custom = { donor_singular_phrase: 'gift you gave {{when}}', donor_plural_phrase: '{{count}} gifts you have given' };
    const render = (settings: DonorPhraseSettings, disabled = false) => {
      act(() => root.render(<ThemeProvider theme={createTheme()}>
        <DonorPersonalizationSection settings={settings} sampleCount={1} onSampleCountChange={vi.fn()}
          onChange={onChange} disabled={disabled} />
      </ThemeProvider>));
    };
    render(custom);
    expect(Array.from(container.querySelectorAll('[role="combobox"]')).map((field) => field.textContent)).toEqual([
      'Other — write your own', 'Other — write your own',
    ]);
    expect(Array.from(container.querySelectorAll<HTMLTextAreaElement>('textarea:not([aria-hidden="true"])')).map((field) => field.value))
      .toEqual([custom.donor_singular_phrase, custom.donor_plural_phrase]);
    expect(onChange).not.toHaveBeenCalled();
    render(defaultDonorPhrases, true);
    expect(container.querySelector('textarea')).toBeNull();
    expect(container.querySelectorAll('[role="combobox"][aria-disabled="true"]').length).toBe(2);
    expect(onChange).not.toHaveBeenCalled();
  });
});
