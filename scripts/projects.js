let ganttFocusProjectId=null;
let ganttStatusFilter='all';
let ganttTypeFilters=[];
let ganttClientFilterQuery='';
let ganttListSortKey='period';
let ganttListSortDir='asc';
let ganttListSearchQuery='';
let ganttListSelectedIds=[];

const GANTT_STATUS_OPTIONS=[
  {value:'all',label:'전체'},
  {value:'in_progress',label:'진행중'},
  {value:'overdue',label:'지연'},
  {value:'completed',label:'완료'}
];

const GANTT_TYPE_OPTIONS=['감사','세무','밸류에이션','자문','실사','기타'];

function setGView(v){
  curGView=v;
  ['gvp','gvm'].forEach(id=>{
    const el=document.getElementById(id);
    if(el)el.style.cssText='';
  });
  const activeBtn=document.getElementById(v==='project'?'gvp':'gvm');
  if(activeBtn)activeBtn.style.cssText='background:var(--navy);color:#fff;border-color:var(--navy)';
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
  renderGanttActiveFilterTags();
}

function setMemberFilter(value){
  const sel=document.getElementById('memberFilter');
  if(!sel)return;
  sel.value=value||'';
  renderMemberFilterTabs();
  renderGantt();
}

function getGanttMonthBounds(year=curYear,month=curMonth){
  const days=daysInMonth(year,month);
  return {
    first:new Date(year,month-1,1),
    last:new Date(year,month-1,days)
  };
}

function getGanttProjectStatusKey(project){
  const raw=String(project?.status||'').trim();
  if(raw==='진행중')return'in_progress';
  if(raw==='완료')return'completed';
  return raw.toLowerCase().replace(/[\s-]+/g,'_');
}

function isGanttProjectCompleted(project){
  const statusKey=getGanttProjectStatusKey(project);
  return statusKey==='completed'||statusKey==='done';
}

function isGanttProjectInProgress(project){
  const statusKey=getGanttProjectStatusKey(project);
  return statusKey==='in_progress'||statusKey==='active';
}

function isGanttProjectOverdue(project,baseDate=getHomeBaseDate()){
  const endDate=toDate(project?.end||project?.end_date||'');
  return !Number.isNaN(endDate.getTime())&&endDate<baseDate&&!isGanttProjectCompleted(project);
}

function getGanttProjectCompletionDate(project){
  return project?.actual_end_date||project?.end||project?.end_date||null;
}

function getGanttProjectProgress(project,baseDate=getHomeBaseDate()){
  const startDate=toDate(project?.start||project?.start_date||'');
  const endDate=toDate(project?.end||project?.end_date||'');
  if(Number.isNaN(startDate.getTime())||Number.isNaN(endDate.getTime())){
    return isGanttProjectCompleted(project)?100:0;
  }
  const start=new Date(startDate.getFullYear(),startDate.getMonth(),startDate.getDate());
  const end=new Date(endDate.getFullYear(),endDate.getMonth(),endDate.getDate());
  const today=new Date(baseDate.getFullYear(),baseDate.getMonth(),baseDate.getDate());
  const totalDays=Math.max(1,Math.round((end-start)/86400000)+1);
  if(today<start)return 0;
  if(today>=end)return 100;
  const elapsedDays=Math.max(1,Math.round((today-start)/86400000)+1);
  return Math.max(0,Math.min(100,Math.round((elapsedDays/totalDays)*100)));
}

function getGanttClientGroupCounts(projectRows){
  return (projectRows||[]).reduce((acc,project)=>{
    if(isGanttProjectCompleted(project))acc.completed+=1;
    else if(isGanttProjectOverdue(project))acc.overdue+=1;
    else acc.active+=1;
    return acc;
  },{active:0,overdue:0,completed:0});
}

function countInProgressProjectsForMembers(memberNames){
  const names=[...new Set((Array.isArray(memberNames)?memberNames:[]).map(name=>String(name||'').trim()).filter(Boolean))];
  if(!names.length)return 0;
  return (projects||[]).filter(project=>isGanttProjectInProgress(project)&&names.some(name=>(project.members||[]).includes(name))).length;
}

function isGanttProjectCompletedThisMonth(project,year=curYear,month=curMonth){
  if(!isGanttProjectCompleted(project))return false;
  const completionDate=toDate(getGanttProjectCompletionDate(project)||'');
  return !Number.isNaN(completionDate.getTime())&&completionDate.getFullYear()===year&&completionDate.getMonth()+1===month;
}

function getGanttProjectBillingAmount(project){
  const directAmount=Number(project?.billing_amount||0);
  if(directAmount>0)return directAmount;
  const linkedContract=(contracts||[]).find(contract=>String(contract.id)===String(project?.contract_id||''));
  const contractAmount=Number(linkedContract?.contract_amount||0);
  return contractAmount>0?contractAmount:0;
}

function getGanttProjectClient(project){
  return (clients||[]).find(client=>String(client.id)===String(project?.client_id||''))||null;
}

function getGanttProjectClientName(project){
  return String(getGanttProjectClient(project)?.name||'').trim();
}

function getGanttMonthData(year=curYear,month=curMonth){
  const memberFilter=document.getElementById('memberFilter')?.value||'';
  const {first,last}=getGanttMonthBounds(year,month);
  const projs=(projects||[]).filter(project=>{
    if(memberFilter==='me'&&currentMember&&!project.members.includes(currentMember.name))return false;
    if(memberFilter&&memberFilter!=='me'&&!project.members.includes(memberFilter))return false;
    return toDate(project.start)<=last&&toDate(project.end)>=first;
  });
  const schs=(schedules||[]).filter(schedule=>{
    if(memberFilter==='me'&&currentMember&&!scheduleHasMember(schedule,currentMember.name))return false;
    if(memberFilter&&memberFilter!=='me'&&!scheduleHasMember(schedule,memberFilter))return false;
    return toDate(schedule.start)<=last&&toDate(schedule.end)>=first;
  });
  return {projs,schs};
}

function projectMatchesTopFilters(project){
  if(ganttStatusFilter==='in_progress'&&!isGanttProjectInProgress(project))return false;
  if(ganttStatusFilter==='overdue'&&!isGanttProjectOverdue(project))return false;
  if(ganttStatusFilter==='completed'&&!isGanttProjectCompleted(project))return false;
  if(ganttTypeFilters.length&&!ganttTypeFilters.includes(String(project?.type||'기타').trim()||'기타'))return false;
  if(ganttClientFilterQuery){
    const clientName=getGanttProjectClientName(project).toLowerCase();
    if(!clientName.includes(String(ganttClientFilterQuery).trim().toLowerCase()))return false;
  }
  return true;
}

function applyProjectTopFilters(projs,schs){
  return {
    projs:(projs||[]).filter(projectMatchesTopFilters),
    schs:schs||[]
  };
}

window.applyProjectTopFilters=applyProjectTopFilters;

function getGanttFilteredData(){
  const {projs,schs}=getGanttMonthData(curYear,curMonth);
  return applyProjectTopFilters(projs,schs);
}

function setGanttFocusProject(projectId){
  ganttFocusProjectId=projectId||null;
  renderGantt();
}

function goToCurrentGanttMonth(){
  const today=getHomeBaseDate();
  curYear=today.getFullYear();
  curMonth=today.getMonth()+1;
  renderGantt();
}

function setGanttStatusFilter(value){
  ganttStatusFilter=value||'all';
  renderGantt();
}

function toggleGanttTypeFilter(type){
  const value=String(type||'').trim();
  if(!value)return;
  if(ganttTypeFilters.includes(value))ganttTypeFilters=ganttTypeFilters.filter(item=>item!==value);
  else ganttTypeFilters=[...ganttTypeFilters,value];
  renderGantt();
}

function setGanttClientFilter(value){
  ganttClientFilterQuery=String(value||'').trim();
  renderGantt();
}

function clearGanttFilterTag(kind,value=''){
  if(kind==='member'){
    const sel=document.getElementById('memberFilter');
    if(sel)sel.value='';
    renderMemberFilterTabs();
  }else if(kind==='status'){
    ganttStatusFilter='all';
  }else if(kind==='type'){
    ganttTypeFilters=ganttTypeFilters.filter(item=>item!==value);
  }else if(kind==='client'){
    ganttClientFilterQuery='';
  }
  renderGantt();
}

function getGanttStatusFilterLabel(value){
  return (GANTT_STATUS_OPTIONS.find(option=>option.value===value)?.label)||'전체';
}

function getGanttMonthDeltaText(delta){
  if(!delta)return'전월 대비 변동 없음';
  return '전월 대비 '+(delta>0?'+':'')+delta+'건';
}

function formatGanttCurrency(value){
  return Number(value||0).toLocaleString()+'원';
}

function ensureGanttTodayButton(){
  const nav=document.querySelector('#pageGantt .month-nav');
  if(!nav||document.getElementById('ganttTodayBtn'))return;
  const btn=document.createElement('button');
  btn.type='button';
  btn.id='ganttTodayBtn';
  btn.className='btn sm gantt-today-btn';
  btn.textContent='오늘';
  btn.onclick=goToCurrentGanttMonth;
  nav.appendChild(btn);
}

function ensureGanttTopFilterBar(){
  const toolbar=document.querySelector('#pageGantt .gantt-toolbar');
  const memberTabs=document.getElementById('memberFilterTabs');
  if(!toolbar||!memberTabs)return null;
  let bar=document.getElementById('ganttTopFilterBar');
  if(!bar){
    bar=document.createElement('div');
    bar.id='ganttTopFilterBar';
    bar.className='gantt-top-filter-bar';
    memberTabs.parentNode.insertBefore(bar,memberTabs);
  }
  return bar;
}

function ensureGanttActiveFilterRow(){
  const memberTabs=document.getElementById('memberFilterTabs');
  if(!memberTabs)return null;
  let row=document.getElementById('ganttActiveFilterRow');
  if(!row){
    row=document.createElement('div');
    row.id='ganttActiveFilterRow';
    row.className='gantt-active-filter-row';
    memberTabs.parentNode.insertBefore(row,memberTabs.nextSibling);
  }
  return row;
}

function renderGanttTopFilterBar(){
  const bar=ensureGanttTopFilterBar();
  if(!bar)return;
  const clientOptions=[...new Set((clients||[]).map(client=>String(client?.name||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
  bar.innerHTML=''
    +'<div class="gantt-top-filter-group">'
      +'<span class="gantt-top-filter-label">상태</span>'
      +'<select id="ganttStatusFilterSelect">'
        +GANTT_STATUS_OPTIONS.map(option=>'<option value="'+option.value+'"'+(ganttStatusFilter===option.value?' selected':'')+'>'+option.label+'</option>').join('')
      +'</select>'
    +'</div>'
    +'<div class="gantt-top-filter-group gantt-type-group">'
      +'<span class="gantt-top-filter-label">유형</span>'
      +'<div class="gantt-type-chip-list">'
        +GANTT_TYPE_OPTIONS.map(type=>'<button type="button" class="gantt-type-chip'+(ganttTypeFilters.includes(type)?' active':'')+'" onclick="toggleGanttTypeFilter(\''+type+'\')">'+type+'</button>').join('')
      +'</div>'
    +'</div>'
    +'<div class="gantt-top-filter-group gantt-client-group">'
      +'<span class="gantt-top-filter-label">고객사</span>'
      +'<input id="ganttClientFilterInput" class="gantt-client-search" list="ganttClientFilterOptions" value="'+esc(ganttClientFilterQuery)+'" placeholder="고객사 검색" />'
      +'<datalist id="ganttClientFilterOptions">'
        +clientOptions.map(name=>'<option value="'+esc(name)+'"></option>').join('')
      +'</datalist>'
    +'</div>';
  const statusSelect=document.getElementById('ganttStatusFilterSelect');
  if(statusSelect)statusSelect.onchange=e=>setGanttStatusFilter(e.target.value);
  const clientInput=document.getElementById('ganttClientFilterInput');
  if(clientInput){
    clientInput.onchange=e=>setGanttClientFilter(e.target.value);
    clientInput.oninput=e=>{
      if(!e.target.value)setGanttClientFilter('');
    };
  }
}

function renderGanttActiveFilterTags(){
  const row=ensureGanttActiveFilterRow();
  if(!row)return;
  const tags=[];
  const memberValue=document.getElementById('memberFilter')?.value||'';
  if(memberValue)tags.push({kind:'member',value:memberValue,label:'멤버 · '+memberValue});
  if(ganttStatusFilter!=='all')tags.push({kind:'status',value:ganttStatusFilter,label:'상태 · '+getGanttStatusFilterLabel(ganttStatusFilter)});
  ganttTypeFilters.forEach(type=>tags.push({kind:'type',value:type,label:'유형 · '+type}));
  if(ganttClientFilterQuery)tags.push({kind:'client',value:ganttClientFilterQuery,label:'고객사 · '+ganttClientFilterQuery});
  if(!tags.length){
    row.innerHTML='';
    row.style.display='none';
    return;
  }
  row.style.display='flex';
  row.innerHTML=tags.map(tag=>'<button type="button" class="gantt-filter-tag" onclick="clearGanttFilterTag(\''+tag.kind+'\',\''+String(tag.value).replace(/'/g,"\\'")+'\')">'+esc(tag.label)+' <span>×</span></button>').join('');
}

function ensureGanttTopAreaControls(){
  ensureGanttTodayButton();
  renderGanttTopFilterBar();
  renderGanttActiveFilterTags();
  const scheduleBtn=document.getElementById('scheduleAddBtn');
  if(scheduleBtn)scheduleBtn.textContent='+ 일정';
}

function getPreviousMonth(year=curYear,month=curMonth){
  if(month===1)return {year:year-1,month:12};
  return {year,month:month-1};
}

function getGanttKpiBaseProjects(year=curYear,month=curMonth){
  const {projs}=getGanttMonthData(year,month);
  return projs.filter(projectMatchesTopFilters);
}

function renderGanttOverviewCards(projs,schs){
  ensureGanttTopAreaControls();
  const el=document.getElementById('ganttOverview');
  if(!el)return;
  const activeCount=projs.filter(isGanttProjectInProgress).length;
  const overdueProjects=projs.filter(project=>isGanttProjectOverdue(project));
  const overdueCount=overdueProjects.length;
  const completedThisMonth=projs.filter(project=>isGanttProjectCompletedThisMonth(project));
  const completedAmount=completedThisMonth.reduce((sum,project)=>sum+getGanttProjectBillingAmount(project),0);
  const unbilledProjects=projs.filter(project=>isGanttProjectCompleted(project)&&project?.is_billable!==false&&String(project?.billing_status||'').trim()==='미청구');
  const unbilledAmount=unbilledProjects.reduce((sum,project)=>sum+getGanttProjectBillingAmount(project),0);
  const {year:prevYear,month:prevMonth}=getPreviousMonth(curYear,curMonth);
  const prevActiveCount=getGanttKpiBaseProjects(prevYear,prevMonth).filter(isGanttProjectInProgress).length;
  const activeDelta=activeCount-prevActiveCount;
  const cards=[
    {
      label:'전체',
      value:projs.length+'건',
      sub:'이번 달 기준',
      className:''
    },
    {
      label:'진행중',
      value:activeCount+'건',
      sub:getGanttMonthDeltaText(activeDelta),
      className:''
    },
    {
      label:'지연',
      value:overdueCount===0?'없음 ✓':overdueCount+'건',
      sub:overdueCount?((overdueProjects.sort((a,b)=>toDate(a.end)-toDate(b.end))[0]?.name||'지연 프로젝트')+' 포함'):'지연 프로젝트 없음',
      className:overdueCount?'is-danger':'is-good'
    },
    {
      label:'이번 달 완료',
      value:completedThisMonth.length+'건',
      sub:'빌링 금액 '+formatGanttCurrency(completedAmount),
      className:'is-good'
    },
    {
      label:'미청구',
      value:unbilledProjects.length+'건',
      sub:'미청구 금액 '+formatGanttCurrency(unbilledAmount),
      className:unbilledProjects.length?'is-warn':''
    }
  ];
  el.innerHTML=cards.map(card=>'<div class="gantt-kpi '+card.className+'"><div class="gantt-kpi-label">'+card.label+'</div><div class="gantt-kpi-value">'+card.value+'</div><div class="gantt-kpi-sub">'+card.sub+'</div></div>').join('');
}

renderGanttSidebarList=function(projs){
  const el=document.getElementById('ganttProjectList');
  const doneStatus='완료';
  const activeStatus='진행중';
  if(!el)return;
  if(!projs.length){
    el.innerHTML='<div class="gantt-empty-copy">No projects match this filter.</div>';
    return;
  }
  if(!ganttFocusProjectId||!projs.some(p=>p.id===ganttFocusProjectId))ganttFocusProjectId=projs[0].id;
  const sorted=[...projs].sort((a,b)=>toDate(a.end)-toDate(b.end));
  el.innerHTML=sorted.map(p=>{
    const client=clients.find(c=>c.id===p.client_id);
    const issueCount=openIssuesByProject[p.id]||0;
    const hasMemo=!!(p.memo&&String(p.memo).trim());
    const warning=isOverdue(p)
      ?'기간 초과'
      :isDueToday(p)
      ?'오늘 마감'
      :p.status===doneStatus&&p.is_billable&&p.billing_status==='미청구'
      ?'빌링 필요'
      :issueCount
      ?'열린 이슈 '+issueCount+'건'
      :'정상 진행';
    const memoMeta=hasMemo?'<div class="gantt-project-meta" style="color:#334155;font-weight:700">메모 있음</div>':'';
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

renderGanttDetailPanel=function(projs,schs){
  const el=document.getElementById('ganttDetail');
  if(!el)return;
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
  el.innerHTML='<div class="gantt-panel-head"><div><div class="gantt-panel-title">'+esc(project.name)+'</div><div class="gantt-panel-sub">'+esc(client?.name||'No client')+' | '+esc(project.type||'No type')+'</div></div><span class="badge '+(project.status==='진행중'?'badge-blue':project.status==='완료'?'badge-green':'badge-orange')+'">'+esc(project.status||'No status')+'</span></div><div class="gantt-detail-grid"><div><div class="gantt-detail-label">Period</div><div class="gantt-detail-value">'+esc((project.start||'')+' ~ '+(project.end||''))+'</div></div><div><div class="gantt-detail-label">Owners</div><div class="gantt-detail-value">'+esc(projectMembers.join(', ')||'Unassigned')+'</div></div><div><div class="gantt-detail-label">Billing</div><div class="gantt-detail-value">'+esc(project.is_billable?(project.billing_status||'No status'):'Non-billable')+'</div></div><div><div class="gantt-detail-label">Issue / Comment</div><div class="gantt-detail-value">'+issueCount+' issues | '+commentCount+' comments</div></div></div><div class="gantt-main-copy">The left side is not a priority engine. It is simply the visible project list for this month. Select a project to see team schedules and quick actions here.</div><div class="gantt-detail-actions"><button class="btn primary sm" onclick="openProjModal(\''+project.id+'\')">Open Project</button><button class="btn sm" onclick="openProjModal(\''+project.id+'\',null,null,\'issue\')">Open Issues</button><button class="btn sm" onclick="handleProjectOutlookEvent(\''+project.id+'\')">Add to Outlook</button></div><div class="gantt-detail-section"><div class="gantt-panel-title">Team Schedule</div><div class="gantt-detail-list">'+(memberSchedules.map(s=>'<div class="gantt-detail-item"><div><div class="gantt-detail-item-title">'+esc(s.title||scheduleLabel(s.schedule_type))+'</div><div class="gantt-detail-item-sub">'+esc((s.start||'')+' ~ '+(s.end||'')+' | '+getScheduleMemberLabel(s))+'</div></div><span class="badge badge-gray">'+esc(scheduleLabel(s.schedule_type))+'</span></div>').join('')||'<div class="gantt-empty-copy">No leave, fieldwork, or internal schedule found for this team in the current filter.</div>')+'</div></div>';
};

function fixBars(){
  document.querySelectorAll('.bar[data-span]').forEach(bar=>{
    const span=parseInt(bar.dataset.span,10);
    const td=bar.closest('td');
    if(!td)return;
    let w=0;
    let t=td;
    for(let i=0;i<span;i++){
      if(t){
        w+=t.offsetWidth;
        t=t.nextElementSibling;
      }
    }
    bar.style.width=(w-4)+'px';
    bar.style.right='auto';
  });
}

function renderLegend(){
  document.getElementById('legend').innerHTML=
    Object.entries(TYPES).map(([k,c])=>'<div class="legend-item"><div class="legend-dot" style="background:'+c+'"></div>'+k+'</div>').join('')+
    Object.entries(SCHEDULE_META).filter(([k])=>k!=='project').map(([k,v])=>'<div class="legend-item"><div class="legend-dot" style="background:'+v.color+';border:1px dashed rgba(0,0,0,.15)"></div>'+v.label+'</div>').join('')+
    '<div class="legend-item" style="margin-left:12px;gap:8px"><span style="opacity:.3">■</span> 완료 <span style="opacity:.5">■</span> 예정 <span>■</span> 진행중</div>';
}

function buildGanttCalendarItemHtml(item){
  const itemClass=item.kind==='project'?'project':'schedule';
  const bg=item.kind==='project'?item.color:withAlpha(item.color,'2B');
  const text=item.kind==='project'?'#FFFFFF':'#243241';
  const border=item.kind==='project'?'transparent':withAlpha(item.color,'55');
  const action=item.kind==='project'
    ?`openProjModal('${item.id}')`
    :`openScheduleModal('${item.id}')`;
  return '<button class="gantt-calendar-item '+itemClass+'" type="button" onclick="'+action+'" style="background:'+bg+';color:'+text+';border:1px solid '+border+(item.dueToday?';box-shadow:inset 0 0 0 1px rgba(146,64,14,.24)':'')+'" title="'+esc(item.title)+'">'+esc(item.label)+'</button>';
}

function buildGanttCalendarItemsForDate(cellDate,projs,schs){
  const ts=cellDate.getTime();
  const items=[];
  projs.forEach(p=>{
    if(toDate(p.start).getTime()<=ts&&toDate(p.end).getTime()>=ts){
      items.push({
        kind:'project',
        id:p.id,
        label:p.name,
        title:[p.name,p.type||'',(p.members||[]).join(', ')].filter(Boolean).join(' | '),
        color:TYPES[p.type]||'#4e5968',
        dueToday:isDueToday(p)&&toDate(p.end).getTime()===ts
      });
    }
  });
  schs.forEach(s=>{
    if(toDate(s.start).getTime()<=ts&&toDate(s.end).getTime()>=ts){
      const labelBase=s.title||scheduleLabel(s.schedule_type);
      items.push({
        kind:'schedule',
        id:s.id,
        label:(s.member_name?s.member_name+' · ':'')+labelBase,
        title:[labelBase,s.member_name||'',s.location||'',s.memo||''].filter(Boolean).join(' | '),
        color:scheduleColor(s.schedule_type)
      });
    }
  });
  return items.sort((a,b)=>{
    if(a.kind!==b.kind)return a.kind==='project'?-1:1;
    return a.label.localeCompare(b.label,'ko');
  });
}

function renderGanttCalendarGrid(projs,schs){
  const wrap=document.getElementById('ganttWrap');
  if(!wrap)return;
  const weekdayLabels=['일','월','화','수','목','금','토'];
  const totalDays=daysInMonth(curYear,curMonth);
  const firstDay=new Date(curYear,curMonth-1,1);
  const startOffset=firstDay.getDay();
  const totalCells=Math.ceil((startOffset+totalDays)/7)*7;
  if(!projs.length&&!schs.length){
    wrap.innerHTML='<div class="empty-state" style="padding:40px">이 달에 표시할 프로젝트와 일정이 없습니다.</div>';
    renderLegend();
    return;
  }
  const weekdayHead=weekdayLabels.map(label=>'<div class="gantt-calendar-weekday">'+label+'</div>').join('');
  let cells='';
  for(let i=0;i<totalCells;i++){
    const dayNumber=i-startOffset+1;
    if(dayNumber<1||dayNumber>totalDays){
      cells+='<div class="gantt-calendar-day is-empty"></div>';
      continue;
    }
    const cellDate=new Date(curYear,curMonth-1,dayNumber);
    cellDate.setHours(0,0,0,0);
    const items=buildGanttCalendarItemsForDate(cellDate,projs,schs);
    const preview=items.slice(0,4).map(buildGanttCalendarItemHtml).join('');
    const overflow=items.length>4?'<div class="gantt-calendar-item more">+'+(items.length-4)+'건</div>':'';
    const isWeekendCell=cellDate.getDay()===0||cellDate.getDay()===6;
    const todayClass=isToday(curYear,curMonth,dayNumber)?' is-today':'';
    const weekendClass=isWeekendCell?' is-weekend':'';
    cells+='<div class="gantt-calendar-day'+todayClass+weekendClass+'">'
      +'<div class="gantt-calendar-date-row"><div class="gantt-calendar-date">'+dayNumber+'</div>'+(items.length?'<div class="gantt-calendar-count">'+items.length+'건</div>':'')+'</div>'
      +'<div class="gantt-calendar-items">'+preview+overflow+'</div>'
      +'</div>';
  }
  wrap.innerHTML='<div class="gantt-calendar-wrap"><div class="gantt-calendar-board"><div class="gantt-calendar-weekdays">'+weekdayHead+'</div><div class="gantt-calendar-grid">'+cells+'</div></div></div>';
  renderLegend();
}

function renderGanttListView(projs,schs){
  const wrap=document.getElementById('ganttWrap');
  if(!wrap)return;
  if(!projs.length){
    wrap.innerHTML='<div class="empty-state" style="padding:40px">현재 필터에서 표시할 프로젝트가 없습니다.</div>';
    renderLegend();
    return;
  }
  const sorted=[...projs].sort((a,b)=>{
    const overdueDiff=Number(isGanttProjectOverdue(b))-Number(isGanttProjectOverdue(a));
    if(overdueDiff)return overdueDiff;
    return toDate(a.end)-toDate(b.end);
  });
  wrap.innerHTML='<div class="gantt-list-view">'
    +sorted.map(project=>{
      const client=getGanttProjectClient(project);
      const issueCount=openIssuesByProject[project.id]||0;
      const relatedSchedules=(schs||[]).filter(schedule=>scheduleHasAnyProjectMember(schedule,project.members||[])).length;
      return '<button type="button" class="gantt-list-card" onclick="openProjModal(\''+project.id+'\')">'
        +'<div class="gantt-list-card-head"><div><div class="gantt-list-card-title">'+esc(project.name)+'</div><div class="gantt-list-card-sub">'+esc(client?.name||'고객사 미지정')+' · '+esc(project.type||'유형 미지정')+'</div></div><span class="badge '+(project.status==='진행중'?'badge-blue':project.status==='완료'?'badge-green':'badge-orange')+'">'+esc(project.status||'상태 없음')+'</span></div>'
        +'<div class="gantt-list-card-meta"><span>기간 '+esc((project.start||'')+' ~ '+(project.end||''))+'</span><span>담당 '+esc((project.members||[]).join(', ')||'미지정')+'</span></div>'
        +'<div class="gantt-list-card-meta"><span>이슈 '+issueCount+'건</span><span>관련 일정 '+relatedSchedules+'건</span><span>'+(isGanttProjectOverdue(project)?'기간 초과':'정상 진행')+'</span></div>'
        +'</button>';
    }).join('')
    +'</div>';
  renderLegend();
}

function setGanttListSearchQuery(value){
  ganttListSearchQuery=String(value||'').trim();
  renderGantt();
}

function sortGanttListBy(key){
  const nextKey=String(key||'').trim();
  if(!nextKey)return;
  if(ganttListSortKey===nextKey)ganttListSortDir=ganttListSortDir==='asc'?'desc':'asc';
  else{
    ganttListSortKey=nextKey;
    ganttListSortDir=(nextKey==='billing_amount'||nextKey==='issue_count'||nextKey==='status')?'desc':'asc';
  }
  renderGantt();
}

function canManageGanttListProject(project){
  if(typeof canManageProjectMembers==='function')return !!canManageProjectMembers(project);
  return !!((typeof roleIsAdmin==='function'&&roleIsAdmin())||(currentUser&&project?.created_by===currentUser.id));
}

function getGanttListBillingStatus(project){
  if(project?.is_billable===false)return '비청구대상';
  return String(project?.billing_status||'미청구').trim()||'미청구';
}

function getGanttListBillingBadgeClass(status){
  if(status==='수금완료')return 'badge-green';
  if(status==='청구완료')return 'badge-blue';
  if(status==='미청구')return 'badge-orange';
  return 'badge-gray';
}

function getGanttListStatusBadgeClass(status){
  if(status==='진행중')return 'badge-blue';
  if(status==='완료')return 'badge-green';
  return 'badge-orange';
}

function getGanttListPriorityLabel(priority){
  if(priority==='high')return '긴급';
  if(priority==='low')return '낮음';
  return '보통';
}

function getGanttListPriorityBadgeClass(priority){
  if(priority==='high')return 'badge-red';
  if(priority==='low')return 'badge-gray';
  return 'badge-blue';
}

function getGanttListProjectRows(projs){
  return (projs||[]).map(project=>{
    const clientName=getGanttProjectClientName(project)||'고객사 미지정';
    const memberNames=[...(project.members||[])];
    const billingAmount=getGanttProjectBillingAmount(project);
    const billingStatus=getGanttListBillingStatus(project);
    const issueCount=openIssuesByProject[project.id]||0;
    const periodText=(project.start||project.start_date||'')+' ~ '+(project.end||project.end_date||'');
    const searchText=[clientName,project?.name||'',project?.type||'',memberNames.join(' ')].join(' ').toLowerCase();
    const status=String(project?.status||'예정').trim()||'예정';
    return {
      project,
      clientName,
      memberText:memberNames.join(', ')||'담당자 미지정',
      billingAmount,
      billingStatus,
      issueCount,
      periodText,
      status,
      priority:String(project?.priority||'medium').trim()||'medium',
      searchText
    };
  });
}

function filterGanttListRows(rows){
  const query=String(ganttListSearchQuery||'').trim().toLowerCase();
  if(!query)return rows;
  return rows.filter(row=>row.searchText.includes(query));
}

function compareGanttListValues(a,b,key){
  if(key==='client_name')return a.clientName.localeCompare(b.clientName,'ko');
  if(key==='name')return String(a.project?.name||'').localeCompare(String(b.project?.name||''),'ko');
  if(key==='type')return String(a.project?.type||'').localeCompare(String(b.project?.type||''),'ko');
  if(key==='status'){
    const order={진행중:3,예정:2,완료:1};
    return (order[a.status]||0)-(order[b.status]||0);
  }
  if(key==='period'){
    const startDiff=toDate(a.project?.start||a.project?.start_date||'')-toDate(b.project?.start||b.project?.start_date||'');
    if(startDiff)return startDiff;
    return toDate(a.project?.end||a.project?.end_date||'')-toDate(b.project?.end||b.project?.end_date||'');
  }
  if(key==='members')return a.memberText.localeCompare(b.memberText,'ko');
  if(key==='billing_status')return a.billingStatus.localeCompare(b.billingStatus,'ko');
  if(key==='billing_amount')return Number(a.billingAmount||0)-Number(b.billingAmount||0);
  if(key==='issue_count')return Number(a.issueCount||0)-Number(b.issueCount||0);
  if(key==='priority')return Number(getProjectPriorityRank(a.priority)||0)-Number(getProjectPriorityRank(b.priority)||0);
  return 0;
}

function sortGanttListRows(rows){
  return [...rows].sort((a,b)=>{
    const diff=compareGanttListValues(a,b,ganttListSortKey);
    if(diff)return ganttListSortDir==='asc'?diff:-diff;
    return String(a.project?.name||'').localeCompare(String(b.project?.name||''),'ko');
  });
}

function toggleGanttListProjectSelection(projectId){
  const id=String(projectId||'');
  if(!id)return;
  if(ganttListSelectedIds.includes(id))ganttListSelectedIds=ganttListSelectedIds.filter(item=>item!==id);
  else ganttListSelectedIds=[...ganttListSelectedIds,id];
  renderGantt();
}

function toggleGanttListSelectAll(checked,projectIds){
  const ids=[...new Set((projectIds||[]).map(id=>String(id||'')).filter(Boolean))];
  ganttListSelectedIds=checked?ids:[];
  renderGantt();
}

function clearGanttListSelection(){
  ganttListSelectedIds=[];
  renderGantt();
}

function getGanttListSelectedProjects(){
  return (projects||[]).filter(project=>ganttListSelectedIds.includes(String(project?.id||'')));
}

async function completeGanttListSelectedProjects(){
  const selectedProjects=getGanttListSelectedProjects().filter(canManageGanttListProject);
  if(!selectedProjects.length){alert('완료 처리할 프로젝트를 선택해주세요.');return;}
  if(!confirm('선택한 프로젝트를 일괄 완료 처리할까요?'))return;
  const today=new Date().toISOString().slice(0,10);
  try{
    for(const project of selectedProjects){
      await api('PATCH','projects?id=eq.'+project.id,{
        status:'완료',
        actual_end_date:project.actual_end_date||today
      });
    }
    ganttListSelectedIds=[];
    await loadAll();
    renderGantt();
  }catch(e){
    alert('일괄 완료 처리 오류: '+e.message);
  }
}

async function applyGanttListBulkStatus(){
  const selectedProjects=getGanttListSelectedProjects().filter(canManageGanttListProject);
  if(!selectedProjects.length){alert('상태를 변경할 프로젝트를 선택해주세요.');return;}
  const nextStatus=document.getElementById('ganttBulkStatusSelect')?.value||'';
  if(!nextStatus){alert('변경할 상태를 선택해주세요.');return;}
  if(!confirm('선택한 프로젝트의 상태를 "'+nextStatus+'"로 변경할까요?'))return;
  const today=new Date().toISOString().slice(0,10);
  try{
    for(const project of selectedProjects){
      const body={status:nextStatus};
      if(nextStatus==='완료'&&!project.actual_end_date)body.actual_end_date=today;
      await api('PATCH','projects?id=eq.'+project.id,body);
    }
    ganttListSelectedIds=[];
    await loadAll();
    renderGantt();
  }catch(e){
    alert('일괄 상태 변경 오류: '+e.message);
  }
}

async function applyGanttListBulkMember(){
  const selectedProjects=getGanttListSelectedProjects().filter(canManageGanttListProject);
  if(!selectedProjects.length){alert('담당자를 변경할 프로젝트를 선택해주세요.');return;}
  const memberName=document.getElementById('ganttBulkMemberSelect')?.value||'';
  if(!memberName){alert('변경할 담당자를 선택해주세요.');return;}
  const member=(members||[]).find(item=>item?.name===memberName);
  if(!member){alert('담당자 정보를 찾지 못했습니다.');return;}
  if(!confirm('선택한 프로젝트의 담당자를 "'+memberName+'" 1명으로 변경할까요?'))return;
  try{
    for(const project of selectedProjects){
      await api('DELETE','project_members?project_id=eq.'+project.id);
      await apiEx('POST','project_members?on_conflict=project_id,member_id',{project_id:project.id,member_id:member.id},'resolution=merge-duplicates,return=representation');
    }
    ganttListSelectedIds=[];
    await loadAll();
    renderGantt();
  }catch(e){
    alert('일괄 담당자 변경 오류: '+e.message);
  }
}

function getGanttListSortIndicator(key){
  if(ganttListSortKey!==key)return '';
  return ganttListSortDir==='asc'?' ↑':' ↓';
}

function renderGanttListView(projs,schs){
  const wrap=document.getElementById('ganttWrap');
  if(!wrap)return;
  const legend=document.getElementById('legend');
  if(legend)legend.innerHTML='';
  const rows=sortGanttListRows(filterGanttListRows(getGanttListProjectRows(projs)));
  const visibleProjectIds=new Set(rows.map(row=>String(row.project?.id||'')));
  ganttListSelectedIds=ganttListSelectedIds.filter(id=>visibleProjectIds.has(String(id)));
  const selectableRows=rows.filter(row=>canManageGanttListProject(row.project));
  const selectedSet=new Set(ganttListSelectedIds.map(id=>String(id)));
  const allSelected=!!selectableRows.length&&selectableRows.every(row=>selectedSet.has(String(row.project?.id||'')));
  const availableMembers=getAvailableGanttMembers();
  if(!rows.length){
    wrap.innerHTML='<div class="empty-state" style="padding:40px">현재 필터에서 표시할 프로젝트가 없습니다.</div>';
    return;
  }
  wrap.innerHTML='<div class="gantt-list-view">'
    +'<div class="gantt-list-toolbar">'
      +'<div class="gantt-list-toolbar-main">'
        +'<input id="ganttListSearchInput" class="gantt-list-search" value="'+esc(ganttListSearchQuery)+'" placeholder="프로젝트명 / 고객사명 / 담당자명 검색" />'
        +'<div class="gantt-list-count">총 '+rows.length+'건</div>'
      +'</div>'
      +(ganttListSelectedIds.length?'<div class="gantt-list-selection-summary">'+ganttListSelectedIds.length+'건 선택됨</div>':'')
    +'</div>'
    +(ganttListSelectedIds.length
      ?'<div class="gantt-list-bulkbar">'
        +'<div class="gantt-list-bulkbar-main"><span class="gantt-list-bulk-title">일괄 작업</span><button type="button" class="btn sm" onclick="clearGanttListSelection()">선택 해제</button></div>'
        +'<div class="gantt-list-bulk-actions">'
          +'<button type="button" class="btn sm" onclick="completeGanttListSelectedProjects()">일괄 완료 처리</button>'
          +'<select id="ganttBulkStatusSelect"><option value="">상태 변경</option><option value="예정">예정</option><option value="진행중">진행중</option><option value="완료">완료</option></select>'
          +'<button type="button" class="btn sm" onclick="applyGanttListBulkStatus()">적용</button>'
          +'<select id="ganttBulkMemberSelect"><option value="">담당자 변경</option>'+availableMembers.map(member=>'<option value="'+esc(member.name)+'">'+esc(member.name)+'</option>').join('')+'</select>'
          +'<button type="button" class="btn sm" onclick="applyGanttListBulkMember()">적용</button>'
        +'</div>'
      +'</div>'
      :'')
    +'<div class="gantt-list-table-shell"><table class="gantt-list-table">'
      +'<thead><tr>'
        +'<th class="gantt-list-check-col"><input type="checkbox" '+(allSelected?'checked ':'')+(selectableRows.length?'':'disabled ')+'onclick="event.stopPropagation();toggleGanttListSelectAll(this.checked,['+selectableRows.map(row=>'\''+row.project.id+'\'').join(',')+'])" /></th>'
        +'<th><button type="button" class="gantt-list-sort-btn" onclick="sortGanttListBy(\'client_name\')">고객사'+getGanttListSortIndicator('client_name')+'</button></th>'
        +'<th><button type="button" class="gantt-list-sort-btn" onclick="sortGanttListBy(\'name\')">프로젝트명'+getGanttListSortIndicator('name')+'</button></th>'
        +'<th><button type="button" class="gantt-list-sort-btn" onclick="sortGanttListBy(\'type\')">유형'+getGanttListSortIndicator('type')+'</button></th>'
        +'<th><button type="button" class="gantt-list-sort-btn" onclick="sortGanttListBy(\'status\')">상태'+getGanttListSortIndicator('status')+'</button></th>'
        +'<th><button type="button" class="gantt-list-sort-btn" onclick="sortGanttListBy(\'period\')">기간'+getGanttListSortIndicator('period')+'</button></th>'
        +'<th><button type="button" class="gantt-list-sort-btn" onclick="sortGanttListBy(\'members\')">담당자'+getGanttListSortIndicator('members')+'</button></th>'
        +'<th><button type="button" class="gantt-list-sort-btn" onclick="sortGanttListBy(\'billing_status\')">빌링 상태'+getGanttListSortIndicator('billing_status')+'</button></th>'
        +'<th class="is-numeric"><button type="button" class="gantt-list-sort-btn is-numeric" onclick="sortGanttListBy(\'billing_amount\')">빌링 금액'+getGanttListSortIndicator('billing_amount')+'</button></th>'
        +'<th class="is-numeric"><button type="button" class="gantt-list-sort-btn is-numeric" onclick="sortGanttListBy(\'issue_count\')">이슈 수'+getGanttListSortIndicator('issue_count')+'</button></th>'
        +'<th><button type="button" class="gantt-list-sort-btn" onclick="sortGanttListBy(\'priority\')">우선순위'+getGanttListSortIndicator('priority')+'</button></th>'
      +'</tr></thead>'
      +'<tbody>'
      +rows.map(row=>{
        const project=row.project;
        const selected=selectedSet.has(String(project.id));
        const canManage=canManageGanttListProject(project);
        return '<tr class="gantt-list-row'+(selected?' is-selected':'')+(isGanttProjectOverdue(project)?' is-overdue':'')+(isDueToday(project)?' is-due-today':'')+'" onclick="openProjModal(\''+project.id+'\')">'
          +'<td class="gantt-list-check-col" onclick="event.stopPropagation()"><input type="checkbox" '+(selected?'checked ':'')+(canManage?'':'disabled ')+'onchange="toggleGanttListProjectSelection(\''+project.id+'\')" /></td>'
          +'<td>'+esc(row.clientName)+'</td>'
          +'<td><div class="gantt-list-project-name">'+esc(project.name||'프로젝트명 없음')+'</div>'+(project.memo?'<div class="gantt-list-project-sub">'+esc(truncateText(project.memo,48))+'</div>':'')+'</td>'
          +'<td>'+esc(project.type||'기타')+'</td>'
          +'<td><span class="badge '+getGanttListStatusBadgeClass(row.status)+'">'+esc(row.status)+'</span></td>'
          +'<td>'+esc(row.periodText)+'</td>'
          +'<td>'+esc(row.memberText)+'</td>'
          +'<td><span class="badge '+getGanttListBillingBadgeClass(row.billingStatus)+'">'+esc(row.billingStatus)+'</span></td>'
          +'<td class="is-numeric">'+formatGanttCurrency(row.billingAmount)+'</td>'
          +'<td class="is-numeric">'+row.issueCount+'건</td>'
          +'<td>'+(typeof getProjectPriorityBadge==='function'?getProjectPriorityBadge(row.priority):('<span class="badge '+getGanttListPriorityBadgeClass(row.priority)+'">'+getGanttListPriorityLabel(row.priority)+'</span>'))+'</td>'
        +'</tr>';
      }).join('')
      +'</tbody>'
    +'</table></div>'
    +'</div>';
  const searchInput=document.getElementById('ganttListSearchInput');
  if(searchInput)searchInput.oninput=e=>setGanttListSearchQuery(e.target.value);
}
