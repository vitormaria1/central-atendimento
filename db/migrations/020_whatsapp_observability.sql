do $$
begin
  if not exists (select 1 from pg_type where typname = 'whatsapp_send_status') then
    create type whatsapp_send_status as enum ('pending', 'completed', 'failed');
  end if;
end$$;

create table if not exists whatsapp_send_requests (
  id bigint generated always as identity primary key,
  client_request_id text not null unique,
  kind text not null,
  chat_id text not null,
  status whatsapp_send_status not null default 'pending',
  request_meta jsonb not null default '{}'::jsonb,
  response_meta jsonb,
  result_message_id text,
  error_text text,
  created_by_agent_id text references agents (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists whatsapp_send_requests_chat_created_idx
  on whatsapp_send_requests (chat_id, created_at desc, id desc);

drop trigger if exists trg_whatsapp_send_requests_updated_at on whatsapp_send_requests;
create trigger trg_whatsapp_send_requests_updated_at
  before update on whatsapp_send_requests
  for each row execute function set_updated_at();

create table if not exists whatsapp_webhook_events (
  id bigint generated always as identity primary key,
  event_type text not null,
  chat_id text,
  accepted boolean not null default false,
  reason text,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists whatsapp_webhook_events_created_idx
  on whatsapp_webhook_events (created_at desc, id desc);

create index if not exists whatsapp_webhook_events_chat_idx
  on whatsapp_webhook_events (chat_id, created_at desc, id desc);
