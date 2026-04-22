let weeklyReviewWeekOffset=0;

function getWeeklyReviewWeekRangeLabel(offsetWeeks=weeklyReviewWeekOffset){
  const {start,end}=getWeeklyReviewBusinessWeekBounds(offsetWeeks);
  const weekdayLabels=['일','월','화','수','목','금','토'];
  const startLabel=`${start.getFullYear()}.${pad(start.getMonth()+1)}.${pad(start.getDate())} (${weekdayLabels[start.getDay()]})`;
  const endLabel=`${end.getFullYear()}.${pad(end.getMonth()+1)}.${pad(end.getDate())} (${weekdayLabels[end.getDay()]})`;
  return `${startLabel} ~ ${endLabel}`;
}
function getWeeklyReviewBusinessWeekBounds(offsetWeeks=0){
  const {start}=getWeekBounds(offsetWeeks);
  const end=new Date(start);
  end.setDate(start.getDate()+4);
  end.setHours(23,59,59,999);
  return {start,end};
}
function getWeeklyReviewDate(value){
  if(!value)return null;
  if(value instanceof Date)return new Date(value.getTime());
  const raw=String(value||'').trim();
  if(!raw)return null;
  if(/^\d{4}-\d{2}-\d{2}$/.test(raw))return toDate(raw);
  const parsed=new Date(raw);
  return Number.isNaN(parsed.getTime())?null:parsed;
}
function isWeeklyReviewDateInRange(value,start,end){
  const date=getWeeklyReviewDate(value);
  return !!date&&date>=start&&date<=end;
}
function normalizeWeeklyReviewProjectStatus(status){
  return String(status||'').trim().toLowerCase().replace(/[\s-]+/g,'_');
}
function isWeeklyReviewCompletedProject(project){
  const statusRaw=String(project?.status||'').trim();
  const statusKey=normalizeWeeklyReviewProjectStatus(statusRaw);
  return statusRaw==='완료'||statusKey==='completed'||statusKey==='done';
}
function isWeeklyReviewActiveProject(project){
  const statusRaw=String(project?.status||'').trim();
  const statusKey=normalizeWeeklyReviewProjectStatus(statusRaw);
  return statusRaw==='진행중'||statusKey==='in_progress'||statusKey==='active'||statusKey==='진행_중';
}
function getWeeklyReviewProjectStartDate(project){
  return project?.start||project?.start_date||null;
}
function getWeeklyReviewProjectEndDate(project){
  return project?.end||project?.end_date||getWeeklyReviewProjectStartDate(project);
}
function getWeeklyReviewProjectCompletionDate(project){
  return project?.actual_end_date||getWeeklyReviewProjectEndDate(project);
}
function getWeeklyReviewProjectBillingAmount(project){
  const directAmount=Number(project?.billing_amount||0);
  if(directAmount>0)return directAmount;
  const linkedContract=(contracts||[]).find(contract=>String(contract.id)===String(project?.contract_id||''));
  const contractAmount=Number(linkedContract?.contract_amount||0);
  return contractAmount>0?contractAmount:0;
}
function formatWeeklyReviewCount(value){
  return `${Number(value||0).toLocaleString()}건`;
}
function formatWeeklyReviewCurrency(value){
  return `${Math.round(Number(value)||0).toLocaleString()}원`;
}
function getWeeklyReviewShortDate(value){
  const date=getWeeklyReviewDate(value);
  if(!date)return '-';
  return `${date.getMonth()+1}.${date.getDate()}`;
}
function getWeeklyReviewTimestamp(value){
  const date=getWeeklyReviewDate(value);
  return date?date.getTime():0;
}
function isWeeklyReviewProjectOverdue(project,baseDate=getHomeBaseDate()){
  const endDate=getWeeklyReviewDate(getWeeklyReviewProjectEndDate(project));
  return !!endDate&&endDate<baseDate&&!isWeeklyReviewCompletedProject(project);
}
function getWeeklyReviewProjectClient(project){
  return (clients||[]).find(client=>String(client.id)===String(project?.client_id||''))||null;
}
function getWeeklyReviewIssueProject(issue){
  return (projects||[]).find(project=>String(project.id)===String(issue?.project_id||''))||null;
}
function formatWeeklyReviewPriorityLabel(priority){
  const raw=String(priority||'medium').trim().toLowerCase();
  if(raw==='high')return '높음';
  if(raw==='low')return '낮음';
  return '보통';
}
function getWeeklyReviewPriorityBadgeClass(priority){
  const raw=String(priority||'medium').trim().toLowerCase();
  if(raw==='high')return 'badge-red';
  if(raw==='low')return 'badge-blue';
  return 'badge-orange';
}
function getWeeklyReviewScheduleBadgeClass(type){
  const raw=String(type||'').trim();
  if(raw==='fieldwork')return 'badge-orange';
  if(raw==='internal')return 'badge-blue';
  return 'badge-gray';
}
function sortWeeklyReviewProjectsByCompletion(a,b){
  const diff=getWeeklyReviewTimestamp(getWeeklyReviewProjectCompletionDate(b))-getWeeklyReviewTimestamp(getWeeklyReviewProjectCompletionDate(a));
  if(diff)return diff;
  return String(a?.name||'').localeCompare(String(b?.name||''),'ko');
}
function sortWeeklyReviewProjectsByStart(a,b){
  const diff=getWeeklyReviewTimestamp(getWeeklyReviewProjectStartDate(a))-getWeeklyReviewTimestamp(getWeeklyReviewProjectStartDate(b));
  if(diff)return diff;
  return String(a?.name||'').localeCompare(String(b?.name||''),'ko');
}
function sortWeeklyReviewProjectsByEnd(a,b){
  const diff=getWeeklyReviewTimestamp(getWeeklyReviewProjectEndDate(a))-getWeeklyReviewTimestamp(getWeeklyReviewProjectEndDate(b));
  if(diff)return diff;
  return String(a?.name||'').localeCompare(String(b?.name||''),'ko');
}
function sortWeeklyReviewPendingProjects(a,b){
  const overdueDiff=Number(isWeeklyReviewProjectOverdue(b))-Number(isWeeklyReviewProjectOverdue(a));
  if(overdueDiff)return overdueDiff;
  return sortWeeklyReviewProjectsByEnd(a,b);
}
function sortWeeklyReviewIssues(a,b){
  const diff=getWeeklyReviewTimestamp(b?.resolved_at||b?.updated_at||b?.created_at)-getWeeklyReviewTimestamp(a?.resolved_at||a?.updated_at||a?.created_at);
  if(diff)return diff;
  return String(a?.title||'').localeCompare(String(b?.title||''),'ko');
}
function sortWeeklyReviewSchedules(a,b){
  const diff=getWeeklyReviewTimestamp(a?.start||a?.start_date)-getWeeklyReviewTimestamp(b?.start||b?.start_date);
  if(diff)return diff;
  return String(a?.title||scheduleLabel(a?.schedule_type)).localeCompare(String(b?.title||scheduleLabel(b?.schedule_type)),'ko');
}
function createWeeklyReviewProjectItem(project,options={}){
  const client=getWeeklyReviewProjectClient(project);
  const members=Array.isArray(project?.members)?project.members.filter(Boolean):[];
  const meta=[client?.name||'',project?.type||'',members.join(', ')].filter(Boolean).join(' · ');
  return {
    title:String(project?.name||'이름 없는 프로젝트'),
    meta,
    badgeLabel:options.badgeLabel||(isWeeklyReviewCompletedProject(project)?'완료':isWeeklyReviewProjectOverdue(project)?'지연':'진행중'),
    badgeClass:options.badgeClass||(isWeeklyReviewCompletedProject(project)?'badge-green':isWeeklyReviewProjectOverdue(project)?'badge-red':'badge-blue'),
    sideText:options.sideText||(
      getWeeklyReviewProjectStartDate(project)&&getWeeklyReviewProjectEndDate(project)
        ? formatRangeShort(getWeeklyReviewProjectStartDate(project),getWeeklyReviewProjectEndDate(project))
        : getWeeklyReviewShortDate(getWeeklyReviewProjectEndDate(project))
    ),
    action:options.action||("openProjModal('"+project.id+"')")
  };
}
function createWeeklyReviewIssueItem(issue,options={}){
  const project=getWeeklyReviewIssueProject(issue);
  const client=getWeeklyReviewProjectClient(project);
  const meta=[client?.name||'',project?.name||'',issue?.assignee_name||issue?.owner_name||''].filter(Boolean).join(' · ');
  return {
    title:String(issue?.title||'제목 없는 이슈'),
    meta,
    badgeLabel:options.badgeLabel||formatWeeklyReviewPriorityLabel(issue?.priority),
    badgeClass:options.badgeClass||getWeeklyReviewPriorityBadgeClass(issue?.priority),
    sideText:options.sideText||(String(issue?.status||'').trim()==='resolved'
      ? `해결 ${getWeeklyReviewShortDate(issue?.resolved_at||issue?.updated_at||issue?.created_at)}`
      : `등록 ${getWeeklyReviewShortDate(issue?.created_at)}`),
    action:options.action||("openIssueModal('"+(issue?.project_id||'')+"','"+(issue?.id||'')+"')")
  };
}
function createWeeklyReviewScheduleItem(schedule,options={}){
  const scheduleType=String(schedule?.schedule_type||'').trim();
  return {
    title:String(schedule?.title||scheduleLabel(scheduleType)),
    meta:[scheduleLabel(scheduleType),getScheduleMemberLabel(schedule),schedule?.location||''].filter(Boolean).join(' · '),
    badgeLabel:options.badgeLabel||scheduleLabel(scheduleType),
    badgeClass:options.badgeClass||getWeeklyReviewScheduleBadgeClass(scheduleType),
    sideText:options.sideText||formatRangeShort(
      schedule?.start||schedule?.start_date,
      schedule?.end||schedule?.end_date||schedule?.start||schedule?.start_date
    ),
    action:options.action||("openScheduleModal('"+schedule.id+"')")
  };
}
function renderWeeklyReviewCardMarkup(card){
  const toneClass=card?.tone?` is-${card.tone}`:'';
  const badgeText=card?.badge||'';
  return '<section class="card weekly-review-card">'
    +'<div class="weekly-review-card-head">'
      +'<div class="weekly-review-card-title">'+esc(card?.title||'')+'</div>'
      +(badgeText?'<span class="weekly-review-card-badge">'+esc(badgeText)+'</span>':'')
    +'</div>'
    +'<div class="weekly-review-card-value'+toneClass+'">'+esc(card?.value||'-')+'</div>'
    +'<div class="weekly-review-card-meta">'+esc(card?.meta||'')+'</div>'
  +'</section>';
}
function renderWeeklyReviewItemMarkup(item){
  const badgeHtml=item?.badgeLabel?'<span class="badge '+esc(item?.badgeClass||'badge-gray')+'">'+esc(item.badgeLabel)+'</span>':'';
  const sideTextHtml=item?.sideText?'<div class="weekly-review-item-side-text">'+esc(item.sideText)+'</div>':'';
  const onclickAttr=item?.action?' onclick="'+item.action+'"':'';
  return '<button type="button" class="weekly-review-item"'+onclickAttr+'>'
    +'<div class="weekly-review-item-main">'
      +'<div class="weekly-review-item-title">'+esc(item?.title||'-')+'</div>'
      +(item?.meta?'<div class="weekly-review-item-meta">'+esc(item.meta)+'</div>':'')
    +'</div>'
    +'<div class="weekly-review-item-side">'
      +badgeHtml
      +sideTextHtml
    +'</div>'
  +'</button>';
}
function renderWeeklyReviewGroupMarkup(group){
  const items=Array.isArray(group?.items)?group.items:[];
  return '<div class="weekly-review-section-group">'
    +'<div class="weekly-review-section-group-title">'
      +'<span>'+esc(group?.title||'')+'</span>'
      +'<span class="weekly-review-section-group-count">'+formatWeeklyReviewCount(items.length)+'</span>'
    +'</div>'
    +(items.length
      ? '<div class="weekly-review-list">'+items.map(renderWeeklyReviewItemMarkup).join('')+'</div>'
      : '<div class="weekly-review-empty">해당 항목이 없습니다.</div>')
  +'</div>';
}
function renderWeeklyReviewSectionMarkup(section){
  const groups=Array.isArray(section?.groups)?section.groups:[];
  return '<section class="card weekly-review-section">'
    +'<div class="weekly-review-section-head">'
      +'<div>'
        +'<div class="weekly-review-section-title">'+esc(section?.title||'')+'</div>'
        +(section?.sub?'<div class="weekly-review-section-sub">'+esc(section.sub)+'</div>':'')
      +'</div>'
    +'</div>'
    +groups.map(renderWeeklyReviewGroupMarkup).join('')
  +'</section>';
}
function renderWeeklyReviewPageMarkup(rangeLabel,navLabel,cards,sections){
  return '<div class="weekly-review-head">'
      +'<div class="weekly-review-title-wrap">'
        +'<h2 class="section-title">주간 리뷰</h2>'
        +'<div class="weekly-review-range">'+esc(rangeLabel)+'</div>'
      +'</div>'
      +'<div class="month-nav weekly-review-nav">'
        +'<button type="button" class="month-nav-btn" onclick="renderWeeklyReviewPage('+(weeklyReviewWeekOffset-1)+')">&#8249;</button>'
        +'<div class="weekly-review-nav-label">'+esc(navLabel)+'</div>'
        +'<button type="button" class="month-nav-btn" onclick="renderWeeklyReviewPage('+(weeklyReviewWeekOffset+1)+')">&#8250;</button>'
      +'</div>'
    +'</div>'
    +'<div class="weekly-review-grid">'
      +(cards||[]).map(renderWeeklyReviewCardMarkup).join('')
    +'</div>'
    +'<div class="weekly-review-body">'
      +'<div class="weekly-review-body-grid">'
        +(sections||[]).map(renderWeeklyReviewSectionMarkup).join('')
      +'</div>'
    +'</div>';
}
async function getWeeklyReviewPageData(offsetWeeks=weeklyReviewWeekOffset){
  const reviewBounds=getWeeklyReviewBusinessWeekBounds(offsetWeeks);
  const nextBounds=getWeeklyReviewBusinessWeekBounds(offsetWeeks+1);
  const today=getHomeBaseDate();
  await loadContracts();
  const issueRows=await api('GET','project_issues?select=id,project_id,title,priority,status,resolved_at,updated_at,created_at,assignee_name,owner_name').catch(()=>[]);
  const completedProjects=(projects||[]).filter(project=>
    isWeeklyReviewCompletedProject(project)
    &&isWeeklyReviewDateInRange(getWeeklyReviewProjectCompletionDate(project),reviewBounds.start,reviewBounds.end)
  ).sort(sortWeeklyReviewProjectsByCompletion);
  const resolvedIssues=(issueRows||[]).filter(issue=>
    String(issue?.status||'').trim()==='resolved'
    &&isWeeklyReviewDateInRange(issue?.resolved_at||issue?.updated_at||issue?.created_at,reviewBounds.start,reviewBounds.end)
  ).sort(sortWeeklyReviewIssues);
  const pendingProjectMap=new Map();
  (projects||[]).forEach(project=>{
    if(!project)return;
    const endDate=getWeeklyReviewDate(getWeeklyReviewProjectEndDate(project));
    const isOverdue=!!endDate&&endDate<today&&!isWeeklyReviewCompletedProject(project);
    if(isWeeklyReviewActiveProject(project)||isOverdue){
      pendingProjectMap.set(String(project.id),project);
    }
  });
  const pendingProjects=[...pendingProjectMap.values()].sort(sortWeeklyReviewPendingProjects);
  const pendingSchedules=(schedules||[]).filter(schedule=>{
    const scheduleType=String(schedule?.schedule_type||'').trim();
    if(!scheduleType||scheduleType==='project'||!SCHEDULE_META[scheduleType])return false;
    const startDate=getWeeklyReviewDate(schedule?.start||schedule?.start_date);
    const endDate=getWeeklyReviewDate(schedule?.end||schedule?.end_date||schedule?.start||schedule?.start_date);
    return !!startDate&&!!endDate&&startDate<=today&&endDate>=today;
  }).sort(sortWeeklyReviewSchedules);
  const openIssues=(issueRows||[]).filter(issue=>String(issue?.status||'').trim()==='open').sort(sortWeeklyReviewIssues);
  const nextWeekStarts=(projects||[]).filter(project=>
    !isWeeklyReviewCompletedProject(project)
    &&isWeeklyReviewDateInRange(getWeeklyReviewProjectStartDate(project),nextBounds.start,nextBounds.end)
  ).sort(sortWeeklyReviewProjectsByStart);
  const nextWeekEnds=(projects||[]).filter(project=>
    !isWeeklyReviewCompletedProject(project)
    &&isWeeklyReviewDateInRange(getWeeklyReviewProjectEndDate(project),nextBounds.start,nextBounds.end)
  ).sort(sortWeeklyReviewProjectsByEnd);
  const nextWeekSchedules=(schedules||[]).filter(schedule=>{
    const scheduleType=String(schedule?.schedule_type||'').trim();
    if(!scheduleType||scheduleType==='project'||!SCHEDULE_META[scheduleType])return false;
    const startDate=getWeeklyReviewDate(schedule?.start||schedule?.start_date);
    const endDate=getWeeklyReviewDate(schedule?.end||schedule?.end_date||schedule?.start||schedule?.start_date);
    return !!startDate&&!!endDate&&startDate<=nextBounds.end&&endDate>=nextBounds.start;
  }).sort(sortWeeklyReviewSchedules);
  const nextWeekItemCount=new Set([
    ...nextWeekStarts.map(project=>'start:'+project.id),
    ...nextWeekEnds.map(project=>'end:'+project.id),
    ...nextWeekSchedules.map(schedule=>'schedule:'+schedule.id)
  ]).size;
  const unbilledProjects=(projects||[]).filter(project=>
    isWeeklyReviewCompletedProject(project)
    &&project?.is_billable
    &&String(project?.billing_status||'').trim()==='미청구'
  ).sort(sortWeeklyReviewProjectsByCompletion);
  const unbilledAmount=unbilledProjects.reduce((sum,project)=>sum+getWeeklyReviewProjectBillingAmount(project),0);
  const cards=[
    {
      title:'이번 주 실적',
      badge:'이번 주',
      value:formatWeeklyReviewCount(completedProjects.length),
      meta:`해결 이슈 ${resolvedIssues.length}건`,
      tone:completedProjects.length?'success':''
    },
    {
      title:'Pending',
      badge:'현재',
      value:formatWeeklyReviewCount(pendingProjects.length),
      meta:`미해결 이슈 ${openIssues.length}건`,
      tone:pendingProjects.length?'warning':'success'
    },
    {
      title:'차주 할 일',
      badge:'다음 주',
      value:formatWeeklyReviewCount(nextWeekItemCount),
      meta:`시작 ${nextWeekStarts.length}건 · 마감 ${nextWeekEnds.length}건 · 일정 ${nextWeekSchedules.length}건`,
      tone:nextWeekItemCount?'':'success'
    },
    {
      title:'청구 대기',
      badge:'실시간',
      value:formatWeeklyReviewCurrency(unbilledAmount),
      meta:`완료 후 미청구 ${unbilledProjects.length}건`,
      tone:unbilledAmount?'danger':'success'
    }
  ];
  const pendingWorkItems=[
    ...pendingProjects.map(project=>createWeeklyReviewProjectItem(project,{
      badgeLabel:isWeeklyReviewProjectOverdue(project,today)?'지연':'진행중',
      badgeClass:isWeeklyReviewProjectOverdue(project,today)?'badge-red':'badge-blue',
      sideText:`종료 ${getWeeklyReviewShortDate(getWeeklyReviewProjectEndDate(project))}`
    })),
    ...pendingSchedules.map(schedule=>createWeeklyReviewScheduleItem(schedule))
  ];
  const sections=[
    {
      title:'A. 이번 주 실적',
      sub:'선택한 주차에 완료되거나 해결된 항목입니다.',
      groups:[
        {
          title:'이번 주 완료된 프로젝트/업무',
          items:completedProjects.map(project=>createWeeklyReviewProjectItem(project,{
            badgeLabel:'완료',
            badgeClass:'badge-green',
            sideText:`완료 ${getWeeklyReviewShortDate(getWeeklyReviewProjectCompletionDate(project))}`
          }))
        },
        {
          title:'이번 주 해결된 이슈',
          items:resolvedIssues.map(issue=>createWeeklyReviewIssueItem(issue,{
            sideText:`해결 ${getWeeklyReviewShortDate(issue?.resolved_at||issue?.updated_at||issue?.created_at)}`
          }))
        }
      ]
    },
    {
      title:'B. Pending',
      sub:'현재 기준으로 남아 있는 일정 및 업무와 미해결 이슈입니다.',
      groups:[
        {
          title:'진행중 / 지연 일정 및 업무',
          items:pendingWorkItems
        },
        {
          title:'미해결 이슈',
          items:openIssues.map(issue=>createWeeklyReviewIssueItem(issue,{
            sideText:`등록 ${getWeeklyReviewShortDate(issue?.created_at)}`
          }))
        }
      ]
    },
    {
      title:'C. 차주 할 일',
      sub:'다음 영업주에 예정된 시작, 마감, 일정성 항목입니다.',
      groups:[
        {
          title:'다음 주 시작 예정',
          items:nextWeekStarts.map(project=>createWeeklyReviewProjectItem(project,{
            badgeLabel:'시작 예정',
            badgeClass:'badge-blue',
            sideText:`시작 ${getWeeklyReviewShortDate(getWeeklyReviewProjectStartDate(project))}`
          }))
        },
        {
          title:'다음 주 마감 예정',
          items:nextWeekEnds.map(project=>createWeeklyReviewProjectItem(project,{
            badgeLabel:'마감 예정',
            badgeClass:'badge-orange',
            sideText:`마감 ${getWeeklyReviewShortDate(getWeeklyReviewProjectEndDate(project))}`
          }))
        },
        {
          title:'다음 주 필드웍/휴가/출장/외근 등 일정성 항목',
          items:nextWeekSchedules.map(schedule=>createWeeklyReviewScheduleItem(schedule))
        }
      ]
    },
    {
      title:'D. 빌링 체크',
      sub:'완료 처리되었지만 아직 청구되지 않은 항목입니다.',
      groups:[
        {
          title:'완료됐으나 미청구인 항목',
          items:unbilledProjects.map(project=>createWeeklyReviewProjectItem(project,{
            badgeLabel:'미청구',
            badgeClass:'badge-red',
            sideText:getWeeklyReviewProjectBillingAmount(project)
              ? formatWeeklyReviewCurrency(getWeeklyReviewProjectBillingAmount(project))
              : '금액 미입력',
            action:"openProjModal('"+project.id+"',null,null,'completion')"
          }))
        }
      ]
    }
  ];
  return {cards,sections};
}
async function getWeeklyReviewSummaryCards(offsetWeeks=weeklyReviewWeekOffset){
  const data=await getWeeklyReviewPageData(offsetWeeks);
  return data.cards;
}
async function renderWeeklyReviewPage(offset){
  if(offset!==undefined)weeklyReviewWeekOffset=offset;
  const el=document.getElementById('pageWeeklyReview');
  if(!el)return;
  const requestedOffset=weeklyReviewWeekOffset;
  const rangeLabel=getWeeklyReviewWeekRangeLabel();
  const navLabel=weeklyReviewWeekOffset===0
    ? '이번 주'
    : weeklyReviewWeekOffset>0
      ? `${weeklyReviewWeekOffset}주 후`
      : `${Math.abs(weeklyReviewWeekOffset)}주 전`;
  const loadingCards=[
    {title:'이번 주 실적',badge:'이번 주',value:'...',meta:'불러오는 중...'},
    {title:'Pending',badge:'현재',value:'...',meta:'불러오는 중...'},
    {title:'차주 할 일',badge:'다음 주',value:'...',meta:'불러오는 중...'},
    {title:'청구 대기',badge:'실시간',value:'...',meta:'불러오는 중...'}
  ];
  el.innerHTML=renderWeeklyReviewPageMarkup(rangeLabel,navLabel,loadingCards,[]);
  const data=await getWeeklyReviewPageData(requestedOffset).catch(()=>({
    cards:[
      {title:'이번 주 실적',badge:'이번 주',value:'-',meta:'데이터를 불러오지 못했습니다.'},
      {title:'Pending',badge:'현재',value:'-',meta:'데이터를 불러오지 못했습니다.'},
      {title:'차주 할 일',badge:'다음 주',value:'-',meta:'데이터를 불러오지 못했습니다.'},
      {title:'청구 대기',badge:'실시간',value:'-',meta:'데이터를 불러오지 못했습니다.'}
    ],
    sections:[]
  }));
  if(curPage!=='weeklyReview'||weeklyReviewWeekOffset!==requestedOffset)return;
  el.innerHTML=renderWeeklyReviewPageMarkup(rangeLabel,navLabel,data.cards,data.sections);
}
