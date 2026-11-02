-- Additive commerce hardening; apply through the deployment migration process.
begin;
alter table orders add column if not exists checkout_key text;
alter table orders add column if not exists checkout_hash text;
alter table orders add column if not exists reader_id text;
alter table orders add column if not exists payment_url text;
alter table orders add column if not exists is_dev boolean not null default false;
alter table orders add column if not exists refunded_at timestamptz;
alter table orders add column if not exists commerce_checked_at timestamptz;
create unique index if not exists orders_checkout_key_idx on orders(checkout_key);
alter table downloads add column if not exists revoked_at timestamptz;
create table if not exists payment_attempts (
  order_id text primary key references orders(id),
  state text not null check (state in ('creating','ready','unknown')),
  attempts integer not null default 1 check (attempts = 1),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists email_delivery (
  order_id text primary key references orders(id),
  payload jsonb not null,
  state text not null default 'pending' check (state in ('pending','sending','sent','cancelled','manual')),
  attempts integer not null default 0 check (attempts between 0 and 8),
  first_attempt_at timestamptz,
  next_attempt_at timestamptz not null default now(),
  lease_until timestamptz,
  claim_id text,
  provider_id text,
  last_error text,
  sent_at timestamptz
);
create index if not exists email_delivery_retry_idx on email_delivery(state, next_attempt_at);
commit;
