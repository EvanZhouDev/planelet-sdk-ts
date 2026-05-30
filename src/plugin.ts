import type {
  ActionDefinition,
  ActionManifest,
  AuthConfig,
  BearerTokenProvider,
  CleanupTriggerRequest,
  ExecuteActionRequest,
  HandleTriggerWebhookRequest,
  JsonRecord,
  ParameterManifest,
  PlaneletPlugin,
  PluginDefinition,
  PluginManifest,
  SetupTriggerRequest,
  TriggerDefinition,
  TriggerManifest,
} from "./types.js";

type DisplayFields = {
  icon?: string;
  iconUrl?: string;
  description?: string;
};

const jsonHeaders = {
  "content-type": "application/json; charset=utf-8",
};

export class PlaneletError extends Error {
  readonly status: number;

  constructor(message: string, options: { status?: number } = {}) {
    super(message);
    this.name = "PlaneletError";
    this.status = options.status ?? 500;
  }
}

export function defineAction<TAction extends ActionDefinition>(definition: TAction): TAction {
  return definition;
}

export function defineTrigger<TTrigger extends TriggerDefinition>(definition: TTrigger): TTrigger {
  return definition;
}

export function createBearerAuth(bearerToken: BearerTokenProvider): AuthConfig {
  return { bearerToken };
}

export function createPlugin(definition: PluginDefinition): PlaneletPlugin {
  const actions = createDefinitionMap(definition.actions ?? [], "action");
  const triggers = createDefinitionMap(definition.triggers ?? [], "trigger");
  const manifest = createManifest(definition, [...actions.values()], [...triggers.values()]);

  const handle = async (request: Request): Promise<Response> => {
    try {
      const authResponse = await authorize(definition.auth, request);

      if (authResponse) {
        return authResponse;
      }

      return await routeRequest(request, manifest, actions, triggers);
    } catch (error) {
      return errorResponse(error);
    }
  };

  return {
    manifest,
    actions,
    triggers,
    handle,
    fetch: handle,
  };
}

async function routeRequest(
  request: Request,
  manifest: PluginManifest,
  actions: ReadonlyMap<string, ActionDefinition>,
  triggers: ReadonlyMap<string, TriggerDefinition>,
): Promise<Response> {
  const url = new URL(request.url);
  const segments = splitPath(url.pathname);

  if (segments.length === 1 && segments[0] === "manifest") {
    if (request.method !== "GET") {
      return methodNotAllowed("GET");
    }

    return jsonResponse(manifest);
  }

  if (segments.length === 3 && segments[0] === "actions" && segments[2] === "execute") {
    if (request.method !== "POST") {
      return methodNotAllowed("POST");
    }

    const actionId = segmentAt(segments, 1);
    const action = actions.get(actionId);

    if (!action) {
      return notFound(`Unknown action "${actionId}"`);
    }

    const payload = toExecuteActionRequest(await readJsonBody(request));
    const response = await action.execute(payload, {
      request,
      actionId,
      params: { actionId },
    });

    return jsonResponse(response);
  }

  if (segments.length === 3 && segments[0] === "triggers") {
    if (request.method !== "POST") {
      return methodNotAllowed("POST");
    }

    const triggerId = segmentAt(segments, 1);
    const lifecycle = segmentAt(segments, 2);
    const trigger = triggers.get(triggerId);

    if (!trigger) {
      return notFound(`Unknown trigger "${triggerId}"`);
    }

    if (lifecycle === "setup") {
      if (!trigger.setup) {
        return notFound(`Trigger "${triggerId}" does not implement setup`);
      }

      const payload = toSetupTriggerRequest(await readJsonBody(request));
      const response = await trigger.setup(payload, {
        request,
        triggerId,
        params: { triggerId },
      });

      return jsonResponse(response);
    }

    if (lifecycle === "webhook") {
      if (!trigger.webhook) {
        return notFound(`Trigger "${triggerId}" does not implement webhook`);
      }

      const payload = toHandleTriggerWebhookRequest(await readJsonBody(request));
      const response = await trigger.webhook(payload, {
        request,
        triggerId,
        params: { triggerId },
      });

      return jsonResponse(response);
    }

    if (lifecycle === "cleanup") {
      if (!trigger.cleanup) {
        return notFound(`Trigger "${triggerId}" does not implement cleanup`);
      }

      const payload = toCleanupTriggerRequest(await readJsonBody(request));
      const response = await trigger.cleanup(payload, {
        request,
        triggerId,
        params: { triggerId },
      });

      return jsonResponse(response);
    }
  }

  return notFound("Not found");
}

function createManifest(
  definition: PluginDefinition,
  actions: ActionDefinition[],
  triggers: TriggerDefinition[],
): PluginManifest {
  const manifest: PluginManifest = {
    id: definition.id,
    label: definition.label,
    actions: actions.map(actionManifest),
    triggers: triggers.map(triggerManifest),
  };

  copyDisplayFields(definition, manifest);

  return manifest;
}

function actionManifest(action: ActionDefinition): ActionManifest {
  const manifest: ActionManifest = {
    id: action.id,
    label: action.label,
    parameters: action.parameters.map(parameterManifest),
  };

  copyDisplayFields(action, manifest);

  return manifest;
}

function triggerManifest(trigger: TriggerDefinition): TriggerManifest {
  const manifest: TriggerManifest = {
    id: trigger.id,
    label: trigger.label,
    parameters: trigger.parameters.map(parameterManifest),
  };

  copyDisplayFields(trigger, manifest);

  return manifest;
}

function parameterManifest(parameter: ParameterManifest): ParameterManifest {
  const manifest: ParameterManifest = {
    id: parameter.id,
    label: parameter.label,
    type: parameter.type,
  };

  if (parameter.description !== undefined) {
    manifest.description = parameter.description;
  }

  if (parameter.required !== undefined) {
    manifest.required = parameter.required;
  }

  if (parameter.default !== undefined) {
    manifest.default = parameter.default;
  }

  if (parameter.options !== undefined) {
    manifest.options = parameter.options.map((option) => ({ ...option }));
  }

  return manifest;
}

function copyDisplayFields(source: DisplayFields, target: DisplayFields): void {
  if (source.icon !== undefined) {
    target.icon = source.icon;
  }

  if (source.iconUrl !== undefined) {
    target.iconUrl = source.iconUrl;
  }

  if (source.description !== undefined) {
    target.description = source.description;
  }
}

function createDefinitionMap<TDefinition extends { id: string }>(
  definitions: TDefinition[],
  label: string,
): ReadonlyMap<string, TDefinition> {
  const definitionsById = new Map<string, TDefinition>();

  for (const definition of definitions) {
    if (definitionsById.has(definition.id)) {
      throw new PlaneletError(`Duplicate ${label} id "${definition.id}"`);
    }

    definitionsById.set(definition.id, definition);
  }

  return definitionsById;
}

async function authorize(
  auth: AuthConfig | undefined,
  request: Request,
): Promise<Response | undefined> {
  if (!auth) {
    return undefined;
  }

  const authorized =
    typeof auth === "function"
      ? await auth(request)
      : await verifyBearerToken(auth.bearerToken, request);

  if (authorized === false) {
    return jsonResponse({ success: false, error: "Unauthorized" }, { status: 401 });
  }

  return undefined;
}

async function verifyBearerToken(
  provider: BearerTokenProvider,
  request: Request,
): Promise<boolean> {
  const expectedToken = typeof provider === "function" ? await provider() : provider;

  if (!expectedToken) {
    return false;
  }

  return request.headers.get("authorization") === `Bearer ${expectedToken}`;
}

async function readJsonBody(request: Request): Promise<unknown> {
  const rawBody = await request.text();

  if (rawBody.trim() === "") {
    throw new PlaneletError("Expected a JSON request body", { status: 400 });
  }

  try {
    return JSON.parse(rawBody) as unknown;
  } catch {
    throw new PlaneletError("Invalid JSON request body", { status: 400 });
  }
}

function toExecuteActionRequest(value: unknown): ExecuteActionRequest {
  const body = expectRecord(value, "Action execute request body");
  const request: ExecuteActionRequest = {
    parameters: optionalRecord(body.parameters, "parameters") ?? {},
  };

  if (Object.hasOwn(body, "input")) {
    request.input = body.input;
  }

  return request;
}

function toSetupTriggerRequest(value: unknown): SetupTriggerRequest {
  const body = expectRecord(value, "Trigger setup request body");
  const webhook = expectRecord(body.webhook, "webhook");
  const url = webhook.url;
  const secret = webhook.secret;

  if (typeof url !== "string") {
    throw new PlaneletError("webhook.url must be a string", { status: 400 });
  }

  if (secret !== undefined && typeof secret !== "string") {
    throw new PlaneletError("webhook.secret must be a string", { status: 400 });
  }

  const request: SetupTriggerRequest = {
    parameters: optionalRecord(body.parameters, "parameters") ?? {},
    webhook: { url },
  };

  if (secret !== undefined) {
    request.webhook.secret = secret;
  }

  return request;
}

function toHandleTriggerWebhookRequest(value: unknown): HandleTriggerWebhookRequest {
  const body = expectRecord(value, "Trigger webhook request body");
  const forwardedRequest = expectRecord(body.request, "request");
  const method = forwardedRequest.method;
  const rawBodyBase64 = forwardedRequest.rawBodyBase64;

  if (typeof method !== "string") {
    throw new PlaneletError("request.method must be a string", { status: 400 });
  }

  if (typeof rawBodyBase64 !== "string") {
    throw new PlaneletError("request.rawBodyBase64 must be a string", { status: 400 });
  }

  const request: HandleTriggerWebhookRequest = {
    parameters: optionalRecord(body.parameters, "parameters") ?? {},
    request: {
      method,
      headers: stringArrayRecord(forwardedRequest.headers, "request.headers"),
      rawBodyBase64,
    },
  };

  const metadata = optionalRecord(body.metadata, "metadata");
  const query = optionalStringArrayRecord(forwardedRequest.query, "request.query");

  if (metadata !== undefined) {
    request.metadata = metadata;
  }

  if (query !== undefined) {
    request.request.query = query;
  }

  return request;
}

function toCleanupTriggerRequest(value: unknown): CleanupTriggerRequest {
  const body = expectRecord(value, "Trigger cleanup request body");
  const request: CleanupTriggerRequest = {
    parameters: optionalRecord(body.parameters, "parameters") ?? {},
  };
  const metadata = optionalRecord(body.metadata, "metadata");

  if (metadata !== undefined) {
    request.metadata = metadata;
  }

  return request;
}

function optionalRecord(value: unknown, fieldName: string): JsonRecord | undefined {
  if (value === undefined) {
    return undefined;
  }

  return expectRecord(value, fieldName);
}

function expectRecord(value: unknown, fieldName: string): JsonRecord {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new PlaneletError(`${fieldName} must be a JSON object`, { status: 400 });
  }

  return value as JsonRecord;
}

function optionalStringArrayRecord(
  value: unknown,
  fieldName: string,
): Record<string, string[]> | undefined {
  if (value === undefined) {
    return undefined;
  }

  return stringArrayRecord(value, fieldName);
}

function stringArrayRecord(value: unknown, fieldName: string): Record<string, string[]> {
  const record = expectRecord(value, fieldName);
  const normalized: Record<string, string[]> = {};

  for (const [key, item] of Object.entries(record)) {
    if (!Array.isArray(item) || item.some((entry) => typeof entry !== "string")) {
      throw new PlaneletError(`${fieldName}.${key} must be a string array`, { status: 400 });
    }

    normalized[key] = item;
  }

  return normalized;
}

function splitPath(pathname: string): string[] {
  return pathname
    .replace(/\/+$/, "")
    .split("/")
    .filter(Boolean)
    .map((segment) => {
      try {
        return decodeURIComponent(segment);
      } catch {
        throw new PlaneletError("Invalid URL path encoding", { status: 400 });
      }
    });
}

function segmentAt(segments: string[], index: number): string {
  const segment = segments[index];

  if (segment === undefined) {
    throw new PlaneletError("Invalid URL path", { status: 400 });
  }

  return segment;
}

function methodNotAllowed(allowedMethod: string): Response {
  return jsonResponse(
    { success: false, error: `Method not allowed. Use ${allowedMethod}.` },
    { status: 405, headers: { allow: allowedMethod } },
  );
}

function notFound(error: string): Response {
  return jsonResponse({ success: false, error }, { status: 404 });
}

function errorResponse(error: unknown): Response {
  const status = error instanceof PlaneletError ? error.status : 500;
  const message = error instanceof Error ? error.message : "Unknown plugin error";

  return jsonResponse({ success: false, error: message }, { status });
}

function jsonResponse(data: unknown, init: ResponseInit = {}): Response {
  return new Response(JSON.stringify(data), {
    ...init,
    headers: {
      ...jsonHeaders,
      ...Object.fromEntries(new Headers(init.headers).entries()),
    },
  });
}
