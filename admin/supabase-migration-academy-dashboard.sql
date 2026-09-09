-- Additive: timing fields for live teacher dashboard.
-- No DROP / DELETE.

alter table public.academy_sessions
  add column if not exists phase_started_at timestamptz;

alter table public.academy_answers
  add column if not exists response_ms integer;
