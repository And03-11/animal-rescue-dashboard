begin;

-- The application reaches PostgreSQL through its trusted backend. Public Data
-- API roles must not have direct table, view, or sequence privileges.
revoke all privileges on all tables
  in schema public
  from anon, authenticated;

revoke all privileges on all sequences
  in schema public
  from anon, authenticated;

-- Tables created through SQL do not always receive RLS automatically.
do $$
declare
  item record;
begin
  for item in
    select n.nspname as schema_name, c.relname as table_name
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format(
      'alter table %I.%I enable row level security',
      item.schema_name,
      item.table_name
    );
  end loop;
end
$$;

-- Keep future objects private when they are created by the current owner.
alter default privileges in schema public
  revoke all on tables from anon, authenticated;

alter default privileges in schema public
  revoke all on sequences from anon, authenticated;

commit;
