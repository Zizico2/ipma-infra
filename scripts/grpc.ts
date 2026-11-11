import assert from "node:assert/strict";
import { loadSync } from "@grpc/proto-loader";
import {
  Client,
  credentials,
  Metadata,
  type MethodDefinition,
  type ServiceError,
} from "@grpc/grpc-js";

export type Data = Record<string, unknown>;

export function client(endpoint: string) {
  const url = new URL(endpoint);
  assert(
    ["http:", "https:"].includes(url.protocol),
    "Use an HTTP(S) gRPC origin",
  );
  assert(
    !url.username &&
      !url.password &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash,
  );
  const definition = loadSync("ipma/proxy/v1/proxy.proto", {
    includeDirs: [".sources/ipma-proto/proto"],
    longs: String,
    enums: String,
    defaults: false,
  });
  const methods = definition["ipma.proxy.v1.ProxyService"] as Record<
    string,
    MethodDefinition<Data, Data>
  >;
  const transport = new Client(
    url.host,
    url.protocol === "https:"
      ? credentials.createSsl()
      : credentials.createInsecure(),
    {
      "grpc.max_receive_message_length": 32 * 1024 * 1024,
    },
  );
  return {
    close: () => transport.close(),
    ready: () =>
      new Promise<void>((resolve, reject) =>
        transport.waitForReady(Date.now() + 60_000, (error) =>
          error ? reject(error) : resolve(),
        ),
      ),
    call: (
      method: string,
      request: Data = {},
      headers: Record<string, string> = {},
    ) =>
      new Promise<Data>((resolve, reject) => {
        const rpc = methods[method];
        assert(rpc, `Unknown RPC ${method}`);
        const metadata = new Metadata();
        for (const [key, value] of Object.entries(headers))
          metadata.set(key, value);
        transport.makeUnaryRequest(
          `/${"ipma.proxy.v1.ProxyService"}/${method}`,
          rpc.requestSerialize,
          rpc.responseDeserialize,
          request,
          metadata,
          { deadline: Date.now() + 60_000 },
          (error: ServiceError | null, response?: Data) =>
            error ? reject(error) : resolve(response!),
        );
      }),
  };
}
