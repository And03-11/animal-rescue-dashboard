import { act, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { ThemeProvider, createTheme } from '@mui/material/styles';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import apiClient from '../src/api/axiosConfig';
import { useDonorHtmlDetection } from '../src/features/email-sender/useDonorHtmlDetection';
import { defaultDonorPhrases } from '../src/features/email-sender/donorPersonalization';
import { DonorDetectionFeedback } from '../src/components/DonorDetectionFeedback';
import TemplatesPage from '../src/pages/TemplatesPage';

const html = '<table style="width:600px"><tr><td>Thank you for your donation three days ago.</td></tr></table>';
const configured = html.replace('donation three days ago', '{{Day}}');
const detection = { status: 'matched', source: 'rules', content: configured, original_phrase: 'donation three days ago',
  donor_singular_phrase: 'donation {{when}}', donor_plural_phrase: '{{count}} donations in the past week', message: 'Donor wording configured.' };
let container: HTMLDivElement;
let root: ReturnType<typeof createRoot>;
const theme = createTheme();

beforeEach(() => {
  globalThis.IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container);
});
afterEach(() => { act(() => root.unmount()); container.remove(); vi.restoreAllMocks(); });

function paste(field: HTMLTextAreaElement, text: string) {
  field.setSelectionRange(0, field.value.length);
  const event = new Event('paste', { bubbles: true, cancelable: true });
  Object.defineProperty(event, 'clipboardData', { value: { getData: () => text } });
  field.dispatchEvent(event);
}

function type(field: HTMLTextAreaElement | HTMLInputElement, value: string) {
  const prototype = field instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(prototype, 'value')!.set!.call(field, value);
  field.dispatchEvent(new Event('input', { bubbles: true }));
}

function Harness() {
  const [form, setForm] = useState({ content: '', ...defaultDonorPhrases, name: 'Original name' });
  const controller = useDonorHtmlDetection({ content: form.content, settings: form, enabled: true,
    onChange: (patch) => setForm((current) => ({ ...current, ...patch })),
  });
  return <>
    <input aria-label="Name" value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
    <textarea aria-label="HTML" value={form.content} onPaste={controller.onPaste}
      onChange={(event) => { controller.reset(); setForm({ ...form, content: event.target.value }); }} />
    <output>{form.donor_singular_phrase} | {form.donor_plural_phrase}</output>
    <DonorDetectionFeedback {...controller} onDetect={controller.detect} onUndo={controller.undo} />
  </>;
}

function renderHarness() {
  act(() => root.render(<ThemeProvider theme={theme}><Harness /></ThemeProvider>));
  return container.querySelector('textarea')!;
}

describe('automatic donor HTML detection', () => {
  it('automatically detects pasted HTML, configures both phrases and can undo without overwriting a name edit', async () => {
    const post = vi.spyOn(apiClient, 'post').mockResolvedValue({ data: detection });
    const field = renderHarness();
    await act(async () => paste(field, html));
    expect(post).toHaveBeenCalledWith('/templates/detect-donor-phrase', { content: html }, expect.objectContaining({ signal: expect.any(AbortSignal) }));
    expect(field.value).toBe(configured);
    expect(container.querySelector('output')?.textContent).toBe('donation {{when}} | {{count}} donations in the past week');
    act(() => type(container.querySelector('input')!, 'Renamed while reviewing'));
    const undo = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Undo')!;
    act(() => undo.click());
    expect(field.value).toBe(html);
    expect(container.querySelector('output')?.textContent).toBe(`${defaultDonorPhrases.donor_singular_phrase} | ${defaultDonorPhrases.donor_plural_phrase}`);
    expect(container.querySelector('input')!.value).toBe('Renamed while reviewing');
  });

  it('does not apply an outdated response after the HTML is edited', async () => {
    let resolve!: (value: { data: typeof detection }) => void;
    vi.spyOn(apiClient, 'post').mockImplementation(() => new Promise((done) => { resolve = done; }));
    const field = renderHarness();
    await act(async () => paste(field, html));
    expect(container.textContent).toContain('Detecting donor wording');
    act(() => type(field, '<p>New content being edited</p>'));
    await act(async () => resolve({ data: detection }));
    expect(field.value).toBe('<p>New content being edited</p>');
    expect(container.textContent).not.toContain('Donor wording configured.');
    expect(container.textContent).not.toContain('Undo');
  });

  it('keeps pasted HTML on a provider failure and allows a retry', async () => {
    const post = vi.spyOn(apiClient, 'post').mockRejectedValueOnce(new Error('private diagnostic')).mockResolvedValueOnce({ data: detection });
    const field = renderHarness();
    await act(async () => paste(field, html));
    expect(field.value).toBe(html);
    expect(container.textContent).toContain('Your pasted HTML was kept');
    expect(container.textContent).not.toContain('private diagnostic');
    const retry = Array.from(container.querySelectorAll('button')).find((button) => button.textContent === 'Detect donor wording')!;
    await act(async () => retry.click());
    expect(post).toHaveBeenCalledTimes(2);
    expect(field.value).toBe(configured);
  });

  it('keeps configured phrases when {{Day}} is already present', async () => {
    vi.spyOn(apiClient, 'post').mockResolvedValue({ data: { ...detection, status: 'already_configured', content: configured,
      donor_singular_phrase: null, donor_plural_phrase: null, message: 'Existing phrases kept.' } });
    const field = renderHarness();
    await act(async () => paste(field, configured));
    expect(field.value).toBe(configured);
    expect(container.querySelector('output')?.textContent).toBe(`${defaultDonorPhrases.donor_singular_phrase} | ${defaultDonorPhrases.donor_plural_phrase}`);
    expect(container.textContent).not.toContain('Undo');
  });

  it('does not send normal typing or a plain-text paste to the detection API', async () => {
    const post = vi.spyOn(apiClient, 'post');
    const field = renderHarness();
    act(() => type(field, html));
    await act(async () => paste(field, 'another ordinary word'));
    expect(post).not.toHaveBeenCalled();
  });

  it('waits for automatic setup before saving a template and saves the exact result', async () => {
    vi.spyOn(apiClient, 'get').mockResolvedValue({ data: [] });
    let resolve!: (value: { data: typeof detection }) => void;
    const post = vi.spyOn(apiClient, 'post').mockImplementation((url) => url === '/templates/detect-donor-phrase'
      ? new Promise((done) => { resolve = done; }) : Promise.resolve({ data: { id: 1 } }));
    await act(async () => root.render(<ThemeProvider theme={theme}><TemplatesPage /></ThemeProvider>));
    const create = Array.from(container.querySelectorAll('button')).find((button) => button.textContent?.includes('Create HTML template'))!;
    act(() => create.click());
    const dialog = document.querySelector('[role="dialog"]')!;
    const name = dialog.querySelector<HTMLInputElement>('input')!;
    act(() => type(name, 'Donor thanks'));
    const field = dialog.querySelector<HTMLTextAreaElement>('textarea[placeholder="Paste the complete email HTML here…"]')!;
    await act(async () => paste(field, html));
    const save = Array.from(dialog.querySelectorAll('button')).find((button) => button.textContent === 'Create template')!;
    expect(save.disabled).toBe(true);
    await act(async () => resolve({ data: detection }));
    expect(save.disabled).toBe(false);
    expect(field.value).toBe(configured);
    await act(async () => save.click());
    expect(post).toHaveBeenLastCalledWith('/templates', {
      name: 'Donor thanks', content: configured,
      donor_singular_phrase: detection.donor_singular_phrase, donor_plural_phrase: detection.donor_plural_phrase,
    });
  });
});
