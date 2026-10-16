const { action, app } = require("photoshop");
const { state } = require("../state");

const EVENTS = ["select", "close", "open", "imageSize", "canvasSize", "historyStateChanged"];

// handlers: { onIdleChange(), onWorkClosed(), onLock(msg), onUnlock() }
function init(handlers) {
  action.addNotificationListener(EVENTS.map(e => ({ event: e })), (event) => {
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
  });
}

module.exports = { init };
