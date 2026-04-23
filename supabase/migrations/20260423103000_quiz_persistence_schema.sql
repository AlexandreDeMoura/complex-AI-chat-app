begin;

create extension if not exists "pgcrypto";

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$;

create table if not exists public.questions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question text not null,
  mcq_question text not null,
  complete_answer text not null,
  mcq_options jsonb not null,
  subject text not null,
  difficulty smallint not null,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint questions_mcq_options_is_array check (jsonb_typeof(mcq_options) = 'array')
);

create table if not exists public.collections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  description text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  constraint collections_user_id_name_key unique (user_id, name)
);

create table if not exists public.collection_questions (
  collection_id uuid not null references public.collections (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  added_at timestamptz not null default timezone('utc', now()),
  primary key (collection_id, question_id)
);

create table if not exists public.answer_history (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  mode text not null check (mode in ('open', 'mcq')),
  user_answer text not null,
  is_correct boolean,
  grade smallint,
  ai_feedback text,
  answered_at timestamptz not null default timezone('utc', now()),
  constraint answer_history_grade_range check (grade is null or grade between 0 and 5),
  constraint answer_history_mode_fields check (
    (mode = 'open' and is_correct is null)
    or (mode = 'mcq' and grade is null and is_correct is not null)
  )
);

create table if not exists public.mastery_cache (
  user_id uuid not null references auth.users (id) on delete cascade,
  question_id uuid not null references public.questions (id) on delete cascade,
  mastery_level smallint not null default 0 check (mastery_level between 0 and 5),
  updated_at timestamptz not null default timezone('utc', now()),
  primary key (user_id, question_id)
);

create index if not exists idx_questions_user_id on public.questions (user_id);
create index if not exists idx_collections_user_id on public.collections (user_id);
create index if not exists idx_collection_questions_question_id on public.collection_questions (question_id);
create index if not exists idx_answer_history_user_id on public.answer_history (user_id);
create index if not exists idx_answer_history_question_id_answered_at
  on public.answer_history (question_id, answered_at);
create index if not exists idx_mastery_cache_question_id on public.mastery_cache (question_id);

drop trigger if exists set_questions_updated_at on public.questions;
create trigger set_questions_updated_at
before update on public.questions
for each row
execute function public.set_updated_at();

drop trigger if exists set_collections_updated_at on public.collections;
create trigger set_collections_updated_at
before update on public.collections
for each row
execute function public.set_updated_at();

drop trigger if exists set_mastery_cache_updated_at on public.mastery_cache;
create trigger set_mastery_cache_updated_at
before update on public.mastery_cache
for each row
execute function public.set_updated_at();

alter table public.questions enable row level security;
alter table public.collections enable row level security;
alter table public.collection_questions enable row level security;
alter table public.answer_history enable row level security;
alter table public.mastery_cache enable row level security;

drop policy if exists questions_user_isolation on public.questions;
create policy questions_user_isolation
on public.questions
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists collections_user_isolation on public.collections;
create policy collections_user_isolation
on public.collections
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists answer_history_user_isolation on public.answer_history;
create policy answer_history_user_isolation
on public.answer_history
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists mastery_cache_user_isolation on public.mastery_cache;
create policy mastery_cache_user_isolation
on public.mastery_cache
for all
to authenticated
using (user_id = auth.uid())
with check (user_id = auth.uid());

drop policy if exists collection_questions_transitive_user_isolation on public.collection_questions;
create policy collection_questions_transitive_user_isolation
on public.collection_questions
for all
to authenticated
using (
  exists (
    select 1
    from public.collections c
    where c.id = collection_id
      and c.user_id = auth.uid()
  )
  and exists (
    select 1
    from public.questions q
    where q.id = question_id
      and q.user_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.collections c
    where c.id = collection_id
      and c.user_id = auth.uid()
  )
  and exists (
    select 1
    from public.questions q
    where q.id = question_id
      and q.user_id = auth.uid()
  )
);

commit;
