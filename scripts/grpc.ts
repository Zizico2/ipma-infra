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

export function client(endpoint: string, publicData = false) {
  const schema = publicData
    ? {
        file: "ipma/public_data/v1/public_data.proto",
        directory: ".sources/ipma-public-data-proto/proto",
        service: "ipma.public_data.v1.PublicDataService",
      }
    : {
        file: "ipma/proxy/v1/proxy.proto",
        directory: ".sources/ipma-proto/proto",
        service: "ipma.proxy.v1.ProxyService",
      };
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
  const definition = loadSync(schema.file, {
    includeDirs: [schema.directory],
    longs: String,
    enums: String,
    defaults: false,
  });
  const methods = definition[schema.service] as Record<
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
          `/${schema.service}/${method}`,
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
