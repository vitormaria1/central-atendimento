do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_view_type') then
    create type task_view_type as enum ('list', 'board', 'calendar');
  end if;
end$$;

create table if not exists task_views (
  id bigint generated always as identity primary key,
  name text not null,
  view_type task_view_type not null default 'list',
  department task_department,
  owner_agent_id text references agents (id) on delete cascade,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists task_views_owner_idx on task_views (owner_agent_id, id);
create index if not exists task_views_department_idx on task_views (department, id);

drop trigger if exists trg_task_views_updated_at on task_views;
create trigger trg_task_views_updated_at before update on task_views for each row execute function set_updated_at();

create table if not exists task_audit_events (
  id bigint generated always as identity primary key,
  task_id bigint not null references tasks (id) on delete cascade,
  actor_agent_id text references agents (id) on delete set null,
  actor_name text not null,
  event_type text not null,
  data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists task_audit_events_task_id_idx on task_audit_events (task_id, id);

create table if not exists task_comment_reactions (
  id bigint generated always as identity primary key,
  comment_id bigint not null references task_comments (id) on delete cascade,
  emoji text not null,
  actor_agent_id text references agents (id) on delete set null,
  actor_name text not null,
  created_at timestamptz not null default now(),
  unique (comment_id, emoji, actor_agent_id)
);

create index if not exists task_comment_reactions_comment_id_idx on task_comment_reactions (comment_id, id);

create table if not exists task_comment_attachments (
  id bigint generated always as identity primary key,
  comment_id bigint not null references task_comments (id) on delete cascade,
  filename text not null,
  mimetype text,
  size_bytes int not null,
  content bytea not null,
  created_at timestamptz not null default now()
);

create index if not exists task_comment_attachments_comment_id_idx on task_comment_attachments (comment_id, id);

