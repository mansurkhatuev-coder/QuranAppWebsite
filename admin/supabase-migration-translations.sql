-- Run once in Supabase SQL Editor after initial schema.
alter table public.dua_items add column if not exists translation_chechen text;
alter table public.dua_items add column if not exists extra_translations jsonb not null default '[]'::jsonb;
