import assert from "node:assert/strict";

import { createPlugin, defineAction } from "../dist/index.js";
import { createNodeServer } from "../dist/node.js";

const plugin = createPlugin({
  id: "node-smoke",
  label: "Node Smoke",
  actions: [
    defineAction({
      id: "echo",
      label: "Echo",
      parameters: [],
      execute: async ({ parameters }) => ({
        success: true,
        data: {
          parameters,
        },
      }),
    }),
  ],
  triggers: [],
});

const server = createNodeServer(plugin);

await new Promise((resolve) => {
  server.listen(0, "127.0.0.1", resolve);
});

const address = server.address();

if (address === null || typeof address === "string") {
  throw new Error("Expected server to listen on a TCP address");
}

const baseUrl = `http://127.0.0.1:${address.port}`;

try {
  const manifestResponse = await fetch(`${baseUrl}/manifest`);
  const manifest = await manifestResponse.json();

  assert.equal(manifestResponse.status, 200);
  assert.equal(manifest.id, "node-smoke");

  const actionResponse = await fetch(`${baseUrl}/actions/echo/execute`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ parameters: { ok: true } }),
  });
  const actionResult = await actionResponse.json();

  assert.equal(actionResponse.status, 200);
  assert.deepEqual(actionResult, {
    success: true,
    data: {
      parameters: { ok: true },
    },
  });

  console.log("Node smoke test passed");
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
      } else {
        resolve(undefined);
      }
    });
  });
}
