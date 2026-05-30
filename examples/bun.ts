/// <reference types="bun" />

import { createPlugin, decodeRawBodyText, defineAction, defineTrigger } from "../src/index.js";

const plugin = createPlugin({
  id: "example",
  label: "Example Plugin",
  description: "Example Planelet plugin served by Bun.",
  actions: [
    defineAction({
      id: "echo",
      label: "Echo",
      description: "Returns the configured message and upstream input.",
      parameters: [
        {
          id: "message",
          label: "Message",
          type: "string",
          required: true,
        },
      ],
      execute: async ({ parameters, input }) => ({
        success: true,
        data: {
          message: parameters.message,
          input,
        },
      }),
    }),
  ],
  triggers: [
    defineTrigger({
      id: "webhook",
      label: "Incoming Webhook",
      parameters: [],
      setup: async ({ webhook }) => ({
        success: true,
        metadata: {
          webhookUrl: webhook.url,
        },
      }),
      webhook: async ({ request }) => ({
        success: true,
        emit: true,
        eventType: "webhook.received",
        payload: {
          method: request.method,
          body: decodeRawBodyText(request.rawBodyBase64),
        },
      }),
      cleanup: async () => ({ success: true }),
    }),
  ],
});

Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  fetch: plugin.fetch,
});

console.log("Planelet plugin listening on http://127.0.0.1:3000");
