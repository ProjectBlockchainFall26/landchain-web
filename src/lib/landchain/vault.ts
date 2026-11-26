// Document vault: where the actual files live, OFF chain. Only their SHA-256 fingerprints go on chain.
//
// In backend mode (VITE_API_URL) this is the Lands Commission's vault behind landchain-backend (Supabase Storage),
// readable only by officers and the owner through short-lived signed links. In chain mode it is IndexedDB in this
// browser, so switching demo accounts in the same browser shows the access rules; on another device the files
// simply aren't there (the fingerprints still are).
import { API_MODE } from "./api/config";
import { openDocument } from "./api/actions";
export interface VaultFile {
  hash: string;
  name: string;
  type: string;
  mime: string;
  size: number;
  data: Blob;
  parcelId: string;
}

const DB = "landchain-vault",
  STORE = "files";
function open(): Promise<IDBDatabase> {
  return new Promise((res, rej) => {
    const r = indexedDB.open(DB, 1);
    r.onupgradeneeded = () =>
      r.result.createObjectStore(STORE, { keyPath: "hash" });
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  });
}
async function tx<T>(
  mode: IDBTransactionMode,
  run: (s: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  const db = await open();
  return new Promise((res, rej) => {
    const req = run(db.transaction(STORE, mode).objectStore(STORE));
    req.onsuccess = () => res(req.result);
    req.onerror = () => rej(req.error);
  });
}

export const putFile = (f: VaultFile) =>
  tx("readwrite", (s) => s.put(f)).then(() => undefined);
export const getFile = (hash: string) =>
  tx<VaultFile | undefined>(
    "readonly",
    (s) => s.get(hash) as IDBRequest<VaultFile | undefined>,
  );

export async function openFile(hash: string, parcelId?: string) {
  if (API_MODE) return parcelId ? openDocument(hash, parcelId) : false;
  const f = await getFile(hash);
  if (!f) return false;
  window.open(URL.createObjectURL(f.data), "_blank", "noopener");
  return true;
}
