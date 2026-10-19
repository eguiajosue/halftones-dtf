const test = require("node:test");
const assert = require("node:assert");
const { memoryFolder, useFolder } = require("./stubs");
const { DEFAULTS } = require("../src/state");
const presets = require("../src/presets");

test("normalize: valida tipos, rangos y listas", () => {
  const p = presets.normalize({ lpi: "30", angle: 999, htType: "FOO", cleanup: "x", halftone: "no",
    black: 300, white: 10, outBlack: 200, outWhite: 100, gamma: 50, shadow: -5,
    knockoutColor: { r: 300, g: "12", b: null }, shirt: "rojo", extra: 1 });
  assert.strictEqual(p.lpi, 30);
  assert.strictEqual(p.angle, 360);
  assert.strictEqual(p.htType, DEFAULTS.htType);
  assert.strictEqual(p.cleanup, DEFAULTS.cleanup);
  assert.strictEqual(p.halftone, DEFAULTS.halftone);
  assert.strictEqual(p.black, 253);
  assert.strictEqual(p.white, 255);                 // blanco > negro + 2
  assert.ok(p.outWhite >= p.outBlack);
  assert.strictEqual(p.gamma, 9.99);
  assert.strictEqual(p.shadow, 0);
  assert.deepStrictEqual(p.knockoutColor, { r: 255, g: 12, b: 0 });
  assert.deepStrictEqual(p.shirt, DEFAULTS.shirt);
  assert.ok(!("extra" in p));
  assert.deepStrictEqual(Object.keys(p).sort(), Object.keys(DEFAULTS).sort());
  assert.deepStrictEqual(presets.normalize(null), DEFAULTS);
});

test("guardar, listar, cargar y borrar", async () => {
  const folder = memoryFolder();
  useFolder(folder);
  assert.deepStrictEqual(await presets.list(), ["Default"]);
  await presets.save("A&B <x>", { ...DEFAULTS, lpi: 45 });
  assert.deepStrictEqual(await presets.list(), ["Default", "A&B <x>"]);
  assert.strictEqual((await presets.load("A&B <x>")).lpi, 45);
  await assert.rejects(presets.save("Default", DEFAULTS));
  await assert.rejects(presets.save("   ", DEFAULTS));
  await presets.remove("A&B <x>");
  assert.deepStrictEqual(await presets.list(), ["Default"]);
  assert.strictEqual(presets.takeWarning(), null);
});

test("JSON dañado: se hace copia y se avisa, no se pierde en silencio", async () => {
  const folder = memoryFolder({ "presets.json": "{ esto no es json" });
  useFolder(folder);
  assert.deepStrictEqual(await presets.list(), ["Default"]);
  const bak = Object.keys(folder.files).find(n => n.startsWith("presets.bak-"));
  assert.ok(bak, "debe existir la copia");
  assert.strictEqual(folder.files[bak], "{ esto no es json");
  assert.match(presets.takeWarning(), /dañado/);
  assert.strictEqual(presets.takeWarning(), null);  // solo una vez
  await presets.save("Nuevo", DEFAULTS);
  assert.deepStrictEqual(await presets.list(), ["Default", "Nuevo"]);
  assert.strictEqual(folder.files[bak], "{ esto no es json");
});
