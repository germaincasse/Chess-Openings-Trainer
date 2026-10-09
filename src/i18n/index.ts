import { useSyncExternalStore } from 'react';
import analysis from './locales/analysis';
import appearance from './locales/appearance';
import common from './locales/common';
import data from './locales/data';
import explorer from './locales/explorer';
import importNs from './locales/import';
import repertoire from './locales/repertoire';
import training from './locales/training';
import weak from './locales/weak';

// French / English interface strings. One dictionary per namespace, keys are "namespace.key".
// Plurals: define "key_one" and "key_other" and pass a `count` param.

export type Lang = 'fr' | 'en';
export type Params = Record<string, string | number>;

const dicts = { analysis, appearance, common, data, explorer, import: importNs, repertoire, training, weak };
type Dicts = typeof dicts;
type StripPlural<K> = K extends `${infer B}_one` ? B : K extends `${infer B}_other` ? B : K;
export type TKey = {
  [N in keyof Dicts]: `${N & string}.${StripPlural<keyof Dicts[N]['fr']> & string}`;
}[keyof Dicts];

/** A translatable message stored as data (so saved reports follow the language). */
export interface Msg {
  key: TKey;
  params?: Params;
}

const STORAGE_KEY = 'cot-lang';

function initialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'fr' || saved === 'en') return saved;
  } catch {
    // Storage unavailable: fall back to the browser language.
  }
  return navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

let lang: Lang = initialLang();
document.documentElement.lang = lang;
const listeners = new Set<() => void>();

export function getLang(): Lang {
  return lang;
}

export function setLang(l: Lang) {
  if (l === lang) return;
  lang = l;
  document.documentElement.lang = l;
  try {
    localStorage.setItem(STORAGE_KEY, l);
  } catch {
    // Not remembered, still applied.
  }
  for (const fn of listeners) fn();
}

function pluralForm(n: number): 'one' | 'other' {
  return lang === 'fr' ? (Math.abs(n) < 2 ? 'one' : 'other') : n === 1 ? 'one' : 'other';
}

export function t(key: TKey, params?: Params): string {
  const dot = key.indexOf('.');
  const ns = dicts[key.slice(0, dot) as keyof Dicts] as { fr: Record<string, string>; en: Record<string, string> };
  const k = key.slice(dot + 1);
  const d = ns[lang];
  let s: string | undefined;
  if (params && typeof params.count === 'number') s = d[`${k}_${pluralForm(params.count)}`];
  s ??= d[k] ?? ns.fr[k] ?? key;
  return params ? s.replace(/\{(\w+)\}/g, (m, p: string) => (params[p] !== undefined ? String(params[p]) : m)) : s;
}

/** Renders a stored message; plain strings come from data saved before translation existed. */
export function msg(m: Msg | string): string {
  return typeof m === 'string' ? m : t(m.key, m.params);
}

/** Locale for dates and numbers. */
export function locale(): string {
  return lang === 'fr' ? 'fr-FR' : 'en-GB';
}

/** Re-renders the component when the language changes and returns the translator. */
export function useT(): typeof t {
  useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => lang,
  );
  return t;
}

export function useLang(): Lang {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => lang,
  );
}
