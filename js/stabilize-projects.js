(function(){
  if(window.__STABILIZE_PROJECTS_LOADED__) return;
  window.__STABILIZE_PROJECTS_LOADED__ = true;

  function findMemberByName(name){
    return (members || []).find(function(member){
      return member && member.name === name;
    }) || null;
  }

  function memberNamesToIds(names){
    return [...new Set((names || [])
      .map(function(name){ return findMemberByName(name)?.id || null; })
      .filter(Boolean))];
  }

  function projectMemberNames(project){
    return Array.isArray(project?.members) ? project.members.filter(Boolean) : [];
  }

  function projectMemberIds(project){
    return Array.isArray(project?.member_ids) ? project.member_ids.filter(Boolean) : [];
  }

  function projectAssignedToCurrentMember(project){
    if(!project || !currentMember) return false;
    if(currentMember.id && projectMemberIds(project).includes(currentMember.id)) return true;
    if(currentMember.name && projectMemberNames(project).includes(currentMember.name)) return true;
    return false;
  }

  function normalizeProject(project, projectMemberRows){
    const rows = (projectMemberRows || []).filter(function(row){
      return row?.project_id === project.id;
    });
    const names = rows
      .map(function(row){ return row?.members?.name || ''; })
      .filter(Boolean);
    const ids = rows
      .map(function(row){ return row?.member_id || row?.members?.id || null; })
      .filter(Boolean);
    return {
      ...project,
      start: project.start_date,
      end: project.end_date,
      members: [...new Set(names)],
      member_ids: [...new Set(ids)]
    };
  }

  async function loadProjectMembersForProject(projectId){
    return api('GET', 'project_members?project_id=eq.' + projectId + '&select=member_id,members(id,name,email)').catch(function(){
      return [];
    });
  }

  async function syncProjectMembers(projectId, memberNames){
    const targetMemberIds = memberNamesToIds(memberNames);
    const currentRows = await loadProjectMembersForProject(projectId);
    const currentMemberIds = [...new Set((currentRows || []).map(function(row){
      return row?.member_id || row?.members?.id || null;
    }).filter(Boolean))];

    const targetSet = new Set(targetMemberIds);
    const currentSet = new Set(currentMemberIds);

    for(const memberId of currentMemberIds){
      if(!targetSet.has(memberId)){
        await api('DELETE', 'project_members?project_id=eq.' + projectId + '&member_id=eq.' + memberId);
      }
    }

    for(const memberId of targetMemberIds){
      if(!currentSet.has(memberId)){
        await apiEx(
          'POST',
          'project_members?on_conflict=project_id,member_id',
          { project_id: projectId, member_id: memberId },
          'resolution=merge-duplicates,return=representation'
        );
      }
    }
  }

  function collectProjectFormBody(){
    const name = document.getElementById('fName')?.value?.trim() || '';
    const type = document.getElementById('fType')?.value || null;
    const start = document.getElementById('fStart')?.value || null;
    const end = document.getElementById('fEnd')?.value || null;
    const status = document.getElementById('fStatus')?.value || null;
    const client_id = document.getElementById('fClient')?.value || null;
    const contract_id = document.getElementById('fContract')?.value || null;
    const is_billable = !!document.getElementById('fBillable')?.checked;
    const billingPendingStatus = '\uBBF8\uCCAD\uAD6C';
    const doneStatus = '\uC644\uB8CC';
    const billing_status = is_billable ? (document.getElementById('fBilling')?.value || billingPendingStatus) : billingPendingStatus;
    const billing_amount = is_billable && document.getElementById('fAmt')?.value ? parseInt(document.getElementById('fAmt').value, 10) : null;
    const billing_note = is_billable ? (document.getElementById('fBNote')?.value?.trim() || null) : null;
    const memo = document.getElementById('fMemo')?.value?.trim() || null;
    const project_code = document.getElementById('fProjCode')?.value?.trim() || null;
    let actual_end_date = document.getElementById('fActualEnd')?.value || null;
    if(status === doneStatus && !actual_end_date){
      actual_end_date = new Date().toISOString().slice(0, 10);
    }
    const result_summary = document.getElementById('fResultSummary')?.value?.trim() || null;
    const work_summary = document.getElementById('fWorkSummary')?.value?.trim() || null;
    const issue_note = document.getElementById('fIssueNote')?.value?.trim() || null;
    const follow_up_needed = !!document.getElementById('fFollowUp')?.checked;
    const follow_up_note = document.getElementById('fFollowUpNote')?.value?.trim() || null;
    const estimated_hours = document.getElementById('fEstimatedHours')?.value
      ? parseFloat(document.getElementById('fEstimatedHours').value)
      : null;
    const priority = document.getElementById('fPriority')?.value || 'medium';

    return {
      valid: !!(name && start && end && start <= end),
      errorMessage: !name || !start || !end
        ? '\uD504\uB85C\uC81D\uD2B8\uBA85, \uC2DC\uC791\uC77C, \uC885\uB8CC\uC77C\uC744 \uC785\uB825\uD574\uC8FC\uC138\uC694.'
        : (start > end ? '\uC885\uB8CC\uC77C\uC774 \uC2DC\uC791\uC77C\uBCF4\uB2E4 \uBE60\uB985\uB2C8\uB2E4.' : ''),
      name,
      body:{
        name,
        type,
        start_date:start,
        end_date:end,
        status,
        estimated_hours,
        priority,
        client_id,
        contract_id,
        is_billable,
        billing_status,
        billing_amount,
        billing_note,
        memo,
        project_code,
        actual_end_date,
        result_summary,
        work_summary,
        issue_note,
        follow_up_needed,
        follow_up_note
      }
    };
  }

  async function saveProjectCore(projectId, body){
    if(projectId){
      await api('PATCH', 'projects?id=eq.' + projectId, body);
      return projectId;
    }
    const created = await api('POST', 'projects', { ...body, created_by: currentUser.id });
    return created?.[0]?.id || null;
  }

  async function afterProjectSave(projectId, name){
    await logActivity(projects.find(function(project){ return project.id === projectId; }) ? '\uD504\uB85C\uC81D\uD2B8 \uC218\uC815' : '\uD504\uB85C\uC81D\uD2B8 \uCD94\uAC00', 'project', projectId, name);
    closeModal();
    await loadAll();
    if(curPage === 'gantt'){
      renderGantt();
    }else if(curPage === 'detail'){
      const savedProj = projects.find(function(project){ return project.id === projectId; });
      const clientId = savedProj?.client_id;
      if(clientId) openClientDetail(clientId, 'projects');
      else setPage('clients');
    }else if(curPage === 'team'){
      if(typeof renderTeamMainDashboard === 'function') renderTeamMainDashboard();
      if(typeof renderTeamNotices === 'function') renderTeamNotices();
      if(typeof loadIssueFeed === 'function') loadIssueFeed(true);
      if(typeof renderMyWeek === 'function') renderMyWeek();
      if(typeof renderWeeklyScheduleSummary === 'function') renderWeeklyScheduleSummary();
    }else{
      renderClients();
    }
  }

  window.projectAssignedToCurrentMember = projectAssignedToCurrentMember;

  window.canEdit = function(project){
    if(!project) return !!canManageCore();
    return !!canManageCore();
  };

  window.canDeleteProject = function(project){
    if(!project) return false;
    return !!(roleIsAdmin() || (currentUser && project.created_by === currentUser.id));
  };

  window.canManageProjectMembers = function(project){
    if(!project) return !!roleIsAdmin();
    return !!(roleIsAdmin() || (currentUser && project.created_by === currentUser.id));
  };

  window.loadAll = async function(){
    setStatus('\uBD88\uB7EC\uC624\uB294 \uC911...');
    try{
      const [projectRows, memberRows, projectMemberRows, clientRows, noticeRows, scheduleRows, knowledgeRows] = await Promise.all([
        api('GET', 'projects?select=*&order=start_date'),
        api('GET', 'members?select=*&order=name'),
        api('GET', 'project_members?select=project_id,member_id,members(id,name,email)'),
        api('GET', 'clients?select=*&order=name'),
        api('GET', 'notices?select=*&order=is_pinned.desc,created_at.desc'),
        api('GET', 'schedules?select=*,schedule_members(member_id,members(id,name))&order=start_date'),
        api('GET', 'knowledge_posts?select=*&order=is_pinned.desc,created_at.desc').catch(function(){ return []; })
      ]);

      members = memberRows || [];
      projects = (projectRows || []).map(function(project){
        return normalizeProject(project, projectMemberRows || []);
      });
      clients = clientRows || [];
      notices = noticeRows || [];
      knowledgePosts = knowledgeRows || [];
      schedules = (scheduleRows || []).map(function(schedule){
        return {
          ...schedule,
          start: schedule.start_date,
          end: schedule.end_date,
          member_name: schedule.member_name || getMemberById(schedule.member_id)?.name || ''
        };
      });

      if(typeof populateMemberFilter === 'function') populateMemberFilter();
      if(typeof updateNoticeDot === 'function') updateNoticeDot();
      setStatus('\uACE0\uAC1D\uC0AC ' + clients.length + '\uAC1C, \uD504\uB85C\uC81D\uD2B8 ' + projects.length + '\uAC1C\uB97C \uBD88\uB7EC\uC654\uC2B5\uB2C8\uB2E4.', 'ok');

      Promise.all([
        api('GET', 'contracts?select=*&order=created_at.desc'),
        api('GET', 'billing_logs?select=*&order=created_at.desc'),
        api('GET', 'client_assignments?select=*'),
        api('GET', 'project_issues?status=eq.open&select=id,project_id')
      ]).then(function(results){
        contracts = results[0] || [];
        billingLogs = results[1] || [];
        clientAssignments = results[2] || [];
        openIssuesByProject = {};
        (results[3] || []).forEach(function(issue){
          if(!openIssuesByProject[issue.project_id]) openIssuesByProject[issue.project_id] = 0;
          openIssuesByProject[issue.project_id] += 1;
        });
      }).catch(function(){});
    }catch(error){
      setStatus('\uC624\uB958: ' + error.message, 'err');
    }
  };

  window.saveProj = async function(){
    const existing = editingProjId ? projects.find(function(project){ return project.id === editingProjId; }) : null;
    if(!editingProjId && !canManageCore()){
      alert('\uBA64\uBC84 \uC774\uC0C1 \uAD8C\uD55C\uC774 \uD544\uC694\uD569\uB2C8\uB2E4.');
      return;
    }
    if(editingProjId && !window.canEdit(existing)){
      alert('\uD574\uB2F9 \uD504\uB85C\uC81D\uD2B8\uB97C \uC218\uC815\uD560 \uC218 \uC5C6\uC2B5\uB2C8\uB2E4.');
      return;
    }

    const payload = collectProjectFormBody();
    if(!payload.valid){
      alert(payload.errorMessage);
      return;
    }

    try{
      const wasEditing = !!editingProjId;
      const projectId = await saveProjectCore(editingProjId, payload.body);
      editingProjId = projectId;

      if(projectId && (!wasEditing || window.canManageProjectMembers(existing))){
        await syncProjectMembers(projectId, formMembers || []);
      }

      await afterProjectSave(projectId, payload.name);
    }catch(error){
      alert('\uC800\uC7A5 \uC624\uB958: ' + error.message);
    }
  };
})();
