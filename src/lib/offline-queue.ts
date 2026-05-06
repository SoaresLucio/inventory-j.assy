import { openDB, type IDBPDatabase } from "idb";
import { supabase } from "@/integrations/supabase/client";

export interface QueuedItem {
  client_id: string;
  user_id: string;
  item_code: string;
  uc: string;
  lote: string;
  endereco: string;
  quantidade: number;
  created_at: string;
}

const DB_NAME = "jassy-inventory";
const STORE = "pending";

let dbPromise: Promise<IDBPDatabase> | null = null;
const getDB = () => {
  if (typeof indexedDB === "undefined") return null;
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, 1, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "client_id" });
        }
      },
    });
  }
  return dbPromise;
};

export async function enqueueItem(item: QueuedItem) {
  const db = await getDB();
  if (!db) return;
  await db.put(STORE, item);
}

export async function getPending(): Promise<QueuedItem[]> {
  const db = await getDB();
  if (!db) return [];
  return (await db.getAll(STORE)) as QueuedItem[];
}

export async function removePending(client_id: string) {
  const db = await getDB();
  if (!db) return;
  await db.delete(STORE, client_id);
}

export async function pendingCount(): Promise<number> {
  const db = await getDB();
  if (!db) return 0;
  return db.count(STORE);
}

export async function flushQueue(): Promise<{ ok: number; failed: number; synced: QueuedItem[] }> {
  const items = await getPending();
  let ok = 0, failed = 0;
  const synced: QueuedItem[] = [];
  for (const it of items) {
    const { error } = await supabase.from("inventory_items").insert(it);
    // Treat duplicate (already synced) as success
    if (!error || error.code === "23505") {
      await removePending(it.client_id);
      synced.push(it);
      ok++;
    } else {
      failed++;
    }
  }
  return { ok, failed, synced };
}