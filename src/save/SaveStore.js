// Mundos guardados en el navegador (IndexedDB).
//
// Se guardan dos cosas:
// - "worlds": un registro por mundo (nombre, semilla, dónde está el jugador,
//   hotbar y fechas).
// - "chunks": SOLO los chunks que los jugadores cambiaron, como diferencias
//   con el terreno generado: [índice, bloque, índice, bloque, ...]. El resto
//   del mundo no se guarda: se vuelve a generar igual con la semilla.

const DB_NAME = 'megabrick';
const DB_VERSION = 1;

/** Promesa de un pedido de IndexedDB. */
function request(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/** Promesa de una transacción completa (todo guardado o nada). */
function transactionDone(tx) {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error ?? new Error('Se canceló el guardado.'));
  });
}

/** Todas las claves de chunks de un mundo: [mundo, "cx,cz"]. */
const chunkRange = (worldId) => IDBKeyRange.bound([worldId, ''], [worldId, '￿']);

export class SaveStore {
  constructor() {
    this._db = null;
  }

  /** Abre la base (una sola vez). Rechaza si el navegador no deja guardar. */
  open() {
    this._db ??= new Promise((resolve, reject) => {
      if (!window.indexedDB) {
        reject(new Error('Este navegador no tiene IndexedDB.'));
        return;
      }
      const req = window.indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        db.createObjectStore('worlds', { keyPath: 'id', autoIncrement: true });
        db.createObjectStore('chunks', { keyPath: ['world', 'key'] });
      };
      req.onsuccess = () => {
        const db = req.result;
        // Si otra pestaña abre una versión más nueva del juego, se le deja.
        db.onversionchange = () => db.close();
        resolve(db);
      };
      req.onerror = () => reject(req.error);
      req.onblocked = () => reject(new Error('Otra pestaña está usando una versión vieja del juego.'));
    });
    return this._db;
  }

  /** Registros de todos los mundos, del jugado más recientemente al más viejo. */
  async list() {
    const db = await this.open();
    const worlds = await request(db.transaction('worlds').objectStore('worlds').getAll());
    return worlds.sort((a, b) => b.playedAt - a.playedAt);
  }

  /**
   * Guarda el registro de un mundo y los chunks indicados, todo junto.
   * Sin `meta.id`, crea un mundo nuevo. Devuelve el id.
   * @param {object} meta registro del mundo
   * @param {Array<[string, Uint16Array]>} chunks [clave, diferencias] de cada chunk
   */
  async save(meta, chunks) {
    const db = await this.open();
    const tx = db.transaction(['worlds', 'chunks'], 'readwrite');
    const done = transactionDone(tx);
    const record = { ...meta };
    if (record.id == null) delete record.id; // el id lo pone la base
    const put = tx.objectStore('worlds').put(record);
    const putChunks = (id) => {
      const store = tx.objectStore('chunks');
      for (const [key, edits] of chunks) store.put({ world: id, key, edits });
      // Se confirma ya: al cerrar la pestaña no hay tiempo de esperar.
      tx.commit?.();
    };
    // Con el id conocido, todo se pide de una vez (sin esperar respuestas).
    if (record.id != null) putChunks(record.id);
    else put.onsuccess = () => putChunks(put.result);
    await done;
    return put.result;
  }

  /** Un mundo con sus cambios: {meta, edits: [[clave, diferencias], ...]}, o null. */
  async load(id) {
    const db = await this.open();
    const tx = db.transaction(['worlds', 'chunks']);
    const [meta, chunks] = await Promise.all([
      request(tx.objectStore('worlds').get(id)),
      request(tx.objectStore('chunks').getAll(chunkRange(id))),
    ]);
    if (!meta) return null;
    return { meta, edits: chunks.map((c) => [c.key, c.edits]) };
  }

  /** Borra un mundo y todos sus chunks. */
  async delete(id) {
    const db = await this.open();
    const tx = db.transaction(['worlds', 'chunks'], 'readwrite');
    tx.objectStore('worlds').delete(id);
    tx.objectStore('chunks').delete(chunkRange(id));
    await transactionDone(tx);
  }
}
