begin;

create or replace function public.upsert_mastery_cache_level(
  p_question_id uuid,
  p_mastery_level smallint
)
returns table (mastery_level smallint)
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'Authentication is required to update mastery.'
      using errcode = '42501';
  end if;

  if p_mastery_level < 0 or p_mastery_level > 5 then
    raise exception 'Mastery level must be between 0 and 5.'
      using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.questions q
    where q.id = p_question_id
      and q.user_id = v_user_id
  ) then
    raise exception 'Question not found.'
      using errcode = 'P0002';
  end if;

  return query
  insert into public.mastery_cache (user_id, question_id, mastery_level)
  values (v_user_id, p_question_id, p_mastery_level)
  on conflict (user_id, question_id)
  do update
    set mastery_level = greatest(public.mastery_cache.mastery_level, excluded.mastery_level),
        updated_at = timezone('utc', now())
  returning public.mastery_cache.mastery_level;
end;
$$;

grant execute on function public.upsert_mastery_cache_level(uuid, smallint) to authenticated;

commit;
