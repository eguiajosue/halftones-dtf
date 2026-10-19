// Cola de cambios del modo en vivo. Cada control marca qué cambió ("kinds"); un único bucle aplica
// el último estado sin perder tipos de cambio (el último valor gana, no se acumulan llamadas).
//  - dirty: pendiente de aplicar. Si falla por WRONG_DOC se conserva y se reintenta al volver al documento.
//  - stale: el documento no refleja el panel (fallo de sincronización o cambio diferido, p. ej. un
//    slider que solo aplica al soltar). No se reintenta solo; flush() lo aplica antes de Aplicar.
// opts: { sync(kinds), onError(e), canPump(), onBusy(on) }
function createLiveQueue({ sync, onError = () => {}, canPump = () => true, onBusy = () => {} }) {
  const dirty = new Set();
  const stale = new Set();
  let pumping = false;

  async function pump() {
    if (pumping) return;
    pumping = true;
    onBusy(true);
    try {
      while (dirty.size && canPump()) {
        const kinds = new Set(dirty);
        dirty.clear();
        try {
          await sync(kinds);
          kinds.forEach(k => stale.delete(k));
        } catch (e) {
          const wrongDoc = e && e.message === "WRONG_DOC";
          kinds.forEach(k => (wrongDoc ? dirty : stale).add(k));
          await onError(e);
          if (wrongDoc) break;          // se reanuda con pump() al desbloquear
        }
      }
    } finally {
      pumping = false;
      onBusy(false);
    }
  }

  async function drain() {
    while (pumping) await new Promise(r => setTimeout(r, 30));
  }

  // Espera al ajuste en curso y aplica todo lo pendiente (dirty + stale) de una vez.
  // Si falla, lo pendiente se conserva y el error se propaga.
  async function flush() {
    await drain();
    const kinds = new Set([...dirty, ...stale]);
    if (!kinds.size) return;
    dirty.clear();
    stale.clear();
    try {
      await sync(kinds);
    } catch (e) {
      const wrongDoc = e && e.message === "WRONG_DOC";
      kinds.forEach(k => (wrongDoc ? dirty : stale).add(k));
      throw e;
    }
  }

  return {
    mark: (...kinds) => kinds.forEach(k => dirty.add(k)),
    defer: (...kinds) => kinds.forEach(k => stale.add(k)),
    clear: () => { dirty.clear(); stale.clear(); },
    pending: () => new Set([...dirty, ...stale]),
    isPumping: () => pumping,
    pump, drain, flush
  };
}

module.exports = { createLiveQueue };
