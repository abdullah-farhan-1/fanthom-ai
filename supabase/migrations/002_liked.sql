-- Meetings can be liked (starred) and sorted by it. Run once in Supabase → SQL Editor.
alter table meetings add column if not exists liked boolean not null default false;
