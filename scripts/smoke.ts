import assert from "node:assert/strict";
import { client, type Data } from "./grpc.ts";

const [
  adapterUrl = "http://127.0.0.1:50051",
  gatewayUrl = "http://127.0.0.1:50052",
] = process.argv.slice(2);
const adapter = client(adapterUrl);
const gateway = client(gatewayUrl);
try {
  await Promise.all([adapter.ready(), gateway.ready()]);
  for (const service of [adapter, gateway]) {
    assert.equal((await service.call("Ping")).message, "pong");
  }
  const request = { locationId: 1110600 };
  const direct = await adapter.call("GetWeatherForecast", request);
  assert(!(direct.metadata as Data).expiresAt, "adapter must not cache");
  assert((direct.forecasts as unknown[]).length > 0);
  const first = await gateway.call("GetWeatherForecast", request, {
    "x-forwarded-for": "192.0.2.1",
  });
  const second = await gateway.call("GetWeatherForecast", request, {
    "x-forwarded-for": "192.0.2.2",
  });
  assert(
    (first.metadata as Data).expiresAt,
    "gateway public request bypassed cache; inspect ingress metadata",
  );
  assert.deepEqual(first, second, "gateway did not reuse the cached response");
  const bypass = await gateway.call("GetWeatherForecast", request, {
    "x-cache-bypass": "smoke-test",
  });
  assert(
    !(bypass.metadata as Data).expiresAt,
    "application context must bypass shared cache",
  );
  console.log(
    "PASS: native gRPC, adapter HTTPS egress, gateway cache across ingress headers, caller-context bypass",
  );
} finally {
  adapter.close();
  gateway.close();
}
