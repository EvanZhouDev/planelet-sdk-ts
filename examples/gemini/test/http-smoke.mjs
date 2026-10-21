import assert from "node:assert/strict";
import { createServer } from "node:http";

import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { generateText } from "ai";

let received;
const server = createServer(async (request, response) => {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  received = {
    url: request.url,
    method: request.method,
    headers: request.headers,
    body: JSON.parse(Buffer.concat(chunks).toString()),
  };
  response.writeHead(200, { "content-type": "application/json" });
  response.end(
    JSON.stringify({
      candidates: [
        {
          content: { role: "model", parts: [{ text: "Hello from Gemini" }] },
          finishReason: "STOP",
        },
      ],
      usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 3, totalTokenCount: 4 },
    }),
  );
});
await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
const address = server.address();
if (!address || typeof address === "string") throw new Error("Expected a TCP listener");

try {
  const google = createGoogleGenerativeAI({
    apiKey: "local-test-key",
    baseURL: `http://127.0.0.1:${address.port}/v1beta`,
  });
  const result = await generateText({ model: google("gemini-2.5-flash"), prompt: "Hello" });
  assert.equal(result.text, "Hello from Gemini");
  assert.equal(result.usage.totalTokens, 4);
  assert.equal(received.method, "POST");
  assert.equal(received.url, "/v1beta/models/gemini-2.5-flash:generateContent");
  assert.equal(received.headers["x-goog-api-key"], "local-test-key");
  assert.deepEqual(received.body.contents, [{ role: "user", parts: [{ text: "Hello" }] }]);
  console.log("Gemini provider HTTP contract passed");
} finally {
  await new Promise((resolve, reject) => {
    server.close((error) => (error ? reject(error) : resolve()));
    server.closeAllConnections();
  });
}
