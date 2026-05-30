import type { DirectPluginEvent } from "./types.js";

export type FetchLike = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;

export type SuperPlaneClientOptions = {
  baseUrl: string | URL;
  integrationId: string;
  token?: string;
  headers?: HeadersInit;
  fetch?: FetchLike;
};

export class SuperPlaneClientError extends Error {
  readonly status: number;
  readonly responseBody: string;

  constructor(message: string, options: { status: number; responseBody: string }) {
    super(message);
    this.name = "SuperPlaneClientError";
    this.status = options.status;
    this.responseBody = options.responseBody;
  }
}

export class SuperPlaneClient {
  readonly baseUrl: URL;
  readonly integrationId: string;
  readonly token: string | undefined;
  readonly headers: HeadersInit | undefined;
  readonly fetch: FetchLike;

  constructor(options: SuperPlaneClientOptions) {
    const fetchImplementation = options.fetch ?? globalThis.fetch;

    if (!fetchImplementation) {
      throw new SuperPlaneClientError("No fetch implementation is available", {
        status: 0,
        responseBody: "",
      });
    }

    this.baseUrl = new URL(options.baseUrl);
    this.integrationId = options.integrationId;
    this.token = options.token;
    this.headers = options.headers;
    this.fetch = fetchImplementation;
  }

  async emitEvent(event: DirectPluginEvent): Promise<Response> {
    const url = appendPath(
      this.baseUrl,
      `/api/v1/integrations/${encodeURIComponent(this.integrationId)}/events`,
    );
    const headers = new Headers(this.headers);

    headers.set("content-type", "application/json");

    if (this.token) {
      headers.set("authorization", `Bearer ${this.token}`);
    }

    const response = await this.fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(event),
    });

    if (!response.ok) {
      throw new SuperPlaneClientError(`SuperPlane event request failed with ${response.status}`, {
        status: response.status,
        responseBody: await response.text(),
      });
    }

    return response;
  }
}

export function createSuperPlaneClient(options: SuperPlaneClientOptions): SuperPlaneClient {
  return new SuperPlaneClient(options);
}

function appendPath(baseUrl: URL, path: string): URL {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/$/, "");

  url.pathname = `${basePath}${path}`;
  url.search = "";
  url.hash = "";

  return url;
}
