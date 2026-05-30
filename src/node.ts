import { Buffer } from "node:buffer";
import { type IncomingMessage, type Server, type ServerResponse, createServer } from "node:http";
import { Readable } from "node:stream";

import type { PlaneletPlugin } from "./types.js";

export type NodeHandlerOptions = {
  onError?: (error: unknown) => void;
};

export type NodeRequestHandler = (request: IncomingMessage, response: ServerResponse) => void;

export function createNodeHandler(
  plugin: Pick<PlaneletPlugin, "handle" | "fetch">,
  options: NodeHandlerOptions = {},
): NodeRequestHandler {
  return (incoming, outgoing) => {
    void handleNodeRequest(plugin, incoming, outgoing, options);
  };
}

export function createNodeServer(
  plugin: Pick<PlaneletPlugin, "handle" | "fetch">,
  options: NodeHandlerOptions = {},
): Server {
  return createServer(createNodeHandler(plugin, options));
}

async function handleNodeRequest(
  plugin: Pick<PlaneletPlugin, "handle" | "fetch">,
  incoming: IncomingMessage,
  outgoing: ServerResponse,
  options: NodeHandlerOptions,
): Promise<void> {
  try {
    const request = toFetchRequest(incoming);
    const response = await plugin.handle(request);

    await writeFetchResponse(outgoing, response);
  } catch (error) {
    options.onError?.(error);

    if (outgoing.headersSent) {
      outgoing.destroy(error instanceof Error ? error : undefined);
      return;
    }

    outgoing.statusCode = 500;
    outgoing.setHeader("content-type", "application/json; charset=utf-8");
    outgoing.end(JSON.stringify({ success: false, error: "Node adapter error" }));
  }
}

function toFetchRequest(incoming: IncomingMessage): Request {
  const origin = `http://${incoming.headers.host ?? "localhost"}`;
  const url = new URL(incoming.url ?? "/", origin);
  const method = incoming.method ?? "GET";
  const headers = new Headers();

  for (const [name, value] of Object.entries(incoming.headers)) {
    if (value === undefined) {
      continue;
    }

    if (Array.isArray(value)) {
      for (const item of value) {
        headers.append(name, item);
      }
    } else {
      headers.set(name, value);
    }
  }

  const init: RequestInit & { duplex?: "half" } = {
    method,
    headers,
  };

  if (method !== "GET" && method !== "HEAD") {
    init.body = Readable.toWeb(incoming) as unknown as BodyInit;
    init.duplex = "half";
  }

  return new Request(url, init);
}

async function writeFetchResponse(outgoing: ServerResponse, response: Response): Promise<void> {
  outgoing.statusCode = response.status;

  response.headers.forEach((value, name) => {
    outgoing.setHeader(name, value);
  });

  if (response.body === null) {
    outgoing.end();
    return;
  }

  outgoing.end(Buffer.from(await response.arrayBuffer()));
}
