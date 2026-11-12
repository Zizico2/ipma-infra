import assert from "node:assert/strict";
import { client, type Data } from "./grpc.ts";

const args = process.argv.slice(2);
assert(
  args.length === 0 || args.length === 2 || args.length === 4,
  "Use zero, two, or four endpoint URLs",
);
async function smokePair(
  adapterUrl: string,
  gatewayUrl: string,
  publicData: boolean,
) {
  const method = publicData ? "GetForecast" : "GetWeatherForecast";
  const adapter = client(adapterUrl, publicData);
  const gateway = client(gatewayUrl, publicData);
  try {
    await Promise.all([adapter.ready(), gateway.ready()]);
    for (const service of [adapter, gateway])
      assert.equal((await service.call("Ping")).message, "pong");
    const request = { locationId: 1110600 };
    const direct = await adapter.call(method, request);
    assert(!(direct.metadata as Data).expiresAt, "adapter must not cache");
    const forecasts = direct.forecasts as Data[];
    assert(forecasts.length > 0);
    if (publicData) {
      assert(
        forecasts.some((row) => row.periodHours === 1),
        "missing hourly forecast",
      );
      assert(
        (direct.metadata as Data).sourceUrl
          ?.toString()
          .includes("/public-data/"),
      );
      assert((await adapter.call("GetLocations")).locations instanceof Array);
      assert((await adapter.call("GetDistricts")).districts instanceof Array);
      assert(Array.isArray((await adapter.call("GetWarnings")).warnings ?? []));
    }
    const first = await gateway.call(method, request, {
      "x-forwarded-for": "192.0.2.1",
    });
    const second = await gateway.call(method, request, {
      "x-forwarded-for": "192.0.2.2",
    });
    assert(
      (first.metadata as Data).expiresAt,
      "gateway public request bypassed cache",
    );
    assert.deepEqual(first, second, "gateway did not reuse cached response");
    const bypass = await gateway.call(method, request, {
      "x-cache-bypass": "smoke-test",
    });
    assert(
      !(bypass.metadata as Data).expiresAt,
      "application context must bypass shared cache",
    );
    console.log(
      `PASS: ${publicData ? "public-data" : "open-data"} native gRPC, direct fetch, ingress cache reuse, context bypass`,
    );
  } finally {
    adapter.close();
    gateway.close();
  }
}
await smokePair(
  args[0] ?? "http://127.0.0.1:50051",
  args[1] ?? "http://127.0.0.1:50052",
  false,
);
if (args.length !== 2)
  await smokePair(
    args[2] ?? "http://127.0.0.1:50053",
    args[3] ?? "http://127.0.0.1:50054",
    true,
  );
