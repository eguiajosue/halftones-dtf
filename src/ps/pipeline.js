const { app, constants } = require("photoshop");
const { state, resetState } = require("../state");
const perf = require("../perf");
const {
  bp, bpThenId, modal, px, validId, layerById, targetLayer, channel, selectLayer, findLayer, baseName
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

// Fusiona las capas visibles en una sola (conserva la transparencia) y descarta las ocultas:
// el objeto inteligente ART no arrastra un PSB con todas las capas originales.
async function mergeVisibleLayers(work) {
  try {
    const visible = work.layers.filter(l => l.visible);
    if (visible.length > 1) await bp({ _obj: "mergeVisible" });                                          // 🔍
    const keep = work.layers.filter(l => l.visible);
    if (keep.length !== 1) return;                                           // estado inesperado: se deja como estaba
    for (const l of [...work.layers]) if (l.id !== keep[0].id) await l.delete();
  } catch (e) { console.log("No se pudo fusionar las capas visibles:", e); }
}

// ---- Preparar ---------------------------------------------------------------
// s = ajustes de la UI + widthPx / heightPx (tamaño objetivo a 300 ppi)
function runPrep(s) { return perf.track("Preparar", () => runPrepTracked(s)); }

async function runPrepTracked(s) {
  const src = app.activeDocument;
  if (!src) throw new Error("No hay documento abierto.");
  state.phase = "RUNNING";
  state.srcDocId = src.id;
  let work = null;
  let stage = "inicio";
  const at = n => { stage = n; };

  try {
    await modal("Open-DTF: Preparar", async (ctx) => {
      // 1) Duplicar (documento de trabajo); el original nunca se toca
      at("duplicar documento");
      work = await src.duplicate(`${baseName(src.title)} - Prep`);
      app.activeDocument = work;
      state.workDocId = work.id;
      if (work.mode !== constants.DocumentMode.RGB) await work.changeMode(constants.ChangeMode.RGB);
      // 8 bits/canal: con 16/32 bits la memoria y el tiempo de cada render se duplican o cuadruplican
      try { await bp({ _obj: "convertMode", depth: 8, merge: false, rasterize: false }); }                // 🔍
      catch (e) { console.log("Profundidad 8 bits no aplicada:", e); }

      at("historial");
      const hid = await ctx.hostControl.suspendHistory({ documentID: work.id, name: "Open-DTF: Preparar" });
      try {
        ctx.reportProgress({ value: 0.1, commandName: "Duplicando documento" });

        // 2) Redimensionar a 300 ppi y tamaño objetivo
        at(`redimensionar (${s.widthPx}x${s.heightPx})`);
        await work.resizeImage(s.widthPx, s.heightPx, 300, constants.ResampleMethod.BICUBICAUTOMATIC);
        checkCancel(ctx);
        ctx.reportProgress({ value: 0.25, commandName: "Redimensionando" });

        // 3) Aplanar todo en un objeto inteligente "ART"
        at("objeto inteligente ART");
        await mergeVisibleLayers(work);
        const artId = await bpThenId([{ _obj: "selectAllLayers", _target: [targetLayer] }, { _obj: "newPlacedLayer" }]);   // 🔍
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
        at("MAP DESAT / MAP LEVELS / MAP DOTS / umbral");
        const desat = await L_.makeMapDesat("MAP DESAT", s.colorSens);
        const desatId = desat.id;
        state.desatKind = desat.kind;
        const levelsId = await L_.makeLevels("MAP LEVELS", s);
        let curvesId = null;               // punto mín./máx.: si Photoshop no acepta la curva, la función queda desactivada
        try { curvesId = await L_.makeCurves("MAP DOTS", s.dotMin, s.dotMax); }
        catch (e) { console.log("Curva de punto mín./máx. no disponible:", e); }
        const thrId = await L_.makeThreshold("MAP THRESHOLD");
        at("capa de semitono");
        const htId = await L_.makeHalftoneLayer(s.htType, s.lpi, s.angle);
        await findLayer(work, htId).moveAbove(findLayer(work, thrId));
        checkCancel(ctx);
        ctx.reportProgress({ value: 0.6, commandName: "Construyendo mapa de semitono" });

        at("agrupar MAP GROUP");
        const members = [mapBgId, mapArtId, koId, desatId, levelsId, curvesId, thrId, htId].filter(id => id !== null).map(id => {
          const l = findLayer(work, id);
          if (!l) throw new Error(`Capa no encontrada (id ${id})`);
          return l;
        });
        const group = await work.createLayerGroup({ name: "MAP GROUP", fromLayers: members });        // 🔍
        const mapGroupId = validId(group.id, "MAP GROUP");

        Object.assign(state.layers, { art: artId, shirt: shirtId, mapGroup: mapGroupId, mapArt: mapArtId,
          mapBg: mapBgId, ko: koId, desat: desatId, levels: levelsId, threshold: thrId, halftone: htId });
        if (curvesId !== null) state.layers.curves = curvesId;

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
  await L_.cleanupPatterns();
}

// ---- Aplicar -----------------------------------------------------------------
function applyPrep(s) { return perf.track("Aplicar", () => applyPrepTracked(s)); }

async function applyPrepTracked(s) {
  await modal("Open-DTF: Aplicar", async (ctx) => {
    const work = getWorkDoc();
    app.activeDocument = work;
    const L = state.layers;
    ctx.reportProgress({ value: 0.1, commandName: "Calculando máscara" });

    // 1) Máscara final: motor nativo de Mapa de bits (opcional) o motivo + Hard Mix
    if (!state.maskFresh) await refreshMask(s);          // la vista en vivo ya la dejó al día
    if (s.nativeFinal && s.halftone && s.knockout) {
      try { await nativeScreenMask(s); }
      catch (e) { console.log("Trama nativa no disponible, se usa el motivo:", e); await refreshMask(s); }
      state.maskFresh = false;
    }
    checkCancel(ctx);

    await selectLayer(L.art);
    await bp({ _obj: "select", _target: [channel("mask")], makeVisible: false });
    ctx.reportProgress({ value: 0.4, commandName: "Limpieza" });

    // 2) Limpieza sobre la máscara
    const radius = { none: null, standard: 0.6, high: 1.2 }[s.cleanup];
    if (radius) {
      if (s.cleanup === "high") await bp({ _obj: "median", radius: px(1) });
      await bp([{ _obj: "gaussianBlur", radius: px(radius) }, { _obj: "thresholdClassEvent", level: 128 }]);
    }
    // 3) De-fringe: erosionar 1 px la máscara
    if (s.defringe) {
      await bp({ _obj: "minimum", radius: px(1),
                 preserveShape: { _enum: "preserveShape", _value: "roundness" } });                 // 🔍
    }
    checkCancel(ctx);
    ctx.reportProgress({ value: 0.6, commandName: "Rasterizando" });

    // 4) Liberar las capas de trabajo (el mapa ya está en la máscara), rasterizar y aplicar la máscara
    await bp({ _obj: "select", _target: [channel("RGB")], makeVisible: false });
    try {
      await bp({ _obj: "delete", _target: [layerById(L.mapGroup), layerById(L.shirt)] });
    } catch (e) { console.log("No se pudieron liberar las capas de trabajo:", e); }
    await bp([
      { _obj: "rasterizeLayer", _target: [layerById(L.art)] },
      { _obj: "delete", _target: [channel("mask")], apply: true }
    ]);
    if (s.defringe) await bp({ _obj: "defringe", width: 1 });                                       // 🔍

    // 5) Resultado: documento nuevo con una sola capa con alfa
    const name = baseName(work.title).replace(/ - Prep$/, "") + " - Prepped";
    const layer = findLayer(work, L.art);
    layer.name = name;
    ctx.reportProgress({ value: 0.85, commandName: "Creando documento final" });
    const out = await app.documents.add({
      width: work.width, height: work.height, resolution: work.resolution,
      mode: constants.NewDocumentMode.RGB, fill: constants.DocumentFill.TRANSPARENT, name
    });
    const copy = await layer.duplicate(out);                                                        // 🔍
    for (const l of [...out.layers]) if (l.id !== copy.id) await l.delete();
    await work.closeWithoutSaving();
    app.activeDocument = out;
    ctx.reportProgress({ value: 1, commandName: "Listo" });
  });
  resetState();
  await L_.cleanupPatterns();
}

module.exports = { runPrep, applyPrep, cancelPrep, getWorkDoc };
