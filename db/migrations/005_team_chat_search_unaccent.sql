create extension if not exists unaccent;

drop index if exists team_chat_messages_search_tsv_idx;

alter table team_chat_messages
  drop column if exists search_tsv;

alter table team_chat_messages
  add column search_tsv tsvector;

update team_chat_messages
set search_tsv = to_tsvector('portuguese', unaccent(coalesce(sender_name, '') || ' ' || coalesce(body, '')))
where search_tsv is null;

create index if not exists team_chat_messages_search_tsv_idx
  on team_chat_messages using gin (search_tsv);

create or replace function team_chat_messages_search_tsv_update() returns trigger as $$
begin
  new.search_tsv := to_tsvector('portuguese', unaccent(coalesce(new.sender_name, '') || ' ' || coalesce(new.body, '')));
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_team_chat_messages_search_tsv on team_chat_messages;
create trigger trg_team_chat_messages_search_tsv
before insert or update of sender_name, body
on team_chat_messages
for each row execute function team_chat_messages_search_tsv_update();
