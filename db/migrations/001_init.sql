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

insert into agents (id, name) values
  ('vanderlei', 'Vanderlei'),
  ('gustavo', 'Gustavo')
on conflict (id) do update set name = excluded.name;
