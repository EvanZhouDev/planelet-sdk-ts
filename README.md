# Planelet SDK for TypeScript

Build Planelet plugin servers that SuperPlane can call directly. The SDK is fetch-native for Bun and ships a small `node:http` adapter for Node.js, so the same plugin definition works in both runtimes.

## Install

```sh
bun add planelet-sdk-ts
```

For local development in this repo:

```sh
bun install
bun run check
```

## Bun server

```ts
import { createPlugin, defineAction } from "planelet-sdk-ts";

const plugin = createPlugin({
  id: "demo",
  label: "Demo Plugin",
  actions: [
    defineAction({
      id: "echo",
      label: "Echo",
      parameters: [{ id: "message", label: "Message", type: "string", required: true }],
      execute: async ({ parameters, input }) => ({
        success: true,
        data: {
          message: parameters.message,
          input,
        },
      }),
    }),
  ],
  triggers: [],
});

Bun.serve({
  port: 3000,
  fetch: plugin.fetch,
});
```

Point the Planelet integration in SuperPlane at `http://host.docker.internal:3000` when SuperPlane is running in Docker, or at the reachable host/port for your environment. You can edit and restart this local process without building a new SuperPlane container.

## Node.js server

```ts
import { createNodeServer } from "planelet-sdk-ts/node";
import { createPlugin, defineAction } from "planelet-sdk-ts";

const plugin = createPlugin({
  id: "demo",
  label: "Demo Plugin",
  actions: [
    defineAction({
      id: "echo",
      label: "Echo",
      parameters: [],
      execute: async ({ parameters }) => ({
        success: true,
        data: { parameters },
      }),
    }),
  ],
  triggers: [],
});

createNodeServer(plugin).listen(3000, "127.0.0.1");
```

Node.js 18.17 or newer is required because the SDK uses the standard `Request`, `Response`, and `fetch` APIs.

## Webhook trigger

```ts
import { createPlugin, decodeRawBodyText, defineTrigger, firstHeader } from "planelet-sdk-ts";

const plugin = createPlugin({
  id: "webhooks",
  label: "Webhooks",
  actions: [],
  triggers: [
    defineTrigger({
      id: "incoming",
      label: "Incoming Webhook",
      parameters: [],
      setup: async ({ webhook }) => ({
        success: true,
        metadata: { providerWebhookUrl: webhook.url },
      }),
      webhook: async ({ request }) => {
        const signature = firstHeader(request.headers, "x-provider-signature");
        const body = decodeRawBodyText(request.rawBodyBase64);

        if (!signature) {
          return { success: false, error: "Missing signature", status: 401 };
        }

        return {
          success: true,
          emit: true,
          eventType: "incoming.received",
          payload: JSON.parse(body),
        };
      },
      cleanup: async () => ({ success: true }),
    }),
  ],
});
```

Use `metadata` for provider webhook IDs or setup state. Do not put secrets in the manifest.

## Auth

If the SuperPlane integration is configured with an auth token, require the same bearer token in the plugin:

```ts
import { createBearerAuth, createPlugin } from "planelet-sdk-ts";

const plugin = createPlugin({
  id: "secure-demo",
  label: "Secure Demo",
  auth: createBearerAuth(process.env.PLANELET_TOKEN ?? ""),
  actions: [],
  triggers: [],
});
```

Custom auth can be supplied as a function. Return `false` to reject the request or throw to return a plugin-level error.

## Direct events

Plugins can emit events into SuperPlane without waiting for a third-party webhook:

```ts
import { createSuperPlaneClient } from "planelet-sdk-ts";

const superplane = createSuperPlaneClient({
  baseUrl: "https://superplane.example",
  integrationId: "integration-id",
  token: process.env.SUPERPLANE_TOKEN,
});

await superplane.emitEvent({
  eventType: "build.finished",
  payload: { status: "passed" },
});
```

## Plugin API

A Plugin is an HTTP server that exposes a manifest and optional action/trigger endpoints for SuperPlane.

### Basics

- Base URL is configured by the user in SuperPlane.
- All requests and responses use JSON.
- All IDs in paths must be URL-safe or URL-escaped.
- `id` is a stable machine identifier.
- `label` is user-facing display text.
- `icon` is a built-in icon slug.
- `iconUrl` is a remote image URL. If both are present, SuperPlane should prefer `iconUrl`.
- Unknown fields should be ignored for forward compatibility.

### Auth

When an auth token is configured on the SuperPlane integration, SuperPlane sends it on every plugin request:

```http
Authorization: Bearer <token>
```

Third-party webhook auth is provider-specific. SuperPlane forwards raw webhook headers and body to the plugin so the plugin can verify signatures.

### Manifest

```http
GET /manifest
```

```ts
type PluginManifest = {
  id: string;
  label: string;
  icon?: string;
  iconUrl?: string;
  description?: string;
  actions: ActionManifest[];
  triggers: TriggerManifest[];
};

type ActionManifest = {
  id: string;
  label: string;
  icon?: string;
  iconUrl?: string;
  description?: string;
  parameters: ParameterManifest[];
};

type TriggerManifest = {
  id: string;
  label: string;
  icon?: string;
  iconUrl?: string;
  description?: string;
  parameters: ParameterManifest[];
};

type ParameterManifest = {
  id: string;
  label: string;
  type: "string" | "text" | "number" | "bool" | "select" | "object";
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: { label: string; value: string }[];
};
```

### Actions

SuperPlane calls this when an action node runs.

```http
POST /actions/{actionId}/execute
Content-Type: application/json
```

```ts
type ExecuteActionRequest = {
  parameters: Record<string, unknown>;
  input?: unknown;
};

type ExecuteActionResponse =
  | { success: true; data: Record<string, unknown> }
  | { success: false; error: string };
```

### Webhook Triggers

All manifest triggers currently use the webhook lifecycle below.

#### Setup

Called when a configured trigger is published. The plugin should register or update the provider webhook using `webhook.url`.

```http
POST /triggers/{triggerId}/setup
```

```ts
type SetupTriggerRequest = {
  parameters: Record<string, unknown>;
  webhook: {
    url: string;
    secret?: string;
  };
};

type SetupTriggerResponse =
  | { success: true; metadata?: Record<string, unknown> }
  | { success: false; error: string };
```

`metadata` is stored by SuperPlane and passed back to future webhook and cleanup calls.

#### Webhook Handling

Called after a third party hits SuperPlane's generated webhook URL.

```http
POST /triggers/{triggerId}/webhook
```

```ts
type HandleTriggerWebhookRequest = {
  parameters: Record<string, unknown>;
  metadata?: Record<string, unknown>;
  request: {
    method: string;
    headers: Record<string, string[]>;
    query?: Record<string, string[]>;
    rawBodyBase64: string;
  };
};

type HandleTriggerWebhookResponse =
  | {
      success: true;
      emit: true;
      eventType: string;
      payload: unknown;
      response?: WebhookHttpResponse;
    }
  | {
      success: true;
      emit: false;
      reason?: string;
      response?: WebhookHttpResponse;
    }
  | {
      success: false;
      error: string;
      status?: number;
    };

type WebhookHttpResponse = {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
};
```

The plugin should verify signatures, handle provider challenges, filter irrelevant events, and return normalized workflow payloads.

#### Cleanup

Called when the trigger is removed or no longer needs the provider webhook.

```http
POST /triggers/{triggerId}/cleanup
```

```ts
type CleanupTriggerRequest = {
  parameters: Record<string, unknown>;
  metadata?: Record<string, unknown>;
};

type CleanupTriggerResponse = { success: true } | { success: false; error: string };
```

### Direct Events

Plugins may also emit events directly into SuperPlane without a third-party webhook.

```http
POST /api/v1/integrations/{integrationId}/events
Content-Type: application/json
```

```ts
type DirectPluginEvent = {
  eventType: string;
  payload: unknown;
};
```

### Required Behavior

- Return `404` for unknown actions/triggers.
- Return `{ success: false, error }` for plugin-level failures.
- Keep IDs stable once users may have configured workflows with them.
- Do not put secrets in manifests.
- Use `metadata` for provider webhook IDs or other setup state.
- `rawBodyBase64` must be decoded before signature verification.
- If a webhook should not start a workflow, return `{ success: true, emit: false }`.
- If a provider requires a challenge response, return `emit: false` with `response`.

The SDK routes each endpoint to the matching lifecycle function and returns `404` for unknown actions or triggers. Use `decodeRawBodyBase64` or `decodeRawBodyText` before signature verification.
