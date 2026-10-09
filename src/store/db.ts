import { createStore, del, get, set } from 'idb-keyval';

// Everything lives in the browser's IndexedDB: nothing is sent to a server.
const idb = createStore('chess-openings-trainer', 'kv');

export const loadKey = <T>(key: string) => get<T>(key, idb);
export const saveKey = (key: string, value: unknown) => set(key, value, idb);
export const removeKey = (key: string) => del(key, idb);

export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
