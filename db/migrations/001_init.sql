create table if not exists agents (
  id text primary key,
  name text not null
);

create table if not exists chat_state (
  chat_id text primary key,
  status text not null default 'pendente',
  assigned_agent_id text references agents (id) on delete set null,
  tags text[] not null default '{}',
  updated_at timestamptz not null default now()
);

create table if not exists audit_send (
  id bigserial primary key,
  chat_id text not null,
  agent_id text not null references agents (id),
  uazapi_message_id text,
  sent_at timestamptz not null default now()
);

insert into agents (id, name) values
  ('vanderlei', 'Vanderlei'),
  ('gustavo', 'Gustavo')
on conflict (id) do update set name = excluded.name;

