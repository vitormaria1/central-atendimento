alter table task_comments
  add column if not exists mentions text[] not null default '{}';

create index if not exists task_comments_mentions_gin_idx
  on task_comments using gin (mentions);

