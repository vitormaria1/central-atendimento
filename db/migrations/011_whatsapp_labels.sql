create table if not exists wa_labels (
  id text primary key,
  name text not null,
  color text null,
  updated_at timestamptz not null default now()
);

create index if not exists wa_labels_name_idx on wa_labels (name);

