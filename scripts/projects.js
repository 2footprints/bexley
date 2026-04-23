let ganttFocusProjectId=null;
let ganttStatusFilter='all';
let ganttTypeFilters=[];
let ganttClientFilterQuery='';
let ganttListSortKey='period';
let ganttListSortDir='asc';
let ganttListSearchQuery='';
let ganttListSelectedIds=[];
let ganttDetailTab='overview';
let ganttProjectTasksByProjectId={};
let ganttProjectTaskLoadMetaByProjectId={};
let editingProjectTaskProjectId='';
let editingProjectTaskId='';

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

function scrollGanttDetailIntoView(){
  const detail=document.getElementById('ganttDetail');
  if(detail)detail.scrollIntoView({behavior:'smooth',block:'start'});
}

function openGanttProjectDetail(projectId,scrollIntoPanel=true){
  const prevProjectId=ganttFocusProjectId;
  ganttFocusProjectId=projectId||null;
  if(projectId&&String(prevProjectId||'')!==String(projectId||''))ganttDetailTab='overview';
  renderGantt();
  if(scrollIntoPanel&&projectId){
    requestAnimationFrame(()=>requestAnimationFrame(scrollGanttDetailIntoView));
  }
}

function setGanttFocusProject(projectId){
  openGanttProjectDetail(projectId,true);
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

function getGanttKpiBaseProjects(year=curYear,month=curMonth){
  const {projs}=getGanttMonthData(year,month);
  return projs.filter(projectMatchesTopFilters);
}

function renderGanttOverviewCards(projs,schs){
  ensureGanttTopAreaControls();
  renderGanttEntryViewChrome();
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

renderGanttDetailPanel=function(projs,schs){
  const el=document.getElementById('ganttDetail');
  if(!el)return;
  const project=projs.find(p=>p.id===ganttFocusProjectId)||null;
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

function getGanttListRiskMeta(project,issueCount){
  if(isGanttProjectOverdue(project))return {label:'지연',tone:'danger',rank:4,detail:'기한이 지났습니다'};
  if(isDueToday(project))return {label:'오늘 마감',tone:'warn',rank:3,detail:'오늘 종료 예정'};
  if(Number(issueCount||0)>0)return {label:'이슈 주의',tone:'issue',rank:2,detail:'미해결 이슈 '+issueCount+'건'};
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
    const riskMeta=getGanttListRiskMeta(project,issueCount);
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
      riskMeta,
      periodText,
      status,
      priority:String(project?.priority||'medium').trim()||'medium',
      searchText
    };
  });
}

function getGanttListSignalBarMarkup(overdueRows,dueTodayRows,issueAttentionRows){
  const chips=[];
  if(overdueRows.length)chips.push('<div class="gantt-list-signal-chip is-danger">지연 '+overdueRows.length+'건</div>');
  if(dueTodayRows.length)chips.push('<div class="gantt-list-signal-chip is-warn">오늘 마감 '+dueTodayRows.length+'건</div>');
  if(issueAttentionRows.length)chips.push('<div class="gantt-list-signal-chip is-issue">미해결 이슈 '+issueAttentionRows.length+'건</div>');
  if(!chips.length)chips.push('<div class="gantt-list-signal-chip is-safe">주의 신호 없음</div>');
  return chips.join('');
}

function getGanttListAttentionSubtext(row){
  if(Number(row?.issueCount||0)>0)return '미해결 이슈 '+row.issueCount+'건';
  return row?.riskMeta?.detail||'현재 위험 신호 없음';
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
  const rows=sortGanttListRows(filterGanttListRows(getGanttListProjectRows(projs)));
  const visibleProjectIds=new Set(rows.map(row=>String(row.project?.id||'')));
  ganttListSelectedIds=ganttListSelectedIds.filter(id=>visibleProjectIds.has(String(id)));
  const selectableRows=rows.filter(row=>canManageGanttListProject(row.project));
  const selectedSet=new Set(ganttListSelectedIds.map(id=>String(id)));
  const allSelected=!!selectableRows.length&&selectableRows.every(row=>selectedSet.has(String(row.project?.id||'')));
  const availableMembers=getAvailableGanttMembers();
  const overdueRows=rows.filter(row=>row.riskMeta?.tone==='danger');
  const dueTodayRows=rows.filter(row=>row.riskMeta?.label==='오늘 마감');
  const issueAttentionRows=rows.filter(row=>row.issueCount>0);
  if(!rows.length){
    wrap.innerHTML='<div class="empty-state" style="padding:40px">현재 필터에서 표시할 프로젝트가 없습니다.</div>';
    return;
  }
  wrap.innerHTML='<div class="gantt-list-view">'
    +'<div class="gantt-list-toolbar">'
      +'<div class="gantt-list-toolbar-main">'
        +'<input id="ganttListSearchInput" class="gantt-list-search" value="'+esc(ganttListSearchQuery)+'" placeholder="프로젝트명 / 고객사명 / 담당자명 검색" />'
        +'<div class="gantt-list-count">총 '+rows.length+'건 · 프로젝트를 선택하면 아래 상세 패널로 이어집니다.</div>'
      +'</div>'
      +(ganttListSelectedIds.length?'<div class="gantt-list-selection-summary">'+ganttListSelectedIds.length+'건 선택됨</div>':'')
    +'</div>'
    +'<div class="gantt-list-signalbar">'
      +getGanttListSignalBarMarkup(overdueRows,dueTodayRows,issueAttentionRows)
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
        const selected=selectedSet.has(String(project.id));
        const canManage=canManageGanttListProject(project);
        return '<tr class="gantt-list-row'+(selected?' is-selected':'')+(isGanttProjectOverdue(project)?' is-overdue':'')+(isDueToday(project)?' is-due-today':'')+'" onclick="openGanttProjectDetail(\''+project.id+'\')">'
          +'<td class="gantt-list-check-col" onclick="event.stopPropagation()"><input type="checkbox" '+(selected?'checked ':'')+(canManage?'':'disabled ')+'onchange="toggleGanttListProjectSelection(\''+project.id+'\')" /></td>'
          +'<td>'+esc(row.clientName)+'</td>'
          +'<td><div class="gantt-list-project-name">'+esc(project.name||'프로젝트명 없음')+'</div><div class="gantt-list-project-sub">'+esc(row.typeText)+'</div></td>'
          +'<td><div class="gantt-list-member-cell">'+esc(row.memberText)+'</div></td>'
          +'<td><div class="gantt-list-period-cell">'+esc(row.periodText)+'</div></td>'
          +'<td><span class="badge '+getGanttListStatusBadgeClass(row.status)+'">'+esc(row.status)+'</span></td>'
          +'<td><div class="gantt-list-progress"><div class="gantt-list-progress-text">'+row.progressPercent+'%</div><div class="gantt-list-progress-track"><div class="gantt-list-progress-fill" style="width:'+row.progressPercent+'%"></div></div></div></td>'
          +'<td><div class="gantt-list-attention-cell"><span class="gantt-list-attention-label is-'+esc(row.riskMeta?.tone||'safe')+'" title="'+esc(row.riskMeta?.detail||'')+'">'+esc(row.riskMeta?.label||'정상')+'</span><div class="gantt-list-attention-sub">'+esc(getGanttListAttentionSubtext(row))+'</div></div></td>'
          +'<td><div class="gantt-list-billing-cell"><span class="badge '+getGanttListBillingBadgeClass(row.billingStatus)+'">'+esc(row.billingStatus)+'</span>'+(row.billingAmount>0?'<div class="gantt-list-billing-sub">'+formatGanttCurrency(row.billingAmount)+'</div>':'')+'</div></td>'
        +'</tr>';
      }).join('')
      +'</tbody>'
    +'</table></div>'
    +'</div>';
  const searchInput=document.getElementById('ganttListSearchInput');
  if(searchInput)searchInput.oninput=e=>setGanttListSearchQuery(e.target.value);
}

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

function renderGanttProjectOverviewSection(project,client,linkedContract,projectMembers,memberSchedules,billingStatus,billingAmount){
  const scheduleTone=(memberSchedules||[]).length?'is-warn':'';
  return ''
    +'<div class="gantt-detail-pane">'
      +'<div class="gantt-detail-grid gantt-detail-grid--overview">'
        +'<div class="gantt-detail-summary-card"><div class="gantt-detail-label">고객사</div><div class="gantt-detail-value">'+esc(client?.name||'고객사 미지정')+'</div></div>'
        +'<div class="gantt-detail-summary-card"><div class="gantt-detail-label">연결 계약</div><div class="gantt-detail-value">'+esc(linkedContract?.contract_name||'계약 없음')+'</div>'+(linkedContract?.contract_amount?'<div class="gantt-detail-meta">'+formatGanttCurrency(linkedContract.contract_amount)+'</div>':'')+'</div>'
        +'<div class="gantt-detail-summary-card"><div class="gantt-detail-label">기간</div><div class="gantt-detail-value">'+esc((project.start||'')+' ~ '+(project.end||''))+'</div></div>'
        +'<div class="gantt-detail-summary-card"><div class="gantt-detail-label">담당자</div><div class="gantt-detail-value">'+esc(projectMembers.join(', ')||'담당자 미지정')+'</div></div>'
        +'<div class="gantt-detail-summary-card"><div class="gantt-detail-label">빌링 요약</div><div class="gantt-detail-value">'+esc(billingStatus)+'</div><div class="gantt-detail-meta">'+formatGanttCurrency(billingAmount)+'</div></div>'
        +'<div class="gantt-detail-summary-card '+scheduleTone+'"><div class="gantt-detail-label">일정 충돌 요약</div><div class="gantt-detail-value">'+esc(getGanttDetailConflictSummary(memberSchedules))+'</div></div>'
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
  return /Could not find the table 'public\.(project_tasks|tasks)'/i.test(String(error?.message||''));
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
    +(members||[])
      .filter(member=>{
        const isActive=member?.is_active===undefined?true:!!member.is_active;
        const identity=[member?.name,member?.email,member?.auth_user_id].filter(Boolean).join(' ').toLowerCase();
        const isSystemAccount=/projectschedule|system|test/.test(identity);
        return isActive&&!isSystemAccount;
      })
      .sort((a,b)=>String(a?.name||'').localeCompare(String(b?.name||''),'ko'))
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
  const status=document.getElementById('taskStatus')?.value||'예정';
  const priority=document.getElementById('taskPriority')?.value||'medium';
  const assigneeMemberId=document.getElementById('taskAssignee')?.value||null;
  const startDate=document.getElementById('taskStart')?.value||null;
  const dueDate=document.getElementById('taskDue')?.value||null;
  const description=document.getElementById('taskDescription')?.value.trim()||null;
  const progressRaw=document.getElementById('taskProgress')?.value;
  const progressValue=status==='완료'
    ?100
    :Math.max(0,Math.min(100,Number.isNaN(Number(progressRaw))?0:Number(progressRaw)));
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
