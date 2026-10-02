-- Fanthom schema. Run once in Supabase → SQL Editor.
-- All access is server-side with the secret key; RLS is on with no policies,
-- so the publishable (browser) key cannot read or write any table.

create table if not exists meetings (
  id            uuid primary key default gen_random_uuid(),
  title         text not null default 'Untitled meeting',
  meeting_date  date not null default current_date,
  source        text not null check (source in ('audio', 'video', 'transcript')),
  media_path    text,
  duration_s    numeric,
  status        text not null default 'processing' check (status in ('processing', 'ready', 'failed')),
  stage         text,                               -- human-readable progress: "Transcribing", "Writing notes"
  error         text,
  speakers      jsonb not null default '{}'::jsonb, -- {"0": "Sara", "1": "Daniyal"}
  notes         jsonb,                              -- validated AI notes (summary, action items, decisions, questions, chapters)
  model         text,
  created_at    timestamptz not null default now()
);

create table if not exists segments (
  meeting_id  uuid not null references meetings(id) on delete cascade,
  idx         int not null,
  speaker     text not null,
  start_s     numeric not null,
  end_s       numeric not null,
  text        text not null,
  tsv         tsvector generated always as (to_tsvector('english', text)) stored,
  primary key (meeting_id, idx)
);
create index if not exists segments_tsv_idx on segments using gin (tsv);

create table if not exists summaries (
  meeting_id  uuid not null references meetings(id) on delete cascade,
  template    text not null,
  content     jsonb not null,
  model       text,
  created_at  timestamptz not null default now(),
  primary key (meeting_id, template)
);

create table if not exists highlights (
  id          uuid primary key default gen_random_uuid(),
  meeting_id  uuid not null references meetings(id) on delete cascade,
  start_s     numeric not null,
  end_s       numeric not null,
  title       text,
  share_id    text not null unique default substr(md5(random()::text), 1, 10),
  created_at  timestamptz not null default now(),
  check (end_s > start_s)
);
create index if not exists highlights_meeting_idx on highlights (meeting_id);

alter table meetings   enable row level security;
alter table segments   enable row level security;
alter table summaries  enable row level security;
alter table highlights enable row level security;

-- Added later (also in migrations/002_liked.sql)
alter table meetings add column if not exists liked boolean not null default false;
