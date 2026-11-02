create table if not exists "user" (
  id text primary key, name text not null, email text not null unique,
  "emailVerified" boolean not null default false, image text,
  "createdAt" timestamptz not null default now(), "updatedAt" timestamptz not null default now()
);
create table if not exists session (
  id text primary key, "expiresAt" timestamptz not null, token text not null unique,
  "createdAt" timestamptz not null default now(), "updatedAt" timestamptz not null default now(),
  "ipAddress" text, "userAgent" text, "userId" text not null references "user"(id) on delete cascade
);
create table if not exists account (
  id text primary key, "accountId" text not null, "providerId" text not null,
  "userId" text not null references "user"(id) on delete cascade,
  "accessToken" text, "refreshToken" text, "idToken" text,
  "accessTokenExpiresAt" timestamptz, "refreshTokenExpiresAt" timestamptz, scope text, password text,
  "createdAt" timestamptz not null default now(), "updatedAt" timestamptz not null default now()
);
create table if not exists verification (
  id text primary key, identifier text not null, value text not null,
  "expiresAt" timestamptz not null, "createdAt" timestamptz not null default now(), "updatedAt" timestamptz not null default now()
);
create index if not exists verification_identifier_idx on verification(identifier);
create table if not exists "rateLimit" (id text primary key, key text unique not null, count integer not null, "lastRequest" bigint not null);
create table if not exists admin_sessions (
  token_hash text primary key, expires_at timestamptz not null, created_at timestamptz not null default now()
);
create table if not exists guest_order_grants (
  token_hash text not null, order_id text not null references orders(id) on delete cascade,
  expires_at timestamptz not null, primary key(token_hash, order_id)
);
create table if not exists request_limits (
  key text primary key, count integer not null, expires_at timestamptz not null
);
create table if not exists user_roles (
  user_id text primary key references "user"(id) on delete cascade,
  role text not null check (role in ('reader','author','admin')),
  updated_at timestamptz not null default now()
);
