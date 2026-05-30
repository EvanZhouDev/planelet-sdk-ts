/// <reference types="bun" />

/**
 * Timer trigger — demonstrates the event-based trigger model.
 *
 * Starts a background interval on setup and pushes events directly
 * to SuperPlane via its HTTP API. No webhook URL is involved — this
 * is the "On Planelet Event" pattern.
 *
 * Usage:
 *   SUPERPLANE_BASE_URL=http://localhost:8080 \
 *   SUPERPLANE_INTEGRATION_ID=timer-demo \
 *   SUPERPLANE_TOKEN=... \
 *   bun run examples/timer-trigger.ts
 */

import { createPlugin, createSuperPlaneClient, defineTrigger } from "../src/index.js";

const activeTimers = new Map<string, ReturnType<typeof setInterval>>();

const superplane = createSuperPlaneClient({
  baseUrl: process.env.SUPERPLANE_BASE_URL ?? "http://localhost:8080",
  integrationId: process.env.SUPERPLANE_INTEGRATION_ID ?? "timer-demo",
  token: process.env.SUPERPLANE_TOKEN,
});

const plugin = createPlugin({
  id: "timer-demo",
  label: "Timer Demo",
  icon: "clock",
  description: "Emits events on a recurring interval.",
  triggers: [
    defineTrigger({
      id: "timer",
      label: "Timer",
      icon: "clock",
      description: "Emits a timer.tick event every N seconds.",
      parameters: [
        {
          id: "intervalSeconds",
          label: "Interval (seconds)",
          type: "number",
          required: true,
          default: 60,
        },
      ],
      setup: async ({ parameters }) => {
        const intervalSeconds = Math.max(
          1,
          typeof parameters.intervalSeconds === "number" ? parameters.intervalSeconds : 60,
        );
        const intervalMs = intervalSeconds * 1000;

        const timer = setInterval(async () => {
          try {
            await superplane.emitEvent({
              eventType: "timer.tick",
              payload: { tick: new Date().toISOString() },
            });
          } catch {
            // will retry on next tick
          }
        }, intervalMs);

        const timerId = String(Date.now());
        activeTimers.set(timerId, timer);

        return {
          success: true,
          metadata: { timerId, intervalSeconds },
        };
      },
      cleanup: async ({ metadata }) => {
        const timerId = String(metadata?.timerId ?? "");
        const timer = activeTimers.get(timerId);
        if (timer) {
          clearInterval(timer);
          activeTimers.delete(timerId);
        }
        return { success: true };
      },
    }),
  ],
});

const port = Number(process.env.PORT ?? 3012);

Bun.serve({ hostname: "0.0.0.0", port, fetch: plugin.fetch });

console.log(`Timer trigger planelet listening on http://127.0.0.1:${port}`);
