do $$
begin
  if not exists (
    select 1
    from information_schema.columns
    where table_name = 'tasks' and column_name = 'completed_at'
  ) then
    alter table tasks add column completed_at timestamptz;
  end if;
end$$;

-- Backfill for existing completed tasks
update tasks
set completed_at = coalesce(completed_at, updated_at)
where status = 'done' and completed_at is null;

create or replace function set_completed_at_on_done() returns trigger as $$
begin
  if new.status = 'done' and (old.status is distinct from 'done') and new.completed_at is null then
    new.completed_at = now();
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_tasks_completed_at on tasks;
create trigger trg_tasks_completed_at
before update on tasks
for each row
execute function set_completed_at_on_done();

