import { locale } from '../i18n';

export const DAY = 24 * 3600 * 1000;

export function pct(x: number, digits = 0): string {
  return `${(x * 100).toFixed(digits)}%`;
}

export function score(w: number, d: number, n: number): number {
  return n ? (w + d / 2) / n : 0;
}

export function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(locale(), { day: '2-digit', month: 'short', year: 'numeric' });
}

export function plural(n: number, word: string, pluralWord = word + 's'): string {
  return `${n} ${n > 1 ? pluralWord : word}`;
}

export function downloadText(filename: string, text: string, type = 'text/plain') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function readFileText(file: File): Promise<string> {
  return file.text();
}

/** Lets the browser paint between chunks of heavy synchronous work. */
export const yieldToUi = () => new Promise<void>((r) => setTimeout(r, 0));
