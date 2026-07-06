import { dbQuery } from "./db";

export type WhatsappSendKind = "text" | "media";
export type WhatsappSendStatus = "pending" | "completed" | "failed";

export type OutboundRequestRecord = {
  inserted: boolean;
  clientRequestId: string;
  kind: WhatsappSendKind;
  chatId: string;
  status: WhatsappSendStatus;
  requestMeta: Record<string, unknown>;
  responseMeta: Record<string, unknown> | null;
  resultMessageId: string | null;
  errorText: string | null;
  updatedAt: string;
};

const OUTBOUND_REQUEST_TTL_MS = 10 * 60 * 1000;

function isNonCriticalObservabilityError(err: unknown) {
  return (
    typeof err === "object" &&
    err !== null &&
    "code" in err &&
    ((err as { code?: string }).code === "42P01" || (err as { code?: string }).code === "42703")
  );
}

export async function reserveOutboundRequest(params: {
  clientRequestId: string;
  kind: WhatsappSendKind;
  chatId: string;
  requestMeta: Record<string, unknown>;
  createdByAgentId?: "vanderlei" | "gustavo";
}) {
  try {
    const insertResult = await dbQuery(
      `
        insert into whatsapp_send_requests (client_request_id, kind, chat_id, status, request_meta, created_by_agent_id)
        values ($1, $2, $3, 'pending', $4::jsonb, $5)
        on conflict (client_request_id) do nothing
        returning client_request_id
      `,
      [params.clientRequestId, params.kind, params.chatId, JSON.stringify(params.requestMeta), params.createdByAgentId ?? null],
    );
    const inserted = insertResult.rows.length > 0;

    const { rows } = await dbQuery<{
      client_request_id: string;
      kind: WhatsappSendKind;
      chat_id: string;
      status: WhatsappSendStatus;
      request_meta: Record<string, unknown>;
      response_meta: Record<string, unknown> | null;
      result_message_id: string | null;
      error_text: string | null;
      updated_at: string;
    }>(
      `
        select
          client_request_id,
          kind,
          chat_id,
          status,
          request_meta,
          response_meta,
          result_message_id,
          error_text,
          updated_at::text
        from whatsapp_send_requests
        where client_request_id = $1
        limit 1
      `,
      [params.clientRequestId],
    );

    const row = rows[0];
    if (!row) {
      return null;
    }

    const isPending = row.status === "pending";
    const updatedAtMs = new Date(row.updated_at).getTime();
    const isStalePending = isPending && Number.isFinite(updatedAtMs) && Date.now() - updatedAtMs > OUTBOUND_REQUEST_TTL_MS;
    const isRevivedRetry = isStalePending || row.status === "failed";
    if (isStalePending) {
      await dbQuery(
        `
          update whatsapp_send_requests
          set status = 'pending',
              request_meta = $2::jsonb,
              response_meta = null,
              result_message_id = null,
              error_text = null,
              updated_at = now()
          where client_request_id = $1
        `,
        [params.clientRequestId, JSON.stringify(params.requestMeta)],
      );
      row.status = "pending";
      row.request_meta = params.requestMeta;
      row.response_meta = null;
      row.result_message_id = null;
      row.error_text = null;
      row.updated_at = new Date().toISOString();
    }

    if (row.status === "failed") {
      await dbQuery(
        `
          update whatsapp_send_requests
          set status = 'pending',
              request_meta = $2::jsonb,
              response_meta = null,
              result_message_id = null,
              error_text = null,
              updated_at = now()
          where client_request_id = $1
        `,
        [params.clientRequestId, JSON.stringify(params.requestMeta)],
      );
      row.status = "pending";
      row.request_meta = params.requestMeta;
      row.response_meta = null;
      row.result_message_id = null;
      row.error_text = null;
      row.updated_at = new Date().toISOString();
    }

    return {
      inserted: inserted || isRevivedRetry,
      clientRequestId: row.client_request_id,
      kind: row.kind,
      chatId: row.chat_id,
      status: row.status,
      requestMeta: row.request_meta ?? {},
      responseMeta: row.response_meta ?? null,
      resultMessageId: row.result_message_id,
      errorText: row.error_text,
      updatedAt: row.updated_at,
    } satisfies OutboundRequestRecord;
  } catch (err) {
    if (!isNonCriticalObservabilityError(err)) {
      return null;
    }
    return null;
  }
}

export async function completeOutboundRequest(params: {
  clientRequestId: string;
  responseMeta: Record<string, unknown>;
  resultMessageId: string | null;
}) {
  try {
    await dbQuery(
      `
        update whatsapp_send_requests
        set status = 'completed',
            response_meta = $2::jsonb,
            result_message_id = $3,
            error_text = null,
            updated_at = now()
        where client_request_id = $1
      `,
      [params.clientRequestId, JSON.stringify(params.responseMeta), params.resultMessageId],
    );
  } catch (err) {
    if (!isNonCriticalObservabilityError(err)) {
      return;
    }
  }
}

export async function failOutboundRequest(params: { clientRequestId: string; errorText: string }) {
  try {
    await dbQuery(
      `
        update whatsapp_send_requests
        set status = 'failed',
            error_text = $2,
            updated_at = now()
        where client_request_id = $1
      `,
      [params.clientRequestId, params.errorText.slice(0, 2000)],
    );
  } catch (err) {
    if (!isNonCriticalObservabilityError(err)) {
      return;
    }
  }
}

export async function listOutboundRequests(limit = 50) {
  try {
    const { rows } = await dbQuery<{
      client_request_id: string;
      kind: WhatsappSendKind;
      chat_id: string;
      status: WhatsappSendStatus;
      request_meta: Record<string, unknown>;
      response_meta: Record<string, unknown> | null;
      result_message_id: string | null;
      error_text: string | null;
      created_by_agent_id: string | null;
      created_at: string;
      updated_at: string;
    }>(
      `
        select
          client_request_id,
          kind,
          chat_id,
          status,
          request_meta,
          response_meta,
          result_message_id,
          error_text,
          created_by_agent_id,
          created_at::text,
          updated_at::text
        from whatsapp_send_requests
        order by created_at desc, id desc
        limit $1
      `,
      [limit],
    );

    return rows.map((row) => ({
      clientRequestId: row.client_request_id,
      kind: row.kind,
      chatId: row.chat_id,
      status: row.status,
      requestMeta: row.request_meta ?? {},
      responseMeta: row.response_meta ?? null,
      resultMessageId: row.result_message_id,
      errorText: row.error_text,
      createdByAgentId: row.created_by_agent_id,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
  } catch (err) {
    if (!isNonCriticalObservabilityError(err)) {
      return [];
    }
    return [];
  }
}

export async function recordWebhookEvent(params: {
  eventType: string;
  chatId?: string | null;
  accepted: boolean;
  reason?: string | null;
  payload: unknown;
}) {
  try {
    await dbQuery(
      `
        insert into whatsapp_webhook_events (event_type, chat_id, accepted, reason, payload)
        values ($1, $2, $3, $4, $5::jsonb)
      `,
      [params.eventType, params.chatId ?? null, params.accepted, params.reason ?? null, JSON.stringify(params.payload)],
    );
  } catch (err) {
    if (!isNonCriticalObservabilityError(err)) {
      return;
    }
  }
}

export async function listWebhookEvents(limit = 50) {
  try {
    const { rows } = await dbQuery<{
      id: string;
      event_type: string;
      chat_id: string | null;
      accepted: boolean;
      reason: string | null;
      payload: unknown;
      created_at: string;
    }>(
      `
        select id::text, event_type, chat_id, accepted, reason, payload, created_at::text
        from whatsapp_webhook_events
        order by created_at desc, id desc
        limit $1
      `,
      [limit],
    );

    return rows.map((row) => ({
      id: row.id,
      at: new Date(row.created_at).getTime(),
      eventType: row.event_type,
      chatId: row.chat_id,
      accepted: row.accepted,
      reason: row.reason ?? undefined,
      payload: row.payload,
    }));
  } catch (err) {
    if (!isNonCriticalObservabilityError(err)) {
      return [];
    }
    return [];
  }
}
