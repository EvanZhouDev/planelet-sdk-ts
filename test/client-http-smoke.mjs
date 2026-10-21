import assert from "node:assert/strict";
import { createServer } from "node:http";

import { SuperPlaneClientError, createSuperPlaneClient } from "../dist/index.js";

const requests = [];
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  requests.push({
    method: request.method,
    url: request.url,
    headers: request.headers,
    body: JSON.parse(Buffer.concat(chunks).toString()),
  });
  if (requests.length === 1) {
    response.writeHead(202, { "content-type": "application/json" });
    response.end('{"accepted":true}');
  } else {
    response.writeHead(503, { "content-type": "text/plain" });
    response.end("temporarily unavailable");
  }
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Expected a TCP listener");

try {
  const client = createSuperPlaneClient({
    baseUrl: `http://127.0.0.1:${address.port}/superplane/?discard=1#discard`,
    integrationId: "integration/with spaces",
    token: "local-test-token",
    headers: { "x-client-test": "present" },
  });
  const event = { eventType: "test.finished", payload: { passed: true } };
  const response = await client.emitEvent(event);
  assert.equal(response.status, 202);
  assert.deepEqual(await response.json(), { accepted: true });
  assert.equal(requests.length, 1);
  assert.equal(requests[0].method, "POST");
  assert.equal(
    requests[0].url,
    "/superplane/api/v1/integrations/integration%2Fwith%20spaces/events",
  );
  assert.equal(requests[0].headers.authorization, "Bearer local-test-token");
  assert.equal(requests[0].headers["content-type"], "application/json");
  assert.equal(requests[0].headers["x-client-test"], "present");
  assert.deepEqual(requests[0].body, event);

  await assert.rejects(client.emitEvent(event), (error) => {
    assert.ok(error instanceof SuperPlaneClientError);
    assert.equal(error.status, 503);
    assert.equal(error.responseBody, "temporarily unavailable");
    return true;
  });
  assert.equal(requests.length, 2);
  console.log("Native fetch outbound HTTP contract passed");
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}
