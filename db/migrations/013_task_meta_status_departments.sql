do $$
begin
  create table if not exists task_status_meta (
    id text primary key,
    name text not null,
    color text not null default '#64748b',
    sort_order int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );

  create table if not exists task_department_meta (
    id text primary key,
    name text not null,
    color text not null default '#64748b',
    sort_order int not null default 0,
    created_at timestamptz not null default now(),
    updated_at timestamptz not null default now()
  );
end$$;

create index if not exists task_status_meta_sort_idx on task_status_meta (sort_order, id);
create index if not exists task_department_meta_sort_idx on task_department_meta (sort_order, id);

-- Seed current enum values
insert into task_status_meta (id, name, color, sort_order)
values
  ('to_do', 'A Fazer', '#64748b', 10),
  ('in_progress', 'Em Andamento', '#3b82f6', 20),
  ('blocked', 'Pendente', '#f59e0b', 30),
  ('done', 'Concluído', '#22c55e', 40)
on conflict (id) do nothing;

insert into task_department_meta (id, name, color, sort_order)
values
  ('fiscal', 'Fiscal', '#60a5fa', 10),
  ('contabil', 'Contábil', '#a78bfa', 20),
  ('pessoal', 'Pessoal', '#f472b6', 30),
  ('societario_paralegal', 'Societário/Paralegal', '#34d399', 40),
  ('administrativo', 'Administrativo', '#fb7185', 50)
on conflict (id) do nothing;

drop trigger if exists trg_task_status_meta_updated_at on task_status_meta;
create trigger trg_task_status_meta_updated_at before update on task_status_meta for each row execute function set_updated_at();

drop trigger if exists trg_task_department_meta_updated_at on task_department_meta;
create trigger trg_task_department_meta_updated_at before update on task_department_meta for each row execute function set_updated_at();

