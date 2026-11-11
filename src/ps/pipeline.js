const { app, constants } = require("photoshop");
const { state, resetState, HT_TYPES } = require("../state");
const { dimPx } = require("../util");
const {
  bp, modal, px, validId, layerById, targetLayer, channel, selectLayer, lastLayerId, findLayer, baseName
} = require("./bp");
const L_ = require("./layers");
const { refreshMask } = require("./mask");
const { setPreviewMode } = require("./preview");
const { nativeScreenMask } = require("./screen");

const CANCELLED = "CANCELLED";

function checkCancel(ctx) {
  if (ctx.isCancelled) throw new Error(CANCELLED);
}

function getWorkDoc() {
  const d = app.documents.find(x => x.id === state.workDocId);
  if (!d) throw new Error("No se encuentra el documento de trabajo.");
  return d;
}

// Orígenes de 16/32 bits duplican la memoria y ralentizan filtros; la máscara final es binaria, así que
// el documento de trabajo va a 8 bits/canal. Si falla, se sigue como estaba (no es crítico).
async function ensure8Bit(work) {
  const bits = String(work.bitsPerChannel || "");
  if (!bits || /(^|\D)8$|eight/i.test(bits)) return;
  try {
    await bp({ _obj: "convertMode", depth: 8, merge: false });                                       // 🔍
  } catch (e) { console.log("No se pudo pasar a 8 bits:", e); }
}

// ---- Preparar ---------------------------------------------------------------
// s = ajustes de la UI + widthPx / heightPx (tamaño objetivo a 300 ppi)
async function runPrep(s) {
  const src = app.activeDocument;
  if (!src) throw new Error("No hay documento abierto.");
  state.phase = "RUNNING";
  state.srcDocId = src.id;
  let work = null;
  let stage = "inicio";
  const at = n => { stage = n; };

  try {
    await modal("Open-DTF: Preparar", async (ctx) => {
      // 0) Definir los 4 motivos de semitono ahora (una vez por sesión), no a mitad de un ajuste en vivo
      at("motivos de semitono");
      ctx.reportProgress({ value: 0.02, commandName: "Preparando motivos de semitono" });
      for (const t of HT_TYPES) await L_.ensurePattern(t);

      // 1) Duplicar (documento de trabajo); el original nunca se toca
      at("duplicar documento");
      work = await src.duplicate(`${baseName(src.title)} - Prep`);
      app.activeDocument = work;
      state.workDocId = work.id;
      if (work.mode !== constants.DocumentMode.RGB) await work.changeMode(constants.ChangeMode.RGB);
      await ensure8Bit(work);

      at("historial");
      const hid = await ctx.hostControl.suspendHistory({ documentID: work.id, name: "Open-DTF: Preparar" });
      try {
        ctx.reportProgress({ value: 0.1, commandName: "Duplicando documento" });

        // 2a) Si se reduce, aplanar antes: se remuestrea una sola capa. Si se amplía NO: texto, vectores y
        //     objetos inteligentes se re-renderizan nítidos al escalar y aplanarlos antes los dejaría borrosos.
        at("aplanar capas");
        if (work.layers.length > 1 && s.widthPx <= dimPx(work.width) && s.heightPx <= dimPx(work.height)) {
          try { await work.mergeVisibleLayers(); }                                                  // 🔍
          catch (e) { console.log("No se pudo aplanar antes de redimensionar:", e); }
        }

        // 2) Redimensionar a 300 ppi y tamaño objetivo
        at(`redimensionar (${s.widthPx}x${s.heightPx})`);
        await work.resizeImage(s.widthPx, s.heightPx, 300, constants.ResampleMethod.BICUBICAUTOMATIC);
        checkCancel(ctx);
        ctx.reportProgress({ value: 0.25, commandName: "Redimensionando" });

        // 3) Aplanar todo en un objeto inteligente "ART"
        at("objeto inteligente ART");
        await bp([{ _obj: "selectAllLayers", _target: [targetLayer] }, { _obj: "newPlacedLayer" }]);   // 🔍
        const artId = await lastLayerId();
        await bp({ _obj: "set", _target: [targetLayer], to: { _obj: "layer", name: "ART" } });
        validId(artId, "ART");
        const artLayer = findLayer(work, artId);
        if (!artLayer) throw new Error("No se encontró la capa ART");

        // 4) Color de prenda (al fondo)
        at("capa SHIRT COLOR");
        const shirtId = await L_.makeSolid("SHIRT COLOR", s.shirt);
        await findLayer(work, shirtId).moveBelow(artLayer);                                                  // 🔍
        checkCancel(ctx);

        // 5) MAP GROUP: fondo (color de KO) < arte < KO < desat < niveles < umbral < motivo
        at("MAP ART");
        const mapArt = await artLayer.duplicate();     // en UXP puede ser una promesa
        if (!mapArt) throw new Error("No se pudo duplicar ART");
        mapArt.name = "MAP ART";
        const mapArtId = validId(mapArt.id, "MAP ART");
        await selectLayer(mapArtId);
        const mapBgId = await L_.makeSolid("MAP BG", s.knockoutColor);   // el arte transparente cuenta como "fondo"
        await findLayer(work, mapBgId).moveBelow(findLayer(work, mapArtId));
        await selectLayer(mapArtId);
        at("KO COLOR");
        const koId = await L_.makeSolid("KO COLOR", s.knockoutColor, "difference");
        at("MAP DESAT / MAP LEVELS / umbral");
        const desatId = await L_.makeHueSatDesat("MAP DESAT");
        const levelsId = await L_.makeLevels("MAP LEVELS", s);
        const thrId = await L_.makeThreshold("MAP THRESHOLD");
        at("capa de semitono");
        const htId = await L_.makeHalftoneLayer(s.htType, s.lpi, s.angle);
        await findLayer(work, htId).moveAbove(findLayer(work, thrId));
        checkCancel(ctx);
        ctx.reportProgress({ value: 0.6, commandName: "Construyendo mapa de semitono" });

        at("agrupar MAP GROUP");
        const members = [mapBgId, mapArtId, koId, desatId, levelsId, thrId, htId].map(id => {
          const l = findLayer(work, id);
          if (!l) throw new Error(`Capa no encontrada (id ${id})`);
          return l;
        });
        const group = await work.createLayerGroup({ name: "MAP GROUP", fromLayers: members });        // 🔍
        const mapGroupId = validId(group.id, "MAP GROUP");

        Object.assign(state.layers, { art: artId, shirt: shirtId, mapGroup: mapGroupId, mapArt: mapArtId,
          mapBg: mapBgId, ko: koId, desat: desatId, levels: levelsId, threshold: thrId, halftone: htId });

        // 6) Realce de sombras (filtro inteligente) y máscara en ART
        at("sombras y máscara");
        state.shadowOn = false;
        if (s.shadow > 0) await L_.setShadowBoost(s.shadow);

        // 7) Primer cálculo de la máscara y vista
        at("calcular máscara");
        await refreshMask(s);
        at("vista");
        await setPreviewMode("shirt");
        await bp({ _obj: "select", _target: [{ _ref: "menuItemClass", _enum: "menuItemType", _value: "fitOnScreen" }] });
        ctx.reportProgress({ value: 1, commandName: "Listo" });
      } finally {
        await ctx.hostControl.resumeHistory(hid);
      }
    });
    state.phase = "ACTIVE";
  } catch (e) {
    await discardWork(work);
    resetState();
    if (e.message === CANCELLED) return false;
    throw new Error(`${e.message} [paso: ${stage}]`);
  }
  return true;
}

async function discardWork(work) {
  const doc = work && app.documents.find(d => d.id === work.id);
  if (!doc) return;
  try {
    await modal("Open-DTF: Descartar", async () => { await doc.closeWithoutSaving(); });
  } catch (e) { /* ya cerrado */ }
}

// ---- Cancelar ----------------------------------------------------------------
async function cancelPrep() {
  const src = app.documents.find(d => d.id === state.srcDocId);
  const work = app.documents.find(d => d.id === state.workDocId);
  await modal("Open-DTF: Cancelar", async () => {
    if (work) await work.closeWithoutSaving();
    if (src) app.activeDocument = src;
  });
  resetState();
}

// ---- Aplicar -----------------------------------------------------------------
async function applyPrep(s) {
  await modal("Open-DTF: Aplicar", async (ctx) => {
    const work = getWorkDoc();
    app.activeDocument = work;
    const L = state.layers;
    ctx.reportProgress({ value: 0.1, commandName: "Calculando máscara" });

    // 1) Máscara final: motor nativo de Mapa de bits (opcional) o motivo + Hard Mix
    // Si el ajuste en vivo la dejó al día (vista Prenda/Alfa, máscara activa) no se recalcula.
    const maskReady = !state.maskStale && (state.previewMode === "shirt" || state.previewMode === "alpha");
    if (!maskReady) await refreshMask(s);
    if (s.nativeFinal && s.halftone && s.knockout) {
      try { await nativeScreenMask(s); }
      catch (e) { console.log("Trama nativa no disponible, se usa el motivo:", e); await refreshMask(s); }
    }
    checkCancel(ctx);
    ctx.reportProgress({ value: 0.4, commandName: "Limpieza" });

    // 2) Seleccionar la máscara de ART + limpieza + de-fringe (erosión de 1 px), todo en un viaje
    const radius = { none: null, standard: 0.6, high: 1.2 }[s.cleanup];
    const cleanup = [];
    if (radius) {
      if (s.cleanup === "high") cleanup.push({ _obj: "median", radius: px(1) });
      cleanup.push({ _obj: "gaussianBlur", radius: px(radius) }, { _obj: "thresholdClassEvent", level: 128 });
    }
    if (s.defringe) {
      cleanup.push({ _obj: "minimum", radius: px(1),
                     preserveShape: { _enum: "preserveShape", _value: "roundness" } });             // 🔍
    }
    await bp([
      { _obj: "select", _target: [layerById(L.art)], makeVisible: false },
      { _obj: "select", _target: [channel("mask")], makeVisible: false },
      ...cleanup
    ]);
    checkCancel(ctx);
    ctx.reportProgress({ value: 0.6, commandName: "Rasterizando" });

    // 3) Rasterizar y aplicar la máscara (+ defringe de capa), en un viaje
    await bp([
      { _obj: "select", _target: [channel("RGB")], makeVisible: false },
      { _obj: "rasterizeLayer", _target: [layerById(L.art)] },
      { _obj: "delete", _target: [channel("mask")], apply: true },
      ...(s.defringe ? [{ _obj: "defringe", width: 1 }] : [])                                       // 🔍
    ]);

    // 5) Resultado: documento nuevo con una sola capa con alfa
    const name = baseName(work.title).replace(/ - Prep$/, "") + " - Prepped";
    const layer = findLayer(work, L.art);
    layer.name = name;
    // Camino rápido: quitar SHIRT COLOR y MAP GROUP y duplicar el documento (una copia de píxeles, sin
    // crear antes un documento vacío). Si algo no cuadra, se usa el camino clásico.
    let out = null;
    try {
      for (const id of [L.shirt, L.mapGroup]) { const l = findLayer(work, id); if (l) await l.delete(); }
      out = await work.duplicate(name);                                                              // 🔍
      if (out.layers.length !== 1) { await out.closeWithoutSaving(); app.activeDocument = work; out = null; }
    } catch (e) { console.log("Duplicar documento falló, camino clásico:", e); out = null; }
    if (!out) {
      out = await app.documents.add({
        width: work.width, height: work.height, resolution: work.resolution,
        mode: constants.NewDocumentMode.RGB, fill: constants.DocumentFill.TRANSPARENT, name
      });
      const copy = await layer.duplicate(out);                                                      // 🔍
      for (const l of [...out.layers]) if (l.id !== copy.id) await l.delete();
    }
    await work.closeWithoutSaving();
    app.activeDocument = out;
    ctx.reportProgress({ value: 1, commandName: "Listo" });
  });
  resetState();
}

module.exports = { runPrep, applyPrep, cancelPrep, getWorkDoc };
