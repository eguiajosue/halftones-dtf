const test = require("node:test");
const assert = require("node:assert");
const { createLiveQueue } = require("../src/liveQueue");

const tick = () => new Promise(r => setTimeout(r, 5));

// sync falso: registra cada lote; failWith() devuelve el mensaje de error a lanzar, o null
function fakeSync({ failWith = () => null, delay = 10 } = {}) {
  const calls = [];
  const sync = async kinds => {
    calls.push([...kinds].sort());
    await new Promise(r => setTimeout(r, delay));
    const m = failWith(kinds);
    if (m) throw new Error(m);
  };
  return { sync, calls };
}

test("coalescencia: lo marcado durante un sync se aplica en un solo lote", async () => {
  const f = fakeSync();
  const q = createLiveQueue({ sync: f.sync });
  q.mark("levels"); q.pump();
  q.mark("ht"); q.pump(); q.mark("ht", "shirt"); q.pump();
  await q.drain();
  assert.deepStrictEqual(f.calls, [["levels"], ["ht", "shirt"]]);
  assert.strictEqual(q.pending().size, 0);
});

test("WRONG_DOC: se conserva y se reintenta al volver a bombear", async () => {
  let wrong = true;
  const f = fakeSync({ failWith: () => (wrong ? "WRONG_DOC" : null) });
  const errors = [];
  const q = createLiveQueue({ sync: f.sync, onError: e => errors.push(e.message) });
  q.mark("levels"); await q.pump();
  assert.deepStrictEqual(errors, ["WRONG_DOC"]);
  assert.deepStrictEqual([...q.pending()], ["levels"]);
  wrong = false;
  await q.pump();
  assert.strictEqual(q.pending().size, 0);
  assert.strictEqual(f.calls.length, 2);
});

test("otro error: no se reintenta en bucle, queda pendiente para flush()", async () => {
  let broken = true;
  const f = fakeSync({ failWith: () => (broken ? "descriptor" : null) });
  const q = createLiveQueue({ sync: f.sync, onError: () => {} });
  q.mark("shadow"); await q.pump();
  assert.strictEqual(f.calls.length, 1);
  assert.deepStrictEqual([...q.pending()], ["shadow"]);
  await assert.rejects(q.flush(), /descriptor/);
  assert.deepStrictEqual([...q.pending()], ["shadow"]);
  broken = false;
  await q.flush();
  assert.strictEqual(q.pending().size, 0);
});

test("canPump false: no aplica, pero no pierde nada", async () => {
  let can = false;
  const f = fakeSync();
  const q = createLiveQueue({ sync: f.sync, canPump: () => can });
  q.mark("ko"); await q.pump();
  assert.strictEqual(f.calls.length, 0);
  can = true; await q.pump();
  assert.deepStrictEqual(f.calls, [["ko"]]);
});

test("defer + flush: un cambio diferido (slider al soltar) se aplica antes de Aplicar", async () => {
  const f = fakeSync();
  const q = createLiveQueue({ sync: f.sync });
  q.defer("shadow");
  q.mark("levels"); q.pump();
  await tick();
  await q.flush();                                  // espera al sync en curso y aplica lo diferido
  assert.deepStrictEqual(f.calls, [["levels"], ["shadow"]]);
});

test("drain espera al sync en vuelo; onBusy se apaga al terminar", async () => {
  const busy = [];
  const f = fakeSync({ delay: 30 });
  const q = createLiveQueue({ sync: f.sync, onBusy: on => busy.push(on) });
  q.mark("ht"); q.pump();
  assert.strictEqual(q.isPumping(), true);
  await q.drain();
  assert.strictEqual(q.isPumping(), false);
  assert.deepStrictEqual(busy, [true, false]);
});
