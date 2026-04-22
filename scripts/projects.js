let ganttFocusProjectId=null;
let ganttStatusFilter='all';
let ganttTypeFilters=[];
let ganttClientFilterQuery='';

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
