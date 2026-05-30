/// <reference types="bun" />

/**
 * RSS feed trigger — demonstrates the event-based trigger model with polling.
 *
 * Polls an RSS or Atom feed on an interval, tracks seen entries, and emits
 * events for new items via the SuperPlane event API.
 *
 * Usage:
 *   SUPERPLANE_BASE_URL=http://localhost:8080 \
 *   SUPERPLANE_INTEGRATION_ID=rss-demo \
 *   SUPERPLANE_TOKEN=... \
 *   bun run examples/rss-trigger.ts
 */

import { createPlugin, createSuperPlaneClient, defineTrigger } from "../src/index.js";

type FeedEntry = {
  id: string;
  title: string;
  link: string;
  published: string;
};

function parseAtomFeed(xml: string): FeedEntry[] {
  const entries: FeedEntry[] = [];
  const entryPattern = /<entry>([\s\S]*?)<\/entry>/g;
  let match: RegExpExecArray | null;

  while ((match = entryPattern.exec(xml)) !== null) {
    const block = match[1];
    const id = block.match(/<id>([^<]*)<\/id>/)?.[1] ?? "";
    const title = block.match(/<title[^>]*>([^<]*)<\/title>/)?.[1] ?? "";
    const link =
      block.match(/<link[^>]*href="([^"]*)"[^>]*rel="alternate"/)?.[1] ??
      block.match(/<link[^>]*href="([^"]*)"/)?.[1] ??
      "";
    const published =
      block.match(/<published>([^<]*)<\/published>/)?.[1] ??
      block.match(/<updated>([^<]*)<\/updated>/)?.[1] ??
      "";

    if (id || link) {
      entries.push({ id: id || link, title, link, published });
    }
  }

  return entries;
}

function parseRssFeed(xml: string): FeedEntry[] {
  const items: FeedEntry[] = [];
  const itemPattern = /<item>([\s\S]*?)<\/item>/g;
  let match: RegExpExecArray | null;

  while ((match = itemPattern.exec(xml)) !== null) {
    const block = match[1];
    const title = block.match(/<title>([^<]*)<\/title>/)?.[1] ?? "";
    const link = block.match(/<link>([^<]*)<\/link>/)?.[1] ?? "";
    const guid = block.match(/<guid[^>]*>([^<]*)<\/guid>/)?.[1] ?? "";
    const pubDate = block.match(/<pubDate>([^<]*)<\/pubDate>/)?.[1] ?? "";

    if (guid || link) {
      items.push({ id: guid || link, title, link, published: pubDate });
    }
  }

  return items;
}

function parseFeed(xml: string): FeedEntry[] {
  if (xml.includes("<feed") && xml.includes("<entry>")) {
    return parseAtomFeed(xml);
  }
  return parseRssFeed(xml);
}

const activeTimers = new Map<string, ReturnType<typeof setInterval>>();

const superplane = createSuperPlaneClient({
  baseUrl: process.env.SUPERPLANE_BASE_URL ?? "http://localhost:8080",
  integrationId: process.env.SUPERPLANE_INTEGRATION_ID ?? "rss-demo",
  token: process.env.SUPERPLANE_TOKEN,
});

const plugin = createPlugin({
  id: "rss-demo",
  label: "RSS Feed Monitor",
  icon: "rss",
  description: "Polls RSS/Atom feeds and emits events for new entries.",
  triggers: [
    defineTrigger({
      id: "rss-feed",
      label: "RSS Feed",
      icon: "rss",
      description: "Polls a feed URL and emits rss.newEntry for each new item.",
      parameters: [
        {
          id: "feedUrl",
          label: "Feed URL",
          type: "string",
          required: true,
        },
        {
          id: "pollIntervalSeconds",
          label: "Poll Interval (seconds)",
          type: "number",
          default: 300,
        },
      ],
      setup: async ({ parameters }) => {
        const feedUrl =
          typeof parameters.feedUrl === "string" && parameters.feedUrl.trim() !== ""
            ? parameters.feedUrl.trim()
            : "https://blog.cloudflare.com/rss/";
        const pollInterval = Math.max(
          10,
          typeof parameters.pollIntervalSeconds === "number"
            ? parameters.pollIntervalSeconds
            : 300,
        );
        const pollIntervalMs = pollInterval * 1000;

        const seenIds = new Set<string>();

        try {
          const res = await fetch(feedUrl);
          if (res.ok) {
            const xml = await res.text();
            for (const entry of parseFeed(xml)) {
              seenIds.add(entry.id);
            }
          }
        } catch {
          // first fetch failed — will treat all entries as new on next poll
        }

        const timer = setInterval(async () => {
          try {
            const res = await fetch(feedUrl);
            if (!res.ok) return;

            const xml = await res.text();
            for (const entry of parseFeed(xml)) {
              if (seenIds.has(entry.id)) continue;
              seenIds.add(entry.id);

              await superplane.emitEvent({
                eventType: "rss.newEntry",
                payload: { feedUrl, entry },
              });
            }
          } catch {
            // poll failed — will retry on next interval
          }
        }, pollIntervalMs);

        const timerId = String(Date.now());
        activeTimers.set(timerId, timer);

        return {
          success: true,
          metadata: { timerId, feedUrl, pollInterval, initialEntries: seenIds.size },
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

const port = Number(process.env.PORT ?? 3013);

Bun.serve({ hostname: "0.0.0.0", port, fetch: plugin.fetch });

console.log(`RSS feed trigger planelet listening on http://127.0.0.1:${port}`);
