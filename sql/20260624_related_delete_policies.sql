-- Delete policies for project-related operational data.
-- Admins and partners can delete all rows. Other authenticated users can
-- delete rows that belong to projects or schedules in their own team.

grant delete on public.project_outputs to authenticated;
grant delete on public.project_issues to authenticated;
grant delete on public.issue_comments to authenticated;
grant delete on public.project_comments to authenticated;
grant delete on public.schedules to authenticated;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_outputs'
      and policyname = 'project_outputs_delete'
  ) then
    create policy project_outputs_delete
      on public.project_outputs
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.members m
          where m.auth_user_id = auth.uid()
            and (
              lower(coalesce(m.role, '')) in ('admin', 'partner')
              or exists (
                select 1
                from public.projects p
                where p.id = project_outputs.project_id
                  and p.team_id is not null
                  and m.team_id = p.team_id
              )
            )
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_issues'
      and policyname = 'project_issues_delete'
  ) then
    create policy project_issues_delete
      on public.project_issues
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.members m
          where m.auth_user_id = auth.uid()
            and (
              lower(coalesce(m.role, '')) in ('admin', 'partner')
              or exists (
                select 1
                from public.projects p
                where p.id = project_issues.project_id
                  and p.team_id is not null
                  and m.team_id = p.team_id
              )
            )
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'issue_comments'
      and policyname = 'issue_comments_delete'
  ) then
    create policy issue_comments_delete
      on public.issue_comments
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.members m
          where m.auth_user_id = auth.uid()
            and (
              lower(coalesce(m.role, '')) in ('admin', 'partner')
              or exists (
                select 1
                from public.project_issues i
                join public.projects p on p.id = i.project_id
                where i.id = issue_comments.issue_id
                  and p.team_id is not null
                  and m.team_id = p.team_id
              )
            )
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'project_comments'
      and policyname = 'project_comments_delete'
  ) then
    create policy project_comments_delete
      on public.project_comments
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.members m
          where m.auth_user_id = auth.uid()
            and (
              lower(coalesce(m.role, '')) in ('admin', 'partner')
              or exists (
                select 1
                from public.projects p
                where p.id = project_comments.project_id
                  and p.team_id is not null
                  and m.team_id = p.team_id
              )
              or exists (
                select 1
                from public.project_comments parent
                where parent.id = project_comments.parent_id
                  and parent.created_by = auth.uid()
              )
            )
        )
      );
  end if;

  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'schedules'
      and policyname = 'schedules_delete'
  ) then
    create policy schedules_delete
      on public.schedules
      for delete
      to authenticated
      using (
        exists (
          select 1
          from public.members m
          where m.auth_user_id = auth.uid()
            and (
              lower(coalesce(m.role, '')) in ('admin', 'partner')
              or exists (
                select 1
                from public.projects p
                where p.id = schedules.project_id
                  and p.team_id is not null
                  and m.team_id = p.team_id
              )
              or exists (
                select 1
                from public.members schedule_member
                where schedule_member.id = schedules.member_id
                  and schedule_member.team_id is not null
                  and m.team_id = schedule_member.team_id
              )
              or exists (
                select 1
                from public.schedule_members sm
                join public.members schedule_member on schedule_member.id = sm.member_id
                where sm.schedule_id = schedules.id
                  and schedule_member.team_id is not null
                  and m.team_id = schedule_member.team_id
              )
            )
        )
      );
  end if;
end $$;

select pg_notify('pgrst', 'reload schema');
