function renderHomeConsoleSummaryItem(item){
  const tone=item?.tone||'neutral';
  const value=String(item?.value??'0');
  const label=String(item?.label||'');
  const quiet=item?.quiet?' is-quiet':'';
  const action=item?.action||'';
  const tag=action?'button':'div';
  const actionAttr=action?' type="button" onclick="'+action+'"':'';
  return '<'+tag+' class="home-console-summary-item is-'+tone+quiet+'"'+actionAttr+'>'
    +'<span class="home-console-dot"></span>'
    +'<span class="home-console-summary-label">'+esc(label)+'</span>'
    +'<strong class="home-console-summary-value">'+esc(value)+'</strong>'
  +'</'+tag+'>';
}

function renderHomeConsoleSummaryBar(items){
  return '<div class="card home-card home-console-summary">'
    +'<div class="home-console-summary-head">'
      +'<div class="home-section-title">오늘 요약</div>'
      +'<div class="home-section-support">오늘 바로 확인할 운영 신호만 모았습니다.</div>'
    +'</div>'
    +'<div class="home-console-summary-list">'+items.map(renderHomeConsoleSummaryItem).join('')+'</div>'
  +'</div>';
}

function renderHomeOperationsAlertRow(item){
  const tone=item?.tone||'neutral';
  const action=item?.action||'';
  const tag=action?'button':'div';
  const actionAttr=action?' type="button" onclick="'+action+'"':'';
  return '<'+tag+' class="home-ops-alert-row is-'+tone+(item?.quiet?' is-quiet':'')+'"'+actionAttr+'>'
    +'<span class="home-console-dot"></span>'
    +'<span class="home-ops-alert-main"><span class="home-ops-alert-label">'+esc(item?.label||'')+'</span>'
    +'<span class="home-ops-alert-meta">'+esc(item?.meta||'')+'</span></span>'
    +'<strong class="home-ops-alert-value">'+esc(item?.value||'없음')+'</strong>'
  +'</'+tag+'>';
}

function renderHomeCompactOperationsAlerts(items,notes=[]){
  return '<div class="card home-card home-layer-card home-layer-card--warning home-ops-alert-card">'
    +'<div class="home-section-head">'
      +'<div><div class="home-section-title">운영 경고</div><div class="home-section-support">문제가 있는 항목만 작게 표시합니다.</div></div>'
    +'</div>'
    +'<div class="home-ops-alert-list">'+items.map(renderHomeOperationsAlertRow).join('')+'</div>'
    +(notes.length?'<div class="home-ops-note-row">'+notes.map(note=>'<span class="home-ops-note">'+esc(note)+'</span>').join('')+'</div>':'')
  +'</div>';
}

function getHomeConsoleRiskyClientCount(projectRows,issueRows,pendingDocRows){
  const riskyClientIds=new Set();
  const addProject=project=>{
    if(project?.client_id)riskyClientIds.add(String(project.client_id));
  };
  (projectRows||[]).forEach(addProject);
  (pendingDocRows||[]).forEach(row=>{
    const project=(projects||[]).find(item=>String(item?.id||'')===String(row?.project_id||''));
    addProject(project);
  });
  (issueRows||[]).forEach(issue=>{
    const project=(projects||[]).find(item=>String(item?.id||'')===String(issue?.project_id||''));
    addProject(project);
  });
  return riskyClientIds.size;
}

renderHomeRiskSummary = async function(){
  const el=document.getElementById('homeRiskWrap');
  if(!el)return;
  const loadingItems=[
    {label:'오늘 마감',value:'-',tone:'neutral',quiet:true},
    {label:'내 지연 업무',value:'-',tone:'neutral',quiet:true},
    {label:'확인할 이슈',value:'-',tone:'neutral',quiet:true},
    {label:'오늘 일정',value:'-',tone:'neutral',quiet:true},
    {label:'주의 거래처',value:'-',tone:'neutral',quiet:true}
  ];
  el.innerHTML=renderHomeConsoleSummaryBar(loadingItems);
  try{
    const today=getHomeBaseDate();
    const assignedProjects=getHomeActiveAssignedProjects();
    const assignedProjectIds=new Set(assignedProjects.map(project=>String(project.id)));
    const todayDueProjects=assignedProjects.filter(project=>{
      const endDateRaw=project.end||project.end_date;
      return endDateRaw&&toDate(endDateRaw).getTime()===today.getTime();
    });
    const overdueProjects=assignedProjects.filter(project=>{
      const endDateRaw=project.end||project.end_date;
      return endDateRaw&&toDate(endDateRaw)<today;
    });
    const [issueRows,pendingDocs]=await Promise.all([
      ((typeof canViewAllInternalData==='function'&&canViewAllInternalData())||currentMember?.id||currentMember?.name)
        ?api('GET','project_issues?select=id,project_id,status,priority,assignee_member_id,assignee_name').catch(()=>[])
        :Promise.resolve([]),
      api('GET','document_requests?status=eq.pending&select=id,project_id,title,due_date').catch(()=>[])
    ]);
    const myOpenIssues=(issueRows||[]).filter(issue=>{
      if(typeof canViewAllInternalData==='function'&&canViewAllInternalData())return isIssueActiveStatus(issue?.status);
      const matchesAssignee=(currentMember?.id&&String(issue?.assignee_member_id||'')===String(currentMember.id))
        ||(currentMember?.name&&issue?.assignee_name===currentMember.name);
      return matchesAssignee&&isIssueActiveStatus(issue?.status);
    });
    const myHighPriorityIssues=myOpenIssues.filter(issue=>String(issue?.priority||'').trim().toLowerCase()==='high');
    const myPendingDocs=(pendingDocs||[]).filter(row=>assignedProjectIds.has(String(row?.project_id||'')));
    const todayScheduleItems=sortHomeTodayScheduleItems(getHomeTodayScheduleItems(today));
    const riskyClientCount=getHomeConsoleRiskyClientCount(overdueProjects,myOpenIssues,myPendingDocs);
    el.innerHTML=renderHomeConsoleSummaryBar([
      {label:'오늘 마감',value:String(todayDueProjects.length),tone:todayDueProjects.length?'warning':'neutral',quiet:!todayDueProjects.length,action:"setPage('projects')"},
      {label:'내 지연 업무',value:String(overdueProjects.length),tone:overdueProjects.length?'danger':'neutral',quiet:!overdueProjects.length,action:"setPage('projects')"},
      {label:'확인할 이슈',value:String(myOpenIssues.length),tone:myHighPriorityIssues.length?'danger':(myOpenIssues.length?'warning':'neutral'),quiet:!myOpenIssues.length,action:"setPage('issues')"},
      {label:'오늘 일정',value:String(todayScheduleItems.length),tone:todayScheduleItems.length?'info':'neutral',quiet:!todayScheduleItems.length,action:"setPage('mySchedule')"},
      {label:'주의 거래처',value:String(riskyClientCount),tone:riskyClientCount?'danger':'neutral',quiet:!riskyClientCount,action:"setPage('clients')"}
    ]);
  }catch(e){
    console.error('renderHomeRiskSummary failed',e);
    el.innerHTML=renderHomeConsoleSummaryBar(loadingItems);
  }
};

renderTeamWorkload = async function(){
  const el=document.getElementById('teamWorkloadWrap');
  if(!el)return;
  el.innerHTML=renderHomeCompactOperationsAlerts([
    {label:'지연 프로젝트',value:'-',meta:'불러오는 중',tone:'neutral',quiet:true},
    {label:'주의 거래처',value:'-',meta:'불러오는 중',tone:'neutral',quiet:true},
    {label:'미청구',value:'-',meta:'불러오는 중',tone:'neutral',quiet:true}
  ]);
  try{
    const today=getHomeBaseDate();
    const {start:weekStart,end:weekEnd}=getWeekBounds(0);
    const [issueRows,pendingDocs]=await Promise.all([
      api('GET','project_issues?'+getIssueActiveStatusFilter()+'&select=id,project_id,status,priority').catch(()=>[]),
      api('GET','document_requests?status=eq.pending&select=id,project_id,title,due_date').catch(()=>[])
    ]);
    const delayedProjects=(projects||[]).filter(project=>{
      if(isHomeCompletedProject(project))return false;
      const endValue=project?.end||project?.end_date;
      return endValue&&toDate(endValue)<today;
    }).sort((a,b)=>toDate(a.end||a.end_date)-toDate(b.end||b.end_date));
    const unbilledProjects=typeof getHomeOperationsUnbilledProjects==='function'?getHomeOperationsUnbilledProjects():[];
    const pendingBillingAmount=unbilledProjects.reduce((sum,project)=>{
      if(typeof getHomeProjectBillingAmount==='function')return sum+getHomeProjectBillingAmount(project);
      return sum+Number(project?.amount||project?.contract_amount||0);
    },0);
    const riskyClientCount=getHomeConsoleRiskyClientCount([...delayedProjects,...unbilledProjects],issueRows,pendingDocs);
    const weekLeaveCount=[...new Set((schedules||[])
      .filter(schedule=>String(schedule?.schedule_type||'').trim().toLowerCase()==='leave')
      .filter(schedule=>toDate(schedule.start||schedule.start_date)<=weekEnd&&toDate(schedule.end||schedule.end_date||schedule.start||schedule.start_date)>=weekStart)
      .flatMap(schedule=>getOperationalScheduleMemberNames(schedule))
      .filter(Boolean))].length;
    const weekFieldworkCount=[...new Set((schedules||[])
      .filter(schedule=>String(schedule?.schedule_type||'').trim().toLowerCase()==='fieldwork')
      .filter(schedule=>toDate(schedule.start||schedule.start_date)<=weekEnd&&toDate(schedule.end||schedule.end_date||schedule.start||schedule.start_date)>=weekStart)
      .flatMap(schedule=>getOperationalScheduleMemberNames(schedule))
      .filter(Boolean))].length;
    el.innerHTML=renderHomeCompactOperationsAlerts([
      {label:'지연 프로젝트',value:delayedProjects.length?delayedProjects.length+'건':'없음',meta:delayedProjects[0]?.name||'지연 항목이 없습니다.',tone:delayedProjects.length?'danger':'neutral',quiet:!delayedProjects.length,action:"setPage('projects')"},
      {label:'주의 거래처',value:riskyClientCount?riskyClientCount+'곳':'없음',meta:riskyClientCount?'지연, 이슈, 자료 요청 기준':'주의 거래처가 없습니다.',tone:riskyClientCount?'danger':'neutral',quiet:!riskyClientCount,action:"setPage('clients')"},
      {label:'미청구',value:pendingBillingAmount?pendingBillingAmount.toLocaleString()+'원':'없음',meta:unbilledProjects.length?unbilledProjects.length+'건 확인 필요':'미청구 항목이 없습니다.',tone:pendingBillingAmount?'warning':'neutral',quiet:!pendingBillingAmount,action:"openHomePendingBillingProjectBoard()"}
    ],['이번 주 휴가 '+weekLeaveCount+'명','이번 주 필드웍 '+weekFieldworkCount+'명']);
  }catch(e){
    console.error('renderTeamWorkload failed',e);
    el.innerHTML=renderHomeCompactOperationsAlerts([
      {label:'운영 경고',value:'-',meta:'경고 요약을 불러오지 못했습니다.',tone:'neutral',quiet:true}
    ]);
  }
};

function renderHomeScheduleConsoleItem(schedule){
  const memberLabel=getScheduleMemberLabel(schedule);
  const tone=getHomeScheduleTone(schedule.schedule_type);
  const dateLabel=formatHomeDateRangeWithWeekday(schedule.start||schedule.start_date,schedule.end||schedule.end_date||schedule.start||schedule.start_date,'.');
  const title=String(schedule?.title||scheduleLabel(schedule?.schedule_type)||'일정').trim();
  return '<button type="button" class="home-schedule-console-row is-'+tone+'" onclick="openScheduleModal(\''+schedule.id+'\')">'
    +'<span class="home-console-dot"></span>'
    +'<span class="home-schedule-console-date">'+esc(dateLabel)+'</span>'
    +'<span class="home-schedule-console-main"><strong>'+esc(memberLabel||'팀')+'</strong><span>'+esc(title)+'</span></span>'
    +'<span class="badge badge-gray home-schedule-console-type">'+esc(scheduleLabel(schedule.schedule_type))+'</span>'
  +'</button>';
}

renderWeeklyScheduleSummary = function(){
  const el=document.getElementById('memberScheduleWrap');
  if(!el)return;
  const thisWeek=getHomeScheduleWeekData(0);
  const visible=(thisWeek.items||[]).slice(0,5);
  const fieldworkCount=(thisWeek.items||[]).filter(schedule=>String(schedule?.schedule_type||'').trim().toLowerCase()==='fieldwork').length;
  const leaveCount=(thisWeek.items||[]).filter(schedule=>String(schedule?.schedule_type||'').trim().toLowerCase()==='leave').length;
  el.innerHTML='<div class="card home-card home-schedule-console-card">'
    +'<div class="home-section-head">'
      +'<div><div class="home-section-title">팀 일정</div><div class="home-section-support">'+esc(formatHomeWeekRangeLabel(thisWeek.start,thisWeek.end))+' · 필드웍 '+fieldworkCount+' · 휴가 '+leaveCount+'</div></div>'
      +'<button type="button" class="home-inline-btn" onclick="setPage(\'mySchedule\')">전체 일정</button>'
    +'</div>'
    +(visible.length
      ?'<div class="home-schedule-console-list">'+visible.map(renderHomeScheduleConsoleItem).join('')+'</div>'
      :'<div class="weekly-empty home-compact-empty">이번 주 팀 일정이 없습니다.</div>')
  +'</div>';
};

function renderHomeConsoleMetricItem(item){
  const tone=item?.tone||'neutral';
  const value=String(item?.value??'0');
  const label=String(item?.label||'');
  const quiet=item?.quiet?' is-quiet':'';
  const action=item?.action||'';
  const tag=action?'button':'div';
  const actionAttr=action?' type="button" onclick="'+action+'"':'';
  const titleAttr=item?.titleText?' title="'+esc(item.titleText)+'"':'';
  return '<'+tag+' class="home-console-summary-item is-'+tone+quiet+'"'+actionAttr+titleAttr+'>'
    +'<span class="home-console-dot"></span>'
    +'<span class="home-console-summary-label">'+esc(label)+'</span>'
    +'<strong class="home-console-summary-value">'+esc(value)+'</strong>'
  +'</'+tag+'>';
}

function renderHomePersonalSummaryBar(items){
  return '<div class="card home-card home-console-summary">'
    +'<div class="home-console-summary-head">'
      +'<div class="home-section-title">오늘 요약</div>'
      +'<div class="home-section-support">개인 기준: 내가 담당하거나 오늘 직접 확인해야 할 업무입니다.</div>'
    +'</div>'
    +'<div class="home-console-summary-list">'+items.map(renderHomeConsoleMetricItem).join('')+'</div>'
  +'</div>';
}

function renderHomeOperationsMetricRow(item){
  const tone=item?.tone||'neutral';
  const action=item?.action||'';
  const tag=action?'button':'div';
  const actionAttr=action?' type="button" onclick="'+action+'"':'';
  const titleAttr=item?.titleText?' title="'+esc(item.titleText)+'"':'';
  return '<'+tag+' class="home-ops-alert-row is-'+tone+(item?.quiet?' is-quiet':'')+'"'+actionAttr+titleAttr+'>'
    +'<span class="home-console-dot"></span>'
    +'<span class="home-ops-alert-main"><span class="home-ops-alert-label">'+esc(item?.label||'')+'</span>'
    +'<span class="home-ops-alert-meta">'+esc(item?.meta||'')+'</span></span>'
    +'<strong class="home-ops-alert-value">'+esc(item?.value||'없음')+'</strong>'
  +'</'+tag+'>';
}

function renderHomeOperationsMetricPanel(items,notes=[]){
  return '<div class="card home-card home-layer-card home-layer-card--warning home-ops-alert-card">'
    +'<div class="home-section-head">'
      +'<div><div class="home-section-title">운영 경고</div><div class="home-section-support">팀/전체 기준: 프로젝트 지연, 거래처 주의 신호, 청구 확인 항목입니다.</div></div>'
    +'</div>'
    +'<div class="home-ops-alert-list">'+items.map(renderHomeOperationsMetricRow).join('')+'</div>'
    +(notes.length?'<div class="home-ops-note-row">'+notes.map(note=>'<span class="home-ops-note">'+esc(note)+'</span>').join('')+'</div>':'')
  +'</div>';
}

function isHomeConsoleIncompleteTask(task){
  const status=String(task?.status||'').trim();
  return status!=='완료'&&!task?.actual_done_at;
}

function getHomeConsoleTaskDueDate(task){
  const raw=task?.due_date||task?.end_date||task?.end;
  if(!raw)return null;
  const date=toDate(raw);
  if(Number.isNaN(date.getTime()))return null;
  date.setHours(0,0,0,0);
  return date;
}

function isHomeConsoleTaskMine(task){
  if(typeof canViewAllInternalData==='function'&&canViewAllInternalData())return true;
  if(!currentMember)return false;
  return (currentMember?.id&&String(task?.assignee_member_id||task?.owner_member_id||'')===String(currentMember.id))
    ||(currentMember?.name&&String(task?.assignee_name||'').trim()===String(currentMember.name).trim());
}

function getHomeConsoleAttentionClientIds(projectRows,issueRows,pendingDocRows,taskRows){
  const clientIds=new Set();
  const addProject=project=>{
    if(project?.client_id)clientIds.add(String(project.client_id));
  };
  (projectRows||[]).forEach(addProject);
  (pendingDocRows||[]).forEach(row=>{
    const project=(projects||[]).find(item=>String(item?.id||'')===String(row?.project_id||''));
    addProject(project);
  });
  (issueRows||[]).forEach(issue=>{
    const project=(projects||[]).find(item=>String(item?.id||'')===String(issue?.project_id||''));
    addProject(project);
  });
  (taskRows||[]).forEach(task=>{
    const project=(projects||[]).find(item=>String(item?.id||'')===String(task?.project_id||''));
    addProject(project);
  });
  return clientIds;
}

renderHomeRiskSummary = async function(){
  const el=document.getElementById('homeRiskWrap');
  if(!el)return;
  const loadingItems=[
    {label:'오늘 마감',value:'-',tone:'neutral',quiet:true,titleText:'내가 담당자로 포함된 프로젝트 중 오늘 마감되는 항목입니다.'},
    {label:'내 지연 업무',value:'-',tone:'neutral',quiet:true,titleText:'내가 담당자인 미완료 업무 중 마감일이 지난 항목입니다.'},
    {label:'확인할 이슈',value:'-',tone:'neutral',quiet:true,titleText:'내가 담당자인 열린 이슈입니다.'},
    {label:'오늘 일정',value:'-',tone:'neutral',quiet:true,titleText:'오늘 등록된 내 일정과 팀 주요 일정입니다.'}
  ];
  el.innerHTML=renderHomePersonalSummaryBar(loadingItems);
  try{
    const today=getHomeBaseDate();
    const assignedProjects=getHomeActiveAssignedProjects();
    const todayDueProjects=assignedProjects.filter(project=>{
      const endDateRaw=project.end||project.end_date;
      return endDateRaw&&toDate(endDateRaw).getTime()===today.getTime();
    });
    const [issueRows,taskRows]=await Promise.all([
      ((typeof canViewAllInternalData==='function'&&canViewAllInternalData())||currentMember?.id||currentMember?.name)
        ?api('GET','project_issues?select=id,project_id,status,priority,assignee_member_id,assignee_name').catch(()=>[])
        :Promise.resolve([]),
      ((typeof canViewAllInternalData==='function'&&canViewAllInternalData())||currentMember?.id||currentMember?.name)
        ?api('GET','project_tasks?select=id,project_id,title,status,due_date,assignee_member_id,assignee_name,owner_member_id,actual_done_at').catch(()=>[])
        :Promise.resolve([])
    ]);
    const myOverdueTasks=(taskRows||[]).filter(task=>{
      if(!isHomeConsoleIncompleteTask(task)||!isHomeConsoleTaskMine(task))return false;
      const dueDate=getHomeConsoleTaskDueDate(task);
      return !!dueDate&&dueDate<today;
    }).sort((a,b)=>{
      const diff=getHomeConsoleTaskDueDate(a)-getHomeConsoleTaskDueDate(b);
      if(diff)return diff;
      return String(a?.title||'').localeCompare(String(b?.title||''),'ko');
    });
    const myOpenIssues=(issueRows||[]).filter(issue=>{
      if(typeof canViewAllInternalData==='function'&&canViewAllInternalData())return isIssueActiveStatus(issue?.status);
      const matchesAssignee=(currentMember?.id&&String(issue?.assignee_member_id||'')===String(currentMember.id))
        ||(currentMember?.name&&issue?.assignee_name===currentMember.name);
      return matchesAssignee&&isIssueActiveStatus(issue?.status);
    });
    const myHighPriorityIssues=myOpenIssues.filter(issue=>String(issue?.priority||'').trim().toLowerCase()==='high');
    const todayScheduleItems=sortHomeTodayScheduleItems(getHomeTodayScheduleItems(today));
    el.innerHTML=renderHomePersonalSummaryBar([
      {label:'오늘 마감',value:String(todayDueProjects.length),tone:todayDueProjects.length?'warning':'neutral',quiet:!todayDueProjects.length,action:"setPage('projects')",titleText:'내가 담당자로 포함된 프로젝트 중 오늘 마감되는 항목입니다.'},
      {label:'내 지연 업무',value:String(myOverdueTasks.length),tone:myOverdueTasks.length?'danger':'neutral',quiet:!myOverdueTasks.length,action:"setPage('projects')",titleText:'내가 담당자인 미완료 업무 중 마감일이 지난 항목입니다.'},
      {label:'확인할 이슈',value:String(myOpenIssues.length),tone:myHighPriorityIssues.length?'danger':(myOpenIssues.length?'warning':'neutral'),quiet:!myOpenIssues.length,action:"setPage('issues')",titleText:'내가 담당자인 열린 이슈입니다.'},
      {label:'오늘 일정',value:String(todayScheduleItems.length),tone:todayScheduleItems.length?'info':'neutral',quiet:!todayScheduleItems.length,action:"setPage('mySchedule')",titleText:'오늘 등록된 내 일정과 팀 주요 일정입니다.'}
    ]);
  }catch(e){
    console.error('renderHomeRiskSummary failed',e);
    el.innerHTML=renderHomePersonalSummaryBar(loadingItems);
  }
};

renderTeamWorkload = async function(){
  const el=document.getElementById('teamWorkloadWrap');
  if(!el)return;
  el.innerHTML=renderHomeOperationsMetricPanel([
    {label:'전체 지연 프로젝트',value:'-',meta:'불러오는 중',tone:'neutral',quiet:true,titleText:'전체 프로젝트 중 마감일이 지났지만 완료되지 않은 프로젝트입니다.'},
    {label:'주의 거래처',value:'-',meta:'불러오는 중',tone:'neutral',quiet:true,titleText:'지연, 이슈, 미청구, 자료 대기 등 확인이 필요한 항목이 있는 거래처입니다.'},
    {label:'미청구',value:'-',meta:'불러오는 중',tone:'neutral',quiet:true,titleText:'완료 후 청구 확인이 필요한 프로젝트 금액입니다.'}
  ]);
  try{
    const today=getHomeBaseDate();
    const {start:weekStart,end:weekEnd}=getWeekBounds(0);
    const [issueRows,pendingDocs,taskRows]=await Promise.all([
      api('GET','project_issues?'+getIssueActiveStatusFilter()+'&select=id,project_id,status,priority').catch(()=>[]),
      api('GET','document_requests?status=eq.pending&select=id,project_id,title,due_date').catch(()=>[]),
      api('GET','project_tasks?select=id,project_id,status,due_date,actual_done_at').catch(()=>[])
    ]);
    const delayedProjects=(projects||[]).filter(project=>{
      if(isHomeCompletedProject(project))return false;
      const endValue=project?.end||project?.end_date;
      return endValue&&toDate(endValue)<today;
    }).sort((a,b)=>toDate(a.end||a.end_date)-toDate(b.end||b.end_date));
    const overdueTasks=(taskRows||[]).filter(task=>{
      if(!isHomeConsoleIncompleteTask(task))return false;
      const dueDate=getHomeConsoleTaskDueDate(task);
      return !!dueDate&&dueDate<today;
    });
    const unbilledProjects=typeof getHomeOperationsUnbilledProjects==='function'?getHomeOperationsUnbilledProjects():[];
    const pendingBillingAmount=unbilledProjects.reduce((sum,project)=>{
      if(typeof getHomeProjectBillingAmount==='function')return sum+getHomeProjectBillingAmount(project);
      return sum+Number(project?.amount||project?.contract_amount||0);
    },0);
    const attentionClientIds=getHomeConsoleAttentionClientIds([...delayedProjects,...unbilledProjects],issueRows,pendingDocs,overdueTasks);
    const attentionClients=(clients||[])
      .filter(client=>attentionClientIds.has(String(client.id)))
      .sort((a,b)=>String(a?.name||'').localeCompare(String(b?.name||''),'ko'));
    const weekLeaveCount=[...new Set((schedules||[])
      .filter(schedule=>String(schedule?.schedule_type||'').trim().toLowerCase()==='leave')
      .filter(schedule=>toDate(schedule.start||schedule.start_date)<=weekEnd&&toDate(schedule.end||schedule.end_date||schedule.start||schedule.start_date)>=weekStart)
      .flatMap(schedule=>getOperationalScheduleMemberNames(schedule))
      .filter(Boolean))].length;
    const weekFieldworkCount=[...new Set((schedules||[])
      .filter(schedule=>String(schedule?.schedule_type||'').trim().toLowerCase()==='fieldwork')
      .filter(schedule=>toDate(schedule.start||schedule.start_date)<=weekEnd&&toDate(schedule.end||schedule.end_date||schedule.start||schedule.start_date)>=weekStart)
      .flatMap(schedule=>getOperationalScheduleMemberNames(schedule))
      .filter(Boolean))].length;
    el.innerHTML=renderHomeOperationsMetricPanel([
      {label:'전체 지연 프로젝트',value:delayedProjects.length?delayedProjects.length+'건':'없음',meta:delayedProjects[0]?.name||'전체 프로젝트 중 지연 없음',tone:delayedProjects.length?'danger':'neutral',quiet:!delayedProjects.length,action:"setPage('projects')",titleText:'전체 프로젝트 중 마감일이 지났지만 완료되지 않은 프로젝트입니다.'},
      {label:'주의 거래처',value:attentionClients.length?attentionClients.length+'곳':'없음',meta:attentionClients[0]?.name||'관리 필요 거래처 없음',tone:attentionClients.length?'warning':'neutral',quiet:!attentionClients.length,action:"setPage('clients')",titleText:'지연, 이슈, 미청구, 자료 대기 등 확인이 필요한 항목이 있는 거래처입니다.'},
      {label:'미청구',value:pendingBillingAmount?pendingBillingAmount.toLocaleString()+'원':'없음',meta:unbilledProjects.length?('계약 확인 '+unbilledProjects.length+'건'):'미청구 항목 없음',tone:pendingBillingAmount?'warning':'neutral',quiet:!pendingBillingAmount,action:"openHomePendingBillingProjectBoard()",titleText:'완료 후 청구 확인이 필요한 프로젝트 금액입니다.'}
    ],['이번 주 휴가 '+weekLeaveCount+'명','이번 주 필드워크 '+weekFieldworkCount+'명']);
  }catch(e){
    console.error('renderTeamWorkload failed',e);
    el.innerHTML=renderHomeOperationsMetricPanel([
      {label:'운영 경고',value:'-',meta:'경고 요약을 불러오지 못했습니다.',tone:'neutral',quiet:true}
    ]);
  }
};
