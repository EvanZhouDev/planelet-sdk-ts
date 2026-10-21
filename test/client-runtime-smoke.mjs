import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SourceTextModule, createContext } from "node:vm";

const source = await readFile(new URL("../dist/client.js", import.meta.url), "utf8");
const revision = "963452075e9d7e2a47a482f297143af5ed4f76c0";
const options = { baseUrl: "https://example.com", integrationId: "security-fixture" };
const event = { eventType: "security.fixture", payload: {} };

async function checkRuntime(globals, allowed) {
  let calls = 0;
  const fetch = async () => {
    calls++;
    return new Response(null, { status: 202 });
  };
  const context = createContext({ URL, Headers, fetch, ...globals });
  const module = new SourceTextModule(source, { context });
  await module.link(() => {
    throw new Error("The browser-safe client must not import runtime modules");
  });
  await module.evaluate();
  const { SuperPlaneClient, SuperPlaneClientError } = module.namespace;
  if (allowed) {
    assert.equal((await new SuperPlaneClient(options).emitEvent(event)).status, 202);
    assert.equal(calls, 1);
  } else {
    for (const defaultOptions of [options, { ...options, fetch: null }]) {
      assert.throws(
        () => new SuperPlaneClient(defaultOptions),
        (error) => error instanceof SuperPlaneClientError && error.status === 0,
      );
    }
    assert.equal(calls, 0);
  }
  const previousCalls = calls;
  const custom = new SuperPlaneClient({ ...options, fetch });
  assert.equal((await custom.emitEvent(event)).status, 202);
  assert.equal(calls, previousCalls + 1);
}

for (const version of ["22.23.4", "22.24.0", "24.22.1", "24.23.0", "26.12.1", "27.0.0"]) {
  await checkRuntime({ process: { versions: { node: version } } }, true);
}
for (const version of [
  "20.99.0",
  "22.23.3",
  "23.99.0",
  "24.22.0",
  "25.99.0",
  "26.12.0",
  "26.12.1-rc.1",
  "unknown",
]) {
  await checkRuntime({ process: { versions: { node: version } } }, false);
}
await checkRuntime({ Bun: { version: "1.4.4", revision } }, true);
await checkRuntime(
  { process: { versions: { node: "26.3.0" } }, Bun: { version: "1.4.4", revision } },
  true,
);
await checkRuntime({ Bun: { version: "1.3.14", revision: "unsafe" } }, false);
await checkRuntime({ Bun: { version: "1.4.4", revision: "unreviewed" } }, false);
await checkRuntime({ Bun: { version: "1.5.0", revision } }, false);
await checkRuntime({ Bun: {} }, false);
await checkRuntime({}, true);
await checkRuntime({ process: { versions: {} } }, true);
console.log("Runtime boundary, custom fetch, and browser-without-process contracts passed");
