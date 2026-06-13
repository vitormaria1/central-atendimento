alter table tasks
  add column if not exists parent_task_id bigint references tasks (id) on delete cascade;

create index if not exists tasks_parent_task_id_idx on tasks (parent_task_id, id);
