begin;

create or replace function public.delete_collection_with_orphan_strategy(
  p_collection_id uuid,
  p_orphan_strategy text default null,
  p_target_collection_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_strategy text := nullif(trim(coalesce(p_orphan_strategy, '')), '');
  orphan_question_ids uuid[] := '{}'::uuid[];
  deleted_question_ids uuid[] := '{}'::uuid[];
  reassigned_question_ids uuid[] := '{}'::uuid[];
  deleted_collection_id uuid;
  orphan_count integer := 0;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authenticated user is required to delete a collection.';
  end if;

  if normalized_strategy is not null and normalized_strategy not in ('delete', 'reassign') then
    raise exception using
      errcode = '22023',
      message = 'Invalid orphan strategy. Expected "delete" or "reassign".';
  end if;

  perform 1
  from public.collections c
  where c.id = p_collection_id
    and c.user_id = current_user_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Collection not found.';
  end if;

  select coalesce(array_agg(candidate.question_id), '{}'::uuid[])
  into orphan_question_ids
  from (
    select cq.question_id
    from public.collection_questions cq
    where cq.collection_id = p_collection_id
      and not exists (
        select 1
        from public.collection_questions other_links
        where other_links.question_id = cq.question_id
          and other_links.collection_id <> p_collection_id
      )
  ) as candidate;

  orphan_count := coalesce(array_length(orphan_question_ids, 1), 0);

  if orphan_count > 0 and normalized_strategy is null then
    return jsonb_build_object(
      'status', 'orphan_conflict',
      'orphan_question_ids', orphan_question_ids,
      'deleted_collection_id', null,
      'deleted_question_ids', '{}'::uuid[],
      'reassigned_question_ids', '{}'::uuid[]
    );
  end if;

  if orphan_count > 0 and normalized_strategy = 'reassign' then
    if p_target_collection_id is null then
      raise exception using
        errcode = '22023',
        message = 'A target collection is required when orphan_strategy is "reassign".';
    end if;

    if p_target_collection_id = p_collection_id then
      raise exception using
        errcode = '22023',
        message = 'Target collection must be different from the collection being deleted.';
    end if;

    perform 1
    from public.collections c
    where c.id = p_target_collection_id
      and c.user_id = current_user_id;

    if not found then
      raise exception using
        errcode = 'P0002',
        message = 'Target collection not found.';
    end if;

    insert into public.collection_questions (collection_id, question_id)
    select p_target_collection_id, orphan_question_id
    from unnest(orphan_question_ids) as orphan_question_id
    on conflict (collection_id, question_id) do nothing;

    reassigned_question_ids := orphan_question_ids;
  end if;

  if orphan_count > 0 and normalized_strategy = 'delete' then
    with deleted as (
      delete from public.questions q
      where q.user_id = current_user_id
        and q.id = any(orphan_question_ids)
      returning q.id
    )
    select coalesce(array_agg(d.id), '{}'::uuid[])
    into deleted_question_ids
    from deleted d;
  end if;

  delete from public.collections c
  where c.id = p_collection_id
    and c.user_id = current_user_id
  returning c.id
  into deleted_collection_id;

  if deleted_collection_id is null then
    raise exception using
      errcode = 'P0002',
      message = 'Collection not found.';
  end if;

  return jsonb_build_object(
    'status', 'deleted',
    'orphan_question_ids', orphan_question_ids,
    'deleted_collection_id', deleted_collection_id,
    'deleted_question_ids', deleted_question_ids,
    'reassigned_question_ids', reassigned_question_ids
  );
end;
$$;

create or replace function public.remove_collection_question_with_orphan_strategy(
  p_collection_id uuid,
  p_question_id uuid,
  p_orphan_strategy text default null,
  p_target_collection_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_strategy text := nullif(trim(coalesce(p_orphan_strategy, '')), '');
  orphan_question_ids uuid[] := '{}'::uuid[];
  deleted_question_ids uuid[] := '{}'::uuid[];
  reassigned_question_ids uuid[] := '{}'::uuid[];
  has_other_links boolean := false;
  removed_link_count integer := 0;
begin
  if current_user_id is null then
    raise exception using
      errcode = '42501',
      message = 'Authenticated user is required to remove a collection question link.';
  end if;

  if normalized_strategy is not null and normalized_strategy not in ('delete', 'reassign') then
    raise exception using
      errcode = '22023',
      message = 'Invalid orphan strategy. Expected "delete" or "reassign".';
  end if;

  perform 1
  from public.collection_questions cq
  join public.collections c on c.id = cq.collection_id
  join public.questions q on q.id = cq.question_id
  where cq.collection_id = p_collection_id
    and cq.question_id = p_question_id
    and c.user_id = current_user_id
    and q.user_id = current_user_id;

  if not found then
    raise exception using
      errcode = 'P0002',
      message = 'Collection question link not found.';
  end if;

  select exists (
    select 1
    from public.collection_questions cq
    where cq.question_id = p_question_id
      and cq.collection_id <> p_collection_id
  )
  into has_other_links;

  if not has_other_links then
    orphan_question_ids := array[p_question_id];

    if normalized_strategy is null then
      return jsonb_build_object(
        'status', 'orphan_conflict',
        'orphan_question_ids', orphan_question_ids,
        'collection_id', p_collection_id,
        'question_id', p_question_id,
        'deleted_question_ids', '{}'::uuid[],
        'reassigned_question_ids', '{}'::uuid[]
      );
    end if;

    if normalized_strategy = 'reassign' then
      if p_target_collection_id is null then
        raise exception using
          errcode = '22023',
          message = 'A target collection is required when orphan_strategy is "reassign".';
      end if;

      if p_target_collection_id = p_collection_id then
        raise exception using
          errcode = '22023',
          message = 'Target collection must be different from the source collection.';
      end if;

      perform 1
      from public.collections c
      where c.id = p_target_collection_id
        and c.user_id = current_user_id;

      if not found then
        raise exception using
          errcode = 'P0002',
          message = 'Target collection not found.';
      end if;

      insert into public.collection_questions (collection_id, question_id)
      values (p_target_collection_id, p_question_id)
      on conflict (collection_id, question_id) do nothing;

      reassigned_question_ids := orphan_question_ids;
    elsif normalized_strategy = 'delete' then
      with deleted as (
        delete from public.questions q
        where q.id = p_question_id
          and q.user_id = current_user_id
        returning q.id
      )
      select coalesce(array_agg(d.id), '{}'::uuid[])
      into deleted_question_ids
      from deleted d;
    end if;
  end if;

  if coalesce(array_length(deleted_question_ids, 1), 0) = 0 then
    delete from public.collection_questions cq
    using public.collections c
    where cq.collection_id = p_collection_id
      and cq.question_id = p_question_id
      and c.id = cq.collection_id
      and c.user_id = current_user_id;

    get diagnostics removed_link_count = row_count;

    if removed_link_count = 0 then
      raise exception using
        errcode = 'P0002',
        message = 'Collection question link not found.';
    end if;
  end if;

  return jsonb_build_object(
    'status', 'removed',
    'orphan_question_ids', orphan_question_ids,
    'collection_id', p_collection_id,
    'question_id', p_question_id,
    'deleted_question_ids', deleted_question_ids,
    'reassigned_question_ids', reassigned_question_ids
  );
end;
$$;

revoke all on function public.delete_collection_with_orphan_strategy(uuid, text, uuid) from public;
grant execute on function public.delete_collection_with_orphan_strategy(uuid, text, uuid) to authenticated;

revoke all on function public.remove_collection_question_with_orphan_strategy(uuid, uuid, text, uuid) from public;
grant execute on function public.remove_collection_question_with_orphan_strategy(uuid, uuid, text, uuid) to authenticated;

commit;
