alter table clients
  add column if not exists legal_name text,
  add column if not exists whatsapp text,
  add column if not exists contact_name text,
  add column if not exists contact_role text,
  add column if not exists address_line text,
  add column if not exists address_number text,
  add column if not exists neighborhood text,
  add column if not exists city text,
  add column if not exists state text,
  add column if not exists zip_code text,
  add column if not exists notes text;
