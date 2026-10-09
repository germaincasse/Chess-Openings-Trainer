// Opening names from the Lichess chess-openings dataset (CC0), built by scripts/build-openings.mjs.

export interface OpeningName {
  eco: string;
  name: string;
}

let db: Record<string, [string, string]> = {};

export async function loadOpenings(): Promise<void> {
  try {
    const res = await fetch(`${import.meta.env.BASE_URL}openings.json`);
    if (res.ok) db = await res.json();
  } catch {
    // Names are a nice-to-have, the app works without them.
  }
}

export function openingAt(key: string): OpeningName | undefined {
  const e = db[key];
  return e ? { eco: e[0], name: e[1] } : undefined;
}

/** Deepest named position along a sequence of position keys. */
export function openingForKeys(keys: string[]): OpeningName | undefined {
  for (let i = keys.length - 1; i >= 0; i--) {
    const o = openingAt(keys[i]);
    if (o) return o;
  }
  return undefined;
}

/** "Sicilian Defense: Najdorf Variation" -> "Sicilian Defense" */
export function openingFamily(name: string): string {
  return name.split(':')[0].trim();
}
