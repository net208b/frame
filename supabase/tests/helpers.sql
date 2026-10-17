-- Test helpers. Each assertion is two-sided on purpose: `test_rejects` fails
-- loudly if the database ACCEPTS data it should refuse, and `test_accepts`
-- fails if it refuses data it should take. A suite with only negative cases
-- passes just as happily against a broken constraint that rejects everything,
-- so every guard below is paired with a positive control.

create or replace function public.test_rejects(
  label           text,
  stmt            text,
  expect_sqlstate text default null
)
returns void
language plpgsql
as $$
begin
  begin
    execute stmt;
  exception
    when others then
      if expect_sqlstate is not null and sqlstate <> expect_sqlstate then
        raise exception 'WRONG ERROR   %  expected SQLSTATE % but got % (%)',
          label, expect_sqlstate, sqlstate, sqlerrm;
      end if;
      raise notice 'reject ok     %  [%]', label, sqlstate;
      return;
  end;
  raise exception 'NOT REJECTED  %  the database accepted data it must refuse', label;
end
$$;

create or replace function public.test_accepts(label text, stmt text)
returns void
language plpgsql
as $$
begin
  execute stmt;
  raise notice 'accept ok     %', label;
exception
  when others then
    raise exception 'WRONGLY REJECTED  %  (% %)', label, sqlstate, sqlerrm;
end
$$;

comment on function public.test_rejects(text, text, text) is
  'Test-only. Asserts a statement is refused, optionally with a specific SQLSTATE.';
comment on function public.test_accepts(text, text) is
  'Test-only. Asserts a statement succeeds — the positive control for a nearby reject test.';
