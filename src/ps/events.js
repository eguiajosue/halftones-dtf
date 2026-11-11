const { action, app } = require("photoshop");
const { state } = require("../state");
const { debounce } = require("../util");

const EVENTS = ["select", "close", "open", "imageSize", "canvasSize", "historyStateChanged"];

// handlers: { onIdleChange(), onWorkClosed(), onLock(msg), onUnlock() }
function init(handlers) {
  // Cada ajuste en vivo dispara select/historyStateChanged varias veces: se agrupan en una sola comprobación.
  const check = debounce((event) => {
    try {
      if (state.phase === "RUNNING") return;
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
      console.log("events:", event, e);
    }
  }, 100);
  action.addNotificationListener(EVENTS.map(e => ({ event: e })), event => check(event));
}

module.exports = { init };
