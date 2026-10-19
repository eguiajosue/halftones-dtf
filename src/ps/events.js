const { action, app } = require("photoshop");
const { state } = require("../state");

const EVENTS = ["select", "close", "open", "imageSize", "canvasSize", "historyStateChanged"];

// handlers: { onIdleChange(), onWorkClosed(), onLock(), onUnlock() }
function init(handlers) {
  action.addNotificationListener(EVENTS.map(e => ({ event: e })), (event) => {
    try {
      // Preparar / Aplicar / Cancelar cambian de documento a propósito: no bloquear ni resetear a mitad
      if (state.phase !== "ACTIVE" && state.phase !== "IDLE") return;
      if (state.phase === "ACTIVE") {
        const stillOpen = app.documents.some(d => d.id === state.workDocId);
        if (!stillOpen) return handlers.onWorkClosed();
        if (app.activeDocument && app.activeDocument.id !== state.workDocId) {
          return handlers.onLock();
        }
        handlers.onUnlock();
      } else {
        handlers.onIdleChange();
      }
    } catch (e) {
      console.log("events:", event, e);
    }
  });
}

module.exports = { init };
