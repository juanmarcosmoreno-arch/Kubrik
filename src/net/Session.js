// Conexión entre computadoras con WebRTC (PeerJS).
//
// Topología en estrella: el anfitrión abre la partida con un ID derivado del
// código y cada invitado se conecta solo con él. El anfitrión reenvía lo que
// haga falta a los demás. El servidor de PeerJS solo se usa para el primer
// contacto (intercambiar los datos de conexión); después los datos van
// directo entre las computadoras.

// MsgPackPeer: los mensajes viajan en formato MsgPack. El formato por
// defecto de PeerJS (BinaryPack) reserva memoria según lo que dice el mensaje,
// y 5 bytes armados a propósito alcanzan para colgar la pestaña; con
// MsgPackPeer ni siquiera se aceptan conexiones en ese formato.
import { MsgPackPeer as Peer } from 'peerjs';
import { MAX_PLAYERS, peerIdForCode } from './protocol.js';

/** Tiempo máximo para conectarse (ms). */
const CONNECT_TIMEOUT = 15000;

/**
 * Si la conexión con alguien queda "desconectada" este tiempo (ms), se lo da
 * por ido. Al cerrar la pestaña no siempre llega un aviso, y WebRTC tarda
 * unos 15 s en declararla perdida del todo.
 */
const DISCONNECT_GRACE = 3000;

/** Conexiones simultáneas que acepta el anfitrión (jugadores y las que recién llegan). */
const MAX_CONNECTIONS = MAX_PLAYERS + 2;

/** Espera máxima (ms) para reconectarse al servidor si se cortó (va creciendo). */
const MAX_RETRY_DELAY = 30000;

/**
 * Servidor de PeerJS. Por defecto el servidor público y gratuito de PeerJS;
 * se puede usar otro con ?servidor=host:puerto en la URL (por ejemplo, uno
 * propio, o uno local para probar: `npx peer --port 9000`).
 */
function serverOptions() {
  const value = new URLSearchParams(window.location.search).get('servidor');
  if (!value) return {};
  try {
    // Sin protocolo se usa el de la página: una página https (GitHub Pages)
    // no puede conectarse a un servidor sin cifrar.
    const scheme = window.location.protocol === 'https:' ? 'https' : 'http';
    const url = new URL(value.includes('://') ? value : `${scheme}://${value}`);
    const secure = url.protocol === 'https:' || url.protocol === 'wss:';
    return {
      host: url.hostname,
      port: Number(url.port) || (secure ? 443 : 80),
      path: url.pathname || '/',
      secure,
    };
  } catch {
    return {};
  }
}

/** Mensaje en castellano para los errores de PeerJS. */
export function describeError(err) {
  switch (err?.type) {
    case 'peer-unavailable':
      return 'No se encontró esa partida. Revisá el código (y que quien la creó siga con el juego abierto).';
    case 'unavailable-id':
      return 'Ese código ya está en uso. Probá de nuevo.';
    case 'network':
    case 'server-error':
    case 'socket-error':
    case 'socket-closed':
      return 'No se pudo conectar con el servidor de partidas. Revisá tu conexión a internet.';
    case 'browser-incompatible':
      return 'Este navegador no permite conexiones entre jugadores (WebRTC).';
    case 'timeout':
      return 'La conexión tardó demasiado. Puede que tu red bloquee las conexiones directas.';
    default:
      return 'No se pudo conectar a la partida.';
  }
}

/** Espera un evento de un emisor de PeerJS, con tiempo máximo. */
function waitFor(emitter, okEvent, peer) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject({ type: 'timeout' }), CONNECT_TIMEOUT);
    const done = (fn) => (arg) => {
      clearTimeout(timer);
      fn(arg);
    };
    emitter.once(okEvent, done(resolve));
    emitter.once('error', done(reject));
    if (peer && peer !== emitter) peer.once('error', done(reject));
  });
}

export class Session {
  constructor() {
    this.peer = null;
    /** @type {Map<string, import('peerjs').DataConnection>} conexiones por id de peer */
    this.connections = new Map();
    this.role = null; // 'host' | 'guest'
    /** (conn) => void: se abrió una conexión nueva (solo anfitrión). */
    this.onConnection = null;
    /** (message, peerId) => void */
    this.onMessage = null;
    /** (peerId) => void */
    this.onDisconnect = null;
    /** (error) => void: errores después de conectarse. */
    this.onError = null;
    this._retryTimer = 0;
  }

  /** ID propio en la red. */
  get id() {
    return this.peer?.id ?? null;
  }

  /** Abre una partida con el código dado (anfitrión). */
  async host(code) {
    this.role = 'host';
    this.peer = new Peer(peerIdForCode(code), { debug: 0, ...serverOptions() });
    await waitFor(this.peer, 'open');
    const pending = new Set(); // conexiones que todavía no terminaron de abrirse
    this.peer.on('connection', (conn) => {
      // Una sola conexión por computadora y un máximo en total.
      if (
        typeof conn?.on !== 'function' ||
        this.connections.has(conn.peer) ||
        this.connections.size + pending.size >= MAX_CONNECTIONS
      ) {
        conn?.close?.();
        return;
      }
      pending.add(conn);
      // Si no termina de abrirse (el otro canceló, cerró la pestaña o se le
      // cortó la red), PeerJS no siempre avisa: se le pone un plazo para que
      // no quede ocupando un lugar.
      const deadline = setTimeout(() => {
        if (pending.delete(conn)) conn.close();
      }, CONNECT_TIMEOUT + 5000);
      const forget = () => {
        clearTimeout(deadline);
        pending.delete(conn);
      };
      conn.on('close', forget);
      conn.on('error', forget);
      conn.on('open', () => {
        forget();
        const existing = this.connections.get(conn.peer);
        if (existing === conn) return; // a veces PeerJS avisa 'open' dos veces
        if (existing) {
          conn.close(); // ya hay otra conexión desde esa computadora
          return;
        }
        this.connections.set(conn.peer, conn);
        this._listen(conn);
        this.onConnection?.(conn);
      });
    });
    this.peer.on('error', (err) => this.onError?.(err));
    // Si se corta el contacto con el servidor, las conexiones abiertas siguen;
    // se reintenta (cada vez esperando más) para que se puedan sumar más
    // jugadores.
    let delay = 1000;
    this.peer.on('open', () => {
      delay = 1000;
    });
    this.peer.on('disconnected', () => {
      clearTimeout(this._retryTimer);
      this._retryTimer = setTimeout(() => {
        if (this.peer?.disconnected && !this.peer.destroyed) this.peer.reconnect();
      }, delay);
      delay = Math.min(delay * 2, MAX_RETRY_DELAY);
    });
  }

  /** Se une a la partida con el código dado (invitado). */
  async join(code) {
    this.role = 'guest';
    const peer = new Peer({ debug: 0, ...serverOptions() });
    this.peer = peer;
    await waitFor(peer, 'open');
    if (this.peer !== peer) throw { type: 'closed' }; // se cerró mientras tanto
    // Un invitado solo habla con el anfitrión: nadie más se le puede conectar.
    peer.on('connection', (other) => other?.close?.());
    const conn = peer.connect(peerIdForCode(code), { reliable: true });
    await waitFor(conn, 'open', peer);
    if (this.peer !== peer) throw { type: 'closed' }; // se cerró mientras tanto
    this.connections.set(conn.peer, conn);
    this._listen(conn);
    this.peer.on('error', (err) => this.onError?.(err));
  }

  _listen(conn) {
    // Solo cuenta lo que llega por la conexión vigente (no por una cortada).
    const current = () => this.connections.get(conn.peer) === conn;
    conn.on('data', (data) => {
      if (current()) this.onMessage?.(data, conn.peer);
    });
    let graceTimer = 0;
    const closed = () => {
      clearTimeout(graceTimer);
      if (!current()) return;
      this.connections.delete(conn.peer);
      conn.close();
      this.onDisconnect?.(conn.peer);
    };
    conn.on('close', closed);
    conn.on('error', closed);
    // Si la conexión WebRTC se corta de golpe (pestaña cerrada, sin red),
    // 'close' a veces no llega o tarda mucho.
    const pc = conn.peerConnection;
    pc?.addEventListener('connectionstatechange', () => {
      const state = pc.connectionState;
      clearTimeout(graceTimer);
      if (state === 'failed' || state === 'closed') closed();
      else if (state === 'disconnected') graceTimer = setTimeout(closed, DISCONNECT_GRACE);
    });
  }

  /** Manda un mensaje a un peer. */
  send(peerId, message) {
    const conn = this.connections.get(peerId);
    // Si el canal se cierra justo mientras se manda, el envío falla: no
    // importa (la desconexión se avisa por otro lado).
    if (conn?.open) conn.send(message)?.catch?.(() => {});
  }

  /** Corta una conexión (por ejemplo, partida llena). */
  drop(peerId) {
    const conn = this.connections.get(peerId);
    this.connections.delete(peerId);
    // Un momento de gracia para que llegue el último mensaje.
    setTimeout(() => conn?.close(), 500);
  }

  /** Cierra todo. */
  close() {
    const conns = [...this.connections.values()];
    this.connections.clear(); // primero: así no se avisa de cada desconexión
    for (const conn of conns) conn.close();
    // destroy() avisa 'disconnected' antes de terminar; sin este listener no
    // se reconecta (si no, el código quedaría ocupado en el servidor).
    this.peer?.removeAllListeners('disconnected');
    clearTimeout(this._retryTimer);
    try {
      this.peer?.destroy();
    } catch {
      // Un pedido de conexión armado a mano puede dejarle a PeerJS un objeto
      // que no se deja cerrar. Igual ya se desconectó del servidor (lo primero
      // que hace destroy), así que el código queda libre.
    }
    this.peer = null;
  }
}
