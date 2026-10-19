// Preferencias simples del jugador (por ahora, el color del personaje).
//
// Se guardan en localStorage del navegador. Si no está disponible (modo
// privado, almacenamiento bloqueado) se sigue jugando con los valores por
// defecto. El guardado de mundos de la etapa 5 va a usar IndexedDB.

const PREFIX = 'megabrick.';

export function loadPreference(key, fallback) {
  try {
    const value = window.localStorage.getItem(PREFIX + key);
    return value === null ? fallback : JSON.parse(value);
  } catch {
    return fallback;
  }
}

export function savePreference(key, value) {
  try {
    window.localStorage.setItem(PREFIX + key, JSON.stringify(value));
  } catch {
    // Sin almacenamiento: la preferencia vale solo para esta sesión.
  }
}
