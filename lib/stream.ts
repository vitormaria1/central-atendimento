type StreamEvent =
  | { type: "chat_updated"; chatId: string }
  | { type: "message_received"; chatId: string; messageId?: string }
  | {
      type: "system_notification";
      kind: "task_assigned" | "team_chat_message";
      title: string;
      body: string;
      href?: string;
      taskId?: string;
      channel?: string | null;
      assigneeAgentId?: string | null;
      senderAgentId?: string | null;
      actorName?: string | null;
      createdAt?: number;
    };

type Listener = (event: StreamEvent) => void;

const globalForStream = globalThis as unknown as {
  __ca_stream_listeners?: Set<Listener>;
};

function getListeners() {
  if (!globalForStream.__ca_stream_listeners) {
    globalForStream.__ca_stream_listeners = new Set();
  }
  return globalForStream.__ca_stream_listeners;
}

export function publish(event: StreamEvent) {
  for (const listener of getListeners()) listener(event);
}

export function subscribe(listener: Listener) {
  const listeners = getListeners();
  listeners.add(listener);
  return () => listeners.delete(listener);
}

type WebhookDebugItem = {
  at: number;
  accepted: boolean;
  reason?: string;
  payload: unknown;
};

const globalForWebhookDebug = globalThis as unknown as {
  __ca_webhook_debug?: WebhookDebugItem[];
};

function getWebhookDebugStore() {
  if (!globalForWebhookDebug.__ca_webhook_debug) globalForWebhookDebug.__ca_webhook_debug = [];
  return globalForWebhookDebug.__ca_webhook_debug;
}

export function recordWebhookDebug(item: WebhookDebugItem) {
  const store = getWebhookDebugStore();
  store.unshift(item);
  if (store.length > 50) store.length = 50;
}

export function getWebhookDebugItems() {
  return getWebhookDebugStore();
}
