begin;

create or replace function public.bulk_insert_quiz_questions(p_questions jsonb)
returns table (
  question_id uuid,
  collection_id uuid
)
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  v_question_ids uuid[];
  v_subjects text[];
begin
  if current_user_id is null then
    raise exception 'Authenticated user is required to persist quiz questions.';
  end if;

  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    raise exception 'p_questions must be a non-empty JSON array.';
  end if;

  if jsonb_array_length(p_questions) = 0 then
    raise exception 'p_questions must include at least one question.';
  end if;

  -- Step 1: insert questions and capture ids/subjects into parallel arrays.
  -- A single statement is used so the RETURNING clause can feed the aggregate.
  -- Both array_agg calls iterate the same input rows in the same order, so
  -- v_question_ids[i] always pairs with v_subjects[i].
  with parsed_questions as (
    select
      item->>'question' as question,
      item->>'mcq_question' as mcq_question,
      item->>'complete_answer' as complete_answer,
      item->'mcq_options' as mcq_options,
      item->>'subject' as subject,
      (item->>'difficulty')::smallint as difficulty
    from jsonb_array_elements(p_questions) as item
  ),
  inserted_questions as (
    insert into public.questions (
      user_id,
      question,
      mcq_question,
      complete_answer,
      mcq_options,
      subject,
      difficulty
    )
    select
      current_user_id,
      question,
      mcq_question,
      complete_answer,
      mcq_options,
      subject,
      difficulty
    from parsed_questions
    returning id, subject
  )
  select array_agg(id), array_agg(subject)
  into v_question_ids, v_subjects
  from inserted_questions;

  -- Step 2: upsert one collection per distinct subject. Runs as a separate
  -- statement so step 3's RLS policy can see these rows via public.collections.
  insert into public.collections (user_id, name, description)
  select distinct current_user_id, s, null
  from unnest(v_subjects) as s
  on conflict (user_id, name) do nothing;

  -- Step 3: link questions to their subject's collection. At this point, both
  -- the questions (step 1) and collections (step 2) are visible through their
  -- underlying tables, so the collection_questions RLS WITH CHECK passes.
  return query
  insert into public.collection_questions (collection_id, question_id)
  select c.id, q.id
  from unnest(v_question_ids, v_subjects) as q(id, subject)
  join public.collections c
    on c.name = q.subject and c.user_id = current_user_id
  returning
    collection_questions.question_id as question_id,
    collection_questions.collection_id as collection_id;
end;
$$;

revoke all on function public.bulk_insert_quiz_questions(jsonb) from public;
grant execute on function public.bulk_insert_quiz_questions(jsonb) to authenticated;

commit;
