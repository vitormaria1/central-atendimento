do $$
begin
  if not exists (select 1 from pg_type where typname = 'task_department') then
    create type task_department as enum ('fiscal', 'contabil', 'pessoal', 'societario_paralegal', 'administrativo');
  end if;

  if not exists (select 1 from pg_type where typname = 'task_status') then
    create type task_status as enum ('to_do', 'in_progress', 'blocked', 'done');
  end if;

  if not exists (select 1 from pg_type where typname = 'task_priority') then
    create type task_priority as enum ('low', 'normal', 'high', 'urgent');
  end if;
end$$;

create table if not exists clients (
  id bigint generated always as identity primary key,
  name text not null,
  document text,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists clients_name_idx on clients (name);

create table if not exists tasks (
  id bigint generated always as identity primary key,
  title text not null,
  description text,
  department task_department not null,
  status task_status not null default 'to_do',
  priority task_priority not null default 'normal',
  client_id bigint references clients (id) on delete set null,
  assignee_agent_id text references agents (id) on delete set null,
  created_by_agent_id text references agents (id) on delete set null,
  due_at timestamptz,
  tags text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists tasks_department_status_idx on tasks (department, status, id);
create index if not exists tasks_assignee_idx on tasks (assignee_agent_id, id);
create index if not exists tasks_client_idx on tasks (client_id, id);

create table if not exists task_comments (
  id bigint generated always as identity primary key,
  task_id bigint not null references tasks (id) on delete cascade,
  author_agent_id text references agents (id) on delete set null,
  author_name text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create index if not exists task_comments_task_id_idx on task_comments (task_id, id);

create table if not exists task_attachments (
  id bigint generated always as identity primary key,
  task_id bigint not null references tasks (id) on delete cascade,
  filename text not null,
  mimetype text,
  size_bytes int not null,
  content bytea not null,
  created_at timestamptz not null default now()
);

create index if not exists task_attachments_task_id_idx on task_attachments (task_id, id);

create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_clients_updated_at on clients;
create trigger trg_clients_updated_at before update on clients for each row execute function set_updated_at();

drop trigger if exists trg_tasks_updated_at on tasks;
create trigger trg_tasks_updated_at before update on tasks for each row execute function set_updated_at();

