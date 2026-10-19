const test = require("node:test");
const assert = require("node:assert");
const { installDocument, fakeElement } = require("./stubs");
const sliders = require("../src/ui/levelsSlider");

function setup(make) {
  const doc = installDocument();
  const root = fakeElement();
  const changes = [], commits = [];
  const s = make(root, v => changes.push(v), v => commits.push(v));
  return { doc, root, s, changes, commits };
}

test("restricciones de niveles", () => {
  assert.strictEqual(sliders.constrainIn("black", 300, { white: 100 }), 98);
  assert.strictEqual(sliders.constrainIn("white", 1, { black: 50 }), 52);
  assert.strictEqual(sliders.constrainOut("outBlack", 200, { outWhite: 150 }), 150);
  assert.strictEqual(sliders.constrainOut("outWhite", 10, { outBlack: 20 }), 20);
});

test("onChange solo cuando el valor cambia; onCommit al soltar si hubo cambio", () => {
  const { doc, root, s, changes, commits } = setup((r, ch, co) =>
    sliders.createValueSlider(r, "shadow", { min: 0, max: 100 }, ch, co));
  s.set({ shadow: 40 });
  root.fire("mousedown", { clientX: 40 });          // mismo valor: nada
  doc.fire("mousemove", { clientX: 40.2, buttons: 1 });
  assert.strictEqual(changes.length, 0);
  doc.fire("mouseup");
  assert.strictEqual(commits.length, 0);

  root.fire("mousedown", { clientX: 60 });
  doc.fire("mousemove", { clientX: 60.3, buttons: 1 }); // redondea a 60: sin cambio
  doc.fire("mousemove", { clientX: 70, buttons: 1 });
  assert.deepStrictEqual(changes.map(v => v.shadow), [60, 70]);
  doc.fire("mouseup");
  assert.deepStrictEqual(commits.map(v => v.shadow), [70]);
});

test("arrastre soltado fuera del panel (buttons = 0) termina el arrastre", () => {
  const { doc, root, s, changes, commits } = setup((r, ch, co) =>
    sliders.createValueSlider(r, "lpi", { min: 0, max: 100 }, ch, co));
  s.set({ lpi: 10 });
  root.fire("mousedown", { clientX: 20 });
  doc.fire("mousemove", { clientX: 50, buttons: 0 });
  doc.fire("mousemove", { clientX: 80, buttons: 0 });
  assert.deepStrictEqual(changes.map(v => v.lpi), [20]);
  assert.deepStrictEqual(commits.map(v => v.lpi), [20]);
});

test("slider de entrada: gamma se mueve entre negro y blanco", () => {
  const { doc, root, s, changes } = setup((r, ch) => sliders.createInputSlider(r, ch));
  s.set({ black: 0, gamma: 1, white: 255 });
  const gammaHandle = root.children[1];
  gammaHandle.fire("mousedown");
  doc.fire("mousemove", { clientX: 25, buttons: 1 });  // a la izquierda del centro: gamma > 1
  assert.strictEqual(changes.length, 1);
  assert.ok(changes[0].gamma > 1 && changes[0].gamma <= 9.99);
  assert.strictEqual(changes[0].black, 0);
});
