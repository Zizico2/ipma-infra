import { test } from "node:test";
import assert from "node:assert/strict";
import { releases, validateReleases } from "../scripts/releases.ts";

test("release pins reject floating refs and unintended source repositories", () => {
  const manifest = releases();
  assert.doesNotThrow(() => validateReleases(manifest));
  assert.throws(() =>
    validateReleases({
      ...manifest,
      "ipma-proxy": { ...manifest["ipma-proxy"], revision: "main" },
    }),
  );
  assert.throws(() =>
    validateReleases({
      ...manifest,
      "ipma-gateway": {
        ...manifest["ipma-gateway"],
        repository: "https://example.org/untrusted.git",
      },
    }),
  );
});
