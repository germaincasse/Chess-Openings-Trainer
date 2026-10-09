/** Declares a namespace: the English table must have exactly the keys of the French one. */
export function defineDict<const F extends Record<string, string>>(fr: F, en: { [K in keyof F]: string }) {
  return { fr, en };
}
