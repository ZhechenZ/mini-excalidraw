// 极简 IndexedDB KV 封装：不引第三方依赖，够用即可。
// 单 database + 单 store，值为任意可结构化克隆的 JS 对象。
//
// 设计要点：
// - 用 Promise 包一层原始 IndexedDB request 事件回调
// - open() 惰性化，第一次调用才建库/建 store
// - 所有 API 都是 async，出错走 reject

const DB_NAME = 'mini-excalidraw';
const DB_VERSION = 1;
const STORE = 'kv';

let dbPromise: Promise<IDBDatabase> | null = null;

function openDB(): Promise<IDBDatabase> {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return dbPromise;
}

function tx<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  return openDB().then(db => new Promise<T>((resolve, reject) => {
    const t = db.transaction(STORE, mode);
    const s = t.objectStore(STORE);
    const req = run(s);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }));
}

export async function idbGet<T = unknown>(key: string): Promise<T | undefined> {
  return tx('readonly', s => s.get(key) as IDBRequest<T | undefined>);
}

export async function idbSet(key: string, value: unknown): Promise<void> {
  await tx('readwrite', s => s.put(value, key));
}

export async function idbDel(key: string): Promise<void> {
  await tx('readwrite', s => s.delete(key));
}

export async function idbClear(): Promise<void> {
  await tx('readwrite', s => s.clear());
}