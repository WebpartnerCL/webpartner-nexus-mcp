import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveClienteId } from "./metering.js";
import type { AuthInfo } from "./auth.js";

const service: AuthInfo = {
  apiKeyId: "k1",
  ownerClienteId: "owner",
  plan: "scale",
  isService: true,
};
const tenant: AuthInfo = {
  apiKeyId: "k2",
  ownerClienteId: "tenantA",
  plan: "pro",
  isService: false,
};

test("llave de servicio usa el cliente_id de los args", () => {
  assert.equal(resolveClienteId(service, "clienteX"), "clienteX");
});

test("llave de servicio sin cliente_id → lanza", () => {
  assert.throws(() => resolveClienteId(service, undefined));
  assert.throws(() => resolveClienteId(service, null));
});

test("llave de tenant ignora args y usa su dueño", () => {
  assert.equal(resolveClienteId(tenant, undefined), "tenantA");
  assert.equal(resolveClienteId(tenant, "tenantA"), "tenantA");
});

test("llave de tenant con cliente_id de OTRO tenant → lanza (aislamiento)", () => {
  assert.throws(() => resolveClienteId(tenant, "otroTenant"));
});
