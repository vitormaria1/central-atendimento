do $$
begin
  -- Tipos de tarefa (customizáveis)
  create table if not exists task_types (
    id text primary key,
    name text not null unique,
    created_at timestamptz not null default now()
  );

  -- Numeração sequencial para identificação humana
  if not exists (select 1 from pg_class where relkind = 'S' and relname = 'task_number_seq') then
    create sequence task_number_seq;
  end if;

  -- Colunas novas em tasks
  if not exists (
    select 1
    from information_schema.columns
    where table_name = 'tasks' and column_name = 'task_number'
  ) then
    alter table tasks add column task_number bigint not null default nextval('task_number_seq');
    create unique index if not exists tasks_task_number_uidx on tasks (task_number);
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_name = 'tasks' and column_name = 'task_type_id'
  ) then
    alter table tasks add column task_type_id text references task_types (id) on delete set null;
    create index if not exists tasks_task_type_idx on tasks (task_type_id, id);
  end if;
end$$;

-- Seed de tipos comuns de contabilidade (id = slug)
insert into task_types (id, name)
values
  ('abertura_empresa', 'Abertura de Empresa'),
  ('alteracao_contratual', 'Alteração Contratual'),
  ('baixa_empresa', 'Baixa de Empresa'),
  ('imposto_renda', 'Imposto de Renda'),
  ('admissao_trabalhador', 'Admissão de Trabalhador'),
  ('demissao_trabalhador', 'Demissão de Trabalhador'),
  ('folha_pagamento', 'Folha de Pagamento'),
  ('das_simples', 'DAS / Simples Nacional'),
  ('certidoes', 'Certidões'),
  ('parcelamento', 'Parcelamento'),
  ('outros', 'Outros')
on conflict (id) do nothing;

-- Backfill: se existirem tasks antigas sem numeração (deveria ser impossível após coluna NOT NULL),
-- garante que todas terão um valor.
do $$
declare
  r record;
begin
  for r in (select id from tasks where task_number is null order by id asc) loop
    update tasks set task_number = nextval('task_number_seq') where id = r.id;
  end loop;
end$$;

