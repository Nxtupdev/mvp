# Migration conventions

Patterns to follow when writing new SQL migrations for NXTUP. Mostly
forensic notes from past mistakes — read once, then keep nearby when
authoring a new migration.

## File naming

`NNN_short_snake_case_description.sql` where `NNN` is the next zero-
padded sequence number (continuing from the highest existing file).
No gaps. No re-using numbers.

## Header block

Every migration starts with a header comment that explains:

1. **What** the migration does (one-liner).
2. **Why** (context — what bug, feature, or decision prompted it).
3. **How to run** ("Run in Supabase SQL Editor" or otherwise).
4. **Side effects** worth flagging (RLS changes, dropped columns,
   constraint additions that could fail on dirty data).
5. **Idempotency notes** — what happens if someone runs it twice.

Browse existing migrations for the house style — they're verbose on
purpose. Future-you (or another agent) needs the context.

## Required GRANT block for new tables

Supabase is removing the legacy auto-grant of `anon`/`authenticated`/
`service_role` on tables in `public`. Cronograma:

- **Oct 30, 2026**: existing projects (NXTUP) lose the legacy default
- **May 30, 2026**: already applied to new projects

Any `create table` MUST end with explicit GRANTs matching its access
pattern. See migration 034 for the audit of existing tables. Patterns
in use:

**Public-read + owner-managed** (shops, services, shop_avatars):

```sql
grant select on table public.foo to anon;
grant select, insert, update, delete on table public.foo to authenticated;
grant all on table public.foo to service_role;
```

**Public-read + anon-write** (queue_entries, clients — kiosko/check-in
inserts as anon):

```sql
grant select, insert, update on table public.foo to anon;
grant select, insert, update, delete on table public.foo to authenticated;
grant all on table public.foo to service_role;
```

**Secrets / admin-only** (app_settings — read via SECURITY DEFINER
functions, never via Data API):

```sql
grant all on table public.foo to service_role;
-- (no anon/authenticated grants — RLS denies all and functions bypass it)
```

**For sequences** (only if using SERIAL/IDENTITY — NXTUP uses `uuid
default gen_random_uuid()` everywhere so this is rare):

```sql
grant usage, select on sequence public.foo_id_seq to anon, authenticated;
grant all on sequence public.foo_id_seq to service_role;
```

## RLS

Always pair the GRANT block with `alter table ... enable row level
security` and at least one policy. Grant gives the role the *ability*
to touch the table; RLS controls *which rows*. Forgetting RLS while
having grants = full table exposure.

If a table has no RLS policy but RLS is enabled, that role can read
zero rows — which is usually what you want for admin-only tables.

## Functions

`security definer` functions need `grant execute on function
foo(args) to anon, authenticated` (or whichever roles need to call
it). This is unchanged by the Supabase grant changes — only tables
and sequences are affected.

## Comments

Use `comment on table` and `comment on column` liberally for anything
non-obvious. They surface in the Supabase Studio table editor and in
`\d+ tablename` in psql — they're how the next agent will discover
"why is this column nullable?" without having to git-blame back to
the migration.

## Testing

Idempotency check: run the migration twice in a fresh dev database.
The second run should succeed silently. If anything errors, add `if
not exists` / `or replace` / `on conflict do nothing` as appropriate.

If the migration adds a NOT NULL column to an existing table with
rows, you need a backfill step before the constraint or it fails.
The constraint should come last:

```sql
alter table foo add column bar text;
update foo set bar = 'default-value' where bar is null;
alter table foo alter column bar set not null;
```
