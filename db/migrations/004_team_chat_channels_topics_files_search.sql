create table if not exists team_chat_channels (
  slug text primary key,
  name text not null,
  created_by_agent_id text,
  created_by_name text,
  created_at timestamptz not null default now()
);

insert into team_chat_channels (slug, name)
values ('geral', 'Geral')
on conflict (slug) do update set name = excluded.name;

alter table team_chat_messages
  add column if not exists parent_id bigint references team_chat_messages (id) on delete cascade;

alter table team_chat_messages
  add column if not exists search_tsv tsvector
    generated always as (
      to_tsvector('simple', coalesce(sender_name, '') || ' ' || coalesce(body, ''))
    ) stored;

create index if not exists team_chat_messages_channel_id_idx
  on team_chat_messages (channel, id);

create index if not exists team_chat_messages_parent_id_idx
  on team_chat_messages (parent_id, id);

create index if not exists team_chat_messages_search_tsv_idx
  on team_chat_messages using gin (search_tsv);

create table if not exists team_chat_attachments (
  id bigint generated always as identity primary key,
  message_id bigint not null references team_chat_messages (id) on delete cascade,
  filename text not null,
  mimetype text,
  size_bytes int not null,
  content bytea not null,
  created_at timestamptz not null default now()
);

create index if not exists team_chat_attachments_message_id_idx
  on team_chat_attachments (message_id, id);

