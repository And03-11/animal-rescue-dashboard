export const DEFAULT_DONOR_SINGULAR_PHRASE = 'donation you made {{when}}';
export const DEFAULT_DONOR_PLURAL_PHRASE = '{{count}} donations you’ve made over the past week';

export interface DonorPhrasePreset {
  id: string;
  phrase: string;
}

// Ordered by frequency in the reviewed DNR introductions. Store the phrase itself
// so existing templates and campaign snapshots remain independent of this list.
export const DONOR_SINGULAR_PRESETS: readonly DonorPhrasePreset[] = [
  { id: 'donation-when', phrase: 'donation {{when}}' },
  { id: 'donation-you-made', phrase: DEFAULT_DONOR_SINGULAR_PHRASE },
  { id: 'gift-when', phrase: 'gift {{when}}' },
  { id: 'donation-you-gave', phrase: 'donation you gave {{when}}' },
];

// Plural equivalents of the observed wording, including the approved default.
export const DONOR_PLURAL_PRESETS: readonly DonorPhrasePreset[] = [
  { id: 'donations-past-week', phrase: '{{count}} donations in the past week' },
  { id: 'donations-youve-made', phrase: DEFAULT_DONOR_PLURAL_PHRASE },
  { id: 'gifts-past-week', phrase: '{{count}} gifts in the past week' },
];

export interface DonorPhraseSettings {
  donor_singular_phrase: string;
  donor_plural_phrase: string;
}

export const defaultDonorPhrases: DonorPhraseSettings = {
  donor_singular_phrase: DEFAULT_DONOR_SINGULAR_PHRASE,
  donor_plural_phrase: DEFAULT_DONOR_PLURAL_PHRASE,
};

export function hasDayToken(html: string): boolean {
  return /{{\s*day\s*}}/i.test(html);
}

export function validateDonorPhrases(settings: DonorPhraseSettings): string | null {
  for (const phrase of [settings.donor_singular_phrase, settings.donor_plural_phrase]) {
    if (typeof phrase !== 'string' || !phrase.trim() || phrase.length > 1000) return 'Enter a phrase of 1–1000 characters for each case.';
    for (const match of phrase.matchAll(/{{\s*([^{}]+?)\s*}}/g)) {
      if (!['when', 'count'].includes(match[1].trim().toLowerCase())) {
        return 'Use only {{when}} and {{count}} inside donor phrases.';
      }
    }
    if (/{{|}}/.test(phrase.replace(/{{\s*([^{}]+?)\s*}}/g, ''))) {
      return 'Close each donor variable with two braces.';
    }
  }
  return null;
}

const small = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine',
  'ten', 'eleven', 'twelve', 'thirteen', 'fourteen', 'fifteen', 'sixteen', 'seventeen', 'eighteen', 'nineteen'];
const tens = ['', '', 'twenty', 'thirty', 'forty', 'fifty', 'sixty', 'seventy', 'eighty', 'ninety'];

export function numberInWords(value: number): string {
  if (!Number.isInteger(value) || value < 0) throw new Error('Donation numbers must be non-negative integers.');
  if (value < 20) return small[value];
  if (value < 100) return tens[Math.floor(value / 10)] + (value % 10 ? `-${small[value % 10]}` : '');
  if (value < 1000) return `${small[Math.floor(value / 100)]} hundred${value % 100 ? ` ${numberInWords(value % 100)}` : ''}`;
  if (value < 1_000_000) return `${numberInWords(Math.floor(value / 1000))} thousand${value % 1000 ? ` ${numberInWords(value % 1000)}` : ''}`;
  return String(value);
}

export function donorSamplePhrase(settings: DonorPhraseSettings, count = 1, daysAgo = 3): string {
  if (validateDonorPhrases(settings)) return '';
  const phrase = count === 1 ? settings.donor_singular_phrase : settings.donor_plural_phrase;
  const when = daysAgo === 0 ? 'today' : daysAgo === 1 ? 'yesterday' : `${numberInWords(daysAgo)} days ago`;
  return phrase.replace(/{{\s*(when|count)\s*}}/gi, (_, key: string) => (
    key.toLowerCase() === 'when' ? when : numberInWords(count)
  ));
}

export function previewDonorHtml(html: string, settings: DonorPhraseSettings, count = 1, daysAgo = 3): string {
  const phrase = donorSamplePhrase(settings, count, daysAgo);
  const escaped = phrase.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#x27;');
  return html.replace(/{{\s*day\s*}}/gi, () => escaped);
}
