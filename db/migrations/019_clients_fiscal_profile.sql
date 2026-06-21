alter table clients
  add column if not exists municipal_registration text,
  add column if not exists state_registration text,
  add column if not exists tax_regime text,
  add column if not exists fiscal_city text,
  add column if not exists fiscal_state text,
  add column if not exists invoice_email text,
  add column if not exists service_code text,
  add column if not exists service_description text;
