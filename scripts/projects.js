let ganttFocusProjectId=null;
let ganttStatusFilter='all';
let ganttTypeFilters=[];
let ganttClientFilterQuery='';
let ganttListSortKey='period';
let ganttListSortDir='asc';
let ganttListSearchQuery='';
let ganttListSelectedIds=[];
let ganttListExpandedProjectIds=[];
let ganttListExpandedMoreProjectIds=[];
let ganttDetailTab='overview';
let ganttScheduledRefreshRafId=0;
let ganttProjectTasksByProjectId={};
let ganttProjectTaskLoadMetaByProjectId={};
let ganttProjectTaskIssueCountsByProjectId={};
let ganttListTaskSummaryByProjectId={};
let ganttListTaskSummaryLoadingProjectIds=new Set();
let ganttListTaskIssueSummaryByProjectId={};
let ganttListTaskIssueSummaryLoadingProjectIds=new Set();
let ganttListExecutionRiskFilters=[];
let editingProjectTaskProjectId='';
let editingProjectTaskId='';
const GANTT_LIST_TASK_DRILL_LIMIT=3;

const GANTT_STATUS_OPTIONS=[
  {value:'all',label:'전체'},
  {value:'in_progress',label:'진행중'},
  {value:'overdue',label:'지연'},
  {value:'completed',label:'완료'}
];

const GANTT_TYPE_OPTIONS=['감사','세무','밸류에이션','자문','실사','기타'];
const GANTT_TASK_STATUS_OPTIONS=['예정','진행중','대기','완료','보류'];
const GANTT_TASK_PRIORITY_OPTIONS=[
  {value:'high',label:'높음'},
  {value:'medium',label:'보통'},
  {value:'low',label:'낮음'}
];
const GANTT_PROJECT_TASK_TABLE='project_tasks';
const GANTT_PROJECT_TASK_MIGRATION_FILE='sql/20260423_project_tasks_phase1.sql';

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
  return getOperationalMembers();
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
  const statusKey=getGanttProjectRawStatusKey(project);
  return ['completed','done','execution_done','follow_up','fully_closed'].includes(statusKey);
}

function isGanttProjectInProgress(project){
  const statusKey=getGanttProjectStatusKey(project);
  return statusKey==='in_progress'||statusKey==='active';
}

function isGanttProjectOverdue(project,baseDate=getHomeBaseDate()){
  const endDate=toDate(project?.end||project?.end_date||'');
  return !Number.isNaN(endDate.getTime())&&endDate<baseDate&&!isGanttProjectCompleted(project);
}

function isGanttProjectDueToday(project,baseDate=getHomeBaseDate()){
  const endDate=toDate(project?.end||project?.end_date||'');
  if(Number.isNaN(endDate.getTime())||isGanttProjectCompleted(project))return false;
  const today=new Date(baseDate.getFullYear(),baseDate.getMonth(),baseDate.getDate());
  const due=new Date(endDate.getFullYear(),endDate.getMonth(),endDate.getDate());
  return Math.round((due-today)/86400000)===0;
}

function getGanttStatusOptions(){
  return [
    {value:'all',label:'전체'},
    {value:'in_progress',label:'진행중'},
    {value:'overdue',label:'지연'},
    {value:'due_today',label:'오늘 마감'},
    {value:'execution_done',label:'실행 완료'},
    {value:'follow_up',label:'후속관리'},
    {value:'fully_closed',label:'완전 종료'}
  ];
}

function getGanttTypeFilterValue(){
  return Array.isArray(ganttTypeFilters)&&ganttTypeFilters.length
    ?String(ganttTypeFilters[0]||'').trim()||'all'
    :'all';
}

function setGanttTypeFilter(value){
  const normalized=String(value||'all').trim()||'all';
  ganttTypeFilters=normalized==='all'?[]:[normalized];
  renderGantt();
}

function getGanttProjectRawStatusKey(project){
  const raw=String(project?.status||'').trim();
  if(raw==='진행중')return'in_progress';
  if(raw==='예정')return'planned';
  if(raw==='지연')return'overdue';
  if(raw==='실행 완료')return'execution_done';
  if(raw==='후속관리')return'follow_up';
  if(raw==='완전 종료')return'fully_closed';
  if(raw==='완료')return'completed';
  const normalized=raw.toLowerCase().replace(/[\s-]+/g,'_');
  if(normalized==='execution_complete')return'execution_done';
  return normalized;
}

function getGanttProjectLifecycleMeta(project,options={}){
  const taskSummary=options?.taskSummary;
  const taskIssueSummary=options?.taskIssueSummary;
  const pendingDocSummary=options?.pendingDocSummary;
  const issueCount=Number(options?.issueCount||0);
  const rawStatusKey=getGanttProjectRawStatusKey(project);
  const isCompletedLike=['completed','done','execution_done','follow_up','fully_closed'].includes(rawStatusKey)||!!String(project?.actual_end_date||'').trim();
  const openTaskCount=Number(taskSummary?.openCount||0);
  const overdueTaskCount=Number(taskSummary?.overdueCount||0);
  const issueLinkedTaskCount=Number(taskIssueSummary?.issueLinkedTaskCount||0);
  const pendingDocCount=Number(pendingDocSummary?.total||0);
  const billingPending=project?.is_billable!==false&&String(project?.billing_status||'').trim()==='미청구';
  const followUpNeeded=!!project?.follow_up_needed;
  const dueToday=isGanttProjectDueToday(project);
  const overdue=isGanttProjectOverdue(project)||rawStatusKey==='overdue';
  const hasClosureEvidence=
    taskSummary!==undefined&&taskSummary!==null
    &&pendingDocSummary!==undefined&&pendingDocSummary!==null;
  const hasFollowUpSignals=
    openTaskCount>0
    ||issueCount>0
    ||issueLinkedTaskCount>0
    ||pendingDocCount>0
    ||billingPending
    ||followUpNeeded;

  if((rawStatusKey==='fully_closed'&&!hasFollowUpSignals)||(isCompletedLike&&hasClosureEvidence&&!hasFollowUpSignals)){
    return {
      key:'fully_closed',
      label:'완전 종료',
      tone:'safe',
      rank:1,
      detail:'열린 업무, 이슈, 자료 요청, 미청구 항목 없이 종료 기준을 충족했습니다.'
    };
  }

  if(rawStatusKey==='follow_up'||(rawStatusKey==='fully_closed'&&hasFollowUpSignals)||(isCompletedLike&&openTaskCount===0&&(issueCount>0||issueLinkedTaskCount>0||pendingDocCount>0||billingPending||followUpNeeded))){
    return {
      key:'follow_up',
      label:'후속관리',
      tone:'warn',
      rank:4,
      detail:'핵심 실행은 마쳤고 청구, 자료, 이슈, 후속 확인만 남아 있습니다.'
    };
  }

  if(rawStatusKey==='execution_done'||(isCompletedLike&&!hasClosureEvidence)||isCompletedLike){
    return {
      key:'execution_done',
      label:'실행 완료',
      tone:hasFollowUpSignals?'neutral':'safe',
      rank:3,
      detail:hasFollowUpSignals
        ?'핵심 실행은 마쳤지만 운영 후속 항목이 남아 있습니다.'
        :'핵심 실행은 마쳤고 종료 기준 확인만 남아 있습니다.'
    };
  }

  if(overdue){
    return {
      key:'overdue',
      label:'지연',
      tone:'danger',
      rank:6,
      detail:'예정 종료일이 지났지만 아직 진행이 남아 있습니다.'
    };
  }

  if(rawStatusKey==='planned'){
    return {
      key:'planned',
      label:'예정',
      tone:'neutral',
      rank:2,
      detail:'아직 착수 전이거나 준비 단계입니다.'
    };
  }

  return {
    key:'in_progress',
    label:dueToday?'진행중':'진행중',
    tone:dueToday?'warn':'good',
    rank:5,
    detail:dueToday?'오늘 마감 일정이 있어 진행 점검이 필요합니다.':'현재 핵심 실행을 진행 중입니다.'
  };
}

function isGanttProjectFullyClosedForVisibility(project){
  return getGanttProjectLifecycleMeta(project,{
    taskSummary:ganttListTaskSummaryByProjectId[String(project?.id||'')],
    taskIssueSummary:ganttListTaskIssueSummaryByProjectId[String(project?.id||'')],
    pendingDocSummary:(window.ganttProjectPendingDocSummaryByProjectId||{})[String(project?.id||'')],
    issueCount:openIssuesByProject[String(project?.id||'')]||0
  }).key==='fully_closed';
}

window.isGanttProjectFullyClosedForVisibility=isGanttProjectFullyClosedForVisibility;

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

function scheduleGanttFullRefresh(){
  if(ganttScheduledRefreshRafId)return;
  ganttScheduledRefreshRafId=requestAnimationFrame(()=>{
    ganttScheduledRefreshRafId=0;
    renderGantt();
  });
}

function refreshGanttActiveViewOnly(){
  const currentData=getGanttFilteredData();
  if(curGanttLayout==='list'&&typeof renderGanttListView==='function'){
    renderGanttListView(currentData.projs,currentData.schs);
    return;
  }
  if(curGanttLayout==='calendar'&&typeof renderGanttCalendarGrid==='function'){
    renderGanttCalendarGrid(currentData.projs,currentData.schs);
    return;
  }
  if(typeof renderFilteredGanttTimeline==='function'){
    renderFilteredGanttTimeline(currentData.projs,currentData.schs);
    return;
  }
  renderGantt();
}

function scrollGanttDetailIntoView(){
  const detail=document.getElementById('ganttDetail');
  if(detail)detail.scrollIntoView({behavior:'smooth',block:'start'});
}

function openGanttProjectDetail(projectId,scrollIntoPanel=true){
  const prevProjectId=ganttFocusProjectId;
  const shouldKeepWorkTab=ganttDetailTab==='work';
  ganttFocusProjectId=projectId||null;
  if(projectId&&String(prevProjectId||'')!==String(projectId||''))ganttDetailTab=shouldKeepWorkTab?'work':'overview';
  renderGantt();
  if(scrollIntoPanel&&projectId){
    requestAnimationFrame(()=>requestAnimationFrame(scrollGanttDetailIntoView));
  }
}

function setGanttFocusProject(projectId){
  openGanttProjectDetail(projectId,true);
}

function openGanttProjectWorkTab(projectId){
  if(!projectId)return;
  ganttFocusProjectId=projectId;
  ganttDetailTab='work';
  renderGantt();
  requestAnimationFrame(()=>requestAnimationFrame(scrollGanttDetailIntoView));
}

function closeGanttProjectDetail(){
  ganttFocusProjectId=null;
  ganttDetailTab='overview';
  renderGantt();
}

function setGanttDetailTab(tab){
  ganttDetailTab=tab||'overview';
  const {projs,schs}=getGanttFilteredData();
  renderGanttDetailPanel(projs,schs);
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

function renderGanttEntryViewChrome(){
  const shell=document.querySelector('#pageGantt .gantt-shell');
  const topNote=document.getElementById('ganttTopNote');
  const sidebarTitle=document.getElementById('ganttSidebarTitle');
  const sidebarSub=document.getElementById('ganttSidebarSub');
  const mainTitle=document.getElementById('ganttMainTitle');
  const mainCopy=document.getElementById('ganttMainCopy');
  const setTopNote=text=>{
    if(!topNote)return;
    topNote.textContent=text||'';
    topNote.hidden=!text;
  };
  if(shell){
    shell.classList.toggle('is-list-entry',curGanttLayout==='list');
    shell.classList.toggle('is-support-view',curGanttLayout!=='list');
    shell.classList.toggle('is-calendar-mode',curGanttLayout==='calendar');
    shell.classList.toggle('is-timeline-mode',curGanttLayout==='timeline');
    shell.classList.toggle('is-member-view',curGView==='member');
    shell.classList.toggle('is-project-view',curGView!=='member');
  }
  if(curGanttLayout==='list'){
    setTopNote('');
    if(sidebarTitle)sidebarTitle.textContent='빠른 선택';
    if(sidebarSub)sidebarSub.textContent='리스트에서 바로 상세를 열 수 있으니, 여기서는 포커스가 필요한 프로젝트만 다시 고르면 됩니다.';
    if(mainTitle)mainTitle.textContent='프로젝트 목록';
    if(mainCopy)mainCopy.textContent='상태, 기한, 진행률을 먼저 훑고 필요한 프로젝트만 아래 상세 패널로 이어서 확인하세요.';
    return;
  }
  if(curGanttLayout==='calendar'){
    setTopNote('달력은 월간 겹침과 일정 집중도를 보는 보조 보기입니다. 필요한 프로젝트를 고르면 아래 상세 패널로 같은 항목이 이어집니다.');
    if(sidebarTitle)sidebarTitle.textContent='프로젝트 리스트';
    if(sidebarSub)sidebarSub.textContent='달력에서 본 프로젝트를 다시 찾거나, 상세로 이어서 볼 항목을 여기서 빠르게 선택할 수 있습니다.';
    if(mainTitle)mainTitle.textContent='프로젝트 달력';
    if(mainCopy)mainCopy.textContent='프로젝트와 개인 일정이 언제 몰리는지 월 단위로 확인하는 보조 보기입니다. 날짜 맥락을 본 뒤 상세 패널에서 후속 작업을 이어가세요.';
    return;
  }
  if(curGView==='member'){
    setTopNote('인력별 보기는 담당자 기준으로 프로젝트와 개인 일정을 함께 보는 보조 보기입니다. 필요한 프로젝트를 선택해 아래 상세로 이어가세요.');
    if(sidebarTitle)sidebarTitle.textContent='포커스 프로젝트';
    if(sidebarSub)sidebarSub.textContent='인력 흐름을 본 뒤 실제로 관리할 프로젝트를 다시 고르는 빠른 선택 영역입니다.';
    if(mainTitle)mainTitle.textContent='인력 운영 타임라인';
    if(mainCopy)mainCopy.textContent='담당자별 프로젝트와 휴가·필드웍 일정이 어떻게 겹치는지 확인하는 보조 보기입니다. 선택된 프로젝트는 아래 상세 패널과 같은 항목으로 유지됩니다.';
    return;
  }
  setTopNote('간트는 전체 일정 흐름과 충돌을 보는 보조 보기입니다. 월간 맥락을 확인한 뒤 필요한 프로젝트를 선택해 상세 패널로 이어가세요.');
  if(sidebarTitle)sidebarTitle.textContent='포커스 프로젝트';
  if(sidebarSub)sidebarSub.textContent='타임라인을 보다가 바로 관리할 프로젝트를 다시 고를 수 있는 빠른 선택 영역입니다.';
  if(mainTitle)mainTitle.textContent='프로젝트 타임라인';
  if(mainCopy)mainCopy.textContent='프로젝트 바와 휴가·필드웍 레이어를 함께 보는 보조 보기입니다. 선택된 프로젝트는 아래 상세 패널에서 같은 항목으로 이어집니다.';
}

function getPreviousMonth(year=curYear,month=curMonth){
  if(month===1)return {year:year-1,month:12};
  return {year,month:month-1};
}

function getGanttViewRoleMeta(){
  if(curGanttLayout==='list'){
    return {
      topNote:'상단은 프로젝트 비교, 하단은 선택한 프로젝트 상세입니다.',
      sidebarTitle:'프로젝트 선택',
      sidebarSub:'목록에서 본 프로젝트를 다시 선택해 하단 상세로 이어갑니다.',
      mainTitle:'프로젝트 비교 목록',
      mainCopy:'프로젝트 단위로 비교하고, 필요할 때만 관련 업무를 가볍게 펼쳐 봅니다. 세부 관리와 조정은 하단 상세의 Work 탭에서 이어집니다.',
      detailPlaceholder:'위 목록에서 프로젝트를 선택하면 Overview / Work / Issues / Memo가 여기에서 열립니다. 실제 업무 관리는 Work 탭에서 이어집니다.',
      supportCue:''
    };
  }
  if(curGanttLayout==='calendar'){
    return {
      topNote:'상단은 날짜 기준 일정 보기, 하단은 선택한 프로젝트 상세입니다.',
      sidebarTitle:'프로젝트 선택',
      sidebarSub:'달력에서 본 프로젝트를 다시 선택해 하단 상세로 이어갑니다.',
      mainTitle:'프로젝트 일정 달력',
      mainCopy:'날짜별 일정 밀도와 마감 분포를 확인하는 보기입니다. 셀에서는 요약만 보고, 실제 업무 관리는 하단 상세의 Work 탭에서 이어집니다.',
      detailPlaceholder:'위 달력에서 프로젝트를 선택하면 상세가 여기에서 한 번 열립니다. 날짜 확인은 위에서, 업무 관리는 Work 탭에서 이어집니다.',
      supportCue:'달력에서는 날짜가 있는 업무만 가볍게 보이고, 자세한 조정은 아래 상세의 Work 탭에서 이어집니다.'
    };
  }
  if(curGView==='member'){
    return {
      topNote:'상단은 인력 기준 일정 보기, 하단은 선택한 프로젝트 상세입니다.',
      sidebarTitle:'프로젝트 선택',
      sidebarSub:'인력 흐름에서 본 프로젝트를 다시 선택해 하단 상세로 이어갑니다.',
      mainTitle:'인력별 일정 흐름',
      mainCopy:'담당자 기준으로 프로젝트와 개인 일정을 함께 훑어보는 보기입니다. 개인 일정은 제약 레이어로만 보고, 실제 프로젝트 관리는 하단 상세에서 이어갑니다.',
      detailPlaceholder:'위 인력 흐름에서 프로젝트를 선택하면 상세가 여기에서 한 번 열립니다. 개인 일정은 지원 제약으로만 보고, 업무 관리는 Work 탭에서 이어갑니다.',
      supportCue:'인력별 보기에서는 개인 일정이 제약 레이어로만 보입니다. 선택한 프로젝트의 조정은 아래 상세의 Work 탭에서 이어집니다.'
    };
  }
  return {
    topNote:'상단은 일정 흐름 보기, 하단은 선택한 프로젝트 상세입니다.',
    sidebarTitle:'프로젝트 선택',
    sidebarSub:'간트에서 본 프로젝트를 다시 선택해 하단 상세로 이어갑니다.',
    mainTitle:'프로젝트 일정 흐름',
    mainCopy:'프로젝트 기간과 지연 위험을 시간축으로 확인하는 보기입니다. 개인 일정은 지원 레이어로만 보이며, 실제 업무 관리는 하단 상세의 Work 탭에서 이어집니다.',
    detailPlaceholder:'위 간트에서 프로젝트를 선택하면 상세가 여기에서 한 번 열립니다. 일정은 위에서 보고, 업무 관리는 Work 탭에서 이어갑니다.',
    supportCue:'간트는 일정 흐름 확인용이고, 선택한 프로젝트의 자세한 조정은 아래 상세의 Work 탭에서 이어집니다.'
  };
}

function renderGanttEntryViewChromeV2(){
  const shell=document.querySelector('#pageGantt .gantt-shell');
  const topNote=document.getElementById('ganttTopNote');
  const sidebarTitle=document.getElementById('ganttSidebarTitle');
  const sidebarSub=document.getElementById('ganttSidebarSub');
  const mainTitle=document.getElementById('ganttMainTitle');
  const mainCopy=document.getElementById('ganttMainCopy');
  const roleMeta=getGanttViewRoleMeta();
  if(shell){
    shell.classList.toggle('is-list-entry',curGanttLayout==='list');
    shell.classList.toggle('is-support-view',curGanttLayout!=='list');
    shell.classList.toggle('is-calendar-mode',curGanttLayout==='calendar');
    shell.classList.toggle('is-timeline-mode',curGanttLayout==='timeline');
    shell.classList.toggle('is-member-view',curGView==='member');
    shell.classList.toggle('is-project-view',curGView!=='member');
  }
  if(topNote){
    topNote.textContent=roleMeta.topNote||'';
    topNote.hidden=!roleMeta.topNote;
  }
  if(sidebarTitle)sidebarTitle.textContent=roleMeta.sidebarTitle;
  if(sidebarSub)sidebarSub.textContent=roleMeta.sidebarSub;
  if(mainTitle)mainTitle.textContent=roleMeta.mainTitle;
  if(mainCopy)mainCopy.textContent=roleMeta.mainCopy;
  renderGanttSupportViewCueV2();
}

function getGanttKpiBaseProjects(year=curYear,month=curMonth){
  const {projs}=getGanttMonthData(year,month);
  return projs.filter(projectMatchesTopFilters);
}

function renderGanttOverviewCards(projs,schs){
  ensureGanttTopAreaControls();
  renderGanttEntryViewChromeV2();
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
  if(ganttFocusProjectId&&!projs.some(p=>p.id===ganttFocusProjectId))ganttFocusProjectId=null;
  const sorted=[...projs].sort((a,b)=>toDate(a.end)-toDate(b.end));
  el.innerHTML=sorted.map(p=>{
    const client=clients.find(c=>c.id===p.client_id);
    const issueCount=openIssuesByProject[p.id]||0;
    const hasMemo=!!(p.memo&&String(p.memo).trim());
    const isActiveCard=p.id===ganttFocusProjectId;
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
    return '<div class="gantt-project-card'+(isActiveCard?' active':'')+'" onclick="openGanttProjectDetail(\''+p.id+'\')">'
      +'<div class="gantt-project-top"><div><div class="gantt-project-name">'+esc(p.name)+'</div><div class="gantt-project-client">'+esc(client?.name||'No client')+'</div></div><span class="badge '+badgeClass+'">'+esc(p.status||'No status')+'</span></div>'
      +'<div class="gantt-project-meta">'+esc((p.start||'')+' ~ '+(p.end||''))+'</div>'
      +'<div class="gantt-project-meta">'+esc((p.members||[]).join(', ')||'No owner')+'</div>'
      +memoMeta
      +'<div class="gantt-project-warn">'+esc(warning)+'</div>'
      +(isActiveCard?'<div class="gantt-project-selection-hint">선택됨 · 아래 상세 패널에서 바로 후속 작업을 이어서 처리할 수 있습니다.</div>':'')
      +'</div>';
  }).join('');
};

function renderGanttDetailPlaceholder(){
  const roleMeta=getGanttViewRoleMeta();
  return ''
    +'<div class="gantt-detail-placeholder">'
      +'<div class="gantt-detail-context">선택한 프로젝트 상세</div>'
      +'<div class="gantt-panel-title">프로젝트를 선택하면 여기에서 상세를 봅니다.</div>'
      +'<div class="gantt-panel-sub">'+esc(roleMeta.detailPlaceholder)+'</div>'
      +'<div class="gantt-detail-placeholder-roles">'
        +'<span class="gantt-detail-placeholder-chip">Overview는 요약</span>'
        +'<span class="gantt-detail-placeholder-chip">Work는 업무 관리</span>'
      +'</div>'
    +'</div>';
}

renderGanttDetailPanel=function(projs,schs){
  const el=document.getElementById('ganttDetail');
  if(!el)return;
  const project=projs.find(p=>p.id===ganttFocusProjectId)||null;
  if(!project){
    el.innerHTML=renderGanttDetailPlaceholder();
    return;
  }
  if(!project){
    el.innerHTML='<div class="gantt-detail-empty-state"><div class="gantt-detail-context">선택된 프로젝트</div><div class="gantt-panel-title">프로젝트 상세</div><div class="gantt-panel-sub">왼쪽 리스트나 간트, 달력, 리스트 뷰에서 프로젝트를 선택하면 여기에서 같은 상세 정보와 후속 작업을 이어서 볼 수 있습니다.</div></div>';
    return;
  }
  const client=clients.find(c=>c.id===project.client_id)||null;
  const linkedContract=getGanttDetailLinkedContract(project);
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

function buildGanttCalendarItemMap(projs,schs){
  const itemMap={};
  const monthBounds=getGanttMonthBounds();
  const monthFirst=new Date(monthBounds.first.getFullYear(),monthBounds.first.getMonth(),monthBounds.first.getDate());
  const monthLast=new Date(monthBounds.last.getFullYear(),monthBounds.last.getMonth(),monthBounds.last.getDate());
  const pushItem=(dateValue,item)=>{
    if(!itemMap[dateValue])itemMap[dateValue]=[];
    itemMap[dateValue].push(item);
  };
  (projs||[]).forEach(project=>{
    const startDate=toDate(project?.start||project?.start_date||'');
    const endDate=toDate(project?.end||project?.end_date||'');
    if(Number.isNaN(startDate.getTime())||Number.isNaN(endDate.getTime()))return;
    if(startDate>monthLast||endDate<monthFirst)return;
    const visibleStart=startDate<monthFirst?new Date(monthFirst):new Date(startDate.getFullYear(),startDate.getMonth(),startDate.getDate());
    const visibleEnd=endDate>monthLast?new Date(monthLast):new Date(endDate.getFullYear(),endDate.getMonth(),endDate.getDate());
    for(let cursor=new Date(visibleStart);cursor<=visibleEnd;cursor.setDate(cursor.getDate()+1)){
      const dateValue=getGanttCalendarDateValue(cursor);
      if(!dateValue)continue;
      pushItem(dateValue,{
        kind:'project',
        id:project.id,
        label:project.name,
        title:[project.name,project.type||'',(project.members||[]).join(', ')].filter(Boolean).join(' | '),
        color:TYPES[project.type]||'#4e5968',
        dueToday:isDueToday(project)&&getGanttCalendarDateValue(endDate)===dateValue
      });
    }
  });
  (schs||[]).forEach(schedule=>{
    const startDate=toDate(schedule?.start||'');
    const endDate=toDate(schedule?.end||'');
    if(Number.isNaN(startDate.getTime())||Number.isNaN(endDate.getTime()))return;
    if(startDate>monthLast||endDate<monthFirst)return;
    const labelBase=schedule.title||scheduleLabel(schedule.schedule_type);
    const visibleStart=startDate<monthFirst?new Date(monthFirst):new Date(startDate.getFullYear(),startDate.getMonth(),startDate.getDate());
    const visibleEnd=endDate>monthLast?new Date(monthLast):new Date(endDate.getFullYear(),endDate.getMonth(),endDate.getDate());
    for(let cursor=new Date(visibleStart);cursor<=visibleEnd;cursor.setDate(cursor.getDate()+1)){
      const dateValue=getGanttCalendarDateValue(cursor);
      if(!dateValue)continue;
      pushItem(dateValue,{
        kind:'schedule',
        id:schedule.id,
        label:(schedule.member_name?schedule.member_name+' 쨌 ':'')+labelBase,
        title:[labelBase,schedule.member_name||'',schedule.location||'',schedule.memo||''].filter(Boolean).join(' | '),
        color:scheduleColor(schedule.schedule_type)
      });
    }
  });
  Object.keys(itemMap).forEach(dateValue=>{
    itemMap[dateValue].sort((a,b)=>{
      if(a.kind!==b.kind)return a.kind==='project'?-1:1;
      return a.label.localeCompare(b.label,'ko');
    });
  });
  return itemMap;
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
  const itemMap=buildGanttCalendarItemMap(projs,schs);
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
    const items=itemMap[getGanttCalendarDateValue(cellDate)]||[];
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

function getGanttListTaskSummary(projectId){
  const key=String(projectId||'');
  return ganttListTaskSummaryByProjectId[key]||null;
}

function buildGanttListTaskSummary(tasks){
  const rows=Array.isArray(tasks)?tasks:[];
  let overdueCount=0;
  let dueSoonCount=0;
  let unassignedCount=0;
  let openCount=0;
  let waitingCount=0;
  let inProgressCount=0;
  let nearestDueValue='';
  let nearestDueTitle='';
  rows.forEach(task=>{
    const status=String(task?.status||'예정').trim()||'예정';
    const dueMeta=getGanttTaskDueMeta(task);
    if(dueMeta.tone==='danger')overdueCount+=1;
    if(dueMeta.tone==='warn')dueSoonCount+=1;
    if(!String(task?.assignee_member_id||'').trim()&&status!=='완료')unassignedCount+=1;
    if(status!=='완료'){
      openCount+=1;
      if(status==='대기'||status==='보류')waitingCount+=1;
      if(status==='진행중')inProgressCount+=1;
    }
    if(status==='완료')return;
    const dueValue=getGanttTaskDateValue(task?.due_date);
    if(!dueValue)return;
    if(!nearestDueValue||dueValue<nearestDueValue){
      nearestDueValue=dueValue;
      nearestDueTitle=String(task?.title||'').trim();
    }
  });
  return {
    total:rows.length,
    openCount,
    overdueCount,
    dueSoonCount,
    waitingCount,
    inProgressCount,
    unassignedCount,
    nearestDueValue,
    nearestDueLabel:nearestDueValue?formatGanttTaskShortDate(nearestDueValue):'',
    nearestDueTitle
  };
}

function getGanttListTaskSummaryText(summary){
  if(!summary||!summary.total)return '';
  const parts=['업무 '+summary.total+'건'];
  if(summary.overdueCount>0)parts.push('지연 '+summary.overdueCount+'건');
  else if(summary.dueSoonCount>0)parts.push('임박 '+summary.dueSoonCount+'건');
  if(summary.unassignedCount>0)parts.push('무담당 '+summary.unassignedCount+'건');
  else if(summary.nearestDueLabel)parts.push('다음 '+summary.nearestDueLabel);
  return parts.join(' · ');
}

function getGanttListTaskSummaryTitle(summary){
  if(!summary||!summary.total)return '';
  const parts=['업무 '+summary.total+'건'];
  if(summary.openCount>0)parts.push('열린 업무 '+summary.openCount+'건');
  if(summary.overdueCount>0)parts.push('지연 '+summary.overdueCount+'건');
  else if(summary.dueSoonCount>0)parts.push('기한 임박 '+summary.dueSoonCount+'건');
  if(summary.unassignedCount>0)parts.push('무담당 '+summary.unassignedCount+'건');
  if(summary.nearestDueLabel&&summary.nearestDueTitle){
    parts.push('가장 가까운 업무: '+summary.nearestDueTitle+' ('+summary.nearestDueLabel+')');
  }
  return parts.join(' · ');
}

function getGanttListTaskIssueSummary(projectId){
  return ganttListTaskIssueSummaryByProjectId[String(projectId||'')]||null;
}

function refreshGanttOverviewDetailIfNeeded(projectIds){
  const focusId=String(ganttFocusProjectId||'').trim();
  const ids=[...new Set((projectIds||[]).map(id=>String(id||'').trim()).filter(Boolean))];
  if(!focusId||ganttDetailTab!=='overview'||!ids.includes(focusId))return;
  const currentData=getGanttFilteredData();
  renderGanttDetailPanel(currentData.projs,currentData.schs);
}

async function loadGanttListTaskSummaries(projectIds){
  const ids=[...new Set((projectIds||[]).map(id=>String(id||'')).filter(Boolean))];
  const missingIds=ids.filter(id=>ganttListTaskSummaryByProjectId[id]===undefined&&!ganttListTaskSummaryLoadingProjectIds.has(id));
  if(!missingIds.length)return;
  missingIds.forEach(id=>ganttListTaskSummaryLoadingProjectIds.add(id));
  try{
    const rows=await api(
      'GET',
      GANTT_PROJECT_TASK_TABLE+'?project_id=in.('+missingIds.join(',')+')&select=project_id,title,status,due_date,assignee_member_id'
    );
    const grouped={};
    missingIds.forEach(id=>{grouped[id]=[];});
    (Array.isArray(rows)?rows:[]).forEach(task=>{
      const projectId=String(task?.project_id||'');
      if(grouped[projectId])grouped[projectId].push(task);
    });
    missingIds.forEach(id=>{
      ganttListTaskSummaryByProjectId[id]=buildGanttListTaskSummary(grouped[id]||[]);
    });
  }catch(error){
    missingIds.forEach(id=>{
      ganttListTaskSummaryByProjectId[id]=null;
    });
  }finally{
    missingIds.forEach(id=>ganttListTaskSummaryLoadingProjectIds.delete(id));
  }
  if(curGanttLayout==='list'){
    refreshGanttActiveViewOnly();
  }
  refreshGanttOverviewDetailIfNeeded(ids);
}

async function loadGanttListTaskIssueSummaries(projectIds){
  const ids=[...new Set((projectIds||[]).map(id=>String(id||'')).filter(Boolean))];
  const missingIds=ids.filter(id=>ganttListTaskIssueSummaryByProjectId[id]===undefined&&!ganttListTaskIssueSummaryLoadingProjectIds.has(id));
  if(!missingIds.length)return;
  missingIds.forEach(id=>ganttListTaskIssueSummaryLoadingProjectIds.add(id));
  try{
    const rows=await api(
      'GET',
      'project_issues?project_id=in.('+missingIds.join(',')+')'
      +'&'+(typeof getIssueActiveStatusFilter==='function'?getIssueActiveStatusFilter():'status=neq.resolved')
      +'&select=project_id,task_id'
    );
    const grouped={};
    missingIds.forEach(id=>{grouped[id]=new Set();});
    (Array.isArray(rows)?rows:[]).forEach(issue=>{
      const projectId=String(issue?.project_id||'');
      const taskId=String(issue?.task_id||'').trim();
      if(grouped[projectId]&&taskId)grouped[projectId].add(taskId);
    });
    missingIds.forEach(id=>{
      ganttListTaskIssueSummaryByProjectId[id]={issueLinkedTaskCount:grouped[id]?.size||0};
    });
  }catch(error){
    missingIds.forEach(id=>{
      ganttListTaskIssueSummaryByProjectId[id]=null;
    });
  }finally{
    missingIds.forEach(id=>ganttListTaskIssueSummaryLoadingProjectIds.delete(id));
  }
  if(curGanttLayout==='list')refreshGanttActiveViewOnly();
  refreshGanttOverviewDetailIfNeeded(ids);
}

async function loadGanttListPendingDocSummaries(projectIds){
  window.ganttProjectPendingDocSummaryByProjectId=window.ganttProjectPendingDocSummaryByProjectId||{};
  window.ganttProjectPendingDocSummaryLoadingIds=window.ganttProjectPendingDocSummaryLoadingIds instanceof Set
    ?window.ganttProjectPendingDocSummaryLoadingIds
    :new Set();
  const ids=[...new Set((projectIds||[]).map(id=>String(id||'')).filter(Boolean))];
  const cache=window.ganttProjectPendingDocSummaryByProjectId;
  const loadingIds=window.ganttProjectPendingDocSummaryLoadingIds;
  const missingIds=ids.filter(id=>cache[id]===undefined&&!loadingIds.has(id));
  if(!missingIds.length)return;
  missingIds.forEach(id=>loadingIds.add(id));
  try{
    const rows=await api(
      'GET',
      'document_requests?project_id=in.('+missingIds.join(',')+')'
      +'&status=eq.pending'
      +'&select=project_id,due_date'
      +'&order=sort_order.asc'
    );
    const grouped={};
    missingIds.forEach(id=>{grouped[id]=[];});
    (Array.isArray(rows)?rows:[]).forEach(row=>{
      const projectId=String(row?.project_id||'');
      if(grouped[projectId])grouped[projectId].push(row);
    });
    missingIds.forEach(id=>{
      const docs=grouped[id]||[];
      const nearestDueValue=docs.map(doc=>getGanttTaskDateValue(doc?.due_date)).filter(Boolean).sort()[0]||'';
      cache[id]={
        total:docs.length,
        nearestDueValue,
        nearestDueLabel:nearestDueValue?formatGanttTaskShortDate(nearestDueValue):''
      };
    });
  }catch(error){
    missingIds.forEach(id=>{
      cache[id]=null;
    });
  }finally{
    missingIds.forEach(id=>loadingIds.delete(id));
  }
  if(curGanttLayout==='list')refreshGanttActiveViewOnly();
  refreshGanttOverviewDetailIfNeeded(ids);
}

function getGanttListRiskMeta(project,issueCount,taskSummary,taskIssueSummary,pendingDocSummary){
  if(isGanttProjectOverdue(project))return {label:'지연',tone:'danger',rank:5,detail:'프로젝트 기한이 지났습니다'};
  if(isDueToday(project))return {label:'오늘 마감',tone:'warn',rank:4.2,detail:'오늘 종료 예정입니다'};
  if(Number(taskSummary?.overdueCount||0)>0)return {label:'업무 지연',tone:'warn',rank:3.8,detail:'지연 업무 '+taskSummary.overdueCount+'건'};
  if(Number(issueCount||0)>0)return {label:'이슈',tone:'issue',rank:3.2,detail:'미해결 이슈 '+issueCount+'건'};
  if(Number(taskIssueSummary?.issueLinkedTaskCount||0)>0)return {label:'연결 이슈',tone:'issue',rank:2.9,detail:'업무 연결 이슈 '+taskIssueSummary.issueLinkedTaskCount+'건'};
  if(Number(pendingDocSummary?.total||0)>0)return {label:'자료 확인',tone:'warn',rank:2.6,detail:'자료 요청 확인 필요'};
  if(Number(taskSummary?.unassignedCount||0)>0)return {label:'무담당',tone:'neutral',rank:2.2,detail:'담당 확인이 필요한 업무가 있습니다'};
  return {label:'정상',tone:'safe',rank:1,detail:'현재 위험 신호 없음'};
}

function getGanttListProjectRows(projs){
  return (projs||[]).map(project=>{
    const clientName=getGanttProjectClientName(project)||'고객사 미지정';
    const memberNames=[...(project.members||[])];
    const billingAmount=getGanttProjectBillingAmount(project);
    const billingStatus=getGanttListBillingStatus(project);
    const issueCount=openIssuesByProject[project.id]||0;
    const progressPercent=getGanttProjectProgress(project);
    const taskSummary=getGanttListTaskSummary(project.id);
    const taskIssueSummary=getGanttListTaskIssueSummary(project.id);
    const pendingDocSummary=(window.ganttProjectPendingDocSummaryByProjectId||{})[String(project.id||'')]||null;
    const riskMeta=getGanttListRiskMeta(project,issueCount,taskSummary,taskIssueSummary,pendingDocSummary);
    const periodText=(project.start||project.start_date||'')+' ~ '+(project.end||project.end_date||'');
    const searchText=[clientName,project?.name||'',project?.type||'',memberNames.join(' ')].join(' ').toLowerCase();
    const status=String(project?.status||'예정').trim()||'예정';
    return {
      project,
      clientName,
      typeText:String(project?.type||'기타').trim()||'기타',
      memberText:memberNames.join(', ')||'담당자 미지정',
      billingAmount,
      billingStatus,
      issueCount,
      progressPercent,
      taskSummary,
      taskIssueSummary,
      pendingDocSummary,
      taskSummaryText:getGanttListTaskSummaryText(taskSummary),
      taskSummaryTitle:getGanttListTaskSummaryTitle(taskSummary),
      riskMeta,
      periodText,
      status,
      priority:String(project?.priority||'medium').trim()||'medium',
      searchText
    };
  });
}

function getGanttListProjectMetaItems(row){
  const items=[];
  if(Number(row?.taskSummary?.openCount||0)>0)items.push({label:'열린 '+row.taskSummary.openCount,tone:'neutral'});
  else if(Number(row?.taskSummary?.total||0)>0)items.push({label:'업무 '+row.taskSummary.total,tone:'neutral'});
  if(Number(row?.taskSummary?.overdueCount||0)>0)items.push({label:'지연 '+row.taskSummary.overdueCount,tone:'warn'});
  else if(Number(row?.taskSummary?.dueSoonCount||0)>0)items.push({label:'임박 '+row.taskSummary.dueSoonCount,tone:'warn'});
  if(Number(row?.taskIssueSummary?.issueLinkedTaskCount||0)>0)items.push({label:'이슈연결 '+row.taskIssueSummary.issueLinkedTaskCount,tone:'issue'});
  else if(row?.taskSummary?.nearestDueLabel)items.push({label:'다음 '+row.taskSummary.nearestDueLabel,tone:'neutral'});
  return items.slice(0,3);
}

function toggleGanttListTaskDrilldown(projectId){
  const key=String(projectId||'').trim();
  if(!key)return;
  if(ganttListExpandedProjectIds.includes(key)){
    ganttListExpandedProjectIds=ganttListExpandedProjectIds.filter(id=>id!==key);
    ganttListExpandedMoreProjectIds=ganttListExpandedMoreProjectIds.filter(id=>id!==key);
    renderGantt();
    return;
  }
  ganttListExpandedProjectIds=[...ganttListExpandedProjectIds,key];
  renderGantt();
  Promise.all([
    loadGanttProjectTasks(key,false),
    loadGanttProjectTaskIssueCounts(key,false)
  ]).finally(()=>{
    if(curGanttLayout==='list')refreshGanttActiveViewOnly();
  });
}

function toggleGanttListTaskDrilldownMore(projectId){
  const key=String(projectId||'').trim();
  if(!key)return;
  if(ganttListExpandedMoreProjectIds.includes(key))ganttListExpandedMoreProjectIds=ganttListExpandedMoreProjectIds.filter(id=>id!==key);
  else ganttListExpandedMoreProjectIds=[...ganttListExpandedMoreProjectIds,key];
  renderGantt();
}

function getGanttListTaskTextBlob(task){
  return [
    task?.title||'',
    task?.description||'',
    task?.status||'',
    task?.priority||''
  ].join(' ').toLowerCase();
}

function isGanttListLeadershipRelevantTask(task){
  return /감사|audit|보고|report|결산|패키지|자료|문서|증빙|제출|고객|미팅|커뮤니케이션|컨펌|청구|수금|계약|invoice|billing|collection/i.test(getGanttListTaskTextBlob(task));
}

function getGanttListTaskFocusMeta(task,row){
  const dueMeta=getGanttTaskDueMeta(task);
  const issueCount=getGanttTaskLinkedIssueCount(row?.project?.id,task?.id);
  const status=String(task?.status||'').trim();
  const textBlob=getGanttListTaskTextBlob(task);
  const hasPendingDocs=Number(row?.pendingDocSummary?.total||0)>0;
  const reasons=[];
  let score=0;
  if(dueMeta.tone==='danger'){
    score+=100;
    reasons.push('지연');
  }else if(dueMeta.label==='오늘 마감'){
    score+=85;
    reasons.push('오늘 마감');
  }else if(dueMeta.tone==='warn'){
    score+=70;
    reasons.push('기한 임박');
  }
  if(issueCount>0){
    score+=60;
    reasons.push('이슈 연결');
  }
  if((status==='대기'||status==='보류')&&hasPendingDocs){
    score+=55;
    reasons.push('자료 확인 필요');
  }else if(status==='대기'||status==='보류'){
    score+=38;
    reasons.push(status==='대기'?'대기':'보류');
  }
  if(isGanttListLeadershipRelevantTask(task)){
    score+=25;
    if(/청구|수금|계약|invoice|billing|collection/i.test(textBlob))reasons.push('계약/청구 영향');
    else if(/고객|미팅|커뮤니케이션|컨펌/i.test(textBlob))reasons.push('고객 대응 영향');
    else if(/자료|문서|증빙|제출/i.test(textBlob))reasons.push('자료 영향');
    else reasons.push('주요 업무');
  }
  if(!String(task?.assignee_member_id||'').trim()&&score>0){
    score+=12;
    reasons.push('담당 확인');
  }
  return {
    score,
    issueCount,
    dueMeta,
    reasons:[...new Set(reasons)]
  };
}

function getGanttListProjectKeyTasks(row){
  const projectId=String(row?.project?.id||'').trim();
  if(!projectId)return [];
  const tasks=getGanttProjectTasks(projectId).filter(task=>String(task?.status||'').trim()!=='완료');
  return tasks.map(task=>{
    const focusMeta=getGanttListTaskFocusMeta(task,row);
    if(focusMeta.score<45)return null;
    return {
      task,
      focusMeta
    };
  }).filter(Boolean).sort((a,b)=>{
    if(b.focusMeta.score!==a.focusMeta.score)return b.focusMeta.score-a.focusMeta.score;
    const dueA=getGanttTaskDateValue(a.task?.due_date)||'9999-12-31';
    const dueB=getGanttTaskDateValue(b.task?.due_date)||'9999-12-31';
    if(dueA!==dueB)return dueA.localeCompare(dueB);
    return String(a.task?.title||'').localeCompare(String(b.task?.title||''),'ko');
  });
}

function getGanttListTaskDrillTone(task,focusMeta){
  if(focusMeta?.dueMeta?.tone==='danger')return 'danger';
  if(focusMeta?.issueCount>0)return 'issue';
  if(focusMeta?.dueMeta?.tone==='warn'||task?.status==='대기'||task?.status==='보류')return 'warn';
  return 'neutral';
}

function renderGanttListTaskDrilldownRow(row){
  const projectId=String(row?.project?.id||'').trim();
  if(!projectId)return '';
  const loadMeta=getGanttProjectTaskLoadMeta(projectId);
  const hasTaskRows=Array.isArray(ganttProjectTasksByProjectId[projectId]);
  const keyTasks=hasTaskRows?getGanttListProjectKeyTasks(row):[];
  const showAll=ganttListExpandedMoreProjectIds.includes(projectId);
  const visibleTasks=showAll?keyTasks:keyTasks.slice(0,GANTT_LIST_TASK_DRILL_LIMIT);
  const hiddenCount=Math.max(0,keyTasks.length-visibleTasks.length);
  let bodyHtml='';
  if(loadMeta.loading&&!hasTaskRows){
    bodyHtml='<div class="gantt-list-task-drill-empty">핵심 업무를 불러오는 중입니다.</div>';
  }else if(loadMeta.error){
    bodyHtml='<div class="gantt-list-task-drill-empty">'+esc(loadMeta.error)+'</div>';
  }else if(!visibleTasks.length){
    bodyHtml='<div class="gantt-list-task-drill-empty">지금 이 목록에서 따로 펼칠 핵심 업무는 없습니다. 상세 조정은 Work 탭에서 이어집니다.</div>';
  }else{
    bodyHtml='<div class="gantt-list-task-drill-items">'
      +visibleTasks.map(item=>{
        const task=item.task;
        const focusMeta=item.focusMeta;
        const tone=getGanttListTaskDrillTone(task,focusMeta);
        const assignee=getGanttTaskMemberName(task?.assignee_member_id)||'담당자 미지정';
        const dateMeta=getGanttTaskDateDisplayMeta(task);
        const cueLabel=focusMeta.reasons[0]||focusMeta.dueMeta?.label||'확인 필요';
        return '<button type="button" class="gantt-list-task-drill-item is-'+tone+'" onclick="event.stopPropagation();openGanttProjectWorkTab(\''+projectId+'\')">'
          +'<div class="gantt-list-task-drill-main">'
            +'<div class="gantt-list-task-drill-name">'+esc(task?.title||'제목 없는 업무')+'</div>'
            +'<div class="gantt-list-task-drill-meta"><span>'+esc(assignee)+'</span><span>'+esc(dateMeta.dueText)+'</span></div>'
          +'</div>'
          +'<div class="gantt-list-task-drill-side">'
            +'<span class="badge '+getGanttTaskStatusBadgeClass(task?.status)+'">'+esc(task?.status||'예정')+'</span>'
            +'<span class="gantt-list-mini-chip is-'+tone+'">'+esc(cueLabel)+'</span>'
          +'</div>'
        +'</button>';
      }).join('')
    +'</div>';
  }
  return '<tr class="gantt-list-child-row">'
    +'<td class="gantt-list-check-col"></td>'
    +'<td colspan="8">'
      +'<div class="gantt-list-task-drill-shell">'
        +'<div class="gantt-list-task-drill-head">'
        +'<div><div class="gantt-list-task-drill-title">핵심 업무</div><div class="gantt-list-task-drill-sub">프로젝트 비교는 그대로 두고, 리스크나 다음 확인이 필요한 업무만 가볍게 펼쳐 봅니다.</div></div>'
          +'<button type="button" class="btn ghost sm" onclick="event.stopPropagation();openGanttProjectWorkTab(\''+projectId+'\')">Work 보기</button>'
        +'</div>'
        +bodyHtml
        +'<div class="gantt-list-task-drill-footer">'
          +(hiddenCount?'<button type="button" class="gantt-list-drill-more" onclick="event.stopPropagation();toggleGanttListTaskDrilldownMore(\''+projectId+'\')">'+(showAll?'핵심 업무 접기':'핵심 업무 '+hiddenCount+'건 더 보기')+'</button>':'<span class="gantt-list-task-drill-note">상세 관리와 조정은 Work 탭에서 이어집니다.</span>')
          +(!hiddenCount&&visibleTasks.length?'<span class="gantt-list-task-drill-note">세부 조정은 Work 탭에서 이어집니다.</span>':'')
        +'</div>'
      +'</div>'
    +'</td>'
  +'</tr>';
}

function getGanttListExecutionSignalItems(row){
  const items=[];
  if(row?.riskMeta?.label&&row.riskMeta.label!=='정상')items.push({label:row.riskMeta.label,tone:row.riskMeta.tone});
  if(Number(row?.taskSummary?.overdueCount||0)>0&&row?.riskMeta?.label!=='업무 지연')items.push({label:'지연 '+row.taskSummary.overdueCount,tone:'warn'});
  if(Number(row?.issueCount||0)>0&&row?.riskMeta?.label!=='이슈')items.push({label:'이슈 '+row.issueCount,tone:'issue'});
  else if(Number(row?.taskIssueSummary?.issueLinkedTaskCount||0)>0&&row?.riskMeta?.label!=='연결 이슈')items.push({label:'연결이슈 '+row.taskIssueSummary.issueLinkedTaskCount,tone:'issue'});
  if(Number(row?.pendingDocSummary?.total||0)>0&&row?.riskMeta?.label!=='자료 확인')items.push({label:'자료 확인',tone:'warn'});
  if(Number(row?.taskSummary?.unassignedCount||0)>0&&row?.riskMeta?.label!=='무담당')items.push({label:'무담당 '+row.taskSummary.unassignedCount,tone:'neutral'});
  if(!items.length)items.push({label:'정상',tone:'safe'});
  return items.slice(0,3);
}

function renderGanttListMetaChips(items){
  return (items||[]).map(item=>'<span class="gantt-list-mini-chip is-'+esc(item.tone||'neutral')+'">'+esc(item.label||'')+'</span>').join('');
}

function renderGanttListAttentionBadges(row){
  return '<div class="gantt-list-attention-badges">'+renderGanttListMetaChips(getGanttListExecutionSignalItems(row))+'</div>';
}

function getGanttListSignalBarMarkup(overdueRows,dueTodayRows,issueAttentionRows,overdueTaskCount){
  const chips=[];
  if(overdueRows.length)chips.push('<div class="gantt-list-signal-chip is-danger">지연 '+overdueRows.length+'건</div>');
  if(dueTodayRows.length)chips.push('<div class="gantt-list-signal-chip is-warn">오늘 마감 '+dueTodayRows.length+'건</div>');
  if(Number(overdueTaskCount||0)>0)chips.push('<div class="gantt-list-signal-chip is-warn">업무 지연 '+overdueTaskCount+'건</div>');
  if(issueAttentionRows.length)chips.push('<div class="gantt-list-signal-chip is-issue">미해결 이슈 '+issueAttentionRows.length+'건</div>');
  if(!chips.length)chips.push('<div class="gantt-list-signal-chip is-safe">주의 신호 없음</div>');
  return chips.join('');
}

function getGanttListAttentionSubtext(row){
  const items=getGanttListExecutionSignalItems(row).map(item=>item.label);
  if(items.length)return items.join(' · ');
  return row?.riskMeta?.detail||'현재 위험 신호 없음';
}

function toggleGanttListExecutionRiskFilter(key){
  const value=String(key||'').trim();
  if(!value)return;
  if(ganttListExecutionRiskFilters.includes(value))ganttListExecutionRiskFilters=ganttListExecutionRiskFilters.filter(item=>item!==value);
  else ganttListExecutionRiskFilters=[...ganttListExecutionRiskFilters,value];
  renderGantt();
}

function getGanttListExecutionRiskFilterOptions(){
  return [
    {value:'overdue_task',label:'업무 지연'},
    {value:'issue_linked',label:'연결 이슈'},
    {value:'due_soon',label:'기한 임박'},
    {value:'unassigned_task',label:'무담당'},
    {value:'material_waiting',label:'자료 확인'}
  ];
}

function renderGanttListExecutionRiskFilterRow(){
  const options=getGanttListExecutionRiskFilterOptions();
  return '<div class="gantt-list-quickfilters">'
    +options.map(option=>'<button type="button" class="gantt-list-filter-chip'+(ganttListExecutionRiskFilters.includes(option.value)?' active':'')+'" onclick="toggleGanttListExecutionRiskFilter(\''+option.value+'\')">'+option.label+'</button>').join('')
  +'</div>';
}

function rowMatchesGanttListExecutionRiskFilters(row){
  if(!ganttListExecutionRiskFilters.length)return true;
  return ganttListExecutionRiskFilters.every(filterKey=>{
    if(filterKey==='overdue_task')return Number(row?.taskSummary?.overdueCount||0)>0;
    if(filterKey==='issue_linked')return Number(row?.taskIssueSummary?.issueLinkedTaskCount||0)>0;
    if(filterKey==='due_soon')return Number(row?.taskSummary?.dueSoonCount||0)>0;
    if(filterKey==='unassigned_task')return Number(row?.taskSummary?.unassignedCount||0)>0;
    if(filterKey==='material_waiting')return Number(row?.pendingDocSummary?.total||0)>0;
    return true;
  });
}

function filterGanttListRows(rows){
  const query=String(ganttListSearchQuery||'').trim().toLowerCase();
  return rows.filter(row=>{
    if(query&&!row.searchText.includes(query))return false;
    return rowMatchesGanttListExecutionRiskFilters(row);
  });
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
  if(key==='progress')return Number(a.progressPercent||0)-Number(b.progressPercent||0);
  if(key==='risk')return Number(a.riskMeta?.rank||0)-Number(b.riskMeta?.rank||0);
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

function getGanttListRiskBadgeClass(riskMeta){
  if(riskMeta?.tone==='danger')return 'badge-red';
  if(riskMeta?.tone==='warn')return 'badge-orange';
  if(riskMeta?.tone==='issue')return 'badge-blue';
  return 'badge-green';
}

function renderGanttListView(projs,schs){
  const wrap=document.getElementById('ganttWrap');
  if(!wrap)return;
  const legend=document.getElementById('legend');
  if(legend)legend.innerHTML='';
  const projectIds=(projs||[]).map(project=>project?.id);
  loadGanttListTaskSummaries(projectIds);
  loadGanttListTaskIssueSummaries(projectIds);
  loadGanttListPendingDocSummaries(projectIds);
  const rows=sortGanttListRows(filterGanttListRows(getGanttListProjectRows(projs)));
  const visibleProjectIds=new Set(rows.map(row=>String(row.project?.id||'')));
  ganttListSelectedIds=ganttListSelectedIds.filter(id=>visibleProjectIds.has(String(id)));
  ganttListExpandedProjectIds=ganttListExpandedProjectIds.filter(id=>visibleProjectIds.has(String(id)));
  ganttListExpandedMoreProjectIds=ganttListExpandedMoreProjectIds.filter(id=>visibleProjectIds.has(String(id)));
  const selectableRows=rows.filter(row=>canManageGanttListProject(row.project));
  const selectedSet=new Set(ganttListSelectedIds.map(id=>String(id)));
  const allSelected=!!selectableRows.length&&selectableRows.every(row=>selectedSet.has(String(row.project?.id||'')));
  const availableMembers=getAvailableGanttMembers();
  const overdueRows=rows.filter(row=>row.riskMeta?.tone==='danger');
  const dueTodayRows=rows.filter(row=>row.riskMeta?.label==='오늘 마감');
  const issueAttentionRows=rows.filter(row=>row.issueCount>0);
  const overdueTaskCount=rows.reduce((sum,row)=>sum+Number(row.taskSummary?.overdueCount||0),0);
  if(!rows.length){
    wrap.innerHTML='<div class="empty-state" style="padding:40px">현재 필터에서 표시할 프로젝트가 없습니다.</div>';
    return;
  }
  wrap.innerHTML='<div class="gantt-list-view">'
    +'<div class="gantt-list-toolbar">'
      +'<div class="gantt-list-toolbar-main">'
        +'<input id="ganttListSearchInput" class="gantt-list-search" value="'+esc(ganttListSearchQuery)+'" placeholder="프로젝트명 / 고객사명 / 담당자명 검색" />'
        +'<div class="gantt-list-count">총 '+rows.length+'건 · 위에서 프로젝트를 비교하고, 아래에서 선택한 프로젝트 상세를 확인합니다.</div>'
      +'</div>'
      +(ganttListSelectedIds.length?'<div class="gantt-list-selection-summary">'+ganttListSelectedIds.length+'건 선택됨</div>':'')
    +'</div>'
    +'<div class="gantt-list-signalbar">'
      +getGanttListSignalBarMarkup(overdueRows,dueTodayRows,issueAttentionRows,overdueTaskCount)
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
        +'<th><button type="button" class="gantt-list-sort-btn" onclick="sortGanttListBy(\'members\')">담당자'+getGanttListSortIndicator('members')+'</button></th>'
        +'<th><button type="button" class="gantt-list-sort-btn" onclick="sortGanttListBy(\'period\')">기간'+getGanttListSortIndicator('period')+'</button></th>'
        +'<th><button type="button" class="gantt-list-sort-btn" onclick="sortGanttListBy(\'status\')">상태'+getGanttListSortIndicator('status')+'</button></th>'
        +'<th><button type="button" class="gantt-list-sort-btn" onclick="sortGanttListBy(\'progress\')">진행률'+getGanttListSortIndicator('progress')+'</button></th>'
        +'<th><button type="button" class="gantt-list-sort-btn" onclick="sortGanttListBy(\'risk\')">주의'+getGanttListSortIndicator('risk')+'</button></th>'
        +'<th><button type="button" class="gantt-list-sort-btn" onclick="sortGanttListBy(\'billing_status\')">빌링 상태'+getGanttListSortIndicator('billing_status')+'</button></th>'
      +'</tr></thead>'
      +'<tbody>'
      +rows.map(row=>{
        const project=row.project;
        const projectId=String(project?.id||'');
        const selected=selectedSet.has(String(project.id));
        const canManage=canManageGanttListProject(project);
        const metaItems=getGanttListProjectMetaItems(row);
        const hasTaskSummary=Number(row?.taskSummary?.total||0)>0;
        const isExpanded=ganttListExpandedProjectIds.includes(projectId);
        const loadedKeyTaskCount=Array.isArray(ganttProjectTasksByProjectId[projectId])?getGanttListProjectKeyTasks(row).length:0;
        const drillCount=loadedKeyTaskCount||Number(row?.taskSummary?.openCount||row?.taskSummary?.total||0);
        const rowStateClass=isGanttProjectOverdue(project)
          ?' is-overdue'
          :isDueToday(project)
            ?' is-due-today'
            :row.riskMeta?.tone==='issue'
              ?' is-issue-risk'
              :row.riskMeta?.tone==='warn'
                ?' is-attention'
                :'';
        const mainRow='<tr class="gantt-list-row'+(selected?' is-selected':'')+rowStateClass+'" onclick="openGanttProjectDetail(\''+project.id+'\')">'
          +'<td class="gantt-list-check-col" onclick="event.stopPropagation()"><input type="checkbox" '+(selected?'checked ':'')+(canManage?'':'disabled ')+'onchange="toggleGanttListProjectSelection(\''+project.id+'\')" /></td>'
          +'<td>'+esc(row.clientName)+'</td>'
          +'<td><div class="gantt-list-project-name">'+esc(project.name||'프로젝트명 없음')+'</div><div class="gantt-list-project-sub">'+esc(row.typeText)+'</div>'+(metaItems.length?'<div class="gantt-list-project-metachips" title="'+esc(row.taskSummaryTitle||'')+'">'+renderGanttListMetaChips(metaItems)+'</div>':'')+(hasTaskSummary?'<div class="gantt-list-project-actions"><button type="button" class="gantt-list-drill-toggle'+(isExpanded?' active':'')+'" onclick="event.stopPropagation();toggleGanttListTaskDrilldown(\''+project.id+'\')">관련 업무'+(drillCount?'<span class="gantt-list-drill-count">'+drillCount+'</span>':'')+'</button></div>':'')+'</td>'
          +'<td><div class="gantt-list-member-cell">'+esc(row.memberText)+'</div></td>'
          +'<td><div class="gantt-list-period-cell">'+esc(row.periodText)+'</div></td>'
          +'<td><span class="badge '+getGanttListStatusBadgeClass(row.status)+'">'+esc(row.status)+'</span></td>'
          +'<td><div class="gantt-list-progress"><div class="gantt-list-progress-text">'+row.progressPercent+'%</div><div class="gantt-list-progress-track"><div class="gantt-list-progress-fill" style="width:'+row.progressPercent+'%"></div></div></div></td>'
          +'<td><div class="gantt-list-attention-cell" title="'+esc(getGanttListAttentionSubtext(row)||row.riskMeta?.detail||'')+'">'+renderGanttListAttentionBadges(row)+'</div></td>'
          +'<td><div class="gantt-list-billing-cell"><span class="badge '+getGanttListBillingBadgeClass(row.billingStatus)+'">'+esc(row.billingStatus)+'</span>'+(row.billingAmount>0?'<div class="gantt-list-billing-sub">'+formatGanttCurrency(row.billingAmount)+'</div>':'')+'</div></td>'
        +'</tr>';
        return mainRow+(isExpanded?renderGanttListTaskDrilldownRow(row):'');
      }).join('')
      +'</tbody>'
    +'</table></div>'
    +'</div>';
  const searchInput=document.getElementById('ganttListSearchInput');
  if(searchInput)searchInput.oninput=e=>setGanttListSearchQuery(e.target.value);
}

const GANTT_QUICK_LIFECYCLE_OPTIONS=[
  {value:'planned',label:'예정'},
  {value:'in_progress',label:'진행중'},
  {value:'execution_done',label:'실행 완료'},
  {value:'follow_up',label:'후속관리'}
];

function getGanttProjectLifecycleSupportData(project){
  const projectId=String(project?.id||'').trim();
  return {
    taskSummary:ganttListTaskSummaryByProjectId[projectId],
    taskIssueSummary:ganttListTaskIssueSummaryByProjectId[projectId],
    pendingDocSummary:(window.ganttProjectPendingDocSummaryByProjectId||{})[projectId],
    issueCount:Number(openIssuesByProject[projectId]||0)
  };
}

function ensureGanttProjectLifecycleSupport(projectId){
  const key=String(projectId||'').trim();
  if(!key)return;
  if(ganttListTaskSummaryByProjectId[key]===undefined)loadGanttListTaskSummaries([key]);
  if(ganttListTaskIssueSummaryByProjectId[key]===undefined)loadGanttListTaskIssueSummaries([key]);
  if(((window.ganttProjectPendingDocSummaryByProjectId||{})[key])===undefined)loadGanttListPendingDocSummaries([key]);
}

function getGanttProjectCurrentLifecycleMeta(project){
  return getGanttProjectLifecycleMeta(project,getGanttProjectLifecycleSupportData(project));
}

function getGanttProjectQuickLifecycleValue(project){
  const lifecycleMeta=getGanttProjectCurrentLifecycleMeta(project);
  const rawStatus=getGanttProjectRawStatusKey(project);
  if(lifecycleMeta.key==='follow_up')return 'follow_up';
  if(lifecycleMeta.key==='execution_done'||lifecycleMeta.key==='fully_closed')return 'execution_done';
  if(rawStatus==='planned')return 'planned';
  return 'in_progress';
}

function getGanttProjectClosureMeta(project){
  const support=getGanttProjectLifecycleSupportData(project);
  const blockers=[];
  const loading=[];
  const taskSummary=support.taskSummary;
  const pendingDocSummary=support.pendingDocSummary;
  const issueCount=Number(support.issueCount||0);
  const billingPending=project?.is_billable!==false&&String(project?.billing_status||'').trim()==='미청구';
  if(taskSummary===undefined)loading.push('업무');
  else if(Number(taskSummary?.openCount||0)>0)blockers.push('후속 Task '+Number(taskSummary.openCount||0)+'건');
  if(issueCount>0)blockers.push('열린 이슈 '+issueCount+'건');
  if(pendingDocSummary===undefined)loading.push('자료 요청');
  else if(Number(pendingDocSummary?.total||0)>0)blockers.push('자료 요청 '+Number(pendingDocSummary.total||0)+'건');
  if(billingPending)blockers.push('미청구');
  if(project?.follow_up_needed)blockers.push('후속관리');
  return {
    ready:!loading.length,
    loading,
    blockers,
    canFullyClose:!loading.length&&!blockers.length
  };
}

function getGanttProjectQuickLifecycleOptionsHtml(project){
  const currentValue=getGanttProjectQuickLifecycleValue(project);
  return GANTT_QUICK_LIFECYCLE_OPTIONS.map(option=>'<option value="'+option.value+'"'+(option.value===currentValue?' selected':'')+'>'+option.label+'</option>').join('');
}

function buildGanttProjectQuickStatusPatch(project,nextValue){
  const today=new Date().toISOString().slice(0,10);
  switch(String(nextValue||'')){
    case 'planned':
      return {status:'예정',follow_up_needed:false};
    case 'in_progress':
      return {status:'진행중',follow_up_needed:false};
    case 'execution_done':
      return {
        status:'완료',
        follow_up_needed:false,
        actual_end_date:project?.actual_end_date||today
      };
    case 'follow_up':
      return {
        status:'완료',
        follow_up_needed:true,
        actual_end_date:project?.actual_end_date||today
      };
    default:
      return null;
  }
}

async function updateGanttProjectQuickLifecycle(projectId,nextValue){
  const key=String(projectId||'').trim();
  const project=(projects||[]).find(item=>String(item?.id||'')===key);
  if(!key||!project)return;
  if(typeof canEdit==='function'&&!canEdit(project)){
    alert('상태를 변경할 권한이 없습니다.');
    return;
  }
  const patchBody=buildGanttProjectQuickStatusPatch(project,nextValue);
  if(!patchBody)return;
  const currentValue=getGanttProjectQuickLifecycleValue(project);
  if(String(currentValue)===String(nextValue))return;
  try{
    await api('PATCH','projects?id=eq.'+key,patchBody);
    if(typeof logActivity==='function'){
      await logActivity('프로젝트 상태 변경','project',key,project?.name||'');
    }
    await loadAll();
    renderGantt();
  }catch(error){
    alert('상태 변경 중 오류가 발생했습니다: '+error.message);
  }
}

window.applyGanttProjectQuickLifecycleSelection=async function(projectId){
  const select=document.getElementById('ganttProjectQuickStatusSelect');
  if(!select)return;
  await updateGanttProjectQuickLifecycle(projectId,select.value);
};

window.requestGanttProjectFullyClose=async function(projectId){
  const key=String(projectId||'').trim();
  const project=(projects||[]).find(item=>String(item?.id||'')===key);
  if(!key||!project)return;
  if(typeof canEdit==='function'&&!canEdit(project)){
    alert('프로젝트 종료 상태를 변경할 권한이 없습니다.');
    return;
  }
  ensureGanttProjectLifecycleSupport(key);
  const closureMeta=getGanttProjectClosureMeta(project);
  if(!closureMeta.ready){
    alert('완전 종료 기준을 확인하는 중입니다. 잠시 후 다시 시도해 주세요.');
    return;
  }
  if(!closureMeta.canFullyClose){
    alert('완전 종료 전 확인이 필요합니다.\n- '+closureMeta.blockers.join('\n- '));
    return;
  }
  if(!confirm('이 프로젝트를 완전 종료로 변경할까요? 완전 종료된 프로젝트는 기본 목록에서 숨길 수 있습니다.'))return;
  try{
    await api('PATCH','projects?id=eq.'+key,{
      status:'완전 종료',
      follow_up_needed:false,
      actual_end_date:project?.actual_end_date||new Date().toISOString().slice(0,10)
    });
    if(typeof logActivity==='function'){
      await logActivity('프로젝트 완전 종료','project',key,project?.name||'');
    }
    await loadAll();
    renderGantt();
  }catch(error){
    alert('완전 종료 처리 중 오류가 발생했습니다: '+error.message);
  }
};

function renderGanttProjectLifecycleActionPanel(project){
  const lifecycleMeta=getGanttProjectCurrentLifecycleMeta(project);
  const closureMeta=getGanttProjectClosureMeta(project);
  const editable=typeof canEdit==='function'?canEdit(project):canManageGanttListProject(project);
  const currentLabel=lifecycleMeta?.label||'진행중';
  const currentBadgeClass=getGanttListStatusBadgeClass(currentLabel);
  const noteText=lifecycleMeta?.key==='fully_closed'
    ?'완전 종료된 프로젝트입니다. 실행과 후속 정리가 모두 끝난 상태입니다.'
    :!closureMeta.ready
      ?'완전 종료 기준을 확인하는 중입니다. 필요한 업무·이슈·자료 요청을 불러오고 있습니다.'
      :closureMeta.canFullyClose
        ?'완전 종료 기준을 모두 충족했습니다. 지금 종료해도 후속 항목이 남지 않습니다.'
        :'완전 종료 전 확인: '+closureMeta.blockers.join(' · ');
  const noteTone=lifecycleMeta?.key==='fully_closed'
    ?'good'
    :!closureMeta.ready
      ?'neutral'
      :closureMeta.canFullyClose
        ?'good'
        :'warn';
  const closeDisabled=!editable||lifecycleMeta?.key==='fully_closed'||!closureMeta.canFullyClose;
  return ''
    +'<div class="gantt-detail-lifecycle-panel">'
      +'<div class="gantt-detail-lifecycle-top">'
        +'<div class="gantt-detail-lifecycle-copy">'
          +'<div class="gantt-detail-label">프로젝트 상태</div>'
          +'<div class="gantt-detail-lifecycle-state-line"><span class="badge '+currentBadgeClass+'">'+esc(currentLabel)+'</span><span class="gantt-detail-meta">상태는 수명주기를, 보조 칩은 남은 확인 이유를 보여줍니다.</span></div>'
        +'</div>'
        +(editable&&lifecycleMeta?.key!=='fully_closed'
          ?'<div class="gantt-detail-lifecycle-controls">'
              +'<select id="ganttProjectQuickStatusSelect" class="gantt-detail-lifecycle-select">'+getGanttProjectQuickLifecycleOptionsHtml(project)+'</select>'
              +'<button type="button" class="btn sm" onclick="applyGanttProjectQuickLifecycleSelection(\''+project.id+'\')">상태 변경</button>'
              +'<button type="button" class="btn ghost sm gantt-detail-close-btn"'+(closeDisabled?' disabled':'')+' onclick="requestGanttProjectFullyClose(\''+project.id+'\')">완전 종료</button>'
            +'</div>'
          :editable
            ?'<div class="gantt-detail-lifecycle-controls"><button type="button" class="btn ghost sm gantt-detail-close-btn" disabled>완전 종료됨</button></div>'
            :'<div class="gantt-detail-meta">상태 변경 권한이 없습니다.</div>')
      +'</div>'
      +'<div class="gantt-detail-lifecycle-note is-'+noteTone+'">'+esc(noteText)+'</div>'
    +'</div>';
}

function ensureGanttViewSettingsBar(){
  const memberTabs=document.getElementById('memberFilterTabs');
  if(!memberTabs||!memberTabs.parentNode)return null;
  let bar=document.getElementById('ganttViewSettingsBar');
  if(!bar){
    bar=document.createElement('div');
    bar.id='ganttViewSettingsBar';
    bar.className='gantt-view-settings';
    memberTabs.parentNode.insertBefore(bar,memberTabs);
  }
  return bar;
}

function renderGanttViewSettingsBar(){
  const bar=ensureGanttViewSettingsBar();
  if(!bar)return;
  let title='보기 설정';
  let sub='현재 보기에서 필요한 옵션만 남겨 두었습니다.';
  const groups=[];
  if(curGanttLayout==='list'){
    sub='리스트에서는 프로젝트 비교와 선택에 필요한 설정만 보입니다.';
    groups.push(
      '<div class="gantt-view-settings-group">'
        +'<div class="gantt-view-settings-label">표시</div>'
        +'<div class="toggle-wrap gantt-view-settings-toggle">'
          +'<button type="button" class="toggle-btn'+(ganttHideCompleted?' active':'')+'" onclick="setGanttVisibilityToggle(!ganttHideCompleted)">완전 종료 숨기기</button>'
        +'</div>'
      +'</div>'
    );
    groups.push(
      '<div class="gantt-view-settings-group gantt-view-settings-group-wide">'
        +'<div class="gantt-view-settings-label">추가 필터</div>'
        +renderGanttListExecutionRiskFilterRow()
      +'</div>'
    );
  }else if(curGanttLayout==='calendar'){
    title='달력 설정';
    sub='달력에서는 날짜 밀도와 일정 분포만 가볍게 조정합니다.';
    groups.push(
      '<div class="gantt-view-settings-group">'
        +'<div class="gantt-view-settings-label">표시</div>'
        +'<div class="toggle-wrap gantt-view-settings-toggle">'
          +'<button type="button" class="toggle-btn'+(ganttHideCompleted?' active':'')+'" onclick="setGanttVisibilityToggle(!ganttHideCompleted)">완전 종료 숨기기</button>'
        +'</div>'
      +'</div>'
    );
    groups.push(
      '<div class="gantt-view-settings-group">'
        +'<div class="gantt-view-settings-label">일정</div>'
        +'<button type="button" class="btn sm" onclick="openScheduleModal()">+ 개인 일정</button>'
      +'</div>'
    );
  }else{
    title='간트 설정';
    sub='간트에서는 프로젝트 흐름과 개인 일정 제약만 나눠서 봅니다.';
    groups.push(
      '<div class="gantt-view-settings-group">'
        +'<div class="gantt-view-settings-label">보기 방식</div>'
        +'<div class="toggle-wrap gantt-view-settings-toggle">'
          +'<button type="button" class="toggle-btn'+(curGView!=='member'?' active':'')+'" onclick="setGView(\'project\')">프로젝트별</button>'
          +'<button type="button" class="toggle-btn'+(curGView==='member'?' active':'')+'" onclick="setGView(\'member\')">인력별</button>'
        +'</div>'
      +'</div>'
    );
    groups.push(
      '<div class="gantt-view-settings-group">'
        +'<div class="gantt-view-settings-label">개인 일정</div>'
        +'<div class="toggle-wrap gantt-view-settings-toggle">'
          +'<button type="button" class="toggle-btn'+(ganttShowPersonalOverlay?' active':'')+'" onclick="setGanttPersonalOverlayToggle(!ganttShowPersonalOverlay)">제약 레이어</button>'
          +'<button type="button" class="toggle-btn'+(ganttShowPersonalRows?' active':'')+'" onclick="setGanttPersonalRowsToggle(!ganttShowPersonalRows)">별도 행</button>'
        +'</div>'
      +'</div>'
    );
    groups.push(
      '<div class="gantt-view-settings-group">'
        +'<div class="gantt-view-settings-label">표시</div>'
        +'<div class="toggle-wrap gantt-view-settings-toggle">'
          +'<button type="button" class="toggle-btn'+(ganttHideCompleted?' active':'')+'" onclick="setGanttVisibilityToggle(!ganttHideCompleted)">완전 종료 숨기기</button>'
        +'</div>'
      +'</div>'
    );
    groups.push(
      '<div class="gantt-view-settings-group">'
        +'<div class="gantt-view-settings-label">일정</div>'
        +'<button type="button" class="btn sm" onclick="openScheduleModal()">+ 개인 일정</button>'
      +'</div>'
    );
  }
  if(!groups.length){
    bar.hidden=true;
    bar.innerHTML='';
    return;
  }
  bar.hidden=false;
  bar.innerHTML=''
    +'<div class="gantt-view-settings-head">'
      +'<div class="gantt-view-settings-title">'+title+'</div>'
      +'<div class="gantt-view-settings-sub">'+sub+'</div>'
    +'</div>'
    +'<div class="gantt-view-settings-groups">'+groups.join('')+'</div>';
}

function syncGanttPrimaryToolbarVisibility(){
  const scheduleBtn=document.getElementById('scheduleAddBtn');
  const projectViewBtn=document.getElementById('gvp');
  const memberViewBtn=document.getElementById('gvm');
  const visibilityWrap=document.getElementById('ganttVisibilityToggleWrap');
  const summary=document.getElementById('ganttVisibilitySummary');
  const memberTabs=document.getElementById('memberFilterTabs');
  if(scheduleBtn){
    scheduleBtn.hidden=true;
    scheduleBtn.style.display='none';
  }
  [projectViewBtn,memberViewBtn].forEach(btn=>{
    if(!btn)return;
    btn.hidden=true;
    btn.style.display='none';
  });
  if(visibilityWrap){
    visibilityWrap.hidden=true;
    visibilityWrap.style.display='none';
  }
  if(summary)summary.classList.add('is-quiet');
  if(memberTabs){
    const shouldShowMemberTabs=curGanttLayout==='timeline'&&curGView==='member';
    memberTabs.hidden=!shouldShowMemberTabs;
    memberTabs.classList.toggle('is-gantt-secondary',shouldShowMemberTabs);
  }
}

const baseEnsureGanttTopAreaControlsV3=ensureGanttTopAreaControls;
ensureGanttTopAreaControls=function(){
  baseEnsureGanttTopAreaControlsV3();
  syncGanttPrimaryToolbarVisibility();
  renderGanttViewSettingsBar();
};

const baseRenderGanttEntryViewChromeV4=renderGanttEntryViewChromeV2;
renderGanttEntryViewChromeV2=function(){
  baseRenderGanttEntryViewChromeV4();
  syncGanttPrimaryToolbarVisibility();
  renderGanttViewSettingsBar();
};
renderGanttEntryViewChrome=renderGanttEntryViewChromeV2;

const baseRenderGanttDetailPanelV5=renderGanttDetailPanel;
renderGanttDetailPanel=function(projs,schs){
  baseRenderGanttDetailPanelV5(projs,schs);
  const el=document.getElementById('ganttDetail');
  const project=(projs||[]).find(item=>String(item?.id||'')===String(ganttFocusProjectId||''))||null;
  if(!el||!project)return;
  ensureGanttProjectLifecycleSupport(project.id);
  const lifecycleMeta=getGanttProjectCurrentLifecycleMeta(project);
  const badges=el.querySelectorAll('.gantt-detail-badges .badge');
  if(badges[1]){
    badges[1].className='badge '+getGanttListStatusBadgeClass(lifecycleMeta.label||'진행중');
    badges[1].textContent=lifecycleMeta.label||'진행중';
  }
  const editBtn=el.querySelector('.gantt-detail-actions .btn.primary');
  if(editBtn)editBtn.textContent='전체 수정';
  const tabBar=el.querySelector('.gantt-detail-tabbar');
  const existingPanel=el.querySelector('.gantt-detail-lifecycle-panel');
  if(existingPanel)existingPanel.remove();
  if(tabBar)tabBar.insertAdjacentHTML('beforebegin',renderGanttProjectLifecycleActionPanel(project));
};

getGanttProjectActionButtons=function(project,isCompleted){
  const canUpdate=typeof canEdit==='function'?canEdit(project):true;
  const canRemove=typeof canDeleteProject==='function'?canDeleteProject(project):true;
  const buttons=[];
  if(!isCompleted&&canUpdate){
    buttons.push('<button class="gantt-action-btn complete-action" type="button" data-pid="'+project.id+'" onclick="event.stopPropagation();markGanttProjectComplete(this.dataset.pid)" title="실행 완료">✅</button>');
  }
  buttons.push('<button class="gantt-action-btn edit-action" type="button" data-pid="'+project.id+'" onclick="event.stopPropagation();openProjModal(this.dataset.pid)" title="전체 수정">✏️</button>');
  if(canRemove){
    buttons.push('<button class="gantt-action-btn delete-action" type="button" data-pid="'+project.id+'" onclick="event.stopPropagation();deleteGanttProject(this.dataset.pid)" title="삭제">🗑️</button>');
  }
  return buttons.length?'<div class="gantt-row-actions">'+buttons.join('')+'</div>':'';
};

window.markGanttProjectComplete=async function(projectId){
  await updateGanttProjectQuickLifecycle(projectId,'execution_done');
};

updateGanttVisibilitySummary=function(hiddenCompletedCount){
  const summary=ensureGanttVisibilitySummary();
  if(!summary)return;
  const parts=[
    ganttHideCompleted
      ?'완전 종료 '+hiddenCompletedCount+'건 숨김 중'
      :'완전 종료 표시 중'
  ];
  if(curGanttLayout==='timeline'){
    parts.push(ganttShowPersonalOverlay?'개인 일정 레이어 표시 중':'개인 일정 레이어 숨김');
    parts.push(ganttShowPersonalRows?'개인 일정 행 표시 중':'개인 일정 행 숨김');
  }
  summary.textContent=parts.join(' · ');
};

function shouldPreloadGanttLifecycleSupport(){
  return ganttStatusFilter==='execution_done'
    ||ganttStatusFilter==='follow_up'
    ||ganttStatusFilter==='fully_closed'
    ||(typeof ganttHideCompleted!=='undefined'&&!!ganttHideCompleted);
}

applyProjectTopFilters=function(projs,schs){
  const rows=Array.isArray(projs)?projs:[];
  if(shouldPreloadGanttLifecycleSupport()){
    const ids=rows.map(project=>project?.id).filter(Boolean);
    loadGanttListTaskSummaries(ids);
    loadGanttListTaskIssueSummaries(ids);
    loadGanttListPendingDocSummaries(ids);
  }
  return {
    projs:rows.filter(projectMatchesTopFilters),
    schs:schs||[]
  };
};

window.applyProjectTopFilters=applyProjectTopFilters;

const baseLoadGanttListTaskSummaries=loadGanttListTaskSummaries;
loadGanttListTaskSummaries=async function(projectIds){
  await baseLoadGanttListTaskSummaries(projectIds);
  if(shouldPreloadGanttLifecycleSupport()&&curGanttLayout!=='list')scheduleGanttFullRefresh();
};

const baseLoadGanttListTaskIssueSummaries=loadGanttListTaskIssueSummaries;
loadGanttListTaskIssueSummaries=async function(projectIds){
  await baseLoadGanttListTaskIssueSummaries(projectIds);
  if(shouldPreloadGanttLifecycleSupport()&&curGanttLayout!=='list')scheduleGanttFullRefresh();
};

const baseLoadGanttListPendingDocSummaries=loadGanttListPendingDocSummaries;
loadGanttListPendingDocSummaries=async function(projectIds){
  await baseLoadGanttListPendingDocSummaries(projectIds);
  if(shouldPreloadGanttLifecycleSupport()&&curGanttLayout!=='list')scheduleGanttFullRefresh();
};

function getGanttDetailStatusBadgeClass(status){
  return status==='진행중'?'badge-blue':status==='완료'?'badge-green':'badge-orange';
}

function getGanttDetailTypeBadgeClass(type){
  return type==='감사'?'badge-blue':type==='세무'?'badge-green':type==='밸류에이션'?'badge-orange':'badge-gray';
}

function getGanttProjectConflictSchedules(project){
  const projectMembers=project?.members||[];
  return (schedules||[])
    .filter(schedule=>{
      if(schedule.schedule_type!=='leave'&&schedule.schedule_type!=='fieldwork')return false;
      if(!scheduleHasAnyProjectMember(schedule,projectMembers))return false;
      return toDate(schedule.start)<=toDate(project.end||project.end_date||'')&&toDate(schedule.end)>=toDate(project.start||project.start_date||'');
    })
    .sort((a,b)=>toDate(a.start)-toDate(b.start))
    .slice(0,6);
}

function renderGanttDetailIssuePreview(projectId,issues){
  const container=document.getElementById('ganttDetailIssueList');
  if(!container||String(ganttFocusProjectId||'')!==String(projectId||''))return;
  if(!(issues||[]).length){
    container.innerHTML='<div class="gantt-detail-empty">열린 이슈가 없습니다.</div>';
    return;
  }
  container.innerHTML=issues.map(issue=>{
    const statusMeta=typeof getIssueStatusMeta==='function'?getIssueStatusMeta(issue.status):{label:'열림',badgeCls:'badge-blue'};
    const editable=typeof canEditIssue==='function'?canEditIssue(issue):false;
    const canResolve=editable&&typeof isIssueResolvedStatus==='function'?!isIssueResolvedStatus(issue.status):false;
    return '<div class="gantt-detail-item is-clickable" onclick="openIssueModal(\''+(issue.project_id||projectId||'')+'\',\''+issue.id+'\')">'
      +'<div><div class="gantt-detail-item-title">'+(issue.is_pinned?'📌 ':'')+esc(issue.title||'제목 없음')+'</div><div class="gantt-detail-item-sub">'+esc(issue.assignee_name||issue.owner_name||'담당자 미지정')+(issue.priority==='high'?' · 긴급':'')+'</div></div>'
      +'<div class="gantt-detail-item-side"><span class="badge '+statusMeta.badgeCls+'">'+statusMeta.label+'</span>'+(canResolve?'<button type="button" class="btn sm" onclick="event.stopPropagation();resolveIssue(\''+issue.id+'\')">해결</button>':'')+'</div>'
    +'</div>';
  }).join('');
}

function renderGanttDetailDocumentPreview(projectId,documents){
  const container=document.getElementById('ganttDetailDocumentList');
  if(!container||String(ganttFocusProjectId||'')!==String(projectId||''))return;
  if(!(documents||[]).length){
    container.innerHTML='<div class="gantt-detail-empty">대기 중인 자료 요청이 없습니다.</div>';
    return;
  }
  container.innerHTML=documents.map(doc=>{
    return '<div class="gantt-detail-item is-clickable" onclick="openProjModal(\''+projectId+'\',null,null,\'documents\')">'
      +'<div><div class="gantt-detail-item-title">'+esc(doc.title||'자료명 없음')+'</div><div class="gantt-detail-item-sub">'+esc(doc.due_date?('회수 희망일 '+doc.due_date):'회수 희망일 미지정')+'</div></div>'
      +'<span class="badge badge-orange">대기</span>'
    +'</div>';
  }).join('');
}

function getGanttDetailLinkedContract(project){
  return (contracts||[]).find(contract=>String(contract?.id||'')===String(project?.contract_id||''))||null;
}

function getGanttDetailConflictSummary(memberSchedules){
  if(!(memberSchedules||[]).length)return '담당자 휴가/필드웍 일정 없음';
  const preview=memberSchedules
    .slice(0,2)
    .map(schedule=>getScheduleMemberLabel(schedule)+' '+scheduleLabel(schedule.schedule_type))
    .join(', ');
  return '일정 '+memberSchedules.length+'건 · '+preview+(memberSchedules.length>2?' 외':'');
}

function getGanttProjectRemainingDaysMeta(project){
  const endDate=toDate(project?.end||project?.end_date||'');
  const today=getHomeBaseDate();
  if(Number.isNaN(endDate.getTime()))return {label:'기한 미지정',tone:'neutral',detail:'종료일이 없습니다.'};
  const diff=Math.round((endDate-today)/86400000);
  if(isGanttProjectCompleted(project))return {label:'완료',tone:'good',detail:'완료 프로젝트입니다.'};
  if(diff<0)return {label:'지연 D+'+Math.abs(diff),tone:'danger',detail:'종료일이 지났습니다.'};
  if(diff===0)return {label:'오늘 마감',tone:'warn',detail:'오늘 종료 예정입니다.'};
  return {label:'D-'+diff,tone:diff<=3?'warn':'neutral',detail:diff<=3?'마감이 가깝습니다.':'예정된 일정 안에 있습니다.'};
}

function getGanttProjectExecutionFocusItems(project,memberSchedules){
  const items=[];
  const projectMembers=project?.members||[];
  const remainingMeta=getGanttProjectRemainingDaysMeta(project);
  if(!projectMembers.length){
    items.push({tone:'warn',title:'담당자 배정 필요',sub:'현재 담당자가 비어 있어 실행 책임자를 먼저 지정하는 편이 좋습니다.'});
  }else{
    items.push({tone:'neutral',title:'담당자 '+projectMembers.length+'명',sub:projectMembers.join(', ')});
  }
  if(remainingMeta.tone==='danger'||remainingMeta.tone==='warn'){
    items.push({tone:remainingMeta.tone,title:remainingMeta.label,sub:remainingMeta.detail});
  }else{
    items.push({tone:'good',title:'기한 상태 안정',sub:remainingMeta.detail});
  }
  if((memberSchedules||[]).length){
    const firstSchedule=memberSchedules[0];
    items.push({
      tone:'warn',
      title:'일정 신호 '+memberSchedules.length+'건',
      sub:getScheduleMemberLabel(firstSchedule)+' '+scheduleLabel(firstSchedule.schedule_type)+(memberSchedules.length>1?' 외 '+(memberSchedules.length-1)+'건':'')
    });
  }else{
    items.push({tone:'good',title:'팀 일정 충돌 없음',sub:'현재 필터 기준 휴가·필드웍 일정이 겹치지 않습니다.'});
  }
  if(project?.follow_up_needed){
    items.push({
      tone:'issue',
      title:'후속 액션 필요',
      sub:project?.follow_up_note?truncateText(project.follow_up_note,72):'완료 후 후속 조치가 필요합니다.'
    });
  }else{
    items.push({tone:'neutral',title:'후속 액션 없음',sub:'현재 등록된 추가 조치 항목이 없습니다.'});
  }
  return items;
}

function renderGanttDetailTabBar(){
  const tabs=[
    {key:'overview',label:'Overview'},
    {key:'work',label:'Work'},
    {key:'issues',label:'Issues'},
    {key:'memo',label:'Memo / Documents'}
  ];
  return '<div class="gantt-detail-tabbar">'
    +tabs.map(tab=>'<button type="button" class="gantt-detail-tab'+(ganttDetailTab===tab.key?' active':'')+'" onclick="setGanttDetailTab(\''+tab.key+'\')">'+tab.label+'</button>').join('')
  +'</div>';
}

function getGanttOverviewTaskSummary(projectId){
  const key=String(projectId||'');
  const cached=getGanttListTaskSummary(key);
  if(cached)return cached;
  if(Array.isArray(ganttProjectTasksByProjectId[key]))return buildGanttListTaskSummary(getGanttProjectTasks(key));
  return null;
}

function getGanttOverviewIssueLinkedCount(projectId){
  const cached=getGanttListTaskIssueSummary(projectId);
  if(cached&&typeof cached==='object')return Number(cached.issueLinkedTaskCount||0);
  const taskIssueCounts=ganttProjectTaskIssueCountsByProjectId[String(projectId||'')];
  if(taskIssueCounts&&typeof taskIssueCounts==='object'){
    return Object.values(taskIssueCounts).filter(value=>Number(value||0)>0).length;
  }
  return null;
}

function getGanttOverviewExecutionSignals(project){
  const summary=getGanttOverviewTaskSummary(project?.id);
  const issueLinkedCount=getGanttOverviewIssueLinkedCount(project?.id);
  return [
    {
      label:'열린 업무',
      value:summary?(summary.openCount+'건'):'준비 중',
      meta:summary
        ?(summary.total?('전체 '+summary.total+'건 중 확인할 업무'):'등록된 업무 없음')
        :'업무 요약을 준비하는 중입니다.',
      tone:summary&&summary.openCount>0?'neutral':'quiet'
    },
    {
      label:'지연 업무',
      value:summary?(summary.overdueCount?summary.overdueCount+'건':'없음'):'준비 중',
      meta:summary
        ?(summary.overdueCount?'기한을 넘긴 업무가 있습니다.':'현재 지연 업무는 없습니다.')
        :'기한 요약을 준비하는 중입니다.',
      tone:summary&&summary.overdueCount>0?'warn':'quiet'
    },
    {
      label:'이슈 연결',
      value:issueLinkedCount===null?'준비 중':(issueLinkedCount?issueLinkedCount+'건':'없음'),
      meta:issueLinkedCount===null
        ?'업무 연결 이슈를 확인하는 중입니다.'
        :(issueLinkedCount?'Issues 탭과 함께 볼 업무가 있습니다.':'현재 업무 연결 이슈는 없습니다.'),
      tone:issueLinkedCount>0?'warn':'quiet'
    },
    {
      label:'다음 마감',
      value:summary?(summary.nearestDueLabel||'없음'):'준비 중',
      meta:summary
        ?(summary.nearestDueLabel
          ?((summary.nearestDueTitle||'가까운 업무')+' 일정')
          :'가까운 기한 일정이 없습니다.')
        :'마감 일정을 준비하는 중입니다.',
      tone:summary&&summary.nearestDueLabel?'neutral':'quiet'
    }
  ];
}

function renderGanttProjectOverviewSection(project,client,linkedContract,projectMembers,memberSchedules,billingStatus,billingAmount){
  const scheduleTone=(memberSchedules||[]).length?'is-warn':'';
  const scheduleSummary=(memberSchedules||[]).length?getGanttDetailConflictSummary(memberSchedules):'조정 필요 없음';
  const executionSignals=getGanttOverviewExecutionSignals(project);
  return ''
    +'<div class="gantt-detail-pane gantt-overview-pane">'
      +'<div class="gantt-detail-section gantt-detail-section--flush gantt-overview-section">'
        +'<div class="gantt-detail-section-head"><div><div class="gantt-panel-title">프로젝트 요약</div><div class="gantt-detail-meta">고객사, 계약, 기간, 담당자를 중심으로 현재 프로젝트의 큰 맥락을 확인합니다.</div></div></div>'
        +'<div class="gantt-detail-grid gantt-detail-grid--overview">'
          +'<div class="gantt-detail-summary-card"><div class="gantt-detail-label">고객사</div><div class="gantt-detail-value">'+esc(client?.name||'고객사 미지정')+'</div></div>'
          +'<div class="gantt-detail-summary-card"><div class="gantt-detail-label">연결 계약</div><div class="gantt-detail-value">'+esc(linkedContract?.contract_name||'계약 없음')+'</div>'+(linkedContract?.contract_amount?'<div class="gantt-detail-meta">'+formatGanttCurrency(linkedContract.contract_amount)+'</div>':'')+'</div>'
          +'<div class="gantt-detail-summary-card"><div class="gantt-detail-label">기간</div><div class="gantt-detail-value">'+esc((project.start||'')+' ~ '+(project.end||''))+'</div></div>'
          +'<div class="gantt-detail-summary-card"><div class="gantt-detail-label">담당자</div><div class="gantt-detail-value">'+esc(projectMembers.join(', ')||'담당자 미지정')+'</div></div>'
        +'</div>'
      +'</div>'
      +'<div class="gantt-overview-context-grid">'
        +'<div class="gantt-overview-context-card"><div class="gantt-detail-label">계약 / 청구 현황</div><div class="gantt-detail-value">'+esc(billingStatus)+'</div><div class="gantt-detail-meta">'+formatGanttCurrency(billingAmount)+(linkedContract?.contract_amount?' · 계약 '+formatGanttCurrency(linkedContract.contract_amount):'')+'</div></div>'
        +'<div class="gantt-overview-context-card '+scheduleTone+'"><div class="gantt-detail-label">일정 / 조정</div><div class="gantt-detail-value">'+esc(scheduleSummary)+'</div><div class="gantt-detail-meta">'+((memberSchedules||[]).length?('휴가·필드웍 일정 '+memberSchedules.length+'건 확인'):'현재 조정할 일정 없음')+'</div></div>'
      +'</div>'
      +'<div class="gantt-detail-section gantt-overview-section">'
        +'<div class="gantt-detail-section-head"><div><div class="gantt-panel-title">실행 요약</div><div class="gantt-detail-meta">열린 업무, 지연 업무, 이슈 연결, 다음 마감만 가볍게 확인합니다. 세부 조정은 Work 탭에서 이어집니다.</div></div></div>'
        +'<div class="gantt-overview-signal-grid">'
          +executionSignals.map(item=>'<div class="gantt-overview-signal-card is-'+item.tone+'"><div class="gantt-detail-label">'+esc(item.label)+'</div><div class="gantt-detail-value">'+esc(item.value)+'</div><div class="gantt-detail-meta">'+esc(item.meta)+'</div></div>').join('')
        +'</div>'
      +'</div>'
    +'</div>';
}

function renderGanttProjectWorkSection(project,memberSchedules){
  const progress=getGanttProjectProgress(project);
  const estimatedHours=project?.estimated_hours!=null&&project?.estimated_hours!==''?Number(project.estimated_hours).toLocaleString()+'h':'미입력';
  const actualHours=project?.actual_hours!=null&&project?.actual_hours!==''?Number(project.actual_hours).toLocaleString()+'h':'미입력';
  const completionText=project?.actual_end_date||(!isGanttProjectCompleted(project)?'진행 중':(project.end||project.end_date||'완료'));
  const followUpText=project?.follow_up_needed?(project?.follow_up_note?truncateText(project.follow_up_note,60):'후속 액션 필요'):'후속 액션 없음';
  const remainingMeta=getGanttProjectRemainingDaysMeta(project);
  const workFocusItems=getGanttProjectExecutionFocusItems(project,memberSchedules);
  const hourDelta=(project?.estimated_hours!=null&&project?.estimated_hours!==''&&project?.actual_hours!=null&&project?.actual_hours!=='')
    ?Number(project.actual_hours)-Number(project.estimated_hours)
    :null;
  const hourDeltaText=hourDelta===null
    ?'예상과 실제 투입 시간 중 하나가 비어 있습니다.'
    :hourDelta===0
      ?'예상과 실제 투입 시간이 같습니다.'
      :hourDelta>0
        ?'예상보다 '+hourDelta.toLocaleString()+'h 더 투입되었습니다.'
        :'예상보다 '+Math.abs(hourDelta).toLocaleString()+'h 덜 투입되었습니다.';
  return ''
    +'<div class="gantt-detail-pane">'
      +'<div class="gantt-detail-work-hero">'
        +'<div><div class="gantt-detail-label">Work</div><div class="gantt-detail-value">'+esc(remainingMeta.label)+'</div><div class="gantt-detail-meta">'+esc(remainingMeta.detail)+'</div></div>'
        +'<div class="gantt-detail-work-hero-progress"><div class="gantt-detail-label">실행 진행률</div><div class="gantt-detail-work-hero-value">'+progress+'%</div><div class="gantt-detail-work-progress-track"><div class="gantt-detail-work-progress-fill" style="width:'+progress+'%"></div></div></div>'
      +'</div>'
      +'<div class="gantt-detail-work-grid">'
        +'<div class="gantt-detail-work-card"><div class="gantt-detail-label">기간 진행률</div><div class="gantt-detail-value">'+progress+'%</div><div class="gantt-detail-meta">'+esc((project.start||'')+' ~ '+(project.end||''))+'</div></div>'
        +'<div class="gantt-detail-work-card"><div class="gantt-detail-label">투입 시간</div><div class="gantt-detail-value">'+estimatedHours+' / '+actualHours+'</div><div class="gantt-detail-meta">'+esc(hourDeltaText)+'</div></div>'
        +'<div class="gantt-detail-work-card"><div class="gantt-detail-label">완료 기준</div><div class="gantt-detail-value">'+esc(completionText)+'</div><div class="gantt-detail-meta">'+esc(project?.project_code||'프로젝트 코드 없음')+'</div></div>'
        +'<div class="gantt-detail-work-card"><div class="gantt-detail-label">후속 액션</div><div class="gantt-detail-value">'+esc(followUpText)+'</div><div class="gantt-detail-meta">'+(project?.follow_up_needed?'완료 후 조치 필요':'현재 등록 없음')+'</div></div>'
      +'</div>'
      +'<div class="gantt-detail-section gantt-detail-section--flush">'
        +'<div class="gantt-detail-section-head"><div class="gantt-panel-title">실행 포인트</div></div>'
        +'<div class="gantt-detail-focus-grid">'
          +workFocusItems.map(item=>'<div class="gantt-detail-focus-item is-'+item.tone+'"><div class="gantt-detail-focus-title">'+esc(item.title)+'</div><div class="gantt-detail-focus-sub">'+esc(item.sub)+'</div></div>').join('')
        +'</div>'
      +'</div>'
      +'<div class="gantt-detail-section gantt-detail-section--flush">'
        +'<div class="gantt-detail-section-head"><div class="gantt-panel-title">실행 / 일정 신호</div></div>'
        +'<div class="gantt-detail-list">'+((memberSchedules||[]).map(schedule=>'<div class="gantt-detail-item is-clickable" onclick="openScheduleModal(\''+schedule.id+'\')"><div><div class="gantt-detail-item-title">'+esc(getScheduleMemberLabel(schedule))+' '+esc(scheduleLabel(schedule.schedule_type))+'</div><div class="gantt-detail-item-sub">'+esc((schedule.start||'')+' ~ '+(schedule.end||'')+(schedule.location?' · '+schedule.location:''))+'</div></div><span class="badge '+(schedule.schedule_type==='leave'?'badge-orange':'badge-blue')+'">'+esc(scheduleLabel(schedule.schedule_type))+'</span></div>').join('')||'<div class="gantt-detail-empty">담당자 휴가/필드웍 일정이 없습니다.</div>')+'</div>'
      +'</div>'
    +'</div>';
}

function renderGanttProjectIssuesSection(project){
  return ''
    +'<div class="gantt-detail-pane">'
      +'<div class="gantt-detail-section gantt-detail-section--flush">'
        +'<div class="gantt-detail-section-head"><div class="gantt-panel-title">프로젝트 이슈</div><button type="button" class="gantt-detail-link" onclick="openProjModal(\''+project.id+'\',null,null,\'issue\')">전체 이슈 보기</button></div>'
        +'<div class="gantt-detail-list" id="ganttDetailIssueList"><div class="gantt-detail-empty">불러오는 중...</div></div>'
      +'</div>'
    +'</div>';
}

function renderGanttProjectMemoSection(project){
  const noteCards=[
    {label:'프로젝트 메모',value:project?.memo||'',tab:'basic'},
    {label:'결과 요약',value:project?.result_summary||'',tab:'completion'},
    {label:'내부 작업 메모',value:project?.work_summary||'',tab:'completion'},
    {label:'이슈 / 리스크 메모',value:project?.issue_note||'',tab:'completion'},
    {label:'후속 액션',value:project?.follow_up_note||'',tab:'completion'}
  ].filter(card=>String(card.value||'').trim());
  return ''
    +'<div class="gantt-detail-pane">'
      +'<div class="gantt-detail-section gantt-detail-section--flush">'
        +'<div class="gantt-detail-section-head"><div class="gantt-panel-title">자료 요청</div><button type="button" class="gantt-detail-link" onclick="openProjModal(\''+project.id+'\',null,null,\'documents\')">자료요청 관리</button></div>'
        +'<div class="gantt-detail-list" id="ganttDetailDocumentList"><div class="gantt-detail-empty">불러오는 중...</div></div>'
      +'</div>'
      +'<div class="gantt-detail-section">'
        +'<div class="gantt-detail-section-head"><div class="gantt-panel-title">메모 / 운영 노트</div></div>'
        +(noteCards.length
          ?'<div class="gantt-detail-note-grid">'+noteCards.map(card=>'<button type="button" class="gantt-detail-note-card" onclick="openProjModal(\''+project.id+'\',null,null,\''+card.tab+'\')"><div class="gantt-detail-note-label">'+esc(card.label)+'</div><div class="gantt-detail-note-text">'+esc(card.value)+'</div></button>').join('')+'</div>'
          :'<div class="gantt-detail-empty">등록된 메모나 운영 노트가 없습니다.</div>')
      +'</div>'
    +'</div>';
}

async function loadGanttDetailAsync(project){
  const projectId=project?.id||'';
  if(!projectId)return;
  try{
    const [issueRows,documentRows]=await Promise.all([
      api('GET','project_issues?project_id=eq.'+projectId+'&'+(typeof getIssueActiveStatusFilter==='function'?getIssueActiveStatusFilter():'status=neq.resolved')+'&select=id,project_id,title,status,priority,is_pinned,assignee_name,assignee_member_id,owner_name,created_at').catch(()=>[]),
      api('GET','document_requests?project_id=eq.'+projectId+'&status=eq.pending&select=id,project_id,title,due_date,sort_order&order=sort_order.asc').catch(()=>[])
    ]);
    if(String(ganttFocusProjectId||'')!==String(projectId))return;
    const sortedIssues=[...(issueRows||[])].sort((a,b)=>{
      const pinDiff=Number(!!b.is_pinned)-Number(!!a.is_pinned);
      if(pinDiff)return pinDiff;
      const highDiff=Number(String(b.priority||'')==='high')-Number(String(a.priority||'')==='high');
      if(highDiff)return highDiff;
      return toDate(b.created_at)-toDate(a.created_at);
    }).slice(0,3);
    renderGanttDetailIssuePreview(projectId,sortedIssues);
    renderGanttDetailDocumentPreview(projectId,(documentRows||[]).slice(0,3));
  }catch(e){
    const issueContainer=document.getElementById('ganttDetailIssueList');
    const docContainer=document.getElementById('ganttDetailDocumentList');
    if(issueContainer)issueContainer.innerHTML='<div class="gantt-detail-empty">이슈를 불러오지 못했습니다.</div>';
    if(docContainer)docContainer.innerHTML='<div class="gantt-detail-empty">자료 요청을 불러오지 못했습니다.</div>';
  }
}

function getGanttProjectTaskLoadMeta(projectId){
  const key=String(projectId||'');
  return ganttProjectTaskLoadMetaByProjectId[key]||{loading:false,error:''};
}

function getGanttProjectTaskApiPath(queryString){
  return GANTT_PROJECT_TASK_TABLE+(queryString?('?'+queryString):'');
}

function isMissingGanttProjectTaskTableError(error){
  return /Could not find the table 'public\.project_tasks'/i.test(String(error?.message||''));
}

function getMissingGanttProjectTaskTableMessage(){
  return GANTT_PROJECT_TASK_TABLE+' 테이블이 라이브 DB에 없습니다. 먼저 '+GANTT_PROJECT_TASK_MIGRATION_FILE+' 을 적용해 주세요.';
}

function getGanttProjectTasks(projectId){
  const key=String(projectId||'');
  return Array.isArray(ganttProjectTasksByProjectId[key])?ganttProjectTasksByProjectId[key]:[];
}

function setGanttProjectTaskLoadMeta(projectId,patch){
  const key=String(projectId||'');
  ganttProjectTaskLoadMetaByProjectId[key]={
    ...getGanttProjectTaskLoadMeta(key),
    ...(patch||{})
  };
}

function getGanttTaskMemberName(memberId){
  if(!memberId)return '';
  return members.find(member=>String(member?.id||'')===String(memberId||''))?.name||'';
}

function getGanttTaskStatusBadgeClass(status){
  if(status==='진행중')return 'badge-blue';
  if(status==='완료')return 'badge-green';
  if(status==='대기')return 'badge-orange';
  if(status==='보류')return 'badge-gray';
  return 'badge-blue';
}

function getGanttTaskPriorityLabel(priority){
  return GANTT_TASK_PRIORITY_OPTIONS.find(option=>option.value===priority)?.label||'보통';
}

function getGanttTaskPriorityBadgeClass(priority){
  if(priority==='high')return 'badge-red';
  if(priority==='low')return 'badge-gray';
  return 'badge-blue';
}

function getGanttTaskProgressValue(task){
  const numeric=Number(task?.progress_percent);
  if(Number.isNaN(numeric))return task?.status==='완료'?100:0;
  return Math.max(0,Math.min(100,Math.round(numeric)));
}

function getGanttTaskDateRangeLabel(task){
  const start=task?.start_date||'시작 미정';
  const due=task?.due_date||'기한 미정';
  return start+' ~ '+due;
}

function getGanttTaskDueMeta(task,baseDate=getHomeBaseDate()){
  const dueDate=toDate(task?.due_date||'');
  if(Number.isNaN(dueDate.getTime()))return {label:'기한 미정',tone:'neutral'};
  const today=new Date(baseDate.getFullYear(),baseDate.getMonth(),baseDate.getDate());
  const due=new Date(dueDate.getFullYear(),dueDate.getMonth(),dueDate.getDate());
  const diff=Math.round((due-today)/86400000);
  if(task?.status==='완료')return {label:'완료',tone:'good'};
  if(diff<0)return {label:'지연 D+'+Math.abs(diff),tone:'danger'};
  if(diff===0)return {label:'오늘 마감',tone:'warn'};
  return {label:'D-'+diff,tone:diff<=3?'warn':'neutral'};
}

function getGanttTaskActionHint(task){
  const assignee=getGanttTaskMemberName(task?.assignee_member_id);
  const dueMeta=getGanttTaskDueMeta(task);
  if(task?.status==='완료')return task?.actual_done_at?'완료 일시가 기록된 업무입니다.':'완료로 표시된 업무입니다.';
  if(!assignee)return '담당자를 지정해 후속 작업 책임을 정해 주세요.';
  if(dueMeta.tone==='danger')return assignee+' 담당 업무가 기한을 넘겼습니다. 우선순위를 확인해 주세요.';
  if(dueMeta.tone==='warn')return assignee+' 담당 업무의 기한이 가깝습니다. 진행 상황을 확인해 주세요.';
  if(task?.status==='대기')return '대기 사유와 다음 재개 시점을 함께 확인해 주세요.';
  return assignee+' 담당 업무입니다. 진행률과 기한을 함께 관리해 주세요.';
}

function getNextGanttProjectTaskSortOrder(projectId){
  return getGanttProjectTasks(projectId).reduce((maxValue,task)=>Math.max(maxValue,Number(task?.sort_order)||0),0)+1;
}

function getGanttProjectTaskSummary(projectId){
  const tasks=getGanttProjectTasks(projectId);
  const summary={total:tasks.length,inProgress:0,done:0,overdue:0};
  tasks.forEach(task=>{
    if(task?.status==='완료')summary.done+=1;
    if(task?.status==='진행중')summary.inProgress+=1;
    if(getGanttTaskDueMeta(task).tone==='danger')summary.overdue+=1;
  });
  return summary;
}

function renderGanttTaskRows(projectId){
  const tasks=getGanttProjectTasks(projectId);
  return tasks.map(task=>{
    const assignee=getGanttTaskMemberName(task?.assignee_member_id)||'담당자 미지정';
    const dueMeta=getGanttTaskDueMeta(task);
    const progress=getGanttTaskProgressValue(task);
    const priority=String(task?.priority||'medium');
    return ''
      +'<div class="gantt-task-row is-'+dueMeta.tone+'" onclick="openProjectTaskModal(\''+projectId+'\',\''+task.id+'\')">'
        +'<div class="gantt-task-main">'
          +'<div class="gantt-task-title-row">'
            +'<div class="gantt-task-title">'+esc(task?.title||'제목 없는 업무')+'</div>'
            +'<span class="badge '+getGanttTaskPriorityBadgeClass(priority)+'">'+getGanttTaskPriorityLabel(priority)+'</span>'
          +'</div>'
          +(task?.description?'<div class="gantt-task-desc">'+esc(truncateText(task.description,140))+'</div>':'')
          +'<div class="gantt-task-meta-row">'
            +'<span class="gantt-task-meta-pill">'+esc(assignee)+'</span>'
            +'<span class="gantt-task-meta-pill">'+esc(getGanttTaskDateRangeLabel(task))+'</span>'
          +'</div>'
          +'<div class="gantt-task-action-hint">'+esc(getGanttTaskActionHint(task))+'</div>'
        +'</div>'
        +'<div class="gantt-task-side">'
          +'<span class="badge '+getGanttTaskStatusBadgeClass(task?.status)+'">'+esc(task?.status||'예정')+'</span>'
          +'<div class="gantt-task-progress-block"><div class="gantt-task-progress-value">'+progress+'%</div><div class="gantt-task-progress-track"><div class="gantt-task-progress-fill" style="width:'+progress+'%"></div></div></div>'
          +'<div class="gantt-task-due is-'+dueMeta.tone+'">'+esc(dueMeta.label)+'</div>'
          +'<div class="gantt-task-row-actions">'
            +(task?.status!=='완료'
              ?'<button type="button" class="btn sm" onclick="event.stopPropagation();completeProjectTask(\''+projectId+'\',\''+task.id+'\')">완료</button>'
              :'')
            +'<button type="button" class="btn ghost sm" onclick="event.stopPropagation();openProjectTaskModal(\''+projectId+'\',\''+task.id+'\')">수정</button>'
          +'</div>'
        +'</div>'
      +'</div>';
  }).join('');
}

function renderGanttTaskEmptyState(projectId,loadMeta){
  if(loadMeta.loading){
    return '<div class="gantt-detail-empty-state"><div class="gantt-detail-value">업무를 불러오는 중입니다.</div><div class="gantt-detail-meta">선택한 프로젝트의 업무 목록을 가져오고 있습니다.</div></div>';
  }
  if(loadMeta.error){
    return '<div class="gantt-detail-empty-state"><div class="gantt-detail-value">업무 테이블을 아직 사용할 수 없습니다.</div><div class="gantt-detail-meta">'+esc(loadMeta.error)+'</div></div>';
  }
  return ''
    +'<div class="gantt-detail-empty-state gantt-task-empty-state">'
      +'<div class="gantt-detail-value">아직 등록된 업무가 없습니다.</div>'
      +'<div class="gantt-detail-meta">프로젝트 수준 개요는 위에서 확인하고, 실제 실행 업무는 여기서 하나씩 추가해 관리할 수 있습니다.</div>'
      +'<div><button type="button" class="btn primary sm" onclick="openProjectTaskModal(\''+projectId+'\')">+ 업무 추가</button></div>'
    +'</div>';
}

function getProjectTaskModalMemberOptions(selectedId){
  const normalized=String(selectedId||'');
  return '<option value="">담당자 미지정</option>'
    +getOperationalMembers()


      .map(member=>'<option value="'+member.id+'"'+(String(member.id)===normalized?' selected':'')+'>'+esc(member.name||'이름 없음')+'</option>').join('');
}

async function loadGanttProjectTasks(projectId,force){
  const key=String(projectId||'');
  if(!key)return;
  const loadMeta=getGanttProjectTaskLoadMeta(key);
  if(loadMeta.loading)return;
  if(!force&&Array.isArray(ganttProjectTasksByProjectId[key]))return;
  setGanttProjectTaskLoadMeta(key,{loading:true,error:''});
  if(String(ganttFocusProjectId||'')===key&&ganttDetailTab==='work'){
    const currentData=getGanttFilteredData();
    renderGanttDetailPanel(currentData.projs,currentData.schs);
  }
  try{
    const rows=await api('GET',getGanttProjectTaskApiPath('project_id=eq.'+key+'&select=*&order=sort_order.asc,created_at.asc'));
    ganttProjectTasksByProjectId[key]=Array.isArray(rows)?rows:[];
    setGanttProjectTaskLoadMeta(key,{loading:false,error:''});
  }catch(error){
    ganttProjectTasksByProjectId[key]=[];
    setGanttProjectTaskLoadMeta(key,{
      loading:false,
      error:isMissingGanttProjectTaskTableError(error)
        ?getMissingGanttProjectTaskTableMessage()
        :(error?.message||GANTT_PROJECT_TASK_TABLE+' 테이블 조회 중 오류가 발생했습니다.')
    });
  }
  if(String(ganttFocusProjectId||'')===key&&ganttDetailTab==='work'){
    const currentData=getGanttFilteredData();
    renderGanttDetailPanel(currentData.projs,currentData.schs);
  }
}

function openProjectTaskModal(projectId,taskId){
  const project=projects.find(row=>String(row?.id||'')===String(projectId||''));
  if(!project)return;
  const task=(getGanttProjectTasks(projectId)||[]).find(row=>String(row?.id||'')===String(taskId||''))||null;
  editingProjectTaskProjectId=String(projectId||'');
  editingProjectTaskId=String(task?.id||'');
  const overlayHtml=typeof getInputModalOverlayHtml==='function'?getInputModalOverlayHtml():'<div class="overlay" data-modal-kind="input" data-backdrop-close="off">';
  const progressValue=String(getGanttTaskProgressValue(task));
  document.getElementById('modalArea').innerHTML=''
    +overlayHtml
    +'<div class="modal project-task-modal">'
      +'<div class="modal-header"><div><div class="modal-title">'+(task?'업무 수정':'업무 추가')+'</div><div class="modal-sub">프로젝트: '+esc(project.name||'프로젝트 없음')+'</div></div><button class="icon-btn" onclick="closeModal()">✕</button></div>'
      +'<div class="project-task-form">'
        +'<div class="form-row"><label class="form-label">업무 제목</label><input id="taskTitle" value="'+esc(task?.title||'')+'" placeholder="예: 고객 전달 자료 최종 검토"></div>'
        +'<div class="form-grid two">'
          +'<div class="form-row"><label class="form-label">담당자</label><select id="taskAssignee">'+getProjectTaskModalMemberOptions(task?.assignee_member_id||'')+'</select></div>'
          +'<div class="form-row"><label class="form-label">상태</label><select id="taskStatus">'+GANTT_TASK_STATUS_OPTIONS.map(status=>'<option value="'+status+'"'+((task?.status||'예정')===status?' selected':'')+'>'+status+'</option>').join('')+'</select></div>'
          +'<div class="form-row"><label class="form-label">우선순위</label><select id="taskPriority">'+GANTT_TASK_PRIORITY_OPTIONS.map(option=>'<option value="'+option.value+'"'+((String(task?.priority||'medium')===option.value)?' selected':'')+'>'+option.label+'</option>').join('')+'</select></div>'
          +'<div class="form-row"><label class="form-label">진행률</label><div class="project-hours-input"><input id="taskProgress" type="number" min="0" max="100" step="5" value="'+progressValue+'"><span>%</span></div></div>'
          +'<div class="form-row"><label class="form-label">시작일</label><input id="taskStart" type="date" value="'+esc(task?.start_date||'')+'"></div>'
          +'<div class="form-row"><label class="form-label">기한</label><input id="taskDue" type="date" value="'+esc(task?.due_date||'')+'"></div>'
        +'</div>'
        +'<div class="form-row"><label class="form-label">설명</label><textarea id="taskDescription" class="project-modal-memo" placeholder="업무 맥락이나 다음 액션을 간단히 남겨 주세요.">'+esc(task?.description||'')+'</textarea></div>'
      +'</div>'
      +'<div class="modal-footer"><div class="muted">필수 입력은 업무 제목만이며, 나머지는 나중에 보강해도 됩니다.</div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">취소</button><button class="btn primary" onclick="saveProjectTask()">저장</button></div></div>'
    +'</div>'
    +'</div>';
  if(typeof bindModalEscapeHandler==='function')bindModalEscapeHandler();
  if(typeof lockBodyScroll==='function')lockBodyScroll();
}

async function saveProjectTask(){
  const projectId=String(editingProjectTaskProjectId||'');
  if(!projectId)return;
  const taskId=String(editingProjectTaskId||'');
  const existingTask=getGanttProjectTasks(projectId).find(task=>String(task?.id||'')===taskId)||null;
  const title=document.getElementById('taskTitle')?.value.trim();
  if(!title){
    alert('업무 제목을 입력해 주세요.');
    return;
  }
  const status=String(existingTask?.status||'예정').trim()||'예정';
  const priority=String(existingTask?.priority||'medium').trim()||'medium';
  const assigneeMemberId=document.getElementById('taskAssignee')?.value||null;
  const startDate=existingTask?.start_date||null;
  const dueDate=document.getElementById('taskDue')?.value||null;
  const description=document.getElementById('taskDescription')?.value.trim()||null;
  const existingProgress=Number(existingTask?.progress_percent);
  const progressValue=status==='완료'
    ?100
    :Math.max(0,Math.min(100,Number.isNaN(existingProgress)?0:existingProgress));
  const nowIso=new Date().toISOString();
  const body={
    project_id:projectId,
    title,
    description,
    status,
    priority,
    owner_member_id:existingTask?.owner_member_id||currentMember?.id||null,
    assignee_member_id:assigneeMemberId||null,
    start_date:startDate,
    due_date:dueDate,
    actual_done_at:status==='완료'?(existingTask?.actual_done_at||nowIso):null,
    progress_percent:progressValue,
    sort_order:existingTask?.sort_order??getNextGanttProjectTaskSortOrder(projectId),
    created_by:existingTask?.created_by||currentUser?.id||null,
    updated_at:nowIso
  };
  try{
    if(taskId){
      await api('PATCH',getGanttProjectTaskApiPath('id=eq.'+taskId),body);
    }else{
      await api('POST',getGanttProjectTaskApiPath(),{
        ...body,
        created_at:nowIso
      });
    }
    closeModal();
    await loadGanttProjectTasks(projectId,true);
  }catch(error){
    alert(isMissingGanttProjectTaskTableError(error)
      ?getMissingGanttProjectTaskTableMessage()
      :'업무 저장 중 오류가 발생했습니다: '+error.message);
  }
}

async function completeProjectTask(projectId,taskId){
  const projectKey=String(projectId||'');
  const task=getGanttProjectTasks(projectKey).find(row=>String(row?.id||'')===String(taskId||''));
  if(!task)return;
  try{
    await api('PATCH',getGanttProjectTaskApiPath('id=eq.'+taskId),{
      status:'완료',
      progress_percent:100,
      actual_done_at:task?.actual_done_at||new Date().toISOString(),
      updated_at:new Date().toISOString()
    });
    await loadGanttProjectTasks(projectKey,true);
  }catch(error){
    alert(isMissingGanttProjectTaskTableError(error)
      ?getMissingGanttProjectTaskTableMessage()
      :'업무 상태를 바꾸는 중 오류가 발생했습니다: '+error.message);
  }
}

async function deleteProjectTask(projectId,taskId){
  const projectKey=String(projectId||'');
  const taskKey=String(taskId||'');
  const task=getGanttProjectTasks(projectKey).find(row=>String(row?.id||'')===taskKey);
  if(!projectKey||!taskKey||!task)return;
  if(!confirm('"'+(task.title||'이 업무')+'"를 삭제할까요?'))return;
  try{
    await api('DELETE',getGanttProjectTaskApiPath('id=eq.'+taskKey));
    if(String(editingProjectTaskId||'')===taskKey){
      closeModal();
    }
    await loadGanttProjectTasks(projectKey,true);
  }catch(error){
    alert(isMissingGanttProjectTaskTableError(error)
      ?getMissingGanttProjectTaskTableMessage()
      :'업무 삭제 중 오류가 발생했습니다: '+error.message);
  }
}

function renderGanttProjectWorkSection(project,memberSchedules){
  const taskSummary=getGanttProjectTaskSummary(project?.id);
  const loadMeta=getGanttProjectTaskLoadMeta(project?.id);
  return ''
    +'<div class="gantt-detail-pane">'
      +'<div class="gantt-task-summary-grid">'
        +'<div class="gantt-detail-work-card"><div class="gantt-detail-label">전체 업무</div><div class="gantt-detail-value">'+taskSummary.total+'건</div><div class="gantt-detail-meta">프로젝트 안에서 직접 관리하는 업무 수</div></div>'
        +'<div class="gantt-detail-work-card"><div class="gantt-detail-label">진행중</div><div class="gantt-detail-value">'+taskSummary.inProgress+'건</div><div class="gantt-detail-meta">현재 진행중으로 표시된 업무</div></div>'
        +'<div class="gantt-detail-work-card"><div class="gantt-detail-label">기한 초과</div><div class="gantt-detail-value">'+taskSummary.overdue+'건</div><div class="gantt-detail-meta">오늘 기준 기한을 넘긴 업무</div></div>'
        +'<div class="gantt-detail-work-card"><div class="gantt-detail-label">완료</div><div class="gantt-detail-value">'+taskSummary.done+'건</div><div class="gantt-detail-meta">완료 처리된 업무</div></div>'
      +'</div>'
      +'<div class="gantt-detail-section gantt-detail-section--flush">'
        +'<div class="gantt-detail-section-head"><div><div class="gantt-panel-title">업무</div><div class="gantt-detail-meta">프로젝트 수준 개요는 위에서 확인하고, 실제 실행 업무는 여기서 하나씩 관리합니다.</div></div><button type="button" class="btn primary sm" onclick="openProjectTaskModal(\''+project.id+'\')">+ 업무 추가</button></div>'
        +((getGanttProjectTasks(project?.id)||[]).length
          ?'<div class="gantt-task-list-head"><span>업무</span><span>담당 / 기한</span><span>상태 / 진행률</span></div><div class="gantt-task-list">'+renderGanttTaskRows(project.id)+'</div>'
          :renderGanttTaskEmptyState(project.id,loadMeta))
      +'</div>'
      +'<div class="gantt-detail-section">'
        +'<div class="gantt-detail-section-head"><div><div class="gantt-panel-title">일정 참고</div><div class="gantt-detail-meta">휴가·필드웍은 업무와 별도로 유지하되, 실행 영향만 함께 확인합니다.</div></div></div>'
        +'<div class="gantt-detail-list">'+((memberSchedules||[]).map(schedule=>'<div class="gantt-detail-item is-clickable" onclick="openScheduleModal(\''+schedule.id+'\')"><div><div class="gantt-detail-item-title">'+esc(getScheduleMemberLabel(schedule))+' '+esc(scheduleLabel(schedule.schedule_type))+'</div><div class="gantt-detail-item-sub">'+esc((schedule.start||'')+' ~ '+(schedule.end||'')+(schedule.location?' · '+schedule.location:''))+'</div></div><span class="badge '+(schedule.schedule_type==='leave'?'badge-orange':'badge-blue')+'">'+esc(scheduleLabel(schedule.schedule_type))+'</span></div>').join('')||'<div class="gantt-detail-empty">해당 멤버의 휴가/필드웍 일정이 없습니다.</div>')+'</div>'
      +'</div>'
    +'</div>';
}

function getGanttTaskDateValue(value){
  const normalized=String(value||'').trim();
  if(!/^\d{4}-\d{2}-\d{2}$/.test(normalized))return '';
  return normalized;
}

function formatGanttTaskShortDate(value){
  const normalized=getGanttTaskDateValue(value);
  if(!normalized)return '';
  const date=toDate(normalized);
  if(Number.isNaN(date.getTime()))return '';
  return formatRangeShort(normalized,normalized);
}

function getGanttTaskDateDisplayMeta(task){
  const startValue=getGanttTaskDateValue(task?.start_date);
  const dueValue=getGanttTaskDateValue(task?.due_date);
  return {
    startValue,
    dueValue,
    startText:startValue?formatGanttTaskShortDate(startValue):'시작 미정',
    dueText:dueValue?formatGanttTaskShortDate(dueValue):'기한 미정'
  };
}

function getGanttTaskDateRangeLabel(task){
  const dateMeta=getGanttTaskDateDisplayMeta(task);
  return dateMeta.startText+' ~ '+dateMeta.dueText;
}

function getGanttTaskDueMeta(task,baseDate=getHomeBaseDate()){
  if(task?.status==='완료')return {label:'완료',tone:'good'};
  const dueValue=getGanttTaskDateValue(task?.due_date);
  if(!dueValue)return {label:'기한 미정',tone:'neutral'};
  const dueDate=toDate(dueValue);
  if(Number.isNaN(dueDate.getTime()))return {label:'기한 미정',tone:'neutral'};
  const today=new Date(baseDate.getFullYear(),baseDate.getMonth(),baseDate.getDate());
  const due=new Date(dueDate.getFullYear(),dueDate.getMonth(),dueDate.getDate());
  const diff=Math.round((due-today)/86400000);
  if(diff<0)return {label:'지연 D+'+Math.abs(diff),tone:'danger'};
  if(diff===0)return {label:'오늘 마감',tone:'warn'};
  return {label:'D-'+diff,tone:diff<=3?'warn':'neutral'};
}

function getGanttTaskActionHint(task){
  const assignee=getGanttTaskMemberName(task?.assignee_member_id);
  const dueMeta=getGanttTaskDueMeta(task);
  if(task?.status==='완료')return task?.actual_done_at?'완료 일시가 기록된 업무입니다.':'완료로 표시된 업무입니다.';
  if(task?.status==='대기')return '대기 사유와 다음 점검 시점을 짧게 남겨 두면 회의에서 다시 보기 쉽습니다.';
  if(task?.status==='보류')return '보류 중인 업무입니다. 재개 여부와 우선순위를 다음 회의에서 확인해 주세요.';
  if(!assignee)return '담당자를 지정해 후속 작업 책임을 정해 주세요.';
  if(dueMeta.tone==='danger')return assignee+' 담당 업무가 기한을 넘겼습니다. 우선순위를 확인해 주세요.';
  if(dueMeta.tone==='warn')return assignee+' 담당 업무는 기한이 가깝습니다. 진행 상황을 확인해 주세요.';
  return assignee+' 담당 업무입니다. 진행률과 기한을 함께 관리해 주세요.';
}

function getGanttTaskStatusTone(status){
  if(status==='완료')return 'done';
  if(status==='대기')return 'waiting';
  if(status==='진행중')return 'active';
  if(status==='보류')return 'hold';
  return 'planned';
}

function getGanttTaskRowTone(task,dueMeta){
  if(dueMeta?.tone==='danger')return 'danger';
  if(dueMeta?.tone==='warn')return 'warn';
  return getGanttTaskStatusTone(task?.status);
}

function getGanttTaskLinkedIssueCount(projectId,taskId){
  const projectKey=String(projectId||'');
  const taskKey=String(taskId||'');
  if(!projectKey||!taskKey)return 0;
  const counts=ganttProjectTaskIssueCountsByProjectId[projectKey];
  if(!counts||typeof counts!=='object')return 0;
  return Number(counts[taskKey]||0);
}

async function loadGanttProjectTaskIssueCounts(projectId,force){
  const key=String(projectId||'');
  if(!key)return;
  if(!force&&ganttProjectTaskIssueCountsByProjectId[key]!==undefined)return;
  try{
    const rows=await api(
      'GET',
      'project_issues?project_id=eq.'+key
      +'&'+(typeof getIssueActiveStatusFilter==='function'?getIssueActiveStatusFilter():'status=neq.resolved')
      +'&select=id,task_id,status'
    );
    const counts={};
    (Array.isArray(rows)?rows:[]).forEach(issue=>{
      const taskKey=String(issue?.task_id||'').trim();
      if(!taskKey)return;
      counts[taskKey]=(counts[taskKey]||0)+1;
    });
    ganttProjectTaskIssueCountsByProjectId[key]=counts;
  }catch(error){
    ganttProjectTaskIssueCountsByProjectId[key]=null;
  }
}

function getGanttProjectTaskSummary(projectId){
  const tasks=getGanttProjectTasks(projectId);
  const summary={total:tasks.length,inProgress:0,waiting:0,done:0,overdue:0};
  tasks.forEach(task=>{
    if(task?.status==='완료')summary.done+=1;
    if(task?.status==='진행중')summary.inProgress+=1;
    if(task?.status==='대기')summary.waiting+=1;
    if(getGanttTaskDueMeta(task).tone==='danger')summary.overdue+=1;
  });
  return summary;
}

function renderGanttTaskRows(projectId){
  const tasks=getGanttProjectTasks(projectId);
  return tasks.map(task=>{
    const assignee=getGanttTaskMemberName(task?.assignee_member_id)||'담당자 미정';
    const dueMeta=getGanttTaskDueMeta(task);
    const progress=getGanttTaskProgressValue(task);
    const priority=String(task?.priority||'medium');
    const rowTone=getGanttTaskRowTone(task,dueMeta);
    const dateMeta=getGanttTaskDateDisplayMeta(task);
    const issueCount=getGanttTaskLinkedIssueCount(projectId,task?.id);
    return ''
      +'<div class="gantt-task-row is-'+rowTone+'" onclick="openProjectTaskModal(\''+projectId+'\',\''+task.id+'\')">'
        +'<div class="gantt-task-main">'
          +'<div class="gantt-task-title-row">'
            +'<div class="gantt-task-title">'+esc(task?.title||'제목 없는 업무')+'</div>'
            +'<span class="badge '+getGanttTaskPriorityBadgeClass(priority)+'">'+getGanttTaskPriorityLabel(priority)+'</span>'
            +(issueCount>0?'<span class="gantt-task-context-badge is-issue">이슈 '+issueCount+'건</span>':'')
          +'</div>'
          +(task?.description?'<div class="gantt-task-desc">'+esc(truncateText(task.description,140))+'</div>':'')
          +'<div class="gantt-task-action-hint">'+esc(getGanttTaskActionHint(task))+'</div>'
        +'</div>'
        +'<div class="gantt-task-info">'
          +'<div class="gantt-task-info-row"><span class="gantt-task-info-label">담당</span><span class="gantt-task-info-value">'+esc(assignee)+'</span></div>'
          +'<div class="gantt-task-info-row"><span class="gantt-task-info-label">시작</span><span class="gantt-task-info-value">'+esc(dateMeta.startText)+'</span></div>'
          +'<div class="gantt-task-info-row"><span class="gantt-task-info-label">기한</span><span class="gantt-task-info-value is-'+dueMeta.tone+'">'+esc(dateMeta.dueText)+'</span></div>'
        +'</div>'
        +'<div class="gantt-task-side">'
          +'<div class="gantt-task-side-top">'
            +'<span class="badge '+getGanttTaskStatusBadgeClass(task?.status)+'">'+esc(task?.status||'예정')+'</span>'
            +'<div class="gantt-task-due is-'+dueMeta.tone+'">'+esc(dueMeta.label)+'</div>'
          +'</div>'
          +'<div class="gantt-task-progress-block"><div class="gantt-task-progress-value">'+progress+'%</div><div class="gantt-task-progress-track"><div class="gantt-task-progress-fill" style="width:'+progress+'%"></div></div></div>'
          +'<div class="gantt-task-row-actions">'
            +(task?.status!=='완료'
              ?'<button type="button" class="btn sm" onclick="event.stopPropagation();completeProjectTask(\''+projectId+'\',\''+task.id+'\')">완료</button>'
              :'')
            +'<button type="button" class="btn ghost sm" onclick="event.stopPropagation();openProjectTaskModal(\''+projectId+'\',\''+task.id+'\')">수정</button>'
          +'</div>'
        +'</div>'
      +'</div>';
  }).join('');
}

function renderGanttTaskEmptyState(projectId,loadMeta){
  if(loadMeta.loading){
    return '<div class="gantt-detail-empty-state"><div class="gantt-detail-value">업무를 불러오는 중입니다.</div><div class="gantt-detail-meta">선택한 프로젝트의 업무 목록을 가져오고 있습니다.</div></div>';
  }
  if(loadMeta.error){
    return '<div class="gantt-detail-empty-state"><div class="gantt-detail-value">업무 테이블을 아직 사용할 수 없습니다.</div><div class="gantt-detail-meta">'+esc(loadMeta.error)+'</div></div>';
  }
  return ''
    +'<div class="gantt-detail-empty-state gantt-task-empty-state">'
      +'<div class="gantt-detail-value">아직 실행할 업무가 없습니다.</div>'
      +'<div class="gantt-detail-meta">Work 탭은 프로젝트 안에서 오늘 할 일을 관리하는 곳입니다. 업무 제목만 먼저 만들고 담당자와 기한은 나중에 보강해도 됩니다.</div>'
      +'<ul class="gantt-task-empty-points"><li>먼저 해야 할 일부터 1~3개만 등록해도 충분합니다.</li><li>기한이 없더라도 저장할 수 있고, 나중에 일정만 보강하면 됩니다.</li></ul>'
      +'<div><button type="button" class="btn primary sm" onclick="openProjectTaskModal(\''+projectId+'\')">+ 업무 추가</button></div>'
    +'</div>';
}

async function loadGanttProjectTasks(projectId,force){
  const key=String(projectId||'');
  if(!key)return;
  const loadMeta=getGanttProjectTaskLoadMeta(key);
  if(loadMeta.loading)return;
  if(!force&&Array.isArray(ganttProjectTasksByProjectId[key])){
    if(ganttProjectTaskIssueCountsByProjectId[key]===undefined){
      await loadGanttProjectTaskIssueCounts(key,false);
      if(String(ganttFocusProjectId||'')===key&&ganttDetailTab==='work'){
        const currentData=getGanttFilteredData();
        renderGanttDetailPanel(currentData.projs,currentData.schs);
      }
    }
    refreshGanttSupportTaskCompatibility(key);
    return;
  }
  setGanttProjectTaskLoadMeta(key,{loading:true,error:''});
  refreshGanttSupportTaskCompatibility(key);
  if(String(ganttFocusProjectId||'')===key&&ganttDetailTab==='work'){
    const currentData=getGanttFilteredData();
    renderGanttDetailPanel(currentData.projs,currentData.schs);
  }
  try{
    const rows=await api('GET',getGanttProjectTaskApiPath('project_id=eq.'+key+'&select=*&order=sort_order.asc,created_at.asc'));
    ganttProjectTasksByProjectId[key]=Array.isArray(rows)?rows:[];
    setGanttProjectTaskLoadMeta(key,{loading:false,error:''});
    await loadGanttProjectTaskIssueCounts(key,true);
  }catch(error){
    ganttProjectTasksByProjectId[key]=[];
    ganttProjectTaskIssueCountsByProjectId[key]=null;
    setGanttProjectTaskLoadMeta(key,{
      loading:false,
      error:isMissingGanttProjectTaskTableError(error)
        ?getMissingGanttProjectTaskTableMessage()
        :(error?.message||GANTT_PROJECT_TASK_TABLE+' 테이블 조회 중 오류가 발생했습니다.')
    });
  }
  if(String(ganttFocusProjectId||'')===key&&ganttDetailTab==='work'){
    const currentData=getGanttFilteredData();
    renderGanttDetailPanel(currentData.projs,currentData.schs);
  }
  refreshGanttSupportTaskCompatibility(key);
}

function syncProjectTaskStatusUI(){
  const statusEl=document.getElementById('taskStatus');
  const progressEl=document.getElementById('taskProgress');
  if(!statusEl||!progressEl)return;
  if(statusEl.value==='완료')progressEl.value='100';
}

function openProjectTaskModal(projectId,taskId){
  const project=projects.find(row=>String(row?.id||'')===String(projectId||''));
  if(!project)return;
  const task=(getGanttProjectTasks(projectId)||[]).find(row=>String(row?.id||'')===String(taskId||''))||null;
  editingProjectTaskProjectId=String(projectId||'');
  editingProjectTaskId=String(task?.id||'');
  const overlayHtml=typeof getInputModalOverlayHtml==='function'?getInputModalOverlayHtml():'<div class="overlay" data-modal-kind="input" data-backdrop-close="off">';
  document.getElementById('modalArea').innerHTML=''
    +overlayHtml
    +'<div class="modal project-task-modal">'
      +'<div class="modal-header"><div><div class="modal-title">'+(task?'업무 수정':'업무 추가')+'</div><div class="modal-sub">프로젝트: '+esc(project.name||'프로젝트 없음')+'</div></div><button class="icon-btn" onclick="closeModal()">×</button></div>'
      +'<div class="project-task-modal-intro">업무 제목, 담당자, 기한만 정하면 바로 저장할 수 있습니다. 설명은 필요할 때만 짧게 남겨 주세요.</div>'
      +'<div class="project-task-form">'
        +'<div class="project-task-form-section">'
          +'<div class="project-task-form-section-title">업무 기본 정보</div>'
          +'<div class="form-row"><label class="form-label">업무 제목</label><input id="taskTitle" value="'+esc(task?.title||'')+'" placeholder="예: 고객 전달 자료 최종 검토"></div>'
          +'<div class="form-grid two">'
            +'<div class="form-row"><label class="form-label">담당자</label><select id="taskAssignee">'+getProjectTaskModalMemberOptions(task?.assignee_member_id||'')+'</select></div>'
            +'<div class="form-row"><label class="form-label">기한</label><input id="taskDue" type="date" value="'+esc(task?.due_date||'')+'"></div>'
          +'</div>'
          +'<div class="form-row"><label class="form-label">설명</label><textarea id="taskDescription" class="project-modal-memo" placeholder="업무 메모나 다음 액션을 간단히 적어 주세요">'+esc(task?.description||'')+'</textarea></div>'
        +'</div>'
      +'</div>'
      +'<div class="modal-footer"><div class="muted">필수 입력은 업무 제목만이며, 나머지는 운영 상황에 맞춰 나중에 보강해도 됩니다.</div><div class="modal-footer-right">'+(task?'<button class="btn ghost gantt-task-delete-btn" onclick="deleteProjectTask(\''+projectId+'\',\''+task.id+'\')">삭제</button>':'')+'<button class="btn ghost" onclick="closeModal()">취소</button><button class="btn primary" onclick="saveProjectTask()">저장</button></div></div>'
    +'</div>'
    +'</div>';
  if(typeof bindModalEscapeHandler==='function')bindModalEscapeHandler();
  if(typeof lockBodyScroll==='function')lockBodyScroll();
}

function renderGanttProjectWorkSection(project,memberSchedules){
  const taskSummary=getGanttProjectTaskSummary(project?.id);
  const loadMeta=getGanttProjectTaskLoadMeta(project?.id);
  return ''
    +'<div class="gantt-detail-pane">'
      +'<div class="gantt-task-summary-grid">'
        +'<div class="gantt-detail-work-card"><div class="gantt-detail-label">전체 업무</div><div class="gantt-detail-value">'+taskSummary.total+'건</div><div class="gantt-detail-meta">프로젝트 안에서 직접 관리하는 실행 업무</div></div>'
        +'<div class="gantt-detail-work-card"><div class="gantt-detail-label">진행중</div><div class="gantt-detail-value">'+taskSummary.inProgress+'건</div><div class="gantt-detail-meta">담당자와 기한을 보며 계속 추적할 업무</div></div>'
        +'<div class="gantt-detail-work-card"><div class="gantt-detail-label">대기</div><div class="gantt-detail-value">'+taskSummary.waiting+'건</div><div class="gantt-detail-meta">다음 점검 시점과 대기 사유 확인 필요</div></div>'
        +'<div class="gantt-detail-work-card"><div class="gantt-detail-label">기한 초과</div><div class="gantt-detail-value">'+taskSummary.overdue+'건</div><div class="gantt-detail-meta">오늘 기준 기한을 넘긴 업무</div></div>'
        +'<div class="gantt-detail-work-card"><div class="gantt-detail-label">완료</div><div class="gantt-detail-value">'+taskSummary.done+'건</div><div class="gantt-detail-meta">완료 처리된 업무</div></div>'
      +'</div>'
      +'<div class="gantt-detail-section gantt-detail-section--flush">'
        +'<div class="gantt-detail-section-head"><div><div class="gantt-panel-title">업무</div><div class="gantt-detail-meta">프로젝트 수준 개요는 위에서 확인하고, 실제 실행 업무는 여기서 담당·기한·진행률 중심으로 관리합니다.</div></div><button type="button" class="btn primary sm" onclick="openProjectTaskModal(\''+project.id+'\')">+ 업무 추가</button></div>'
        +((getGanttProjectTasks(project?.id)||[]).length
          ?'<div class="gantt-task-list-head"><span>업무</span><span>담당 · 일정</span><span>상태 · 진행률</span></div><div class="gantt-task-list">'+renderGanttTaskRows(project.id)+'</div>'
          :renderGanttTaskEmptyState(project.id,loadMeta))
      +'</div>'
      +'<div class="gantt-detail-section">'
        +'<div class="gantt-detail-section-head"><div><div class="gantt-panel-title">일정 참고</div><div class="gantt-detail-meta">휴가·필드웍은 업무와 별도로 유지하고, 실행 영향만 함께 확인합니다.</div></div></div>'
        +'<div class="gantt-detail-list">'+((memberSchedules||[]).map(schedule=>'<div class="gantt-detail-item is-clickable" onclick="openScheduleModal(\''+schedule.id+'\')"><div><div class="gantt-detail-item-title">'+esc(getScheduleMemberLabel(schedule))+' '+esc(scheduleLabel(schedule.schedule_type))+'</div><div class="gantt-detail-item-sub">'+esc((schedule.start||'')+' ~ '+(schedule.end||'')+(schedule.location?' · '+schedule.location:''))+'</div></div><span class="badge '+(schedule.schedule_type==='leave'?'badge-orange':'badge-blue')+'">'+esc(scheduleLabel(schedule.schedule_type))+'</span></div>').join('')||'<div class="gantt-detail-empty">해당 멤버의 휴가/필드웍 일정은 없습니다.</div>')+'</div>'
      +'</div>'
    +'</div>';
}

function getGanttIssueContextLabel(issue){
  if(String(issue?.task_id||'').trim())return issue?._taskTitle?('업무 · '+issue._taskTitle):'업무 연결 이슈';
  return '프로젝트 단위 이슈';
}

function getGanttIssueOperationalHint(issue){
  const isTaskLinked=!!String(issue?.task_id||'').trim();
  const needsExecutionAttention=String(issue?.priority||'')==='high'||!!issue?.is_pinned;
  if(isTaskLinked){
    return needsExecutionAttention
      ?'실행 영향 있음 · Work 탭에서 연결 업무와 함께 확인'
      :'관련 업무 확인 필요 · Work 탭과 함께 확인';
  }
  return needsExecutionAttention
    ?'프로젝트 조정 확인'
    :'프로젝트 맥락 확인';
}

function renderGanttDetailIssueItem(projectId,issue){
  const statusMeta=typeof getIssueStatusMeta==='function'?getIssueStatusMeta(issue.status):{label:'열림',badgeCls:'badge-blue'};
  const editable=typeof canEditIssue==='function'?canEditIssue(issue):false;
  const canResolve=editable&&typeof isIssueResolvedStatus==='function'?!isIssueResolvedStatus(issue.status):false;
  const assigneeLabel=issue?.assignee_name||issue?.owner_name||'담당자 미정';
  const issueHint=getGanttIssueOperationalHint(issue);
  const contextParts=[getGanttIssueContextLabel(issue),assigneeLabel];
  if(issue.priority==='high')contextParts.push('우선 확인');
  return '<div class="gantt-detail-item is-clickable" onclick="openIssueModal(\''+(issue.project_id||projectId||'')+'\',\''+issue.id+'\')">'
    +'<div><div class="gantt-detail-item-title">'+(issue.is_pinned?'📌 ':'')+esc(issue.title||'제목 없음')+'</div><div class="gantt-detail-item-sub">'+esc(contextParts.join(' · '))+'</div><div class="gantt-issue-item-note">'+esc(issueHint)+'</div></div>'
    +'<div class="gantt-detail-item-side"><span class="badge '+statusMeta.badgeCls+'">'+statusMeta.label+'</span>'+(canResolve?'<button type="button" class="btn sm" onclick="event.stopPropagation();resolveIssue(\''+issue.id+'\')">해결</button>':'')+'</div>'
  +'</div>';
}

function renderGanttDetailIssuePreview(projectId,issues){
  const container=document.getElementById('ganttDetailIssueList');
  if(!container||String(ganttFocusProjectId||'')!==String(projectId||''))return;
  if(!(issues||[]).length){
    container.innerHTML='<div class="gantt-detail-empty">프로젝트 단위 이슈와 업무 연결 이슈가 아직 없습니다.</div>';
    return;
  }
  if(ganttDetailTab!=='issues'){
    container.innerHTML=issues.map(issue=>renderGanttDetailIssueItem(projectId,issue)).join('');
    return;
  }
  const projectLevelIssues=issues.filter(issue=>!String(issue?.task_id||'').trim());
  const taskLinkedIssues=issues.filter(issue=>!!String(issue?.task_id||'').trim());
  container.innerHTML=''
    +(projectLevelIssues.length?'<div class="gantt-issue-group"><div class="gantt-issue-group-label">프로젝트 단위 이슈</div><div class="gantt-detail-list">'+projectLevelIssues.map(issue=>renderGanttDetailIssueItem(projectId,issue)).join('')+'</div></div>':'')
    +(taskLinkedIssues.length?'<div class="gantt-issue-group"><div class="gantt-issue-group-label">업무 연결 이슈</div><div class="gantt-detail-list">'+taskLinkedIssues.map(issue=>renderGanttDetailIssueItem(projectId,issue)).join('')+'</div></div>':'');
}

function renderGanttProjectIssuesSection(project){
  return ''
    +'<div class="gantt-detail-pane">'
      +'<div class="gantt-detail-section gantt-detail-section--flush">'
        +'<div class="gantt-detail-section-head"><div><div class="gantt-panel-title">프로젝트 이슈</div><div class="gantt-detail-meta">프로젝트 전체 이슈와 특정 업무에 연결된 이슈를 함께 확인합니다.</div></div><button type="button" class="gantt-detail-link" onclick="openProjModal(\''+project.id+'\',null,null,\'issue\')">전체 이슈 보기</button></div>'
        +'<div class="gantt-detail-list" id="ganttDetailIssueList"><div class="gantt-detail-empty">불러오는 중...</div></div>'
      +'</div>'
    +'</div>';
}

async function loadGanttDetailAsync(project){
  const projectId=project?.id||'';
  if(!projectId)return;
  try{
    const [issueRows,documentRows,taskRows]=await Promise.all([
      api('GET','project_issues?project_id=eq.'+projectId+'&'+(typeof getIssueActiveStatusFilter==='function'?getIssueActiveStatusFilter():'status=neq.resolved')+'&select=id,project_id,task_id,title,status,priority,is_pinned,assignee_name,assignee_member_id,owner_name,created_at').catch(()=>[]),
      api('GET','document_requests?project_id=eq.'+projectId+'&status=eq.pending&select=id,project_id,title,due_date,sort_order&order=sort_order.asc').catch(()=>[]),
      api('GET','project_tasks?project_id=eq.'+projectId+'&select=id,title&order=sort_order.asc,created_at.asc').catch(()=>[])
    ]);
    if(String(ganttFocusProjectId||'')!==String(projectId))return;
    const taskTitleMap=Object.fromEntries((Array.isArray(taskRows)?taskRows:[]).map(task=>[String(task?.id||''),task?.title||'']));
    const sortedIssues=[...(issueRows||[])].map(issue=>({
      ...issue,
      _taskTitle:taskTitleMap[String(issue?.task_id||'')]||''
    })).sort((a,b)=>{
      const pinDiff=Number(!!b.is_pinned)-Number(!!a.is_pinned);
      if(pinDiff)return pinDiff;
      const highDiff=Number(String(b.priority||'')==='high')-Number(String(a.priority||'')==='high');
      if(highDiff)return highDiff;
      return toDate(b.created_at)-toDate(a.created_at);
    });
    renderGanttDetailIssuePreview(projectId,ganttDetailTab==='issues'?sortedIssues:sortedIssues.slice(0,3));
    renderGanttDetailDocumentPreview(projectId,(documentRows||[]).slice(0,3));
  }catch(e){
    const issueContainer=document.getElementById('ganttDetailIssueList');
    const docContainer=document.getElementById('ganttDetailDocumentList');
    if(issueContainer)issueContainer.innerHTML='<div class="gantt-detail-empty">이슈를 불러오지 못했습니다.</div>';
    if(docContainer)docContainer.innerHTML='<div class="gantt-detail-empty">자료 요청을 불러오지 못했습니다.</div>';
  }
}

renderGanttDetailPanel=function(projs,schs){
  const el=document.getElementById('ganttDetail');
  if(!el)return;
  const project=projs.find(p=>p.id===ganttFocusProjectId)||null;
  if(!project){
    el.innerHTML='<div class="gantt-panel-title">프로젝트 상세</div><div class="gantt-panel-sub">간트, 달력, 리스트에서 프로젝트를 클릭하면 여기서 같은 상세 정보를 확인할 수 있습니다.</div>';
    return;
  }
  const client=clients.find(c=>c.id===project.client_id)||null;
  const projectMembers=project.members||[];
  const memberSchedules=getGanttProjectConflictSchedules(project);
  const billingStatus=project.is_billable!==false?(project.billing_status||'미청구'):'비청구대상';
  const billingAmount=getGanttProjectBillingAmount(project);
  const linkedContract=getGanttDetailLinkedContract(project);
  const priorityBadge=typeof getProjectPriorityBadge==='function'?getProjectPriorityBadge(project.priority):'<span class="badge '+getGanttListPriorityBadgeClass(project.priority)+'">'+getGanttListPriorityLabel(project.priority)+'</span>';
  if(ganttDetailTab==='overview'){
    if(ganttListTaskSummaryByProjectId[String(project.id||'')]===undefined)loadGanttListTaskSummaries([project.id]);
    if(ganttListTaskIssueSummaryByProjectId[String(project.id||'')]===undefined)loadGanttListTaskIssueSummaries([project.id]);
  }
  let sectionHtml=renderGanttProjectOverviewSection(project,client,linkedContract,projectMembers,memberSchedules,billingStatus,billingAmount);
  if(ganttDetailTab==='work')sectionHtml=renderGanttProjectWorkSection(project,memberSchedules);
  else if(ganttDetailTab==='issues')sectionHtml=renderGanttProjectIssuesSection(project);
  else if(ganttDetailTab==='memo')sectionHtml=renderGanttProjectMemoSection(project);
  el.innerHTML=''
    +'<div class="gantt-detail-header">'
      +'<div class="gantt-detail-head-copy">'
        +'<div class="gantt-detail-context">선택된 프로젝트</div>'
        +'<div class="gantt-panel-title">'+esc(project.name)+'</div>'
        +'<div class="gantt-panel-sub">'+esc(client?.name||'고객사 미지정')+'</div>'
        +'<div class="gantt-detail-header-meta">'
          +'<span class="gantt-detail-header-chip">기간 · '+esc((project.start||'')+' ~ '+(project.end||''))+'</span>'
          +'<span class="gantt-detail-header-chip">담당 · '+esc(projectMembers.join(', ')||'미배정')+'</span>'
          +(linkedContract?'<span class="gantt-detail-header-chip">계약 · '+esc(linkedContract.contract_name||'연결 계약')+'</span>':'')
        +'</div>'
        +'<div class="gantt-detail-badges"><span class="badge '+getGanttDetailTypeBadgeClass(project.type)+'">'+esc(project.type||'기타')+'</span><span class="badge '+getGanttDetailStatusBadgeClass(project.status)+'">'+esc(project.status||'예정')+'</span>'+priorityBadge+'</div>'
      +'</div>'
      +'<div class="gantt-detail-actions">'
        +'<button class="btn primary sm" onclick="openProjModal(\''+project.id+'\')">수정</button>'
        +'<button class="btn sm" onclick="handleProjectOutlookEvent(\''+project.id+'\')">Outlook 추가</button>'
        +'<button class="btn ghost sm" onclick="closeGanttProjectDetail()">닫기</button>'
      +'</div>'
    +'</div>'
    +renderGanttDetailTabBar()
    +sectionHtml;
  const detailContext=el.querySelector('.gantt-detail-context');
  if(detailContext)detailContext.textContent='선택한 프로젝트 상세';
  loadGanttDetailAsync(project);
  if(ganttDetailTab==='work')loadGanttProjectTasks(project.id);
  return;
  el.innerHTML=''
    +'<div class="gantt-detail-header">'
      +'<div class="gantt-detail-head-copy">'
        +'<div class="gantt-panel-title">'+esc(project.name)+'</div>'
        +'<div class="gantt-panel-sub">'+esc(client?.name||'고객사 미지정')+'</div>'
        +'<div class="gantt-detail-badges"><span class="badge '+getGanttDetailTypeBadgeClass(project.type)+'">'+esc(project.type||'기타')+'</span><span class="badge '+getGanttDetailStatusBadgeClass(project.status)+'">'+esc(project.status||'예정')+'</span>'+priorityBadge+'</div>'
      +'</div>'
      +'<div class="gantt-detail-actions">'
        +'<button class="btn primary sm" onclick="openProjModal(\''+project.id+'\')">수정</button>'
        +'<button class="btn sm" onclick="handleProjectOutlookEvent(\''+project.id+'\')">Outlook 추가</button>'
        +'<button class="btn ghost sm" onclick="closeGanttProjectDetail()">닫기</button>'
      +'</div>'
    +'</div>'
    +'<div class="gantt-detail-grid">'
      +'<div><div class="gantt-detail-label">기간</div><div class="gantt-detail-value">'+esc((project.start||'')+' ~ '+(project.end||''))+'</div></div>'
      +'<div><div class="gantt-detail-label">담당자</div><div class="gantt-detail-value">'+esc(projectMembers.join(', ')||'담당자 미지정')+'</div></div>'
      +'<div><div class="gantt-detail-label">빌링 상태</div><div class="gantt-detail-value">'+esc(billingStatus)+'</div></div>'
      +'<div><div class="gantt-detail-label">빌링 금액</div><div class="gantt-detail-value">'+formatGanttCurrency(billingAmount)+'</div></div>'
    +'</div>'
    +'<div class="gantt-detail-section"><div class="gantt-detail-section-head"><div class="gantt-panel-title">이슈 미리보기</div><button type="button" class="gantt-detail-link" onclick="openProjModal(\''+project.id+'\',null,null,\'issue\')">전체 이슈 보기</button></div><div class="gantt-detail-list" id="ganttDetailIssueList"><div class="gantt-detail-empty">불러오는 중...</div></div></div>'
    +'<div class="gantt-detail-section"><div class="gantt-detail-section-head"><div class="gantt-panel-title">자료 요청 미리보기</div><button type="button" class="gantt-detail-link" onclick="openProjModal(\''+project.id+'\',null,null,\'documents\')">자료요청 관리</button></div><div class="gantt-detail-list" id="ganttDetailDocumentList"><div class="gantt-detail-empty">불러오는 중...</div></div></div>'
    +'<div class="gantt-detail-section"><div class="gantt-detail-section-head"><div class="gantt-panel-title">팀 일정 충돌</div></div><div class="gantt-detail-list">'+(memberSchedules.map(schedule=>'<div class="gantt-detail-item is-clickable" onclick="openScheduleModal(\''+schedule.id+'\')"><div><div class="gantt-detail-item-title">'+esc(getScheduleMemberLabel(schedule))+' '+esc(scheduleLabel(schedule.schedule_type))+'</div><div class="gantt-detail-item-sub">'+esc((schedule.start||'')+' ~ '+(schedule.end||'')+(schedule.location?' · '+schedule.location:''))+'</div></div><span class="badge '+(schedule.schedule_type==='leave'?'badge-orange':'badge-blue')+'">'+esc(scheduleLabel(schedule.schedule_type))+'</span></div>').join('')||'<div class="gantt-detail-empty">담당자 휴가/필드웍 일정이 없습니다.</div>')+'</div></div>'
    +'<div class="gantt-detail-section"><div class="gantt-detail-section-head"><div class="gantt-panel-title">메모 미리보기</div></div>'+(project.memo?'<button type="button" class="gantt-detail-memo" onclick="openProjModal(\''+project.id+'\')">'+esc(project.memo)+'</button>':'<div class="gantt-detail-empty">등록된 메모가 없습니다.</div>')+'</div>';
  loadGanttDetailAsync(project);
};

function getGanttDetailRenderSignature(projs){
  const project=(projs||[]).find(item=>String(item?.id||'')===String(ganttFocusProjectId||''))||null;
  if(!project)return 'placeholder:'+String(ganttFocusProjectId||'');
  const baseParts=[
    String(project.id||''),
    String(ganttDetailTab||'overview'),
    String(project.name||''),
    String(project.status||''),
    String(project.type||''),
    String(project.client_id||''),
    String(project.contract_id||''),
    String(project.start||project.start_date||''),
    String(project.end||project.end_date||''),
    JSON.stringify(project.members||[]),
    String(project.follow_up_needed||''),
    String(project.follow_up_note||'')
  ];
  if(ganttDetailTab==='overview'){
    baseParts.push(JSON.stringify(getGanttOverviewTaskSummary(project.id)||{}));
    baseParts.push(String(getGanttOverviewIssueLinkedCount(project.id)??''));
    baseParts.push(JSON.stringify(getGanttProjectPendingDocSummary(project.id)||{}));
    baseParts.push(JSON.stringify(getGanttProjectCurrentLifecycleMeta(project)||{}));
  }else if(ganttDetailTab==='work'){
    const tasks=getGanttProjectTasks(project.id);
    const taskDigest=tasks.map(task=>[
      task?.id||'',
      task?.status||'',
      task?.due_date||'',
      task?.assignee_member_id||'',
      task?.progress_percent||''
    ].join(':')).join('|');
    baseParts.push(taskDigest);
    baseParts.push(JSON.stringify(getGanttProjectTaskLoadMeta(project.id)||{}));
    baseParts.push(JSON.stringify(getGanttProjectPendingDocSummary(project.id)||{}));
    baseParts.push(String(getGanttProjectTaskIssueTotal(project.id)||0));
  }
  return baseParts.join('||');
}

const baseRenderGanttDetailPanel=renderGanttDetailPanel;
renderGanttDetailPanel=function(projs,schs){
  const el=document.getElementById('ganttDetail');
  if(!el)return;
  const project=(projs||[]).find(item=>item?.id===ganttFocusProjectId)||null;
  if(!project){
    const placeholderKey='placeholder:'+String(ganttFocusProjectId||'');
    if(el.dataset.renderSignature===placeholderKey)return;
    el.innerHTML=renderGanttDetailPlaceholder();
    el.dataset.renderSignature=placeholderKey;
    return;
  }
  const renderSignature=getGanttDetailRenderSignature(projs);
  if(el.dataset.renderSignature===renderSignature)return;
  baseRenderGanttDetailPanel(projs,schs);
  const detailContext=el.querySelector('.gantt-detail-context');
  if(detailContext)detailContext.textContent='선택한 프로젝트 상세';
  syncGanttDetailWorkShortcut(project);
  el.dataset.renderSignature=renderSignature;
};

function buildGanttCalendarItemHtml(item){
  const itemClass=item.kind==='project'?'project':'schedule';
  const activeClass=item.kind==='project'&&String(ganttFocusProjectId||'')===String(item.id||'')?' is-active':'';
  const bg=item.kind==='project'?item.color:withAlpha(item.color,'2B');
  const text=item.kind==='project'?'#FFFFFF':'#243241';
  const border=item.kind==='project'?'transparent':withAlpha(item.color,'55');
  const action=item.kind==='project'
    ?`openGanttProjectDetail('${item.id}')`
    :`openScheduleModal('${item.id}')`;
  return '<button class="gantt-calendar-item '+itemClass+activeClass+'" type="button" onclick="'+action+'" style="background:'+bg+';color:'+text+';border:1px solid '+border+(item.dueToday?';box-shadow:inset 0 0 0 1px rgba(146,64,14,.24)':'')+'" title="'+esc(item.title)+'">'+esc(item.label)+'</button>';
}

function getGanttSupportCueProject(){
  const projectId=String(ganttFocusProjectId||'').trim();
  if(!projectId)return null;
  return projects.find(project=>String(project?.id||'')===projectId)||null;
}

function getGanttCalendarDateValue(date){
  if(!(date instanceof Date)||Number.isNaN(date.getTime()))return '';
  return date.getFullYear()+'-'+String(date.getMonth()+1).padStart(2,'0')+'-'+String(date.getDate()).padStart(2,'0');
}

function ensureGanttSupportTaskCueElement(){
  const host=document.getElementById('ganttMainCopy')?.parentElement;
  if(!host)return null;
  let cue=document.getElementById('ganttSupportTaskCue');
  if(!cue){
    cue=document.createElement('div');
    cue.id='ganttSupportTaskCue';
    cue.className='gantt-support-task-cue';
    host.appendChild(cue);
  }
  return cue;
}

function renderGanttSupportViewCue(){
  return renderGanttSupportViewCueV2();
  const cue=ensureGanttSupportTaskCueElement();
  if(!cue)return;
  const project=getGanttSupportCueProject();
  const isSupportView=curGanttLayout!=='list';
  if(!isSupportView||!project){
    cue.hidden=true;
    cue.innerHTML='';
    return;
  }
  const projectId=String(project.id||'');
  const loadMeta=getGanttProjectTaskLoadMeta(projectId);
  const hasTaskRows=Array.isArray(ganttProjectTasksByProjectId[projectId]);
  if(!hasTaskRows&&!loadMeta.loading){
    loadGanttProjectTasks(projectId,false);
  }
  const tasks=hasTaskRows?getGanttProjectTasks(projectId):[];
  const summary=getGanttProjectTaskSummary(projectId);
  const listSummary=buildGanttListTaskSummary(tasks);
  const viewCopy=curGanttLayout==='calendar'
    ?'달력에는 날짜가 있는 업무만 가볍게 표시하고, 실제 수정은 Work 탭에서 이어집니다.'
    :curGView==='member'
      ?'개인 일정과는 분리된 프로젝트 업무 신호만 보여주고, 실제 관리는 Work 탭에서 이어집니다.'
      :'간트 흐름을 보면서도 개인 일정과 분리된 프로젝트 업무 신호만 확인할 수 있습니다.';
  cue.hidden=false;
  cue.className='gantt-support-task-cue';
  if(loadMeta.loading&&!tasks.length){
    cue.classList.add('is-loading');
    cue.innerHTML=''
      +'<div class="gantt-support-task-copy">'
        +'<div class="gantt-support-task-title">선택 프로젝트 업무</div>'
        +'<div class="gantt-support-task-sub">'+esc(project.name||'프로젝트')+' 업무를 불러오는 중입니다.</div>'
      +'</div>'
      +'<div class="gantt-support-task-meta">Work 탭과 같은 업무 데이터를 준비하고 있습니다.</div>';
    return;
  }
  if(loadMeta.error){
    cue.classList.add('is-danger');
    cue.innerHTML=''
      +'<div class="gantt-support-task-copy">'
        +'<div class="gantt-support-task-title">선택 프로젝트 업무</div>'
        +'<div class="gantt-support-task-sub">'+esc(loadMeta.error)+'</div>'
      +'</div>'
      +'<button type="button" class="gantt-support-task-action" onclick="openGanttProjectWorkTab(\''+projectId+'\')">Work 탭 보기</button>';
    return;
  }
  if(!tasks.length){
    cue.classList.add('is-empty');
    cue.innerHTML=''
      +'<div class="gantt-support-task-copy">'
        +'<div class="gantt-support-task-title">선택 프로젝트 업무</div>'
        +'<div class="gantt-support-task-sub">아직 등록된 업무가 없습니다. 개인 일정과는 별개로 Work 탭에서 하나씩 추가할 수 있습니다.</div>'
      +'</div>'
      +'<button type="button" class="gantt-support-task-action" onclick="openGanttProjectWorkTab(\''+projectId+'\')">+ 업무 추가</button>';
    return;
  }
  const chips=[
    '<span class="gantt-support-task-chip">업무 '+summary.total+'건</span>',
    '<span class="gantt-support-task-chip">진행중 '+summary.inProgress+'건</span>'
  ];
  if(summary.waiting>0)chips.push('<span class="gantt-support-task-chip is-warn">대기 '+summary.waiting+'건</span>');
  if(summary.overdue>0)chips.push('<span class="gantt-support-task-chip is-danger">지연 '+summary.overdue+'건</span>');
  else if(listSummary?.nearestDueLabel)chips.push('<span class="gantt-support-task-chip is-soft">다음 기한 '+esc(listSummary.nearestDueLabel)+'</span>');
  cue.innerHTML=''
    +'<div class="gantt-support-task-copy">'
      +'<div class="gantt-support-task-title">선택 프로젝트 업무</div>'
      +'<div class="gantt-support-task-sub">'+esc(viewCopy)+'</div>'
    +'</div>'
    +'<div class="gantt-support-task-chips">'+chips.join('')+'</div>'
    +'<button type="button" class="gantt-support-task-action" onclick="openGanttProjectWorkTab(\''+projectId+'\')">Work 탭 보기</button>';
}

function renderGanttSupportViewCueV2(){
  const cue=ensureGanttSupportTaskCueElement();
  if(!cue)return;
  const project=getGanttSupportCueProject();
  const roleMeta=getGanttViewRoleMeta();
  const isSupportView=curGanttLayout!=='list';
  if(!isSupportView||!project){
    cue.hidden=true;
    cue.innerHTML='';
    return;
  }
  const projectId=String(project.id||'');
  const loadMeta=getGanttProjectTaskLoadMeta(projectId);
  const hasTaskRows=Array.isArray(ganttProjectTasksByProjectId[projectId]);
  if(!hasTaskRows&&!loadMeta.loading){
    loadGanttProjectTasks(projectId,false);
  }
  const tasks=hasTaskRows?getGanttProjectTasks(projectId):[];
  const summary=getGanttProjectTaskSummary(projectId);
  const listSummary=buildGanttListTaskSummary(tasks);
  const chips=[];
  if(summary.active>0)chips.push('<span class="gantt-support-task-chip">열린 업무 '+summary.active+'건</span>');
  if(summary.overdue>0)chips.push('<span class="gantt-support-task-chip is-danger">지연 '+summary.overdue+'건</span>');
  else if(summary.issueLinked>0)chips.push('<span class="gantt-support-task-chip is-warn">이슈 연결 '+summary.issueLinked+'건</span>');
  else if(listSummary?.nearestDueLabel)chips.push('<span class="gantt-support-task-chip is-soft">다음 마감 '+esc(listSummary.nearestDueLabel)+'</span>');
  cue.hidden=false;
  cue.className='gantt-support-task-cue is-quiet';
  if(loadMeta.loading&&!tasks.length){
    cue.classList.add('is-loading');
    cue.innerHTML=''
      +'<div class="gantt-support-task-copy">'
        +'<div class="gantt-support-task-title">선택 프로젝트 업무 연결</div>'
        +'<div class="gantt-support-task-sub">'+esc(project.name||'프로젝트')+' 업무를 불러오는 중입니다.</div>'
      +'</div>'
      +'<div class="gantt-support-task-meta">세부 관리는 아래 상세의 Work 탭에서 이어집니다.</div>';
    return;
  }
  if(loadMeta.error){
    cue.classList.add('is-danger');
    cue.innerHTML=''
      +'<div class="gantt-support-task-copy">'
        +'<div class="gantt-support-task-title">선택 프로젝트 업무 연결</div>'
        +'<div class="gantt-support-task-sub">'+esc(loadMeta.error)+'</div>'
      +'</div>'
      +'<button type="button" class="gantt-support-task-action" onclick="openGanttProjectWorkTab(\''+projectId+'\')">Work 탭 열기</button>';
    return;
  }
  cue.innerHTML=''
    +'<div class="gantt-support-task-copy">'
      +'<div class="gantt-support-task-title">선택 프로젝트 업무 연결</div>'
      +'<div class="gantt-support-task-sub">'+esc(tasks.length?roleMeta.supportCue:'아직 등록된 업무가 없습니다. 세부 조정은 아래 상세의 Work 탭에서 이어집니다.')+'</div>'
    +'</div>'
    +(chips.length?'<div class="gantt-support-task-chips">'+chips.join('')+'</div>':'<div class="gantt-support-task-meta">하단 상세의 Work 탭에서 업무를 추가하고 관리합니다.</div>')
    +'<button type="button" class="gantt-support-task-action" onclick="openGanttProjectWorkTab(\''+projectId+'\')">Work 탭 열기</button>';
}

function refreshGanttSupportTaskCompatibility(projectId){
  const key=String(projectId||ganttFocusProjectId||'').trim();
  if(!key||String(ganttFocusProjectId||'')!==key)return;
  renderGanttSupportViewCueV2();
  if(curGanttLayout==='calendar'){
    const currentData=getGanttFilteredData();
    renderGanttCalendarGrid(currentData.projs,currentData.schs);
  }
}

function getGanttCalendarTaskItemsForDate(cellDate){
  const project=getGanttSupportCueProject();
  if(!project)return [];
  const dayValue=getGanttCalendarDateValue(cellDate);
  if(!dayValue)return [];
  return getGanttProjectTasks(project.id).reduce((rows,task)=>{
    if(String(task?.status||'')==='완료')return rows;
    const dueValue=getGanttTaskDateValue(task?.due_date);
    const startValue=getGanttTaskDateValue(task?.start_date);
    const isDueDay=Boolean(dueValue)&&dueValue===dayValue;
    const isStartOnlyDay=!isDueDay&&!dueValue&&Boolean(startValue)&&startValue===dayValue;
    if(!isDueDay&&!isStartOnlyDay)return rows;
    const assignee=getGanttTaskMemberName(task?.assignee_member_id)||'미배정';
    const issueCount=getGanttTaskLinkedIssueCount(project.id,task?.id);
    const dueMeta=isDueDay?getGanttTaskDueMeta(task):{label:'시작',tone:'neutral'};
    rows.push({
      kind:'task',
      id:task?.id,
      projectId:project.id,
      label:(isDueDay?'업무 · ':'시작 · ')+String(task?.title||'제목 없는 업무'),
      title:[
        task?.title||'제목 없는 업무',
        assignee,
        task?.status||'예정',
        isDueDay?('기한 '+formatGanttTaskShortDate(dueValue)):('시작 '+formatGanttTaskShortDate(startValue)),
        issueCount?('이슈 '+issueCount+'건'):''
      ].filter(Boolean).join(' | '),
      tone:dueMeta.tone
    });
    return rows;
  },[]).sort((a,b)=>{
    const toneRank=value=>value==='danger'?0:value==='warn'?1:2;
    const diff=toneRank(a.tone)-toneRank(b.tone);
    if(diff)return diff;
    return String(a.label||'').localeCompare(String(b.label||''),'ko');
  }).slice(0,2);
}

function buildGanttCalendarItemsForDate(cellDate,projs,schs){
  const ts=cellDate.getTime();
  const items=[];
  projs.forEach(project=>{
    if(toDate(project.start).getTime()<=ts&&toDate(project.end).getTime()>=ts){
      items.push({
        kind:'project',
        id:project.id,
        label:project.name,
        title:[project.name,project.type||'',(project.members||[]).join(', ')].filter(Boolean).join(' | '),
        color:TYPES[project.type]||'#4e5968',
        dueToday:isDueToday(project)&&toDate(project.end).getTime()===ts
      });
    }
  });
  getGanttCalendarTaskItemsForDate(cellDate).forEach(item=>items.push(item));
  schs.forEach(schedule=>{
    if(toDate(schedule.start).getTime()<=ts&&toDate(schedule.end).getTime()>=ts){
      const labelBase=schedule.title||scheduleLabel(schedule.schedule_type);
      items.push({
        kind:'schedule',
        id:schedule.id,
        label:(schedule.member_name?schedule.member_name+' · ':'')+labelBase,
        title:[labelBase,schedule.member_name||'',schedule.location||'',schedule.memo||''].filter(Boolean).join(' | '),
        color:scheduleColor(schedule.schedule_type)
      });
    }
  });
  return items.sort((a,b)=>{
    const rank=value=>value==='project'?0:value==='task'?1:2;
    const diff=rank(a.kind)-rank(b.kind);
    if(diff)return diff;
    return String(a.label||'').localeCompare(String(b.label||''),'ko');
  });
}

function buildGanttCalendarItemHtml(item){
  const itemClass=item.kind==='project'?'project':item.kind==='task'?'task':'schedule';
  const activeClass=item.kind==='project'&&String(ganttFocusProjectId||'')===String(item.id||'')?' is-active':'';
  let bg=item.kind==='project'?item.color:withAlpha(item.color,'2B');
  let text=item.kind==='project'?'#FFFFFF':'#243241';
  let border=item.kind==='project'?'transparent':withAlpha(item.color,'55');
  let action=item.kind==='project'
    ?`openGanttProjectDetail('${item.id}')`
    :`openScheduleModal('${item.id}')`;
  if(item.kind==='task'){
    bg=item.tone==='danger'?'#FEF2F2':item.tone==='warn'?'#FFF7ED':'#F8FAFC';
    text=item.tone==='danger'?'#991B1B':item.tone==='warn'?'#9A3412':'#334155';
    border=item.tone==='danger'?'#FECACA':item.tone==='warn'?'#FED7AA':'#E2E8F0';
    action=`openGanttProjectWorkTab('${item.projectId}')`;
  }
  return '<button class="gantt-calendar-item '+itemClass+activeClass+'" type="button" onclick="'+action+'" style="background:'+bg+';color:'+text+';border:1px solid '+border+(item.dueToday?';box-shadow:inset 0 0 0 1px rgba(146,64,14,.24)':'')+'" title="'+esc(item.title)+'">'+esc(item.label)+'</button>';
}

function renderGanttEntryViewChrome(){
  return renderGanttEntryViewChromeV2();
  const shell=document.querySelector('#pageGantt .gantt-shell');
  const topNote=document.getElementById('ganttTopNote');
  const sidebarTitle=document.getElementById('ganttSidebarTitle');
  const sidebarSub=document.getElementById('ganttSidebarSub');
  const mainTitle=document.getElementById('ganttMainTitle');
  const mainCopy=document.getElementById('ganttMainCopy');
  const setTopNote=text=>{
    if(!topNote)return;
    topNote.textContent=text||'';
    topNote.hidden=!text;
  };
  if(shell){
    shell.classList.toggle('is-list-entry',curGanttLayout==='list');
    shell.classList.toggle('is-support-view',curGanttLayout!=='list');
    shell.classList.toggle('is-calendar-mode',curGanttLayout==='calendar');
    shell.classList.toggle('is-timeline-mode',curGanttLayout==='timeline');
    shell.classList.toggle('is-member-view',curGView==='member');
    shell.classList.toggle('is-project-view',curGView!=='member');
  }
  if(curGanttLayout==='list'){
    setTopNote('');
    if(sidebarTitle)sidebarTitle.textContent='빠른 선택';
    if(sidebarSub)sidebarSub.textContent='리스트에서 바로 열 프로젝트를 고르면 아래 상세 패널로 이어집니다.';
    if(mainTitle)mainTitle.textContent='프로젝트 목록';
    if(mainCopy)mainCopy.textContent='상태, 기한, 진행률을 먼저 훑고 필요한 프로젝트만 아래 상세 패널로 이어서 확인하세요.';
    renderGanttSupportViewCue();
    return;
  }
  if(curGanttLayout==='calendar'){
    setTopNote('달력은 프로젝트와 개인 일정의 날짜 겹침을 보는 보조 보기입니다. 필요한 프로젝트를 선택하면 아래 상세 패널과 연결됩니다.');
    if(sidebarTitle)sidebarTitle.textContent='프로젝트 리스트';
    if(sidebarSub)sidebarSub.textContent='달력에서 본 프로젝트를 다시 고르면 아래 상세 패널과 같은 대상이 이어집니다.';
    if(mainTitle)mainTitle.textContent='프로젝트 달력';
    if(mainCopy)mainCopy.textContent='프로젝트와 개인 일정을 날짜 기준으로 훑어보는 보조 보기입니다. 선택한 프로젝트의 업무는 가볍게만 드러나고 실제 관리는 Work 탭에서 이어갑니다.';
    renderGanttSupportViewCue();
    return;
  }
  if(curGView==='member'){
    setTopNote('인력별 보기는 담당자 기준으로 프로젝트와 개인 일정을 함께 보는 보조 보기입니다. 필요한 프로젝트를 선택해 아래 상세로 이어가세요.');
    if(sidebarTitle)sidebarTitle.textContent='빠른 프로젝트';
    if(sidebarSub)sidebarSub.textContent='인력 흐름을 본 뒤 실제로 관리할 프로젝트를 다시 고르는 빠른 선택 영역입니다.';
    if(mainTitle)mainTitle.textContent='인력 운영 타임라인';
    if(mainCopy)mainCopy.textContent='담당자 기준 프로젝트와 휴가/필드 일정 흐름을 보는 보조 보기입니다. 선택된 프로젝트의 업무는 요약만 보이고 실제 수정은 Work 탭에서 이어집니다.';
    renderGanttSupportViewCue();
    return;
  }
  setTopNote('간트는 전체 일정 흐름과 겹침을 보는 보조 보기입니다. 필요한 프로젝트를 선택하면 아래 상세 패널로 이어집니다.');
  if(sidebarTitle)sidebarTitle.textContent='빠른 프로젝트';
  if(sidebarSub)sidebarSub.textContent='타임라인을 보다가 바로 관리할 프로젝트를 다시 고를 수 있는 빠른 선택 영역입니다.';
  if(mainTitle)mainTitle.textContent='프로젝트 타임라인';
  if(mainCopy)mainCopy.textContent='프로젝트 바와 개인 일정의 흐름을 함께 보는 보조 보기입니다. 선택된 프로젝트의 업무는 요약만 보이고 실제 후속 작업은 Work 탭에서 이어집니다.';
  renderGanttSupportViewCue();
}

window.ganttProjectPendingDocSummaryByProjectId=window.ganttProjectPendingDocSummaryByProjectId||{};
window.ganttProjectPendingDocSummaryLoadingIds=window.ganttProjectPendingDocSummaryLoadingIds instanceof Set
  ?window.ganttProjectPendingDocSummaryLoadingIds
  :new Set();

function getGanttProjectPendingDocSummary(projectId){
  return window.ganttProjectPendingDocSummaryByProjectId[String(projectId||'')];
}

async function loadGanttProjectPendingDocSummary(projectId,force){
  const key=String(projectId||'');
  if(!key)return;
  const cache=window.ganttProjectPendingDocSummaryByProjectId;
  const loadingIds=window.ganttProjectPendingDocSummaryLoadingIds;
  if(!force&&cache[key]!==undefined)return;
  if(loadingIds.has(key))return;
  loadingIds.add(key);
  try{
    const rows=await api(
      'GET',
      'document_requests?project_id=eq.'+key
      +'&status=eq.pending'
      +'&select=id,title,due_date'
      +'&order=sort_order.asc'
    );
    const docs=Array.isArray(rows)?rows:[];
    const nearestDueValue=docs
      .map(doc=>getGanttTaskDateValue(doc?.due_date))
      .filter(Boolean)
      .sort()[0]||'';
    const nearestDoc=nearestDueValue
      ?docs.find(doc=>getGanttTaskDateValue(doc?.due_date)===nearestDueValue)
      :null;
    const baseDate=getHomeBaseDate();
    const overdueCount=docs.filter(doc=>{
      const dueValue=getGanttTaskDateValue(doc?.due_date);
      if(!dueValue)return false;
      const dueDate=toDate(dueValue);
      if(Number.isNaN(dueDate.getTime()))return false;
      const today=new Date(baseDate.getFullYear(),baseDate.getMonth(),baseDate.getDate());
      const due=new Date(dueDate.getFullYear(),dueDate.getMonth(),dueDate.getDate());
      return due<today;
    }).length;
    cache[key]={
      total:docs.length,
      overdueCount,
      nearestDueValue,
      nearestDueLabel:nearestDueValue?formatGanttTaskShortDate(nearestDueValue):'',
      nearestTitle:String(nearestDoc?.title||'').trim()
    };
  }catch(error){
    cache[key]=null;
  }finally{
    loadingIds.delete(key);
  }
  if(String(ganttFocusProjectId||'')===key&&ganttDetailTab==='work'){
    const currentData=getGanttFilteredData();
    renderGanttDetailPanel(currentData.projs,currentData.schs);
  }
}

function getGanttProjectTaskIssueTotal(projectId){
  const counts=ganttProjectTaskIssueCountsByProjectId[String(projectId||'')];
  if(!counts||typeof counts!=='object')return 0;
  return Object.values(counts).reduce((sum,value)=>sum+Number(value||0),0);
}

function getGanttTaskOperationalRank(projectId,task){
  const status=String(task?.status||'예정').trim()||'예정';
  const dueMeta=getGanttTaskDueMeta(task);
  const issueCount=getGanttTaskLinkedIssueCount(projectId,task?.id);
  if(status==='완료')return 900;
  if(dueMeta.tone==='danger')return 10;
  if(status==='대기'&&issueCount>0)return 20;
  if(status==='대기')return 30;
  if(status==='보류')return 40;
  if(issueCount>0)return 50;
  if(dueMeta.tone==='warn')return 60;
  if(!String(task?.assignee_member_id||'').trim())return 70;
  if(status==='진행중')return 80;
  return 90;
}

function getGanttTaskDisplayRows(projectId){
  return [...getGanttProjectTasks(projectId)].sort((a,b)=>{
    const rankDiff=getGanttTaskOperationalRank(projectId,a)-getGanttTaskOperationalRank(projectId,b);
    if(rankDiff)return rankDiff;
    const aDue=getGanttTaskDateValue(a?.due_date);
    const bDue=getGanttTaskDateValue(b?.due_date);
    if(aDue&&bDue&&aDue!==bDue)return aDue.localeCompare(bDue);
    if(aDue!==bDue)return aDue?-1:1;
    return String(a?.title||'').localeCompare(String(b?.title||''),'ko');
  });
}

function getGanttProjectNextActionTask(projectId){
  return getGanttTaskDisplayRows(projectId).find(task=>String(task?.status||'').trim()!=='완료')||null;
}

function getGanttTaskContextBadges(projectId,task){
  const badges=[];
  const issueCount=getGanttTaskLinkedIssueCount(projectId,task?.id);
  if(issueCount>0)badges.push('<span class="gantt-task-context-badge is-issue">이슈 '+issueCount+'건</span>');
  if(!String(task?.assignee_member_id||'').trim())badges.push('<span class="gantt-task-context-badge is-neutral">담당 미정</span>');
  if(task?.status!=='완료'&&!getGanttTaskDateValue(task?.due_date))badges.push('<span class="gantt-task-context-badge is-neutral">기한 미정</span>');
  return badges.join('');
}

function getGanttTaskOperationalHint(projectId,task){
  const issueCount=getGanttTaskLinkedIssueCount(projectId,task?.id);
  const status=String(task?.status||'예정').trim()||'예정';
  const assignee=getGanttTaskMemberName(task?.assignee_member_id)||'';
  const dueMeta=getGanttTaskDueMeta(task);
  if(status==='완료')return '완료된 업무입니다. 필요하면 결과 메모와 후속 확인만 보강하세요.';
  if(status==='대기'&&issueCount>0)return '연결 이슈 '+issueCount+'건을 먼저 확인하고 재개 시점을 정하세요.';
  if(status==='대기')return '외부 회신이나 선행 작업 확인 후 다시 시작할 시점을 정해두면 좋습니다.';
  if(status==='보류')return '우선순위가 밀린 업무입니다. 이번 주에도 계속 보류할지 확인하세요.';
  if(dueMeta.tone==='danger')return (assignee?assignee+' 담당 ':'')+'업무 일정이 지났습니다. 오늘 기준 대응 계획을 먼저 정하세요.';
  if(!assignee)return '담당자를 먼저 정하면 진행률과 다음 확인 시점을 관리하기 쉬워집니다.';
  if(issueCount>0)return '연결 이슈 '+issueCount+'건이 있어 진행 막힘 여부를 함께 보는 편이 좋습니다.';
  if(!getGanttTaskDateValue(task?.due_date))return '기한이 아직 없습니다. 다음 체크 시점을 같이 정해두면 안정적입니다.';
  return assignee+' 중심으로 진행률과 다음 마감 시점을 계속 확인하세요.';
}

function getGanttTaskExecutionCueMeta(projectId,task,pendingDocSummary){
  const issueCount=getGanttTaskLinkedIssueCount(projectId,task?.id);
  const status=String(task?.status||'예정').trim()||'예정';
  const dueMeta=getGanttTaskDueMeta(task);
  const dueDiff=getGanttTaskDueDiff(task);
  const hasMaterialWaiting=Number(pendingDocSummary?.total||0)>0&&(status==='대기'||status==='보류');
  if(dueMeta.tone==='danger')return {label:'오늘 대응',tone:'danger',hint:'일정 재조정 또는 완료 처리'};
  if(dueDiff===0)return {label:'오늘 마감',tone:'warn',hint:'오늘 안에 진행 상황 확인'};
  if(dueDiff===1)return {label:'D-1 확인',tone:'warn',hint:'내일 마감 전 준비 확인'};
  if(status==='대기'&&issueCount>0)return {label:'막힘 확인',tone:'danger',hint:'연결 이슈 확인 후 재개'};
  if(hasMaterialWaiting)return {label:'자료 확인',tone:'warn',hint:'프로젝트 자료 요청 영향 확인'};
  if(status==='대기')return {label:'대기 해소',tone:'warn',hint:'재개 조건과 시점 확인'};
  if(status==='보류')return {label:'우선순위 재확인',tone:'warn',hint:'이번 주에도 보류할지 결정'};
  if(!String(task?.assignee_member_id||'').trim())return {label:'담당 지정',tone:'neutral',hint:'담당자 먼저 지정'};
  if(issueCount>0)return {label:'이슈 확인',tone:'warn',hint:'연결 이슈와 함께 점검'};
  if(dueMeta.tone==='warn')return {label:'곧 마감',tone:'warn',hint:'이번 주 마감 확인'};
  if(!getGanttTaskDateValue(task?.due_date))return {label:'기한 정리',tone:'neutral',hint:'기한이나 체크 시점 설정'};
  if(status==='진행중')return {label:'진행 점검',tone:'good',hint:'진행률 업데이트'};
  return {label:'다음 확인',tone:'neutral',hint:'상태와 마감 점검'};
}

function getGanttTaskDueDisplayText(task,dueMeta,dateMeta){
  if(!getGanttTaskDateValue(task?.due_date))return dateMeta?.dueText||'기한 미정';
  if(dueMeta?.tone==='neutral')return dateMeta?.dueText||'기한 미정';
  return (dateMeta?.dueText||'기한 미정')+' · '+(dueMeta?.label||'');
}

function getGanttTaskDueDiff(task,baseDate=getHomeBaseDate()){
  const dueValue=getGanttTaskDateValue(task?.due_date);
  if(!dueValue)return null;
  const dueDate=toDate(dueValue);
  if(Number.isNaN(dueDate.getTime()))return null;
  const today=new Date(baseDate.getFullYear(),baseDate.getMonth(),baseDate.getDate());
  const due=new Date(dueDate.getFullYear(),dueDate.getMonth(),dueDate.getDate());
  return Math.round((due-today)/86400000);
}

function getGanttTaskNextActionRank(projectId,task,pendingDocSummary){
  const status=String(task?.status||'예정').trim()||'예정';
  if(status==='완료')return 999;
  const dueDiff=getGanttTaskDueDiff(task);
  const issueCount=getGanttTaskLinkedIssueCount(projectId,task?.id);
  const hasMaterialWaiting=Number(pendingDocSummary?.total||0)>0&&(status==='대기'||status==='보류');
  if(dueDiff!==null&&dueDiff<0)return 10;
  if(dueDiff===0)return 20;
  if(dueDiff===1)return 30;
  if(issueCount>0)return 40;
  if(hasMaterialWaiting)return 50;
  if(dueDiff!==null&&dueDiff<=3)return 60;
  if(status==='대기')return 70;
  if(status==='보류')return 80;
  if(!String(task?.assignee_member_id||'').trim())return 90;
  if(status==='진행중')return 100;
  return 110;
}

function getGanttProjectFocusTasks(projectId,limit=5){
  const pendingDocSummary=getGanttProjectPendingDocSummary(projectId);
  return [...getGanttTaskDisplayRows(projectId)]
    .filter(task=>String(task?.status||'').trim()!=='완료')
    .sort((a,b)=>{
      const rankDiff=getGanttTaskNextActionRank(projectId,a,pendingDocSummary)-getGanttTaskNextActionRank(projectId,b,pendingDocSummary);
      if(rankDiff)return rankDiff;
      const aDue=getGanttTaskDateValue(a?.due_date);
      const bDue=getGanttTaskDateValue(b?.due_date);
      if(aDue&&bDue&&aDue!==bDue)return aDue.localeCompare(bDue);
      if(aDue!==bDue)return aDue?-1:1;
      return String(a?.title||'').localeCompare(String(b?.title||''),'ko');
    })
    .slice(0,limit);
}

function getGanttTaskQuickStatusOptions(task){
  const current=String(task?.status||'예정').trim()||'예정';
  const preferred=['진행중','대기','완료'];
  const values=preferred.includes(current)?preferred:[current,...preferred];
  return values.map(value=>'<option value="'+value+'"'+(value===current?' selected':'')+'>'+value+'</option>').join('');
}

async function updateProjectTaskQuickStatus(projectId,taskId,nextStatus){
  const projectKey=String(projectId||'');
  const taskKey=String(taskId||'');
  const task=getGanttProjectTasks(projectKey).find(row=>String(row?.id||'')===taskKey);
  const status=String(nextStatus||'').trim();
  if(!projectKey||!taskKey||!task||!status)return;
  const currentStatus=String(task?.status||'예정').trim()||'예정';
  if(status===currentStatus)return;
  const nowIso=new Date().toISOString();
  const currentProgress=getGanttTaskProgressValue(task);
  const progressValue=status==='완료'
    ?100
    :(currentStatus==='완료'&&currentProgress===100?0:currentProgress);
  try{
    await api('PATCH',getGanttProjectTaskApiPath('id=eq.'+taskKey),{
      status,
      progress_percent:progressValue,
      actual_done_at:status==='완료'?(task?.actual_done_at||nowIso):null,
      updated_at:nowIso
    });
    await loadGanttProjectTasks(projectKey,true);
  }catch(error){
    alert(isMissingGanttProjectTaskTableError(error)
      ?getMissingGanttProjectTaskTableMessage()
      :'업무 상태를 바꾸는 중 오류가 발생했습니다: '+error.message);
  }
}

function renderGanttTaskProgressMini(task){
  const progress=getGanttTaskProgressValue(task);
  return ''
    +'<div class="gantt-task-row-progress" aria-label="진행률 '+progress+'%">'
      +'<span class="gantt-task-row-progress-bar"><span class="gantt-task-row-progress-fill" style="width:'+progress+'%"></span></span>'
      +'<span class="gantt-task-row-progress-text">'+progress+'%</span>'
    +'</div>';
}

function renderGanttTaskRowActions(projectId,task,options={}){
  const includeDelete=options.includeDelete!==false;
  return ''
    +(task?.status!=='완료'
      ?'<button type="button" class="btn sm" onclick="event.stopPropagation();completeProjectTask(\''+projectId+'\',\''+task.id+'\')">완료</button>'
      :'')
    +'<button type="button" class="btn ghost sm" onclick="event.stopPropagation();openProjectTaskModal(\''+projectId+'\',\''+task.id+'\')">수정</button>'
    +(includeDelete?'<button type="button" class="btn ghost sm gantt-task-delete-btn" onclick="event.stopPropagation();deleteProjectTask(\''+projectId+'\',\''+task.id+'\')">삭제</button>':'');
}

function renderGanttTaskCard(projectId,task,variant='list'){
  const assignee=getGanttTaskMemberName(task?.assignee_member_id)||'담당 미정';
  const dueMeta=getGanttTaskDueMeta(task);
  const rowTone=getGanttTaskRowTone(task,dueMeta);
  const dateMeta=getGanttTaskDateDisplayMeta(task);
  const cueMeta=getGanttTaskExecutionCueMeta(projectId,task,getGanttProjectPendingDocSummary(projectId));
  if(variant==='focus'){
    const progress=getGanttTaskProgressValue(task);
    return ''
      +'<div class="gantt-task-focus-item is-'+rowTone+'" onclick="openProjectTaskModal(\''+projectId+'\',\''+task.id+'\')">'
        +'<div class="gantt-task-focus-top"><span class="gantt-task-focus-cue is-'+cueMeta.tone+'">'+esc(cueMeta.label)+'</span><span class="badge '+getGanttTaskStatusBadgeClass(task?.status)+'">'+esc(task?.status||'예정')+'</span></div>'
        +'<div class="gantt-task-focus-title-row"><div class="gantt-task-focus-title">'+esc(task?.title||'제목 없는 업무')+'</div>'+getGanttTaskContextBadges(projectId,task)+'</div>'
        +'<div class="gantt-task-focus-meta"><span class="gantt-task-focus-meta-item">'+esc(assignee)+'</span><span class="gantt-task-focus-meta-item is-'+dueMeta.tone+'">'+esc(getGanttTaskDueDisplayText(task,dueMeta,dateMeta))+'</span><span class="gantt-task-focus-meta-item">진행률 '+progress+'%</span></div>'
        +'<div class="gantt-task-focus-footer"><div class="gantt-task-focus-hint">지금 할 일: '+esc(cueMeta.hint)+'</div><div class="gantt-task-row-actions">'+renderGanttTaskRowActions(projectId,task,{includeDelete:false})+'</div></div>'
      +'</div>';
  }
  return ''
    +'<div class="gantt-task-row is-'+rowTone+'" onclick="openProjectTaskModal(\''+projectId+'\',\''+task.id+'\')">'
      +'<div class="gantt-task-row-cell gantt-task-row-cell--title"><span class="gantt-task-row-cell-label">업무</span><div><div class="gantt-task-row-title">'+esc(task?.title||'제목 없는 업무')+'</div>'+renderGanttTaskProgressMini(task)+'</div></div>'
      +'<div class="gantt-task-row-cell gantt-task-row-cell--assignee"><span class="gantt-task-row-cell-label">담당자</span><span class="gantt-task-row-value">'+esc(assignee)+'</span></div>'
      +'<div class="gantt-task-row-cell gantt-task-row-cell--due"><span class="gantt-task-row-cell-label">기한</span><div class="gantt-task-row-due-wrap"><span class="gantt-task-row-value is-'+dueMeta.tone+'">'+esc(dateMeta.dueText)+'</span>'+(getGanttTaskDateValue(task?.due_date)&&dueMeta.tone!=='neutral'?'<span class="gantt-task-row-subhint is-'+dueMeta.tone+'">'+esc(dueMeta.label)+'</span>':'')+'</div></div>'
      +'<div class="gantt-task-row-cell gantt-task-row-cell--status"><span class="gantt-task-row-cell-label">상태</span><div class="gantt-task-row-status-line" onclick="event.stopPropagation()"><select class="gantt-task-status-quick" onclick="event.stopPropagation()" onchange="event.stopPropagation();updateProjectTaskQuickStatus(\''+projectId+'\',\''+task.id+'\',this.value)">'+getGanttTaskQuickStatusOptions(task)+'</select>'+(String(task?.status||'').trim()!=='완료'?'<button type="button" class="btn ghost sm gantt-task-row-complete-btn" onclick="event.stopPropagation();completeProjectTask(\''+projectId+'\',\''+task.id+'\')">완료</button>':'')+'</div></div>'
    +'</div>';
}

function renderGanttProjectNextActionsSection(projectId){
  const focusTasks=getGanttProjectFocusTasks(projectId,5);
  return ''
    +'<div class="gantt-work-focus">'
      +'<div class="gantt-work-focus-head"><div><div class="gantt-panel-title">다음 액션</div><div class="gantt-detail-meta">지연, 오늘·내일 마감, 이슈, 프로젝트 자료 요청 영향 신호가 있는 업무를 먼저 보여줍니다.</div></div><div class="gantt-work-focus-count">우선 '+focusTasks.length+'건</div></div>'
      +(focusTasks.length
        ?'<div class="gantt-work-focus-list">'+focusTasks.map(task=>renderGanttTaskCard(projectId,task,'focus')).join('')+'</div>'
        :'<div class="gantt-detail-empty-state gantt-work-focus-empty"><div class="gantt-detail-value">지금 바로 처리할 열린 업무가 없습니다.</div><div class="gantt-detail-meta">모든 업무가 완료됐거나 아직 등록된 업무가 없습니다. 새 업무를 추가하거나 아래 전체 목록에서 다음 작업을 확인하세요.</div></div>')
    +'</div>';
}

function getGanttProjectWorkSupportCards(project,memberSchedules){
  const projectId=String(project?.id||'');
  const taskSummary=getGanttProjectTaskSummary(projectId);
  const nextTask=getGanttProjectNextActionTask(projectId);
  const issueTotal=getGanttProjectTaskIssueTotal(projectId);
  const pendingDocSummary=getGanttProjectPendingDocSummary(projectId);
  const scheduleCount=(memberSchedules||[]).length;
  const blockedCount=Number(taskSummary.waiting||0)+Number(taskSummary.hold||0);
  const docValue=pendingDocSummary===undefined
    ?'자료 확인 중'
    :pendingDocSummary&&pendingDocSummary.total
      ?'자료 '+pendingDocSummary.total+'건'
      :'자료 대기 없음';
  const docNoteParts=[];
  if(pendingDocSummary&&pendingDocSummary.total){
    if(pendingDocSummary.overdueCount>0)docNoteParts.push('회수 지연 '+pendingDocSummary.overdueCount+'건');
    else if(pendingDocSummary.nearestDueLabel)docNoteParts.push('가장 이른 회수 '+pendingDocSummary.nearestDueLabel);
    else docNoteParts.push('회수일 미정 자료 포함');
  }else if(pendingDocSummary===undefined){
    docNoteParts.push('pending 자료 요청을 불러오는 중입니다.');
  }else{
    docNoteParts.push('현재 pending 자료 요청은 없습니다.');
  }
  docNoteParts.push(scheduleCount>0?'연결 일정 '+scheduleCount+'건':'연결 일정 없음');
  return [
    {
      label:'다음 실행',
      value:nextTask?truncateText(nextTask.title||'다음 업무',28):'우선 업무 없음',
      note:nextTask?getGanttTaskOperationalHint(projectId,nextTask):'진행중이거나 다시 확인할 업무가 없습니다.',
      tone:nextTask?(getGanttTaskDueMeta(nextTask).tone==='danger'?'danger':getGanttTaskDueMeta(nextTask).tone==='warn'?'warn':'neutral'):'good'
    },
    {
      label:'이슈 / 막힘',
      value:issueTotal>0?'연결 이슈 '+issueTotal+'건':blockedCount>0?'대기 · 보류 '+blockedCount+'건':'특이 신호 없음',
      note:issueTotal>0
        ?'Issues 탭에서 어떤 업무가 막혀 있는지 함께 확인하세요.'
        :blockedCount>0
          ?'대기나 보류 업무의 재개 시점과 선행 조건을 정리해두면 좋습니다.'
          :'현재 작업 막힘 신호는 크지 않습니다.',
      tone:issueTotal>0||taskSummary.overdue>0?'danger':blockedCount>0?'warn':'good'
    },
    {
      label:'자료 / 일정',
      value:docValue,
      note:docNoteParts.join(' · '),
      tone:pendingDocSummary&&pendingDocSummary.overdueCount>0?'danger':scheduleCount>0||(pendingDocSummary&&pendingDocSummary.total)?'warn':'neutral'
    }
  ];
}

function renderGanttProjectWorkSupportGrid(project,memberSchedules){
  const cards=getGanttProjectWorkSupportCards(project,memberSchedules);
  return ''
    +'<div class="gantt-work-hub">'
      +'<div class="gantt-work-hub-head">'
        +'<div class="gantt-panel-title">실행 포인트</div>'
        +'<div class="gantt-detail-meta">지금 바로 볼 업무, 연결 이슈, 자료·일정 신호만 가볍게 모아 보여줍니다.</div>'
      +'</div>'
      +'<div class="gantt-work-support-grid">'
        +cards.map(card=>''
          +'<div class="gantt-work-support-card is-'+card.tone+'">'
            +'<div class="gantt-work-support-label">'+esc(card.label)+'</div>'
            +'<div class="gantt-work-support-value">'+esc(card.value)+'</div>'
            +'<div class="gantt-work-support-note">'+esc(card.note)+'</div>'
          +'</div>'
        ).join('')
      +'</div>'
    +'</div>';
}

function buildGanttListTaskSummary(tasks){
  const rows=Array.isArray(tasks)?tasks:[];
  let overdueCount=0;
  let waitingCount=0;
  let inProgressCount=0;
  let openCount=0;
  let nearestDueValue='';
  let nearestDueTitle='';
  rows.forEach(task=>{
    const status=String(task?.status||'예정').trim()||'예정';
    const dueMeta=getGanttTaskDueMeta(task);
    if(dueMeta.tone==='danger')overdueCount+=1;
    if(status!=='완료'){
      openCount+=1;
      if(status==='대기'||status==='보류')waitingCount+=1;
      if(status==='진행중')inProgressCount+=1;
    }
    if(status==='완료')return;
    const dueValue=getGanttTaskDateValue(task?.due_date);
    if(!dueValue)return;
    if(!nearestDueValue||dueValue<nearestDueValue){
      nearestDueValue=dueValue;
      nearestDueTitle=String(task?.title||'').trim();
    }
  });
  return {
    total:rows.length,
    openCount,
    overdueCount,
    waitingCount,
    inProgressCount,
    nearestDueValue,
    nearestDueLabel:nearestDueValue?formatGanttTaskShortDate(nearestDueValue):'',
    nearestDueTitle
  };
}

function getGanttListTaskSummaryText(summary){
  if(!summary||!summary.total)return '';
  const parts=['업무 '+summary.total+'건'];
  if(summary.overdueCount>0)parts.push('지연 '+summary.overdueCount+'건');
  else if(summary.waitingCount>0)parts.push('대기 '+summary.waitingCount+'건');
  else if(summary.inProgressCount>0)parts.push('진행 '+summary.inProgressCount+'건');
  if(summary.overdueCount===0&&summary.nearestDueLabel)parts.push('다음 '+summary.nearestDueLabel);
  return parts.join(' · ');
}

function getGanttListTaskSummaryTitle(summary){
  if(!summary||!summary.total)return '';
  const parts=['업무 '+summary.total+'건'];
  if(summary.openCount>0)parts.push('열린 업무 '+summary.openCount+'건');
  if(summary.overdueCount>0)parts.push('지연 '+summary.overdueCount+'건');
  if(summary.waitingCount>0)parts.push('대기 '+summary.waitingCount+'건');
  if(summary.nearestDueLabel&&summary.nearestDueTitle){
    parts.push('가장 가까운 일정: '+summary.nearestDueTitle+' ('+summary.nearestDueLabel+')');
  }
  return parts.join(' · ');
}

function getGanttListAttentionSubtext(row){
  if(Number(row?.taskSummary?.overdueCount||0)>0)return '업무 지연 '+row.taskSummary.overdueCount+'건';
  if(Number(row?.issueCount||0)>0)return '미해결 이슈 '+row.issueCount+'건';
  if(Number(row?.taskSummary?.waitingCount||0)>0)return '대기 업무 '+row.taskSummary.waitingCount+'건';
  return row?.riskMeta?.detail||'현재 위험 신호 없음';
}

function getGanttProjectTaskSummary(projectId){
  const tasks=getGanttProjectTasks(projectId);
  const summary={total:tasks.length,active:0,inProgress:0,waiting:0,hold:0,done:0,overdue:0,issueLinked:0};
  tasks.forEach(task=>{
    const status=String(task?.status||'예정').trim()||'예정';
    if(status==='완료'){
      summary.done+=1;
    }else{
      summary.active+=1;
      if(status==='진행중')summary.inProgress+=1;
      if(status==='대기')summary.waiting+=1;
      if(status==='보류')summary.hold+=1;
    }
    if(getGanttTaskDueMeta(task).tone==='danger')summary.overdue+=1;
    if(getGanttTaskLinkedIssueCount(projectId,task?.id)>0)summary.issueLinked+=1;
  });
  return summary;
}

function renderGanttTaskRows(projectId){
  return getGanttTaskDisplayRows(projectId).map(task=>renderGanttTaskCard(projectId,task,'list')).join('');
}

function renderGanttProjectWorkSection(project,memberSchedules){
  const taskSummary=getGanttProjectTaskSummary(project?.id);
  const loadMeta=getGanttProjectTaskLoadMeta(project?.id);
  loadGanttProjectPendingDocSummary(project?.id,false);
  return ''
    +'<div class="gantt-detail-pane gantt-work-pane">'
      +'<div class="gantt-task-summary-grid gantt-task-summary-grid--ops">'
        +'<div class="gantt-detail-work-card"><div class="gantt-detail-label">열린 업무</div><div class="gantt-detail-value">'+taskSummary.active+'건</div><div class="gantt-detail-meta">지금 추적 중인 실행 단위</div></div>'
        +'<div class="gantt-detail-work-card"><div class="gantt-detail-label">기한 초과</div><div class="gantt-detail-value">'+taskSummary.overdue+'건</div><div class="gantt-detail-meta">오늘 먼저 정리할 일정</div></div>'
        +'<div class="gantt-detail-work-card"><div class="gantt-detail-label">대기 · 보류</div><div class="gantt-detail-value">'+(taskSummary.waiting+taskSummary.hold)+'건</div><div class="gantt-detail-meta">막힘이나 재개 확인 필요</div></div>'
        +'<div class="gantt-detail-work-card"><div class="gantt-detail-label">이슈 연결</div><div class="gantt-detail-value">'+taskSummary.issueLinked+'건</div><div class="gantt-detail-meta">Issues 탭과 함께 볼 업무</div></div>'
      +'</div>'
      +renderGanttProjectNextActionsSection(project.id)
      +'<div class="gantt-detail-section gantt-detail-section--flush">'
        +'<div class="gantt-detail-section-head"><div><div class="gantt-panel-title">전체 업무</div><div class="gantt-detail-meta">긴 설명보다 담당자, 기한, 상태, 진행률만 빠르게 보고 실행을 이어갑니다.</div></div><button type="button" class="btn primary sm" onclick="openProjectTaskModal(\''+project.id+'\')">+ 업무 추가</button></div>'
        +((getGanttProjectTasks(project?.id)||[]).length
          ?'<div class="gantt-task-list-head"><span>업무</span><span>담당자</span><span>기한</span><span>상태 / 실행</span></div><div class="gantt-task-list">'+renderGanttTaskRows(project.id)+'</div>'
          :renderGanttTaskEmptyState(project.id,loadMeta))
      +'</div>'
      +'<div class="gantt-detail-section gantt-work-schedule-section">'
        +'<div class="gantt-detail-section-head"><div><div class="gantt-panel-title">일정 참고</div><div class="gantt-detail-meta">휴가·필드웍은 업무와 분리해 두고, 실행에 영향을 주는 신호로만 확인합니다.</div></div></div>'
        +'<div class="gantt-detail-list">'+((memberSchedules||[]).map(schedule=>'<div class="gantt-detail-item is-clickable" onclick="openScheduleModal(\''+schedule.id+'\')"><div><div class="gantt-detail-item-title">'+esc(getScheduleMemberLabel(schedule))+' '+esc(scheduleLabel(schedule.schedule_type))+'</div><div class="gantt-detail-item-sub">'+esc((schedule.start||'')+' ~ '+(schedule.end||'')+(schedule.location?' · '+schedule.location:''))+'</div></div><span class="badge '+(schedule.schedule_type==='leave'?'badge-orange':'badge-blue')+'">'+esc(scheduleLabel(schedule.schedule_type))+'</span></div>').join('')||'<div class="gantt-detail-empty">해당 멤버의 휴가/필드 일정은 없습니다.</div>')+'</div>'
      +'</div>'
    +'</div>';
}

function renderGanttIssueEmptyState(projectId){
  return ''
    +'<div class="gantt-detail-empty-state">'
      +'<div class="gantt-detail-value">현재 확인할 이슈가 없습니다.</div>'
      +'<div class="gantt-detail-meta">이 탭에서는 프로젝트 전체 리스크와 업무 연결 이슈를 나눠서 확인합니다.</div>'
      +'<div class="gantt-detail-list">'
        +'<div class="gantt-detail-item"><div><div class="gantt-detail-item-title">프로젝트 단위 이슈 없음</div><div class="gantt-detail-item-sub">범위, 일정, 의사결정처럼 프로젝트 전체에서 확인할 이슈가 없습니다.</div></div><span class="badge badge-gray">없음</span></div>'
        +'<div class="gantt-detail-item"><div><div class="gantt-detail-item-title">업무 연결 이슈 없음</div><div class="gantt-detail-item-sub">특정 업무를 막는 이슈가 없으며, 필요하면 새 이슈를 업무에 선택적으로 연결할 수 있습니다.</div></div><span class="badge badge-gray">없음</span></div>'
      +'</div>'
      +'<div class="gantt-detail-meta">실행 중에는 Work 탭에서 업무별 이슈 수만 가볍게 확인하고, 세부 맥락은 여기서 봅니다.</div>'
    +'</div>';
}

function renderGanttIssueGroup(title,meta,itemsHtml,emptyText){
  return ''
    +'<div class="gantt-issue-group">'
      +'<div><div class="gantt-issue-group-label">'+esc(title)+'</div><div class="gantt-detail-meta">'+esc(meta)+'</div></div>'
      +(itemsHtml?'<div class="gantt-detail-list">'+itemsHtml+'</div>':'<div class="gantt-detail-empty">'+esc(emptyText)+'</div>')
    +'</div>';
}

function getGanttIssueContextLabel(issue){
  if(String(issue?.task_id||'').trim())return issue?._taskTitle?('업무 연결 · '+issue._taskTitle):'업무 연결 이슈';
  return '프로젝트 단위 이슈';
}

function renderGanttDetailIssuePreview(projectId,issues){
  const container=document.getElementById('ganttDetailIssueList');
  if(!container||String(ganttFocusProjectId||'')!==String(projectId||''))return;
  if(!(issues||[]).length){
    container.innerHTML=renderGanttIssueEmptyState(projectId);
    return;
  }
  if(ganttDetailTab!=='issues'){
    container.innerHTML=issues.map(issue=>renderGanttDetailIssueItem(projectId,issue)).join('');
    return;
  }
  const projectLevelIssues=issues.filter(issue=>!String(issue?.task_id||'').trim());
  const taskLinkedIssues=issues.filter(issue=>!!String(issue?.task_id||'').trim());
  container.innerHTML=''
    +renderGanttIssueGroup(
      '프로젝트 단위 이슈',
      '범위, 일정, 의사결정처럼 프로젝트 전체에 영향을 주는 이슈입니다.',
      projectLevelIssues.map(issue=>renderGanttDetailIssueItem(projectId,issue)).join(''),
      '현재 프로젝트 전체에서 확인할 이슈는 없습니다.'
    )
    +renderGanttIssueGroup(
      '업무 연결 이슈',
      '특정 업무 진행을 막거나 늦추는 이슈입니다. 조치는 Work 탭과 함께 확인합니다.',
      taskLinkedIssues.map(issue=>renderGanttDetailIssueItem(projectId,issue)).join(''),
      '현재 업무에 연결된 이슈는 없습니다.'
    );
}

function renderGanttProjectIssuesSection(project){
  return ''
    +'<div class="gantt-detail-pane">'
      +'<div class="gantt-detail-section gantt-detail-section--flush">'
        +'<div class="gantt-detail-section-head"><div><div class="gantt-panel-title">프로젝트 이슈</div><div class="gantt-detail-meta">프로젝트 전체 리스크와 업무 연결 이슈를 나눠 확인합니다. 실행 조정은 Work 탭에서 이어갑니다.</div></div><button type="button" class="gantt-detail-link" onclick="openProjModal(\''+project.id+'\',null,null,\'issue\')">전체 이슈 보기</button></div>'
        +'<div class="gantt-detail-list" id="ganttDetailIssueList"><div class="gantt-detail-empty">불러오는 중...</div></div>'
      +'</div>'
    +'</div>';
}
function buildGanttMemoSupportCards(project){
  return [
    {label:'프로젝트 메모',context:'프로젝트 단위 · 운영 메모',value:project?.memo||'',tab:'basic'},
    {label:'결과 요약',context:'프로젝트 단위 · 참고 기록',value:project?.result_summary||'',tab:'completion'},
    {label:'내부 작업 메모',context:'프로젝트 단위 · 실행 메모',value:project?.work_summary||'',tab:'completion'},
    {label:'이슈 / 리스크 메모',context:'프로젝트 단위 · 리스크 메모',value:project?.issue_note||'',tab:'completion'},
    {label:'후속 액션',context:'프로젝트 단위 · 다음 액션',value:project?.follow_up_note||'',tab:'completion'}
  ].filter(card=>String(card.value||'').trim());
}

function renderGanttDetailDocumentPreview(projectId,documents){
  const container=document.getElementById('ganttDetailDocumentList');
  if(!container||String(ganttFocusProjectId||'')!==String(projectId||''))return;
  const rows=Array.isArray(documents)?documents:[];
  if(!rows.length){
    container.innerHTML=''
      +'<div class="gantt-detail-empty-state">'
        +'<div class="gantt-detail-value">대기 중인 자료 요청이 없습니다.</div>'
        +'<div class="gantt-detail-meta">이 영역은 프로젝트 실행에 필요한 자료 요청과 회수 희망일을 모아 보는 곳입니다.</div>'
        +'<div class="gantt-detail-meta">현재 자료 요청은 프로젝트 단위로 관리되며, Work 탭에서는 실행 신호만 가볍게 확인합니다.</div>'
      +'</div>';
    return;
  }
  container.innerHTML=rows.map(doc=>''
    +'<div class="gantt-detail-item is-clickable" onclick="openProjModal(\''+projectId+'\',null,null,\'documents\')">'
      +'<div>'
        +'<div class="gantt-detail-item-title">'+esc(doc.title||'자료 요청')+'</div>'
        +'<div class="gantt-detail-item-sub">프로젝트 단위 · 자료 요청'+(doc.due_date?' · 회수 희망일 '+esc(doc.due_date):' · 회수 희망일 미정')+'</div>'
      +'</div>'
      +'<div class="gantt-detail-item-side"><span class="badge badge-orange">자료 요청</span><span class="badge badge-gray">프로젝트 단위</span></div>'
    +'</div>'
  ).join('');
}

function renderGanttProjectMemoSection(project){
  const noteCards=buildGanttMemoSupportCards(project);
  return ''
    +'<div class="gantt-detail-pane">'
      +'<div class="gantt-detail-section gantt-detail-section--flush">'
        +'<div class="gantt-detail-section-head"><div><div class="gantt-panel-title">자료 요청 / 실행 자료</div><div class="gantt-detail-meta">프로젝트 실행에 필요한 자료 요청과 회수 상태를 확인합니다. 현재 자료 요청은 프로젝트 단위로 관리됩니다.</div></div><button type="button" class="gantt-detail-link" onclick="openProjModal(\''+project.id+'\',null,null,\'documents\')">자료요청 관리</button></div>'
        +'<div class="gantt-detail-list" id="ganttDetailDocumentList"><div class="gantt-detail-empty">불러오는 중...</div></div>'
      +'</div>'
      +'<div class="gantt-detail-section">'
        +'<div class="gantt-detail-section-head"><div><div class="gantt-panel-title">메모 / 운영 노트</div><div class="gantt-detail-meta">운영 메모, 리스크 메모, 후속 액션, 참고 기록을 모아 두는 실행 지원 영역입니다.</div></div></div>'
        +(noteCards.length
          ?'<div class="gantt-detail-note-grid">'+noteCards.map(card=>''
            +'<button type="button" class="gantt-detail-note-card" onclick="openProjModal(\''+project.id+'\',null,null,\''+card.tab+'\')">'
              +'<div class="gantt-detail-note-label">'+esc(card.label)+'</div>'
              +'<div class="gantt-detail-meta">'+esc(card.context)+'</div>'
              +'<div class="gantt-detail-note-text">'+esc(card.value)+'</div>'
            +'</button>'
          ).join('')+'</div>'
          :'<div class="gantt-detail-empty-state"><div class="gantt-detail-value">아직 남겨둔 실행 메모가 없습니다.</div><div class="gantt-detail-meta">이곳은 프로젝트 단위 운영 메모, 리스크 메모, 후속 액션, 참고 기록을 정리하는 탭입니다.</div><div class="gantt-detail-meta">필요할 때 프로젝트 메모나 완료·후속 탭에서 기록을 남겨 두면 회의와 후속 작업에 도움이 됩니다.</div></div>')
      +'</div>'
    +'</div>';
}

function getGanttStatusFilterLabel(value){
  return getGanttStatusOptions().find(option=>option.value===value)?.label||'전체';
}

function toggleGanttTypeFilter(type){
  setGanttTypeFilter(type);
}

function clearGanttFilterTag(kind,value=''){
  if(kind==='member'){
    const sel=document.getElementById('memberFilter');
    if(sel)sel.value='';
    renderMemberFilterTabs();
  }else if(kind==='status'){
    ganttStatusFilter='all';
  }else if(kind==='type'){
    ganttTypeFilters=[];
  }else if(kind==='client'){
    ganttClientFilterQuery='';
  }
  renderGantt();
}

function renderGanttTopFilterBar(){
  const bar=ensureGanttTopFilterBar();
  if(!bar)return;
  const clientOptions=[...new Set((clients||[]).map(client=>String(client?.name||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
  const typeFilterValue=getGanttTypeFilterValue();
  bar.innerHTML=''
    +'<div class="gantt-top-filter-group gantt-status-group">'
      +'<span class="gantt-top-filter-label">상태</span>'
      +'<div class="gantt-status-chip-list">'
        +getGanttStatusOptions().map(option=>'<button type="button" class="gantt-status-chip'+(ganttStatusFilter===option.value?' active':'')+'" onclick="setGanttStatusFilter(\''+option.value+'\')">'+option.label+'</button>').join('')
      +'</div>'
    +'</div>'
    +'<div class="gantt-top-filter-group gantt-type-group">'
      +'<span class="gantt-top-filter-label">유형</span>'
      +'<select id="ganttTypeFilterSelect">'
        +'<option value="all">전체</option>'
        +GANTT_TYPE_OPTIONS.map(type=>'<option value="'+type+'"'+(typeFilterValue===type?' selected':'')+'>'+type+'</option>').join('')
      +'</select>'
    +'</div>'
    +'<div class="gantt-top-filter-group gantt-client-group">'
      +'<span class="gantt-top-filter-label">고객사</span>'
      +'<input id="ganttClientFilterInput" class="gantt-client-search" list="ganttClientFilterOptions" value="'+esc(ganttClientFilterQuery)+'" placeholder="고객사 검색" />'
      +'<datalist id="ganttClientFilterOptions">'
        +clientOptions.map(name=>'<option value="'+esc(name)+'"></option>').join('')
      +'</datalist>'
    +'</div>';
  const typeSelect=document.getElementById('ganttTypeFilterSelect');
  if(typeSelect)typeSelect.onchange=e=>setGanttTypeFilter(e.target.value);
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
  const typeFilterValue=getGanttTypeFilterValue();
  if(memberValue)tags.push({kind:'member',value:memberValue,label:'멤버 · '+memberValue});
  if(ganttStatusFilter!=='all')tags.push({kind:'status',value:ganttStatusFilter,label:'상태 · '+getGanttStatusFilterLabel(ganttStatusFilter)});
  if(typeFilterValue!=='all')tags.push({kind:'type',value:typeFilterValue,label:'유형 · '+typeFilterValue});
  if(ganttClientFilterQuery)tags.push({kind:'client',value:ganttClientFilterQuery,label:'고객사 · '+ganttClientFilterQuery});
  if(!tags.length){
    row.innerHTML='';
    row.style.display='none';
    return;
  }
  row.style.display='flex';
  row.innerHTML=tags.map(tag=>'<button type="button" class="gantt-filter-tag" onclick="clearGanttFilterTag(\''+tag.kind+'\',\''+String(tag.value).replace(/'/g,"\\'")+'\')">'+esc(tag.label)+' <span>×</span></button>').join('');
}

function projectMatchesTopFilters(project){
  const lifecycleMeta=getGanttProjectLifecycleMeta(project,{
    taskSummary:ganttListTaskSummaryByProjectId[String(project?.id||'')],
    taskIssueSummary:ganttListTaskIssueSummaryByProjectId[String(project?.id||'')],
    pendingDocSummary:(window.ganttProjectPendingDocSummaryByProjectId||{})[String(project?.id||'')],
    issueCount:openIssuesByProject[String(project?.id||'')]||0
  });
  if(ganttStatusFilter==='in_progress'&&lifecycleMeta.key!=='in_progress')return false;
  if(ganttStatusFilter==='overdue'&&lifecycleMeta.key!=='overdue')return false;
  if(ganttStatusFilter==='due_today'&&!isGanttProjectDueToday(project))return false;
  if(ganttStatusFilter==='execution_done'&&lifecycleMeta.key!=='execution_done')return false;
  if(ganttStatusFilter==='follow_up'&&lifecycleMeta.key!=='follow_up')return false;
  if(ganttStatusFilter==='fully_closed'&&lifecycleMeta.key!=='fully_closed')return false;
  const typeFilterValue=getGanttTypeFilterValue();
  if(typeFilterValue!=='all'&&typeFilterValue!==(String(project?.type||'기타').trim()||'기타'))return false;
  if(ganttClientFilterQuery){
    const clientName=getGanttProjectClientName(project).toLowerCase();
    if(!clientName.includes(String(ganttClientFilterQuery).trim().toLowerCase()))return false;
  }
  return true;
}

function buildGanttListTaskSummary(tasks){
  const rows=Array.isArray(tasks)?tasks:[];
  let overdueCount=0;
  let waitingCount=0;
  let inProgressCount=0;
  let openCount=0;
  let dueTodayCount=0;
  let dueSoonCount=0;
  let unassignedCount=0;
  let nearestDueValue='';
  let nearestDueTitle='';
  rows.forEach(task=>{
    const status=String(task?.status||'예정').trim()||'예정';
    const dueMeta=getGanttTaskDueMeta(task);
    if(dueMeta.tone==='danger')overdueCount+=1;
    if(dueMeta.label==='오늘 마감')dueTodayCount+=1;
    else if(dueMeta.tone==='warn')dueSoonCount+=1;
    if(status!=='완료'){
      openCount+=1;
      if(status==='대기'||status==='보류')waitingCount+=1;
      if(status==='진행중')inProgressCount+=1;
      if(!String(task?.assignee_member_id||'').trim())unassignedCount+=1;
    }
    if(status==='완료')return;
    const dueValue=getGanttTaskDateValue(task?.due_date);
    if(!dueValue)return;
    if(!nearestDueValue||dueValue<nearestDueValue){
      nearestDueValue=dueValue;
      nearestDueTitle=String(task?.title||'').trim();
    }
  });
  return {
    total:rows.length,
    openCount,
    overdueCount,
    waitingCount,
    inProgressCount,
    dueTodayCount,
    dueSoonCount,
    unassignedCount,
    nearestDueValue,
    nearestDueLabel:nearestDueValue?formatGanttTaskShortDate(nearestDueValue):'',
    nearestDueTitle
  };
}

function getGanttListRiskMeta(project,issueCount,taskSummary,taskIssueSummary,pendingDocSummary){
  const lifecycleMeta=getGanttProjectLifecycleMeta(project,{taskSummary,taskIssueSummary,pendingDocSummary,issueCount});
  const billingPending=project?.is_billable!==false&&String(project?.billing_status||'').trim()==='미청구';
  if(lifecycleMeta.key==='overdue')return {label:'지연',tone:'danger',rank:6,detail:lifecycleMeta.detail};
  if(isGanttProjectDueToday(project))return {label:'오늘 마감',tone:'warn',rank:5.4,detail:'오늘 종료 예정이어서 일정 점검이 필요합니다.'};
  if(lifecycleMeta.key==='follow_up')return {label:'후속관리',tone:'warn',rank:4.7,detail:lifecycleMeta.detail};
  if(Number(taskSummary?.overdueCount||0)>0)return {label:'후속 Task',tone:'warn',rank:4.3,detail:'열린 업무 중 기한이 지난 항목이 있습니다.'};
  if(billingPending)return {label:'미청구',tone:'warn',rank:4.1,detail:'실행은 진행됐지만 청구 확인이 남아 있습니다.'};
  if(Number(issueCount||0)>0||Number(taskIssueSummary?.issueLinkedTaskCount||0)>0)return {label:'이슈',tone:'issue',rank:3.9,detail:'프로젝트 이슈 또는 업무 연결 이슈를 확인해야 합니다.'};
  if(Number(pendingDocSummary?.total||0)>0)return {label:'자료 요청',tone:'warn',rank:3.6,detail:'자료 회수나 문서 확인이 아직 남아 있습니다.'};
  if(lifecycleMeta.key==='execution_done')return {label:'실행 완료',tone:'neutral',rank:2.6,detail:lifecycleMeta.detail};
  if(lifecycleMeta.key==='fully_closed')return {label:'완전 종료',tone:'safe',rank:1,detail:lifecycleMeta.detail};
  return {label:'정상',tone:'safe',rank:2,detail:'현재 운영상 큰 막힘이 없습니다.'};
}

function getGanttListProjectRows(projs){
  return (projs||[]).map(project=>{
    const clientName=getGanttProjectClientName(project)||'고객사 미지정';
    const memberNames=[...(project.members||[])];
    const billingAmount=getGanttProjectBillingAmount(project);
    const billingStatus=getGanttListBillingStatus(project);
    const issueCount=openIssuesByProject[project.id]||0;
    const progressPercent=getGanttProjectProgress(project);
    const taskSummary=getGanttListTaskSummary(project.id);
    const taskIssueSummary=getGanttListTaskIssueSummary(project.id);
    const pendingDocSummary=(window.ganttProjectPendingDocSummaryByProjectId||{})[String(project.id||'')]||null;
    const lifecycleMeta=getGanttProjectLifecycleMeta(project,{taskSummary,taskIssueSummary,pendingDocSummary,issueCount});
    const riskMeta=getGanttListRiskMeta(project,issueCount,taskSummary,taskIssueSummary,pendingDocSummary);
    const periodText=(project.start||project.start_date||'')+' ~ '+(project.end||project.end_date||'');
    const searchText=[clientName,project?.name||'',project?.type||'',memberNames.join(' ')].join(' ').toLowerCase();
    return {
      project,
      clientName,
      typeText:String(project?.type||'기타').trim()||'기타',
      memberText:memberNames.join(', ')||'담당자 미지정',
      billingAmount,
      billingStatus,
      isBillingPending:project?.is_billable!==false&&String(project?.billing_status||'').trim()==='미청구',
      issueCount,
      progressPercent,
      taskSummary,
      taskIssueSummary,
      pendingDocSummary,
      taskSummaryText:getGanttListTaskSummaryText(taskSummary),
      taskSummaryTitle:getGanttListTaskSummaryTitle(taskSummary),
      lifecycleMeta,
      riskMeta,
      periodText,
      priority:String(project?.priority||'medium').trim()||'medium',
      searchText
    };
  });
}

function getGanttListProjectMetaItems(row){
  const items=[];
  if(Number(row?.taskSummary?.openCount||0)>0)items.push({label:'열린 '+row.taskSummary.openCount,tone:'neutral'});
  if(Number(row?.taskIssueSummary?.issueLinkedTaskCount||0)>0)items.push({label:'이슈연결 '+row.taskIssueSummary.issueLinkedTaskCount,tone:'issue'});
  else if(Number(row?.taskSummary?.dueTodayCount||0)>0)items.push({label:'오늘 '+row.taskSummary.dueTodayCount,tone:'warn'});
  else if(row?.taskSummary?.nearestDueLabel)items.push({label:'다음 '+row.taskSummary.nearestDueLabel,tone:'neutral'});
  return items.slice(0,3);
}

function getGanttListExecutionSignalItems(row){
  const items=[];
  const lifecycleKey=String(row?.lifecycleMeta?.key||'').trim();
  const openTaskCount=Number(row?.taskSummary?.openCount||0);
  const issueLinkedCount=Number(row?.taskIssueSummary?.issueLinkedTaskCount||0);
  const pendingDocCount=Number(row?.pendingDocSummary?.total||0);
  const dueTodayCount=Number(row?.taskSummary?.dueTodayCount||0);
  const issueCount=Number(row?.issueCount||0);
  if(dueTodayCount>0||isGanttProjectDueToday(row?.project))items.push({label:'오늘 마감',tone:'warn'});
  if(row?.isBillingPending)items.push({label:'미청구',tone:'warn'});
  if((lifecycleKey==='execution_done'||lifecycleKey==='follow_up')&&openTaskCount>0)items.push({label:'후속 Task '+openTaskCount+'건',tone:'neutral'});
  else if(openTaskCount>0&&items.length===0)items.push({label:'열린 업무 '+openTaskCount+'건',tone:'neutral'});
  if(pendingDocCount>0)items.push({label:'자료 요청',tone:'warn'});
  if(issueCount>0)items.push({label:'이슈 '+issueCount+'건',tone:'issue'});
  else if(issueLinkedCount>0)items.push({label:'이슈 연결',tone:'issue'});
  if(row?.project?.follow_up_needed)items.push({label:'후속 확인',tone:'neutral'});
  if(!dueTodayCount&&row?.taskSummary?.nearestDueLabel&&lifecycleKey!=='fully_closed')items.push({label:'다음 마감 '+row.taskSummary.nearestDueLabel,tone:'neutral'});
  if(lifecycleKey==='fully_closed'&&!items.length)items.push({label:'종료 기준 충족',tone:'safe'});
  const deduped=[];
  const seen=new Set();
  items.forEach(item=>{
    const key=String(item?.label||'');
    if(!key||seen.has(key))return;
    seen.add(key);
    deduped.push(item);
  });
  return deduped.slice(0,4);
}

function getGanttListAttentionSubtext(row){
  const items=getGanttListExecutionSignalItems(row).map(item=>item.label);
  if(items.length)return items.join(' · ');
  return row?.lifecycleMeta?.detail||row?.riskMeta?.detail||'현재 운영상 큰 막힘이 없습니다.';
}

function compareGanttListValues(a,b,key){
  if(key==='client_name')return a.clientName.localeCompare(b.clientName,'ko');
  if(key==='name')return String(a.project?.name||'').localeCompare(String(b.project?.name||''),'ko');
  if(key==='type')return String(a.project?.type||'').localeCompare(String(b.project?.type||''),'ko');
  if(key==='status')return Number(a?.lifecycleMeta?.rank||0)-Number(b?.lifecycleMeta?.rank||0);
  if(key==='period'){
    const startDiff=toDate(a.project?.start||a.project?.start_date||'')-toDate(b.project?.start||b.project?.start_date||'');
    if(startDiff)return startDiff;
    return toDate(a.project?.end||a.project?.end_date||'')-toDate(b.project?.end||b.project?.end_date||'');
  }
  if(key==='members')return a.memberText.localeCompare(b.memberText,'ko');
  if(key==='billing_status')return a.billingStatus.localeCompare(b.billingStatus,'ko');
  if(key==='billing_amount')return Number(a.billingAmount||0)-Number(b.billingAmount||0);
  if(key==='issue_count')return Number(a.issueCount||0)-Number(b.issueCount||0);
  if(key==='progress')return Number(a.progressPercent||0)-Number(b.progressPercent||0);
  if(key==='risk')return Number(a.riskMeta?.rank||0)-Number(b.riskMeta?.rank||0);
  if(key==='priority')return Number(getProjectPriorityRank(a.priority)||0)-Number(getProjectPriorityRank(b.priority)||0);
  return 0;
}

function getGanttListStatusBadgeClass(status){
  if(status==='지연')return 'badge-red';
  if(status==='후속관리')return 'badge-orange';
  if(status==='실행 완료')return 'badge-gray';
  if(status==='완전 종료')return 'badge-green';
  if(status==='진행중')return 'badge-blue';
  if(status==='예정')return 'badge-gray';
  return 'badge-gray';
}

function buildGanttProjectMemoSummaryEntries(project){
  return [
    {label:'프로젝트 메모',value:project?.memo||'',tab:'basic'},
    {label:'후속 액션',value:project?.follow_up_note||'',tab:'completion'},
    {label:'이슈 / 리스크 메모',value:project?.issue_note||'',tab:'completion'},
    {label:'내부 작업 메모',value:project?.work_summary||'',tab:'completion'},
    {label:'결과 요약',value:project?.result_summary||'',tab:'completion'}
  ].filter(entry=>String(entry.value||'').trim()).slice(0,3);
}

function renderGanttProjectMemoSummarySection(project){
  const memoEntries=buildGanttProjectMemoSummaryEntries(project);
  return ''
    +'<div class="gantt-detail-section gantt-overview-section">'
      +'<div class="gantt-detail-section-head">'
        +'<div><div class="gantt-panel-title">프로젝트 메모</div><div class="gantt-detail-meta">최근 메모와 후속 기록을 빠르게 확인하고, 필요하면 Memo / Documents 탭으로 이어집니다.</div></div>'
        +'<div class="gantt-detail-inline-actions"><button type="button" class="btn ghost sm" onclick="openProjModal(\''+project.id+'\',null,null,\'basic\')">메모 입력</button><button type="button" class="btn sm" onclick="setGanttDetailTab(\'memo\')">Memo / Documents 탭</button></div>'
      +'</div>'
      +(memoEntries.length
        ?'<div class="gantt-detail-note-grid">'+memoEntries.map(entry=>'<button type="button" class="gantt-detail-note-card" onclick="openProjModal(\''+project.id+'\',null,null,\''+entry.tab+'\')"><div class="gantt-detail-note-label">'+esc(entry.label)+'</div><div class="gantt-detail-note-text">'+esc(entry.value)+'</div></button>').join('')+'</div>'
        :'<div class="gantt-detail-empty-state"><div class="gantt-detail-value">아직 남겨둔 프로젝트 메모가 없습니다.</div><div class="gantt-detail-meta">간단한 운영 메모나 후속 메모를 먼저 남기고, 더 자세한 기록은 Memo / Documents 탭에서 이어가면 됩니다.</div><div class="gantt-detail-inline-actions"><button type="button" class="btn ghost sm" onclick="openProjModal(\''+project.id+'\',null,null,\'basic\')">메모 입력</button><button type="button" class="btn sm" onclick="setGanttDetailTab(\'memo\')">Memo / Documents 탭</button></div></div>')
    +'</div>';
}

function renderGanttProjectOverviewSection(project,client,linkedContract,projectMembers,memberSchedules,billingStatus,billingAmount){
  const scheduleTone=(memberSchedules||[]).length?'is-warn':'';
  const scheduleSummary=(memberSchedules||[]).length?getGanttDetailConflictSummary(memberSchedules):'조정 필요 없음';
  const executionSignals=getGanttOverviewExecutionSignals(project);
  return ''
    +'<div class="gantt-detail-pane gantt-overview-pane">'
      +'<div class="gantt-detail-section gantt-detail-section--flush gantt-overview-section">'
        +'<div class="gantt-detail-section-head"><div><div class="gantt-panel-title">프로젝트 요약</div><div class="gantt-detail-meta">고객사, 계약, 기간, 담당자를 중심으로 현재 프로젝트의 큰 흐름을 확인합니다.</div></div></div>'
        +'<div class="gantt-detail-grid gantt-detail-grid--overview">'
          +'<div class="gantt-detail-summary-card"><div class="gantt-detail-label">고객사</div><div class="gantt-detail-value">'+esc(client?.name||'고객사 미지정')+'</div></div>'
          +'<div class="gantt-detail-summary-card"><div class="gantt-detail-label">연결 계약</div><div class="gantt-detail-value">'+esc(linkedContract?.contract_name||'계약 없음')+'</div>'+(linkedContract?.contract_amount?'<div class="gantt-detail-meta">'+formatGanttCurrency(linkedContract.contract_amount)+'</div>':'')+'</div>'
          +'<div class="gantt-detail-summary-card"><div class="gantt-detail-label">기간</div><div class="gantt-detail-value">'+esc((project.start||'')+' ~ '+(project.end||''))+'</div></div>'
          +'<div class="gantt-detail-summary-card"><div class="gantt-detail-label">담당자</div><div class="gantt-detail-value">'+esc(projectMembers.join(', ')||'담당자 미지정')+'</div></div>'
        +'</div>'
      +'</div>'
      +'<div class="gantt-overview-context-grid">'
        +'<div class="gantt-overview-context-card"><div class="gantt-detail-label">계약 / 청구 현황</div><div class="gantt-detail-value">'+esc(billingStatus)+'</div><div class="gantt-detail-meta">'+formatGanttCurrency(billingAmount)+(linkedContract?.contract_amount?' · 계약 '+formatGanttCurrency(linkedContract.contract_amount):'')+'</div></div>'
        +'<div class="gantt-overview-context-card '+scheduleTone+'"><div class="gantt-detail-label">일정 / 조정</div><div class="gantt-detail-value">'+esc(scheduleSummary)+'</div><div class="gantt-detail-meta">'+((memberSchedules||[]).length?('개인 일정 '+memberSchedules.length+'건 확인'):'현재 조정이 필요한 개인 일정 없음')+'</div></div>'
      +'</div>'
      +'<div class="gantt-detail-section gantt-overview-section">'
        +'<div class="gantt-detail-section-head"><div><div class="gantt-panel-title">실행 요약</div><div class="gantt-detail-meta">열린 업무, 지연 업무, 이슈 연결, 다음 마감만 가볍게 확인합니다. 자세한 조정은 Work 탭에서 이어집니다.</div></div></div>'
        +'<div class="gantt-overview-signal-grid">'
          +executionSignals.map(item=>'<div class="gantt-overview-signal-card is-'+item.tone+'"><div class="gantt-detail-label">'+esc(item.label)+'</div><div class="gantt-detail-value">'+esc(item.value)+'</div><div class="gantt-detail-meta">'+esc(item.meta)+'</div></div>').join('')
        +'</div>'
      +'</div>'
      +renderGanttProjectMemoSummarySection(project)
    +'</div>';
}

function syncGanttListWorkShortcuts(rows){
  const rowElements=[...document.querySelectorAll('.gantt-list-table tbody tr.gantt-list-row')];
  rowElements.forEach((rowElement,index)=>{
    const row=rows[index];
    const projectId=String(row?.project?.id||'').trim();
    if(!projectId)return;
    const projectCell=rowElement.children[2];
    if(!projectCell)return;
    let actions=projectCell.querySelector('.gantt-list-project-actions');
    if(!actions){
      actions=document.createElement('div');
      actions.className='gantt-list-project-actions';
      projectCell.appendChild(actions);
    }
    if(actions.querySelector('.gantt-list-work-link'))return;
    const button=document.createElement('button');
    button.type='button';
    button.className='gantt-list-work-link';
    button.textContent='전체 업무';
    button.title='Work 탭에서 전체 업무 보기';
    button.onclick=event=>{
      event.stopPropagation();
      openGanttProjectWorkTab(projectId);
    };
    actions.appendChild(button);
  });
}

function syncGanttDetailWorkShortcut(project){
  const detail=document.getElementById('ganttDetail');
  if(!detail)return;
  const actions=detail.querySelector('.gantt-detail-actions');
  if(!actions)return;
  const existing=actions.querySelector('.gantt-detail-work-shortcut');
  if(ganttDetailTab==='work'){
    if(existing)existing.remove();
    return;
  }
  if(existing)return;
  const projectId=String(project?.id||'').trim();
  if(!projectId)return;
  const button=document.createElement('button');
  button.type='button';
  button.className='btn ghost sm gantt-detail-work-shortcut';
  button.textContent='전체 업무';
  button.title='Work 탭에서 전체 업무 보기';
  button.onclick=event=>{
    event.stopPropagation();
    openGanttProjectWorkTab(projectId);
  };
  actions.insertBefore(button,actions.firstChild||null);
}

function renderGanttListView(projs,schs){
  const wrap=document.getElementById('ganttWrap');
  if(!wrap)return;
  const legend=document.getElementById('legend');
  if(legend)legend.innerHTML='';
  const projectIds=(projs||[]).map(project=>project?.id);
  loadGanttListTaskSummaries(projectIds);
  loadGanttListTaskIssueSummaries(projectIds);
  loadGanttListPendingDocSummaries(projectIds);
  const rows=sortGanttListRows(filterGanttListRows(getGanttListProjectRows(projs)));
  const visibleProjectIds=new Set(rows.map(row=>String(row.project?.id||'')));
  ganttListSelectedIds=ganttListSelectedIds.filter(id=>visibleProjectIds.has(String(id)));
  ganttListExpandedProjectIds=ganttListExpandedProjectIds.filter(id=>visibleProjectIds.has(String(id)));
  ganttListExpandedMoreProjectIds=ganttListExpandedMoreProjectIds.filter(id=>visibleProjectIds.has(String(id)));
  const selectableRows=rows.filter(row=>canManageGanttListProject(row.project));
  const selectedSet=new Set(ganttListSelectedIds.map(id=>String(id)));
  const allSelected=!!selectableRows.length&&selectableRows.every(row=>selectedSet.has(String(row.project?.id||'')));
  const availableMembers=getAvailableGanttMembers();
  const overdueRows=rows.filter(row=>row.lifecycleMeta?.key==='overdue');
  const dueTodayRows=rows.filter(row=>isGanttProjectDueToday(row.project)||Number(row?.taskSummary?.dueTodayCount||0)>0);
  const issueAttentionRows=rows.filter(row=>Number(row?.issueCount||0)>0||Number(row?.taskIssueSummary?.issueLinkedTaskCount||0)>0);
  const overdueTaskCount=rows.reduce((sum,row)=>sum+Number(row.taskSummary?.overdueCount||0),0);
  if(!rows.length){
    wrap.innerHTML='<div class="empty-state" style="padding:40px">현재 필터에서 표시할 프로젝트가 없습니다.</div>';
    return;
  }
  wrap.innerHTML='<div class="gantt-list-view">'
    +'<div class="gantt-list-toolbar">'
      +'<div class="gantt-list-toolbar-main">'
        +'<input id="ganttListSearchInput" class="gantt-list-search" value="'+esc(ganttListSearchQuery)+'" placeholder="프로젝트명 / 고객사명 / 담당자명 검색" />'
        +'<div class="gantt-list-count">총 '+rows.length+'건 · 프로젝트 상태를 먼저 보고, 필요한 경우에만 관련 업무를 펼쳐 확인합니다.</div>'
      +'</div>'
      +(ganttListSelectedIds.length?'<div class="gantt-list-selection-summary">'+ganttListSelectedIds.length+'건 선택</div>':'')
    +'</div>'
    +renderGanttListExecutionRiskFilterRow()
    +'<div class="gantt-list-signalbar">'
      +getGanttListSignalBarMarkup(overdueRows,dueTodayRows,issueAttentionRows,overdueTaskCount)
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
        +'<th><button type="button" class="gantt-list-sort-btn" onclick="sortGanttListBy(\'name\')">프로젝트'+getGanttListSortIndicator('name')+'</button></th>'
        +'<th><button type="button" class="gantt-list-sort-btn" onclick="sortGanttListBy(\'members\')">담당'+getGanttListSortIndicator('members')+'</button></th>'
        +'<th><button type="button" class="gantt-list-sort-btn" onclick="sortGanttListBy(\'period\')">기간'+getGanttListSortIndicator('period')+'</button></th>'
        +'<th><button type="button" class="gantt-list-sort-btn" onclick="sortGanttListBy(\'status\')">상태'+getGanttListSortIndicator('status')+'</button></th>'
        +'<th><button type="button" class="gantt-list-sort-btn" onclick="sortGanttListBy(\'progress\')">진행률'+getGanttListSortIndicator('progress')+'</button></th>'
        +'<th><button type="button" class="gantt-list-sort-btn" onclick="sortGanttListBy(\'risk\')">보조 신호'+getGanttListSortIndicator('risk')+'</button></th>'
        +'<th><button type="button" class="gantt-list-sort-btn" onclick="sortGanttListBy(\'billing_status\')">빌링 상태'+getGanttListSortIndicator('billing_status')+'</button></th>'
      +'</tr></thead>'
      +'<tbody>'
      +rows.map(row=>{
        const project=row.project;
        const projectId=String(project?.id||'');
        const selected=selectedSet.has(String(project.id));
        const canManage=canManageGanttListProject(project);
        const metaItems=getGanttListProjectMetaItems(row);
        const hasTaskSummary=Number(row?.taskSummary?.total||0)>0;
        const isExpanded=ganttListExpandedProjectIds.includes(projectId);
        const loadedKeyTaskCount=Array.isArray(ganttProjectTasksByProjectId[projectId])?getGanttListProjectKeyTasks(row).length:0;
        const drillCount=loadedKeyTaskCount||Math.min(Number(row?.taskSummary?.openCount||row?.taskSummary?.total||0),GANTT_LIST_TASK_DRILL_LIMIT);
        const rowStateClass=row.lifecycleMeta?.key==='overdue'
          ?' is-overdue'
          :isGanttProjectDueToday(project)
            ?' is-due-today'
            :row.riskMeta?.tone==='issue'
              ?' is-issue-risk'
              :row.riskMeta?.tone==='warn'
                ?' is-attention'
                :'';
        const mainRow='<tr class="gantt-list-row'+(selected?' is-selected':'')+rowStateClass+'" onclick="openGanttProjectDetail(\''+project.id+'\')">'
          +'<td class="gantt-list-check-col" onclick="event.stopPropagation()"><input type="checkbox" '+(selected?'checked ':'')+(canManage?'':'disabled ')+'onchange="toggleGanttListProjectSelection(\''+project.id+'\')" /></td>'
          +'<td>'+esc(row.clientName)+'</td>'
          +'<td><div class="gantt-list-project-name">'+esc(project.name||'프로젝트명 없음')+'</div><div class="gantt-list-project-sub">'+esc(row.typeText)+'</div>'+(metaItems.length?'<div class="gantt-list-project-metachips" title="'+esc(row.taskSummaryTitle||'')+'">'+renderGanttListMetaChips(metaItems)+'</div>':'')+(hasTaskSummary?'<div class="gantt-list-project-actions"><button type="button" class="gantt-list-drill-toggle'+(isExpanded?' active':'')+'" onclick="event.stopPropagation();toggleGanttListTaskDrilldown(\''+project.id+'\')">관련 업무'+(drillCount?'<span class="gantt-list-drill-count">'+drillCount+'</span>':'')+'</button></div>':'')+'</td>'
          +'<td><div class="gantt-list-member-cell">'+esc(row.memberText)+'</div></td>'
          +'<td><div class="gantt-list-period-cell">'+esc(row.periodText)+'</div></td>'
          +'<td><span class="badge '+getGanttListStatusBadgeClass(row.lifecycleMeta?.label)+'">'+esc(row.lifecycleMeta?.label||'예정')+'</span></td>'
          +'<td><div class="gantt-list-progress"><div class="gantt-list-progress-text">'+row.progressPercent+'%</div><div class="gantt-list-progress-track"><div class="gantt-list-progress-fill" style="width:'+row.progressPercent+'%"></div></div></div></td>'
          +'<td><div class="gantt-list-attention-cell" title="'+esc(getGanttListAttentionSubtext(row)||row.riskMeta?.detail||'')+'">'+renderGanttListAttentionBadges(row)+'</div></td>'
          +'<td><div class="gantt-list-billing-cell"><span class="badge '+getGanttListBillingBadgeClass(row.billingStatus)+'">'+esc(row.billingStatus)+'</span>'+(row.billingAmount>0?'<div class="gantt-list-billing-sub">'+formatGanttCurrency(row.billingAmount)+'</div>':'')+'</div></td>'
        +'</tr>';
        return mainRow+(isExpanded?renderGanttListTaskDrilldownRow(row):'');
      }).join('')
      +'</tbody>'
    +'</table></div>'
    +'</div>';
  const searchInput=document.getElementById('ganttListSearchInput');
  if(searchInput)searchInput.oninput=e=>setGanttListSearchQuery(e.target.value);
  syncGanttListWorkShortcuts(rows);
}
