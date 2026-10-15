const { app, core } = require("photoshop");

const status = document.getElementById("status");

// Todo cambio al documento debe ir dentro de executeAsModal.
async function showDocInfo() {
  const doc = app.activeDocument;
  if (!doc) {
    status.textContent = "No hay documento abierto.";
    return;
  }
  await core.executeAsModal(
    async () => {
      status.textContent = `${doc.name} — ${doc.width}x${doc.height}px @ ${doc.resolution}ppi`;
    },
    { commandName: "Halftones DTF: info" }
  );
}

document.getElementById("btn-info").addEventListener("click", showDocInfo);
