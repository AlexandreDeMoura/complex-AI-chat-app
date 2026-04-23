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

  return query
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
  ),
  distinct_subjects as (
    select distinct subject
    from inserted_questions
  ),
  inserted_collections as (
    insert into public.collections (user_id, name, description)
    select
      current_user_id,
      subject,
      null
    from distinct_subjects
    on conflict (user_id, name) do nothing
    returning id
  ),
  subject_collections as (
    select
      c.id,
      c.name
    from public.collections c
    join distinct_subjects ds
      on ds.subject = c.name
    where c.user_id = current_user_id
  ),
  inserted_links as (
    insert into public.collection_questions (collection_id, question_id)
    select
      sc.id,
      iq.id
    from inserted_questions iq
    join subject_collections sc
      on sc.name = iq.subject
    returning question_id, collection_id
  )
  select
    question_id,
    collection_id
  from inserted_links;
end;
$$;

revoke all on function public.bulk_insert_quiz_questions(jsonb) from public;
grant execute on function public.bulk_insert_quiz_questions(jsonb) to authenticated;

commit;
