create table if not exists public.guides (
  slug text primary key,
  app_name text not null,
  official_domain text not null,
  data jsonb not null,
  created_at timestamptz not null default now()
);

-- Only the server (service-role key) reads/writes. RLS on with no policies blocks anon/public access.
alter table public.guides enable row level security;
