begin;

drop function if exists public.bulk_insert_quiz_questions(jsonb, jsonb, uuid);
drop function if exists public.bulk_insert_quiz_questions(jsonb);

create or replace function public.bulk_insert_quiz_questions(
  p_questions jsonb,
  p_collection_name_overrides jsonb default null,
  p_merge_into_collection_id uuid default null
)
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
  v_collection_names text[];
begin
  if current_user_id is null then
    raise exception 'Authenticated user is required to persist quiz questions.' using errcode = '42501';
  end if;

  if p_questions is null or jsonb_typeof(p_questions) <> 'array' then
    raise exception 'p_questions must be a non-empty JSON array.';
  end if;

  if jsonb_array_length(p_questions) = 0 then
    raise exception 'p_questions must include at least one question.';
  end if;

  if p_collection_name_overrides is not null and jsonb_typeof(p_collection_name_overrides) <> 'object' then
    raise exception 'p_collection_name_overrides must be a JSON object when provided.' using errcode = '22023';
  end if;

  if p_merge_into_collection_id is not null then
    perform 1
    from public.collections c
    where c.id = p_merge_into_collection_id
      and c.user_id = current_user_id;

    if not found then
      raise exception 'Merge target collection not found.' using errcode = 'P0002';
    end if;
  end if;

  -- Insert all questions first and keep IDs and subjects aligned through parallel arrays.
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

  if p_merge_into_collection_id is not null then
    return query
    insert into public.collection_questions (collection_id, question_id)
    select p_merge_into_collection_id, q.id
    from unnest(v_question_ids) as q(id)
    returning
      collection_questions.question_id as question_id,
      collection_questions.collection_id as collection_id;
  end if;

  select array_agg(
    coalesce(
      nullif(trim(p_collection_name_overrides ->> s.subject), ''),
      s.subject
    )
  )
  into v_collection_names
  from unnest(v_subjects) as s(subject);

  insert into public.collections (user_id, name, description)
  select distinct current_user_id, collection_name, null
  from unnest(v_collection_names) as collection_name
  on conflict (user_id, name) do nothing;

  return query
  insert into public.collection_questions (collection_id, question_id)
  select c.id, q.id
  from unnest(v_question_ids, v_collection_names) as q(id, collection_name)
  join public.collections c
    on c.name = q.collection_name and c.user_id = current_user_id
  returning
    collection_questions.question_id as question_id,
    collection_questions.collection_id as collection_id;
end;
$$;

revoke all on function public.bulk_insert_quiz_questions(jsonb, jsonb, uuid) from public;
grant execute on function public.bulk_insert_quiz_questions(jsonb, jsonb, uuid) to authenticated;

commit;
