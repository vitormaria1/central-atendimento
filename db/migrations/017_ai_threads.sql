create table if not exists ai_threads (
  id bigint generated always as identity primary key,
  agent_id text not null references agents (id) on delete cascade,
  title text not null,
  summary text not null default '',
  selected_template_slug text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ai_threads_agent_updated_idx on ai_threads (agent_id, updated_at desc, id desc);

create table if not exists ai_messages (
  id bigint generated always as identity primary key,
  thread_id bigint not null references ai_threads (id) on delete cascade,
  role text not null check (role in ('user', 'model')),
  content text not null,
  attachments jsonb not null default '[]'::jsonb,
  files jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists ai_messages_thread_id_idx on ai_messages (thread_id, id);

drop trigger if exists trg_ai_threads_updated_at on ai_threads;
create trigger trg_ai_threads_updated_at before update on ai_threads for each row execute function set_updated_at();
