const { action, app } = require("photoshop");
const { state } = require("../state");
const { debounce } = require("../util");

// historyStateChanged solo importa con el trabajo en curso (deshacer/borrar capas); en reposo solo el tamaño
const IDLE_EVENTS = ["select", "close", "open", "imageSize", "canvasSize"];
const EVENTS = [...IDLE_EVENTS, "historyStateChanged"];

// handlers: { isBusy(), onIdleChange(), onWorkClosed(), onLock(msg), onUnlock() }
function init(handlers) {
  function evaluate() {
    try {
      if (state.phase === "RUNNING" || handlers.isBusy()) return;
      if (state.phase === "ACTIVE") {
        const stillOpen = app.documents.some(d => d.id === state.workDocId);
        if (!stillOpen) return handlers.onWorkClosed();
        if (app.activeDocument && app.activeDocument.id !== state.workDocId) {
          return handlers.onLock("Vuelve al documento de trabajo o pulsa Cancelar");
        }
        handlers.onUnlock();
      } else {
        handlers.onIdleChange();
      }
    } catch (e) {
      console.log("events:", e);
    }
  }

  // Las acciones del propio plugin generan decenas de eventos: se ignoran mientras trabaja
  // y el resto se agrupa. Al terminar, main.js llama a check() para no perder ninguno.
  const check = debounce(evaluate, 150);
  action.addNotificationListener(EVENTS.map(e => ({ event: e })), (event, descriptor) => {
    if (handlers.isBusy() || state.phase === "RUNNING") return;
    if (state.phase !== "ACTIVE" && event === "historyStateChanged") return;
    check();
  });
  return { check };
}

module.exports = { init };
