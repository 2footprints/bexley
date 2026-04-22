function setGView(v){
  curGView=v;
  ['gvp','gvm'].forEach(id=>{document.getElementById(id).style.cssText='';});
  document.getElementById(v==='project'?'gvp':'gvm').style.cssText='background:var(--navy);color:#fff;border-color:var(--navy)';
  renderGantt();
}

function populateMemberFilter(){
  const sel=document.getElementById('memberFilter');
  if(!sel)return;
  const prev=sel.value||'';
  const allowedValues=new Set([''].concat(getAvailableGanttMembers().map(member=>member.name)));
  sel.value=allowedValues.has(prev)?prev:'';
  renderMemberFilterTabs();
}

function getAvailableGanttMembers(){
  return (members||[])
    .filter(member=>{
      const isActive=member?.is_active===undefined?true:!!member.is_active;
      const identity=[member?.name,member?.email,member?.auth_user_id].filter(Boolean).join(' ').toLowerCase();
      const isSystemAccount=/projectschedule|system|test/.test(identity);
      return isActive&&!isSystemAccount;
    })
    .sort((a,b)=>String(a?.name||'').localeCompare(String(b?.name||''),'ko'));
}

function renderMemberFilterTabs(){
  const wrap=document.getElementById('memberFilterTabs');
  const sel=document.getElementById('memberFilter');
  if(!wrap||!sel)return;
  const currentValue=sel.value||'';
  const options=[{value:'',label:'전체'}].concat(
    getAvailableGanttMembers().map(member=>({value:member.name,label:member.name}))
  );
  wrap.innerHTML='';
  options.forEach(option=>{
    const btn=document.createElement('button');
    btn.type='button';
    btn.className='member-filter-tab'+(currentValue===option.value?' active':'');
    btn.textContent=option.label;
    btn.onclick=()=>setMemberFilter(option.value);
    wrap.appendChild(btn);
  });
}

function setMemberFilter(value){
  const sel=document.getElementById('memberFilter');
  if(!sel)return;
  sel.value=value||'';
  renderMemberFilterTabs();
  renderGantt();
}

let ganttFocusProjectId=null;

function getGanttFilteredData(){
  const days=daysInMonth(curYear,curMonth);
  const mf=document.getElementById('memberFilter')?.value||'';
  const mFirst=new Date(curYear,curMonth-1,1),mLast=new Date(curYear,curMonth-1,days);
  const projs=projects.filter(p=>{
    if(mf==='me'&&currentMember&&!p.members.includes(currentMember.name))return false;
    if(mf&&mf!=='me'&&!p.members.includes(mf))return false;
    return toDate(p.start)<=mLast&&toDate(p.end)>=mFirst;
  });
  const schs=schedules.filter(s=>{
    if(mf==='me'&&currentMember&&!scheduleHasMember(s,currentMember.name))return false;
    if(mf&&mf!=='me'&&!scheduleHasMember(s,mf))return false;
    return toDate(s.start)<=mLast&&toDate(s.end)>=mFirst;
  });
  return {projs,schs};
}

function setGanttFocusProject(projectId){
  ganttFocusProjectId=projectId||null;
  renderGantt();
}

function renderGanttOverviewCards(projs,schs){
  const el=document.getElementById('ganttOverview'); if(!el) return;
  const activeCount=projs.filter(p=>p.status==='\uC9C4\uD589\uC911').length;
  const doneStatus='\uC644\uB8CC';
  const billingPending='\uBBF8\uCCAD\uAD6C';
  const overdueCount=projs.filter(p=>isOverdue(p)).length;
  const unbilledCount=projs.filter(p=>p.status===doneStatus&&p.is_billable&&p.billing_status===billingPending).length;
  const issueCount=projs.reduce((sum,p)=>sum+(openIssuesByProject[p.id]||0),0);
  const stats=[
    ['이번 달 프로젝트', projs.length, '현재 필터 기준'],
    ['진행중', activeCount, '현재 진행중'],
    ['주의 필요', overdueCount, overdueCount?'지연 프로젝트 '+overdueCount+'건':'지연 프로젝트 없음'],
    ['빌링 필요', unbilledCount, unbilledCount?'완료했으나 미청구':'완료했으나 미청구 없음'],
    ['미해결 이슈', issueCount, '열린 이슈 기준']
  ];
  el.innerHTML=stats.map(([label,value,sub])=>'<div class="gantt-kpi"><div class="gantt-kpi-label">'+label+'</div><div class="gantt-kpi-value">'+value+'</div><div class="gantt-kpi-sub">'+sub+'</div></div>').join('');
}

renderGanttSidebarList = function(projs){
  const el=document.getElementById('ganttProjectList');
  const doneStatus='\uC644\uB8CC';
  const activeStatus='\uC9C4\uD589\uC911';
  if(!el) return;
  if(!projs.length){
    el.innerHTML='<div class="gantt-empty-copy">No projects match this filter.</div>';
    return;
  }
  if(!ganttFocusProjectId || !projs.some(p=>p.id===ganttFocusProjectId)) ganttFocusProjectId=projs[0].id;
  const sorted=[...projs].sort((a,b)=>toDate(a.end)-toDate(b.end));
  el.innerHTML=sorted.map(p=>{
    const client=clients.find(c=>c.id===p.client_id);
    const issueCount=openIssuesByProject[p.id]||0;
    const hasMemo=!!(p.memo&&String(p.memo).trim());
    const warning=isOverdue(p)
      ?'\uAE30\uAC04 \uCD08\uACFC'
      :isDueToday(p)
      ?'\uC624\uB298 \uB9C8\uAC10'
      :p.status===doneStatus&&p.is_billable&&p.billing_status==='\uBBF8\uCCAD\uAD6C'
      ?'\uBE4C\uB9C1 \uD544\uC694'
      :issueCount
      ?'\uC5F4\uB9B0 \uC774\uC288 '+issueCount+'\uAC74'
      :'\uC815\uC0C1 \uC9C4\uD589';
    const memoMeta=hasMemo?'<div class="gantt-project-meta" style="color:#334155;font-weight:700">\uBA54\uBAA8 \uC788\uC74C</div>':'';
    const badgeClass=p.status===activeStatus?'badge-blue':p.status===doneStatus?'badge-green':'badge-orange';
    return '<div class="gantt-project-card'+(p.id===ganttFocusProjectId?' active':'')+'" onclick="setGanttFocusProject(\''+p.id+'\')">'
      +'<div class="gantt-project-top"><div><div class="gantt-project-name">'+esc(p.name)+'</div><div class="gantt-project-client">'+esc(client?.name||'No client')+'</div></div><span class="badge '+badgeClass+'">'+esc(p.status||'No status')+'</span></div>'
      +'<div class="gantt-project-meta">'+esc((p.start||'')+' ~ '+(p.end||''))+'</div>'
      +'<div class="gantt-project-meta">'+esc((p.members||[]).join(', ')||'No owner')+'</div>'
      +memoMeta
      +'<div class="gantt-project-warn">'+esc(warning)+'</div>'
      +'</div>';
  }).join('');
};

renderGanttDetailPanel = function(projs,schs){
  const el=document.getElementById('ganttDetail'); if(!el) return;
  const project=projs.find(p=>p.id===ganttFocusProjectId)||null;
  if(!project){
    el.innerHTML='<div class="gantt-panel-title">Select a project</div><div class="gantt-panel-sub">Pick a project from the left list. The right panel shows the team schedule and quick actions.</div>';
    return;
  }
  const client=clients.find(c=>c.id===project.client_id)||null;
  const projectMembers=project.members||[];
  const memberSchedules=schs.filter(s=>scheduleHasAnyProjectMember(s,projectMembers)).sort((a,b)=>toDate(a.start)-toDate(b.start)).slice(0,8);
  const issueCount=openIssuesByProject[project.id]||0;
  const projectIssueIds=[...(issueFeedCache.pinned||[]),...(issueFeedCache.recent||[])].filter(i=>i.project_id===project.id).map(i=>i.id);
  const commentCount=projectIssueIds.reduce((sum,id)=>sum+(issueCommentCountMap[id]||0),0);
  el.innerHTML='<div class="gantt-panel-head"><div><div class="gantt-panel-title">'+esc(project.name)+'</div><div class="gantt-panel-sub">'+esc(client?.name||'No client')+' | '+esc(project.type||'No type')+'</div></div><span class="badge '+(project.status==='\uC9C4\uD589\uC911'?'badge-blue':project.status==='\uC644\uB8CC'?'badge-green':'badge-orange')+'">'+esc(project.status||'No status')+'</span></div><div class="gantt-detail-grid"><div><div class="gantt-detail-label">Period</div><div class="gantt-detail-value">'+esc((project.start||'')+' ~ '+(project.end||''))+'</div></div><div><div class="gantt-detail-label">Owners</div><div class="gantt-detail-value">'+esc(projectMembers.join(', ')||'Unassigned')+'</div></div><div><div class="gantt-detail-label">Billing</div><div class="gantt-detail-value">'+esc(project.is_billable?(project.billing_status||'No status'):'Non-billable')+'</div></div><div><div class="gantt-detail-label">Issue / Comment</div><div class="gantt-detail-value">'+issueCount+' issues | '+commentCount+' comments</div></div></div><div class="gantt-main-copy">The left side is not a priority engine. It is simply the visible project list for this month. Select a project to see team schedules and quick actions here.</div><div class="gantt-detail-actions"><button class="btn primary sm" onclick="openProjModal(\''+project.id+'\')">Open Project</button><button class="btn sm" onclick="openProjModal(\''+project.id+'\',null,null,\'issue\')">Open Issues</button><button class="btn sm" onclick="handleProjectOutlookEvent(\''+project.id+'\')">Add to Outlook</button></div><div class="gantt-detail-section"><div class="gantt-panel-title">Team Schedule</div><div class="gantt-detail-list">'+(memberSchedules.map(s=>'<div class="gantt-detail-item"><div><div class="gantt-detail-item-title">'+esc(s.title||scheduleLabel(s.schedule_type))+'</div><div class="gantt-detail-item-sub">'+esc((s.start||'')+' ~ '+(s.end||'')+' | '+getScheduleMemberLabel(s))+'</div></div><span class="badge badge-gray">'+esc(scheduleLabel(s.schedule_type))+'</span></div>').join('')||'<div class="gantt-empty-copy">No leave, fieldwork, or internal schedule found for this team in the current filter.</div>')+'</div></div>';
};
