-- Customer profile captured at sign-up. Verified email is required before the library opens.
alter table "user" add column if not exists "firstName" text;
alter table "user" add column if not exists "lastName" text;
alter table "user" add column if not exists country text;
alter table "user" add column if not exists phone text;
