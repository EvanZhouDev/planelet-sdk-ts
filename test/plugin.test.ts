import { describe, expect, test } from "bun:test";

import {
  createBearerAuth,
  createPlugin,
  createSuperPlaneClient,
  decodeRawBodyText,
  defineAction,
  defineTrigger,
} from "../src/index.js";

describe("Planelet plugin", () => {
  test("serves a manifest without handler functions", async () => {
    const plugin = createPlugin({
      id: "demo",
      label: "Demo",
      actions: [
        defineAction({
          id: "echo",
          label: "Echo",
          icon: "message",
          parameters: [{ id: "message", label: "Message", type: "string" }],
          execute: async () => ({ success: true, data: {} }),
        }),
      ],
      triggers: [],
    });

    const response = await plugin.fetch(new Request("http://plugin.test/manifest"));
    const manifest = await response.json();

    expect(response.status).toBe(200);
    expect(manifest).toEqual({
      id: "demo",
      label: "Demo",
      actions: [
        {
          id: "echo",
          label: "Echo",
          icon: "message",
          parameters: [{ id: "message", label: "Message", type: "string" }],
        },
      ],
      triggers: [],
    });
  });

  test("executes actions", async () => {
    const plugin = createPlugin({
      id: "demo",
      label: "Demo",
      actions: [
        defineAction({
          id: "echo",
          label: "Echo",
          parameters: [],
          execute: async ({ parameters, input }) => ({
            success: true,
            data: {
              parameters,
              input,
            },
          }),
        }),
      ],
      triggers: [],
    });

    const response = await plugin.fetch(
      new Request("http://plugin.test/actions/echo/execute", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ parameters: { message: "hello" }, input: { previous: true } }),
      }),
    );

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      data: {
        parameters: { message: "hello" },
        input: { previous: true },
      },
    });
  });

  test("returns 404 for unknown actions", async () => {
    const plugin = createPlugin({
      id: "demo",
      label: "Demo",
      actions: [],
      triggers: [],
    });

    const response = await plugin.fetch(
      new Request("http://plugin.test/actions/missing/execute", {
        method: "POST",
        body: JSON.stringify({ parameters: {} }),
      }),
    );

    expect(response.status).toBe(404);
    expect(await response.json()).toEqual({ success: false, error: 'Unknown action "missing"' });
  });

  test("runs webhook trigger lifecycle handlers", async () => {
    const plugin = createPlugin({
      id: "demo",
      label: "Demo",
      actions: [],
      triggers: [
        defineTrigger({
          id: "incoming",
          label: "Incoming",
          parameters: [],
          setup: async ({ webhook }) => ({
            success: true,
            metadata: {
              providerWebhookId: "webhook-123",
              url: webhook.url,
            },
          }),
          webhook: async ({ request, metadata }) => ({
            success: true,
            emit: true,
            eventType: "incoming.received",
            payload: {
              body: decodeRawBodyText(request.rawBodyBase64),
              metadata,
            },
          }),
          cleanup: async () => ({ success: true }),
        }),
      ],
    });

    const setup = await plugin.fetch(
      new Request("http://plugin.test/triggers/incoming/setup", {
        method: "POST",
        body: JSON.stringify({
          parameters: {},
          webhook: { url: "https://superplane.example/webhook", secret: "secret" },
        }),
      }),
    );
    const webhook = await plugin.fetch(
      new Request("http://plugin.test/triggers/incoming/webhook", {
        method: "POST",
        body: JSON.stringify({
          parameters: {},
          metadata: { providerWebhookId: "webhook-123" },
          request: {
            method: "POST",
            headers: { "x-provider-signature": ["sig"] },
            rawBodyBase64: btoa("hello"),
          },
        }),
      }),
    );

    expect(await setup.json()).toEqual({
      success: true,
      metadata: {
        providerWebhookId: "webhook-123",
        url: "https://superplane.example/webhook",
      },
    });
    expect(await webhook.json()).toEqual({
      success: true,
      emit: true,
      eventType: "incoming.received",
      payload: {
        body: "hello",
        metadata: { providerWebhookId: "webhook-123" },
      },
    });
  });

  test("can require bearer auth", async () => {
    const plugin = createPlugin({
      id: "demo",
      label: "Demo",
      auth: createBearerAuth("test-token"),
      actions: [],
      triggers: [],
    });

    const rejected = await plugin.fetch(new Request("http://plugin.test/manifest"));
    const accepted = await plugin.fetch(
      new Request("http://plugin.test/manifest", {
        headers: { authorization: "Bearer test-token" },
      }),
    );

    expect(rejected.status).toBe(401);
    expect(await rejected.json()).toEqual({ success: false, error: "Unauthorized" });
    expect(accepted.status).toBe(200);
  });
});

describe("SuperPlane client", () => {
  test("emits direct integration events", async () => {
    const requests: Request[] = [];
    const client = createSuperPlaneClient({
      baseUrl: "https://superplane.example/base",
      integrationId: "integration-123",
      token: "token",
      fetch: async (input, init) => {
        requests.push(new Request(input, init));
        return new Response("", { status: 204 });
      },
    });

    const response = await client.emitEvent({
      eventType: "demo.event",
      payload: { ok: true },
    });

    expect(response.status).toBe(204);
    expect(requests).toHaveLength(1);
    expect(requests[0]?.url).toBe(
      "https://superplane.example/base/api/v1/integrations/integration-123/events",
    );
    expect(requests[0]?.headers.get("authorization")).toBe("Bearer token");
    expect(await requests[0]?.json()).toEqual({
      eventType: "demo.event",
      payload: { ok: true },
    });
  });
});
