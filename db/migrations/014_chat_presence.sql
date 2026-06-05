alter table if exists chat_state
  add column if not exists presence_status text,
  add column if not exists last_seen_at timestamptz,
  add column if not exists typing_until_at timestamptz;
