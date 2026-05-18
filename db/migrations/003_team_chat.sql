create table if not exists team_chat_messages (
  id bigint generated always as identity primary key,
  channel text not null default 'geral',
  sender_agent_id text,
  sender_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists team_chat_messages_channel_id_idx
  on team_chat_messages (channel, id);

