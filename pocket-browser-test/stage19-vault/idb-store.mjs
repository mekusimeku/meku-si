/** Stage 19 browser IndexedDB persistence adapter. Review required before any real wallet use. */
const DB_NAME = 'meku-pocket-stage19-vault-candidate';
const STORE = 'vaults';
export function openIndexedDbVaultStore({indexedDB=globalThis.indexedDB, dbName=DB_NAME} = {}) {
  if (!indexedDB || typeof indexedDB.open !== 'function' || typeof dbName !== 'string' || !dbName) throw new Error('INDEXEDDB_UNAVAILABLE');
  let connection;
  function open() {
    if (connection) return Promise.resolve(connection);
    return new Promise((resolve,reject) => {
      const req = indexedDB.open(dbName,1);
      req.onupgradeneeded = () => { if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE); };
      req.onerror = () => reject(new Error('INDEXEDDB_OPEN_FAILED'));
      req.onblocked = () => reject(new Error('INDEXEDDB_BLOCKED'));
      req.onsuccess = () => {
        connection = req.result;
        connection.onversionchange = () => { connection.close(); connection = undefined; };
        connection.onclose = () => { connection = undefined; };
        resolve(connection);
      };
    });
  }
  async function transact(mode,perform) {
    const db = await open();
    return new Promise((resolve,reject) => {
      let outcome, finished = false;
      const tx = db.transaction(STORE,mode);
      const store = tx.objectStore(STORE);
      const stop = () => { if (!finished) { finished = true; reject(new Error('INDEXEDDB_TRANSACTION_FAILED')); } };
      tx.onabort = stop; tx.onerror = stop;
      tx.oncomplete = () => { if (!finished) { finished = true; resolve(outcome); } };
      try {
        perform(store, x => { outcome = x; }, () => tx.abort());
      } catch { tx.abort(); }
    });
  }
  return Object.freeze({
    get: key => transact('readonly',(store,done) => { const r=store.get(key); r.onsuccess=()=>done(r.result??null); }),
    putNew: (key,value) => transact('readwrite',(store,done) => { const r=store.add(value,key); r.onsuccess=()=>done(true); }),
    replace: (key,revision,value) => transact('readwrite',(store,done) => {
      const get=store.get(key); get.onsuccess=()=>{
        if (!get.result || get.result.revision !== revision) { done(false); return; }
        const put=store.put(value,key); put.onsuccess=()=>done(true);
      };
    }),
    remove: (key,revision) => transact('readwrite',(store,done) => {
      const get=store.get(key); get.onsuccess=()=>{
        if (!get.result || get.result.revision !== revision) { done(false); return; }
        const del=store.delete(key); del.onsuccess=()=>done(true);
      };
    }),
    close: () => { connection?.close(); connection=undefined; }
  });
}
