import { useEffect, useRef, useState } from 'react';
import type { ClipboardEvent } from 'react';
import apiClient from '../../api/axiosConfig';
import { validateDonorPhrases } from './donorPersonalization';
import type { DonorPhraseSettings } from './donorPersonalization';

interface Snapshot extends DonorPhraseSettings { content: string }
interface DetectionResult {
  status: 'matched' | 'already_configured' | 'not_found' | 'needs_review' | 'ai_unavailable';
  source: 'rules' | 'ai' | 'none';
  content: string;
  original_phrase: string | null;
  donor_singular_phrase: string | null;
  donor_plural_phrase: string | null;
  message: string;
}
export interface DonorDetectionNotice {
  severity: 'success' | 'info' | 'warning';
  message: string;
  originalPhrase?: string;
}
interface Options {
  content: string;
  settings: DonorPhraseSettings;
  enabled: boolean;
  onChange: (snapshot: Snapshot) => void;
}

function sameSnapshot(left: Snapshot, right: Snapshot) {
  return left.content === right.content && left.donor_singular_phrase === right.donor_singular_phrase
    && left.donor_plural_phrase === right.donor_plural_phrase;
}

export function useDonorHtmlDetection({ content, settings, enabled, onChange }: Options) {
  const [isDetecting, setIsDetecting] = useState(false);
  const [notice, setNotice] = useState<DonorDetectionNotice | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const snapshot = { content, donor_singular_phrase: settings.donor_singular_phrase, donor_plural_phrase: settings.donor_plural_phrase };
  const latest = useRef({ snapshot, enabled, onChange });
  latest.current = { snapshot, enabled, onChange };
  const generation = useRef(0);
  const request = useRef<{ controller: AbortController; snapshot: Snapshot } | null>(null);
  const undoChange = useRef<{ before: Snapshot; after: Snapshot } | null>(null);

  function reset() {
    generation.current += 1;
    request.current?.controller.abort();
    request.current = null;
    undoChange.current = null;
    setCanUndo(false);
    setNotice(null);
    setIsDetecting(false);
  }

  useEffect(() => () => { generation.current += 1; request.current?.controller.abort(); }, []);
  useEffect(() => {
    const snapshot = latest.current.snapshot;
    if (!enabled || (request.current && !sameSnapshot(request.current.snapshot, snapshot))) {
      reset();
    } else if (undoChange.current && !sameSnapshot(undoChange.current.after, snapshot)) {
      undoChange.current = null;
      setCanUndo(false);
      setNotice(null);
    }
  }, [content, settings.donor_singular_phrase, settings.donor_plural_phrase, enabled]);

  async function detect(snapshot = latest.current.snapshot) {
    reset();
    if (!latest.current.enabled || !snapshot.content.trim()) return;
    const id = generation.current;
    const controller = new AbortController();
    request.current = { controller, snapshot };
    setIsDetecting(true);
    try {
      const { data } = await apiClient.post<DetectionResult>('/templates/detect-donor-phrase', {
        content: snapshot.content,
      }, { signal: controller.signal, timeout: 20_000 });
      if (id !== generation.current || controller.signal.aborted || !latest.current.enabled
        || !sameSnapshot(snapshot, latest.current.snapshot)) return;
      request.current = null;
      if (data.status === 'matched') {
        if (!data.original_phrase || !data.donor_singular_phrase || !data.donor_plural_phrase) throw new Error('Incomplete detection');
        const after = { content: data.content, donor_singular_phrase: data.donor_singular_phrase,
          donor_plural_phrase: data.donor_plural_phrase };
        if (validateDonorPhrases(after) || !/{{\s*day\s*}}/i.test(after.content)) throw new Error('Invalid detection');
        undoChange.current = { before: snapshot, after };
        latest.current.snapshot = after;
        latest.current.onChange(after);
        setCanUndo(true);
        setNotice({ severity: 'success', message: data.message, originalPhrase: data.original_phrase });
      } else {
        setNotice({ severity: ['needs_review', 'ai_unavailable'].includes(data.status) ? 'warning' : 'info', message: data.message });
      }
    } catch {
      if (id === generation.current && !controller.signal.aborted) {
        setNotice({ severity: 'warning', message: 'Donor detection is unavailable. Your pasted HTML was kept; retry or configure the phrases manually.' });
      }
    } finally {
      if (id === generation.current) { request.current = null; setIsDetecting(false); }
    }
  }

  function onPaste(event: ClipboardEvent<HTMLElement>) {
    if (!enabled || !(event.target instanceof HTMLTextAreaElement)) return;
    const pasted = event.clipboardData.getData('text/plain');
    if (!/<[a-z!][\s\S]*>/i.test(pasted)) return;
    const field = event.target;
    const content = field.value.slice(0, field.selectionStart) + pasted + field.value.slice(field.selectionEnd);
    event.preventDefault();
    const snapshot = { ...latest.current.snapshot, content };
    latest.current.snapshot = snapshot;
    latest.current.onChange(snapshot);
    void detect(snapshot);
  }

  function undo() {
    const change = undoChange.current;
    if (!change || !sameSnapshot(latest.current.snapshot, change.after)) return;
    reset();
    latest.current.snapshot = change.before;
    latest.current.onChange(change.before);
    setNotice({ severity: 'info', message: 'Automatic donor setup undone. Original HTML and phrases restored.' });
  }

  return { isDetecting, notice, canUndo, onPaste, reset, detect: () => void detect(), undo };
}
