/**
 * Phase J3 — Offline content store.
 *
 * Wraps IndexedDB so a lesson's video + metadata can be cached for
 * playback when the network is gone. Designed for the rural-Sri-Lanka
 * use case: intermittent connection, expensive cellular data.
 *
 * Schema (object store `lessons`):
 *   key = lesson id
 *   value = { id, title, courseTitle, teacherName, blob, mimeType,
 *             sizeBytes, savedAt, captionUrl?, transcriptUrl? }
 *
 * The blob is the raw video bytes. We deliberately don't cache the
 * caption/transcript URLs themselves — those are tiny and re-fetched
 * cheaply; caching their URL string lets the offline player still try
 * to load them when reconnected.
 *
 * No external IndexedDB library (idb, dexie) used — the wrapper is
 * small enough that the dependency wouldn't pay back its bundle cost.
 */

const DB_NAME = 'skillhub-offline';
const DB_VERSION = 1;
const STORE = 'lessons';

export interface OfflineLessonRecord {
  id: string;
  title: string;
  courseTitle?: string;
  teacherName?: string;
  mimeType: string;
  sizeBytes: number;
  savedAt: number;
  captionUrl?: string;
  transcriptUrl?: string;
  blob: Blob;
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB not available in this browser.'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        db.createObjectStore(STORE, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error || new Error('Failed to open IDB'));
  });
}

async function withStore<T>(
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => Promise<T> | T,
): Promise<T> {
  const db = await openDb();
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode);
    const store = tx.objectStore(STORE);
    let result: T | undefined;
    Promise.resolve(fn(store))
      .then((r) => {
        result = r;
      })
      .catch(reject);
    tx.oncomplete = () => resolve(result as T);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}

/** List all saved lessons (newest first). */
export async function listOfflineLessons(): Promise<OfflineLessonRecord[]> {
  return withStore('readonly', (store) => {
    return new Promise<OfflineLessonRecord[]>((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => {
        const rows = (req.result as OfflineLessonRecord[]).slice();
        rows.sort((a, b) => b.savedAt - a.savedAt);
        resolve(rows);
      };
      req.onerror = () => reject(req.error);
    });
  });
}

/** True if a lesson with the given id is already saved. */
export async function isLessonOffline(id: string): Promise<boolean> {
  try {
    const rec = await withStore('readonly', (store) => {
      return new Promise<OfflineLessonRecord | undefined>((resolve, reject) => {
        const req = store.get(id);
        req.onsuccess = () => resolve(req.result as OfflineLessonRecord | undefined);
        req.onerror = () => reject(req.error);
      });
    });
    return !!rec;
  } catch {
    return false;
  }
}

/** Fetch + cache a lesson. Progress callback fires with downloaded/total bytes. */
export async function saveLessonOffline(
  meta: Omit<OfflineLessonRecord, 'blob' | 'mimeType' | 'sizeBytes' | 'savedAt'> & {
    contentUrl: string;
  },
  onProgress?: (downloadedBytes: number, totalBytes: number | null) => void,
): Promise<OfflineLessonRecord> {
  const res = await fetch(meta.contentUrl);
  if (!res.ok || !res.body) {
    throw new Error(`Download failed (${res.status})`);
  }
  const total = Number(res.headers.get('content-length') || 0) || null;
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let received = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    if (value) {
      chunks.push(value);
      received += value.byteLength;
      onProgress?.(received, total);
    }
  }
  const mime = res.headers.get('content-type') || 'application/octet-stream';
  const blob = new Blob(chunks, { type: mime });
  const record: OfflineLessonRecord = {
    id: meta.id,
    title: meta.title,
    courseTitle: meta.courseTitle,
    teacherName: meta.teacherName,
    captionUrl: meta.captionUrl,
    transcriptUrl: meta.transcriptUrl,
    mimeType: mime,
    sizeBytes: blob.size,
    savedAt: Date.now(),
    blob,
  };
  await withStore('readwrite', (store) => {
    store.put(record);
  });
  return record;
}

/** Remove a saved lesson. */
export async function removeOfflineLesson(id: string): Promise<void> {
  await withStore('readwrite', (store) => {
    store.delete(id);
  });
}

/** Reported storage usage (best-effort; not all browsers expose this). */
export async function getStorageEstimate(): Promise<{
  usageBytes: number | null;
  quotaBytes: number | null;
}> {
  if (
    typeof navigator !== 'undefined' &&
    navigator.storage &&
    typeof navigator.storage.estimate === 'function'
  ) {
    try {
      const e = await navigator.storage.estimate();
      return {
        usageBytes: e.usage ?? null,
        quotaBytes: e.quota ?? null,
      };
    } catch {
    }
  }
  return { usageBytes: null, quotaBytes: null };
}

/** Build a same-origin blob URL for the cached video. Caller is
 *  responsible for `URL.revokeObjectURL` when the player unmounts. */
export function lessonBlobUrl(record: OfflineLessonRecord): string {
  return URL.createObjectURL(record.blob);
}

export function formatBytes(b: number | null): string {
  if (b == null) return '—';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  if (b < 1024 * 1024 * 1024) return `${(b / (1024 * 1024)).toFixed(1)} MB`;
  return `${(b / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}
