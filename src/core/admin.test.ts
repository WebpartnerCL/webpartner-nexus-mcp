import { test } from "node:test";
import assert from "node:assert/strict";
import { pickClientUpdate, mergeClientList } from "./admin.js";

test("pickClientUpdate: whitelist ignora claves no editables + acepta válidas", () => {
  const ok = pickClientUpdate({ plan: "pro", activo: false, cal_url: "https://cal.com/x", ignorame: "no" });
  assert.equal(ok.error, undefined);
  assert.deepEqual(ok.update, { plan: "pro", activo: false, cal_url: "https://cal.com/x" });
});

test("pickClientUpdate: plan inválido", () => {
  assert.match(pickClientUpdate({ plan: "ultra" }).error ?? "", /plan inválido/);
});

test("pickClientUpdate: cerebro inválido", () => {
  assert.match(pickClientUpdate({ cerebro: "grok" }).error ?? "", /cerebro inválido/);
});

test("pickClientUpdate: activo no-boolean", () => {
  assert.match(pickClientUpdate({ activo: "si" }).error ?? "", /activo/);
});

test("pickClientUpdate: sin campos editables → error", () => {
  assert.match(pickClientUpdate({ slug: "x" }).error ?? "", /nada que actualizar/);
});

test("pickClientUpdate: null permitido en campos nullable", () => {
  assert.deepEqual(pickClientUpdate({ rubro: null }).update, { rubro: null });
});

test("mergeClientList: une suscripción viva o deja null", () => {
  const clientes = [
    { id: "a", slug: "uno", nombre_negocio: "Uno", rubro: null, plan: "pro", activo: true, cal_url: null },
    { id: "b", slug: "dos", nombre_negocio: "Dos", rubro: "x", plan: "free", activo: true, cal_url: null },
  ];
  const subs = [{ cliente_id: "a", estado: "trial", peldano: "N1", base_monto: 0, moneda: "CLP" }];
  const out = mergeClientList(clientes, subs);
  assert.equal(out[0].suscripcion?.estado, "trial");
  assert.equal(out[1].suscripcion, null);
});
