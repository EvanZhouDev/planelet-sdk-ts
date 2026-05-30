export type Awaitable<T> = T | Promise<T>;

export type JsonRecord = Record<string, unknown>;

export type ParameterType = "string" | "text" | "number" | "bool" | "select" | "object";

export type ParameterOption = {
  label: string;
  value: string;
};

export type ParameterManifest = {
  id: string;
  label: string;
  type: ParameterType;
  description?: string;
  required?: boolean;
  default?: unknown;
  options?: ParameterOption[];
};

export type ActionManifest = {
  id: string;
  label: string;
  icon?: string;
  iconUrl?: string;
  description?: string;
  parameters: ParameterManifest[];
};

export type TriggerManifest = {
  id: string;
  label: string;
  icon?: string;
  iconUrl?: string;
  description?: string;
  parameters: ParameterManifest[];
};

export type PluginManifest = {
  id: string;
  label: string;
  icon?: string;
  iconUrl?: string;
  description?: string;
  actions: ActionManifest[];
  triggers: TriggerManifest[];
};

export type ExecuteActionRequest = {
  parameters: JsonRecord;
  input?: unknown;
};

export type ExecuteActionResponse =
  | { success: true; data: JsonRecord }
  | { success: false; error: string };

export type SetupTriggerRequest = {
  parameters: JsonRecord;
  webhook: {
    url: string;
    secret?: string;
  };
};

export type SetupTriggerResponse =
  | { success: true; metadata?: JsonRecord }
  | { success: false; error: string };

export type WebhookHttpResponse = {
  status?: number;
  headers?: Record<string, string>;
  body?: string;
};

export type HandleTriggerWebhookRequest = {
  parameters: JsonRecord;
  metadata?: JsonRecord;
  request: {
    method: string;
    headers: Record<string, string[]>;
    query?: Record<string, string[]>;
    rawBodyBase64: string;
  };
};

export type HandleTriggerWebhookResponse =
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

export type CleanupTriggerRequest = {
  parameters: JsonRecord;
  metadata?: JsonRecord;
};

export type CleanupTriggerResponse = { success: true } | { success: false; error: string };

export type DirectPluginEvent = {
  eventType: string;
  payload: unknown;
};

export type RequestContext = {
  request: Request;
  params: Record<string, string>;
};

export type ActionContext = RequestContext & {
  actionId: string;
};

export type TriggerContext = RequestContext & {
  triggerId: string;
};

export type ActionHandler = (
  request: ExecuteActionRequest,
  context: ActionContext,
) => Awaitable<ExecuteActionResponse>;

export type TriggerSetupHandler = (
  request: SetupTriggerRequest,
  context: TriggerContext,
) => Awaitable<SetupTriggerResponse>;

export type TriggerWebhookHandler = (
  request: HandleTriggerWebhookRequest,
  context: TriggerContext,
) => Awaitable<HandleTriggerWebhookResponse>;

export type TriggerCleanupHandler = (
  request: CleanupTriggerRequest,
  context: TriggerContext,
) => Awaitable<CleanupTriggerResponse>;

export type AuthVerifier = (request: Request) => Awaitable<boolean | undefined>;

export type BearerTokenProvider = string | (() => Awaitable<string | undefined>);

export type AuthConfig =
  | AuthVerifier
  | {
      bearerToken: BearerTokenProvider;
    };

export type ActionDefinition = ActionManifest & {
  execute: ActionHandler;
};

export type TriggerDefinition = TriggerManifest & {
  setup?: TriggerSetupHandler;
  webhook?: TriggerWebhookHandler;
  cleanup?: TriggerCleanupHandler;
};

export type PluginDefinition = Omit<PluginManifest, "actions" | "triggers"> & {
  actions?: ActionDefinition[];
  triggers?: TriggerDefinition[];
  auth?: AuthConfig;
};

export type PluginHandler = (request: Request) => Promise<Response>;

export type PlaneletPlugin = {
  manifest: PluginManifest;
  actions: ReadonlyMap<string, ActionDefinition>;
  triggers: ReadonlyMap<string, TriggerDefinition>;
  handle: PluginHandler;
  fetch: PluginHandler;
};
