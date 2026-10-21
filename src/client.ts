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
    if (options.fetch === undefined || options.fetch === null) {
      assertDefaultFetchRuntime();
    }

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

function assertDefaultFetchRuntime(): void {
  const runtime = globalThis;
  if ("Bun" in runtime) {
    const bun = runtime.Bun;
    if (
      typeof bun === "object" &&
      bun !== null &&
      "version" in bun &&
      bun.version === "1.4.4" &&
      "revision" in bun &&
      bun.revision === "963452075e9d7e2a47a482f297143af5ed4f76c0"
    ) {
      return;
    }
    throw new SuperPlaneClientError(
      "Default fetch requires verified Bun revision 963452075e9d7e2a47a482f297143af5ed4f76c0; upgrade Bun or supply a fetch with equivalent TLS validation",
      { status: 0, responseBody: "" },
    );
  }

  if (typeof process === "undefined" || !process.versions?.node) {
    return;
  }

  const version = /^(\d+)\.(\d+)\.(\d+)$/.exec(process.versions.node);
  if (version) {
    const major = Number(version[1]);
    const minor = Number(version[2]);
    const patch = Number(version[3]);
    if (
      (major === 22 && (minor > 23 || (minor === 23 && patch >= 4))) ||
      (major === 24 && (minor > 22 || (minor === 22 && patch >= 1))) ||
      (major === 26 && (minor > 12 || (minor === 12 && patch >= 1))) ||
      major > 26
    ) {
      return;
    }
  }

  throw new SuperPlaneClientError(
    "Default fetch requires Node.js ^22.23.4 || ^24.22.1 || >=26.12.1; upgrade Node.js or supply a fetch with equivalent TLS validation",
    { status: 0, responseBody: "" },
  );
}

function appendPath(baseUrl: URL, path: string): URL {
  const url = new URL(baseUrl);
  const basePath = url.pathname.replace(/\/$/, "");

  url.pathname = `${basePath}${path}`;
  url.search = "";
  url.hash = "";

  return url;
}
