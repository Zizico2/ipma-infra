import { client } from "./grpc.ts";

const [endpoint, method = "Ping", countText = "20"] = process.argv.slice(2);
if (
  !endpoint ||
  !["Ping", "GetWeatherForecast", "GetForecast"].includes(method)
)
  throw new Error(
    "Usage: npm run benchmark -- ENDPOINT [Ping|GetWeatherForecast|GetForecast] [count]",
  );
const count = Number(countText);
if (!Number.isInteger(count) || count < 1 || count > 1000)
  throw new Error("count must be 1..1000");
const service = client(
  endpoint,
  method === "GetForecast" || process.env.IPMA_PUBLIC_DATA === "1",
);
const samples: number[] = [];
let failures = 0;
try {
  // The first sample includes connection setup and any service cold start.
  for (let index = 0; index < count; index++) {
    const started = performance.now();
    try {
      const result = await service.call(
        method,
        method !== "Ping" ? { locationId: 1110600 } : {},
      );
      const elapsed = performance.now() - started;
      samples.push(elapsed);
      console.log(
        JSON.stringify({
          type: "sample",
          index,
          endpoint,
          method,
          elapsedMs: elapsed,
          metadata: result.metadata,
        }),
      );
    } catch (error) {
      failures++;
      console.error(
        JSON.stringify({ type: "error", index, message: String(error) }),
      );
    }
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const percentile = (p: number) =>
    sorted[Math.max(0, Math.ceil(sorted.length * p) - 1)] ?? null;
  console.log(
    JSON.stringify({
      type: "summary",
      timestamp: new Date().toISOString(),
      endpoint,
      method,
      count,
      failures,
      firstMs: samples[0],
      p50Ms: percentile(0.5),
      p95Ms: percentile(0.95),
      p99Ms: percentile(0.99),
    }),
  );
  if (failures) process.exitCode = 1;
} finally {
  service.close();
}
