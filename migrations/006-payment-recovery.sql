-- Preserve uncertain attempts; only authenticated reconciliation releases rejected creations.
begin;
alter table payment_attempts drop constraint if exists payment_attempts_state_check;
alter table payment_attempts add constraint payment_attempts_state_check
  check (state in ('creating','ready','unknown','failed','retryable'));
alter table payment_attempts drop constraint if exists payment_attempts_attempts_check;
alter table payment_attempts add constraint payment_attempts_attempts_check
  check (attempts between 1 and 3);
commit;
