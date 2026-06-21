do $$
begin
  if not exists (select 1 from pg_type where typname = 'contract_status') then
    create type contract_status as enum ('draft', 'active', 'paused', 'closed');
  end if;

  if not exists (select 1 from pg_type where typname = 'billing_cycle_status') then
    create type billing_cycle_status as enum ('pending', 'processing', 'partial', 'completed', 'failed');
  end if;

  if not exists (select 1 from pg_type where typname = 'billing_item_status') then
    create type billing_item_status as enum ('pending', 'issued', 'failed', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'payment_status') then
    create type payment_status as enum ('open', 'paid', 'overdue', 'cancelled');
  end if;

  if not exists (select 1 from pg_type where typname = 'ledger_kind') then
    create type ledger_kind as enum ('receivable', 'payable');
  end if;

  if not exists (select 1 from pg_type where typname = 'ledger_source_type') then
    create type ledger_source_type as enum ('monthly_fee', 'extra_service', 'manual', 'adjustment');
  end if;
end$$;

create table if not exists client_contracts (
  id bigint generated always as identity primary key,
  client_id bigint not null unique references clients (id) on delete cascade,
  status contract_status not null default 'draft',
  monthly_fee_cents integer not null default 0,
  due_day smallint not null default 1,
  contract_start_date date,
  contract_end_date date,
  billing_email text,
  billing_whatsapp text,
  send_email boolean not null default true,
  send_whatsapp boolean not null default true,
  generate_invoice boolean not null default true,
  generate_boleto boolean not null default true,
  focus_customer_id text,
  focus_service_id text,
  inter_customer_id text,
  inter_wallet_id text,
  invoice_service_code text,
  invoice_service_description text,
  invoice_nature text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists client_contracts_status_idx on client_contracts (status, id);

create table if not exists fiscal_service_catalog (
  id bigint generated always as identity primary key,
  code text not null unique,
  name text not null,
  description text,
  municipal_code text,
  cnae text,
  tax_regime text,
  active boolean not null default true,
  focus_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists fiscal_service_catalog_active_idx on fiscal_service_catalog (active, id);

create table if not exists billing_cycles (
  id bigint generated always as identity primary key,
  competence_month date not null unique,
  status billing_cycle_status not null default 'pending',
  executed_at timestamptz,
  executed_by text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists billing_cycles_status_idx on billing_cycles (status, competence_month desc);

create table if not exists billing_cycle_items (
  id bigint generated always as identity primary key,
  cycle_id bigint references billing_cycles (id) on delete cascade,
  contract_id bigint not null references client_contracts (id) on delete cascade,
  client_id bigint not null references clients (id) on delete cascade,
  base_amount_cents integer not null default 0,
  avulso_amount_cents integer not null default 0,
  total_amount_cents integer not null default 0,
  due_date date,
  invoice_status billing_item_status not null default 'pending',
  boleto_status billing_item_status not null default 'pending',
  payment_status payment_status not null default 'open',
  email_status text not null default 'pending',
  whatsapp_status text not null default 'pending',
  focus_invoice_id text,
  focus_invoice_number text,
  focus_invoice_url text,
  boleto_url text,
  boleto_barcode text,
  inter_charge_id text,
  sent_at timestamptz,
  paid_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists billing_cycle_items_cycle_contract_idx on billing_cycle_items (cycle_id, contract_id);
create unique index if not exists billing_cycle_items_billing_cycle_item_id_idx on financial_entries (billing_cycle_item_id) where billing_cycle_item_id is not null;
create unique index if not exists financial_entries_extra_service_id_idx on financial_entries (extra_service_id) where extra_service_id is not null;
create index if not exists billing_cycle_items_payment_status_idx on billing_cycle_items (payment_status, due_date);

create table if not exists extra_services (
  id bigint generated always as identity primary key,
  client_id bigint not null references clients (id) on delete cascade,
  contract_id bigint references client_contracts (id) on delete set null,
  billing_cycle_item_id bigint references billing_cycle_items (id) on delete set null,
  competence_month date not null,
  service_date date not null default current_date,
  description text not null,
  amount_cents integer not null,
  status text not null default 'open',
  created_by_agent_id text references agents (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists extra_services_competence_idx on extra_services (competence_month, status, id);

create table if not exists financial_entries (
  id bigint generated always as identity primary key,
  contract_id bigint references client_contracts (id) on delete set null,
  client_id bigint references clients (id) on delete set null,
  billing_cycle_item_id bigint references billing_cycle_items (id) on delete set null,
  extra_service_id bigint references extra_services (id) on delete set null,
  kind ledger_kind not null,
  source_type ledger_source_type not null default 'manual',
  source_label text not null,
  competence_month date,
  due_date date,
  amount_cents integer not null,
  status payment_status not null default 'open',
  paid_at timestamptz,
  external_ref text,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists financial_entries_status_due_idx on financial_entries (status, due_date, id);
create index if not exists financial_entries_kind_idx on financial_entries (kind, status, id);

create table if not exists financial_bank_connections (
  id bigint generated always as identity primary key,
  label text not null,
  bank_name text not null default 'inter',
  status text not null default 'active',
  is_primary boolean not null default false,
  account_number text,
  branch_number text,
  wallet_id text,
  external_account_id text,
  config jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists financial_bank_connections_primary_idx on financial_bank_connections (is_primary, id);

drop trigger if exists trg_client_contracts_updated_at on client_contracts;
create trigger trg_client_contracts_updated_at before update on client_contracts for each row execute function set_updated_at();

drop trigger if exists trg_fiscal_service_catalog_updated_at on fiscal_service_catalog;
create trigger trg_fiscal_service_catalog_updated_at before update on fiscal_service_catalog for each row execute function set_updated_at();

drop trigger if exists trg_billing_cycles_updated_at on billing_cycles;
create trigger trg_billing_cycles_updated_at before update on billing_cycles for each row execute function set_updated_at();

drop trigger if exists trg_billing_cycle_items_updated_at on billing_cycle_items;
create trigger trg_billing_cycle_items_updated_at before update on billing_cycle_items for each row execute function set_updated_at();

drop trigger if exists trg_extra_services_updated_at on extra_services;
create trigger trg_extra_services_updated_at before update on extra_services for each row execute function set_updated_at();

drop trigger if exists trg_financial_entries_updated_at on financial_entries;
create trigger trg_financial_entries_updated_at before update on financial_entries for each row execute function set_updated_at();

drop trigger if exists trg_financial_bank_connections_updated_at on financial_bank_connections;
create trigger trg_financial_bank_connections_updated_at before update on financial_bank_connections for each row execute function set_updated_at();
