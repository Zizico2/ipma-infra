# Portability and measurement

Portable assets are `containers/`, `compose.yaml`, `releases.json`, source-fetch
validation and the native gRPC probes. The images run as a non-root user, require
no persistent disk or Google libraries, accept configuration through environment
variables and shut down on SIGTERM. They are built once and deployed by digest.
The image labels record source repository/revision. `ipma-proto` and `ipma-public-data-proto` are consumed by
their respective service pairs as a pinned Git dependency, not copied into an image's runtime.

`providers/cloud-run/` owns Google resource names, IAM, registry, HTTP/2 ingress,
startup probes, scaling and OIDC setup. Another container target should add its
own directory and workflow while reusing the tested image contract. It should
not wrap Cloud Run's Terraform resources or require changes to Rust application
logic. Hosting the registry on Google does not prevent copying an OCI image to
another registry. Pull/copy the exact digest; do not rebuild and assume identity.

Each gateway process has a separate Moka cache and miss coalescing scope. Scale
to zero, restart or deployment loses that cache. A higher minimum instance count
changes both cost and benchmark behavior; record it. The two services in each pair
can incur separate cold starts. The gateway uses HTTPS to the independently
public adapter; provider IAM authentication has not been added to the app.

Smoke tests check a real upstream fetch and cache reuse. The small benchmark
client emits JSON Lines samples plus p50/p95/p99, error count and source metadata:

```sh
rtk proxy just benchmark https://GATEWAY_HOST GetWeatherForecast 100
rtk proxy just benchmark https://ADAPTER_HOST Ping 100
```

The first sample includes connection establishment; it is **not proof of a cold
container start**. Confirm cold starts using platform instance/startup logs.
Sequential latency samples do not measure throughput or concurrency scaling.
Forecast benchmarks against the adapter contact IPMA on every call. Keep loads
modest and separate upstream time from infrastructure performance.

For comparisons, record image/source digests, region, client location, instance
limits, resource sizes, request concurrency, cache settings and log settings.
Measure adapter-direct, gateway-hit, gateway-miss, cold/warm and concurrent-miss
paths independently. Correlate source `fetched_at`/`expires_at` with request logs
to distinguish cached responses from repeated fetching. Platform request logs,
CPU/memory/instance metrics and billing reports supply the baseline monitoring.
Distributed spans and application cache counters are a future instrumentation
change; this repository does not claim they already exist.

Use the same OpenTelemetry interfaces if instrumentation is added later. Avoid
placing provider SDK calls into the adapter or using a provider trace ID as a
cache key. Forwarded metadata needs a reviewed cache-neutral list at every new
ingress. The existing smoke test deliberately changes a forwarded header and
fails if it accidentally disables caching.
