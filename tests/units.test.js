const test = require("node:test");
const assert = require("node:assert");
const { toPx, fromPx, lpiToLpc, RES } = require("../src/ui/units");

test("unidades: ida y vuelta in/cm/mm a 300 ppi", () => {
  assert.strictEqual(RES, 300);
  assert.strictEqual(toPx(10, "in"), 3000);
  assert.strictEqual(toPx(2.54, "cm"), 300);
  assert.strictEqual(toPx(25.4, "mm"), 300);
  for (const u of ["in", "cm", "mm"]) {
    for (const px of [1, 300, 1234, 6000]) assert.ok(Math.abs(toPx(fromPx(px, u), u) - px) <= 1, `${u} ${px}`);
  }
  assert.strictEqual(fromPx(3000, "in"), 10);
  assert.ok(Math.abs(lpiToLpc(25.4) - 10) < 1e-9);
});
