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
function formatWeeklyReviewCurrencyDelta(value){
  const amount=Math.round(Number(value)||0);
  if(!amount)return '전주 대비 변화 없음';
  return `전주 대비 ${amount>0?'+':''}${amount.toLocaleString()}원`;
}
function formatWeeklyReviewNameSummary(names){
  const unique=[...new Set((Array.isArray(names)?names:[]).map(name=>String(name||'').trim()).filter(Boolean))];
  if(!unique.length)return '없음';
  if(unique.length===1)return unique[0];
  if(unique.length===2)return unique.join(', ');
  return `${unique[0]} 외 ${unique.length-1}명`;
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
function getWeeklyReviewBillingStatusMeta(project){
  const rawStatus=String(project?.billing_status||'').trim();
  if(!project?.is_billable)return {label:'비청구',badgeClass:'badge-gray'};
  if(rawStatus==='수금완료')return {label:'수금완료',badgeClass:'badge-green'};
  if(rawStatus==='청구완료')return {label:'청구완료',badgeClass:'badge-blue'};
  return {label:'미청구',badgeClass:'badge-red'};
}
function createWeeklyReviewCompletedProjectTableItem(project){
  const client=getWeeklyReviewProjectClient(project);
  const memberLabel=(Array.isArray(project?.members)?project.members.filter(Boolean):[]).join(', ')||'-';
  const billingMeta=getWeeklyReviewBillingStatusMeta(project);
  return {
    action:"openProjModal('"+project.id+"',null,null,'completion')",
    columns:[
      client?.name||'-',
      project?.name||'이름 없는 프로젝트',
      project?.type||'-',
      memberLabel,
      formatWeeklyReviewCurrency(getWeeklyReviewProjectBillingAmount(project))
    ],
    badgeLabel:billingMeta.label,
    badgeClass:billingMeta.badgeClass
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
function renderWeeklyReviewTableItemMarkup(item,templateColumns){
  const columns=Array.isArray(item?.columns)?item.columns:[];
  const onclickAttr=item?.action?' onclick="'+item.action+'"':'';
  const template=templateColumns||'1.1fr 1.6fr .9fr 1.1fr 1fr .9fr';
  return '<button type="button" class="weekly-review-item"'+onclickAttr+' style="display:grid;grid-template-columns:'+template+';align-items:center">'
    +columns.map((columnValue,index)=>{
      const align=index===4?'text-align:right;':'';
      return '<div style="min-width:0;font-size:12px;color:var(--text2);line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'+align+'">'+esc(columnValue||'-')+'</div>';
    }).join('')
    +'<div style="display:flex;justify-content:flex-end">'+(item?.badgeLabel?'<span class="badge '+esc(item?.badgeClass||'badge-gray')+'">'+esc(item.badgeLabel)+'</span>':'-')+'</div>'
  +'</button>';
}
function renderWeeklyReviewGroupMarkup(group){
  const items=Array.isArray(group?.items)?group.items:[];
  const summaryHtml=group?.summary?'<div class="weekly-review-card-meta" style="padding-top:10px">'+esc(group.summary)+'</div>':'';
  if(group?.variant==='table'){
    const template=group?.tableTemplate||'1.1fr 1.6fr .9fr 1.1fr 1fr .9fr';
    const headerHtml=Array.isArray(group?.tableHeaders)&&group.tableHeaders.length
      ?'<div style="display:grid;grid-template-columns:'+template+';gap:12px;padding:7px 2px 9px;border-bottom:1px solid var(--border);font-size:10px;font-weight:800;color:var(--text3);letter-spacing:.08em;text-transform:uppercase">'
        +group.tableHeaders.map((header,index)=>'<div style="'+(index===4?'text-align:right;':'')+'">'+esc(header)+'</div>').join('')
      +'</div>'
      :'';
    return '<div class="weekly-review-section-group">'
      +'<div class="weekly-review-section-group-title">'
        +'<span>'+esc(group?.title||'')+'</span>'
        +'<span class="weekly-review-section-group-count">'+formatWeeklyReviewCount(items.length)+'</span>'
      +'</div>'
      +(items.length
        ? headerHtml+'<div class="weekly-review-list" style="margin-top:8px">'+items.map(item=>renderWeeklyReviewTableItemMarkup(item,template)).join('')+'</div>'
        : '<div class="weekly-review-empty">해당 항목이 없습니다.</div>')
      +summaryHtml
    +'</div>';
  }
  return '<div class="weekly-review-section-group">'
    +'<div class="weekly-review-section-group-title">'
      +'<span>'+esc(group?.title||'')+'</span>'
      +'<span class="weekly-review-section-group-count">'+formatWeeklyReviewCount(items.length)+'</span>'
    +'</div>'
    +(items.length
      ? '<div class="weekly-review-list">'+items.map(renderWeeklyReviewItemMarkup).join('')+'</div>'
      : '<div class="weekly-review-empty">해당 항목이 없습니다.</div>')
    +summaryHtml
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
  const previousBounds=getWeeklyReviewBusinessWeekBounds(offsetWeeks-1);
  const today=getHomeBaseDate();
  await loadContracts();
  const [issueRows,billingRows]=await Promise.all([
    api('GET','project_issues?select=id,project_id,title,priority,status,resolved_at,updated_at,created_at,assignee_name,owner_name,is_pinned,status_changed_at').catch(()=>[]),
    api('GET','billing_records?select=contract_id,amount,status').catch(()=>[])
  ]);
  const completedProjects=(projects||[]).filter(project=>
    isWeeklyReviewCompletedProject(project)
    &&isWeeklyReviewDateInRange(getWeeklyReviewProjectCompletionDate(project),reviewBounds.start,reviewBounds.end)
  ).sort(sortWeeklyReviewProjectsByCompletion);
  const previousCompletedProjects=(projects||[]).filter(project=>
    isWeeklyReviewCompletedProject(project)
    &&isWeeklyReviewDateInRange(getWeeklyReviewProjectCompletionDate(project),previousBounds.start,previousBounds.end)
  );
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
  const weeklyRevenue=completedProjects.reduce((sum,project)=>sum+getWeeklyReviewProjectBillingAmount(project),0);
  const previousRevenue=previousCompletedProjects.reduce((sum,project)=>sum+getWeeklyReviewProjectBillingAmount(project),0);
  const revenueDelta=weeklyRevenue-previousRevenue;
  const activeIssues=(issueRows||[]).filter(issue=>isIssueActiveStatus(issue?.status)).sort(sortWeeklyReviewIssues);
  const highPriorityActiveIssues=activeIssues.filter(issue=>String(issue?.priority||'').trim().toLowerCase()==='high');
  const overdueProjects=pendingProjects.filter(project=>isWeeklyReviewProjectOverdue(project,today)).sort((a,b)=>{
    const diff=getWeeklyReviewTimestamp(getWeeklyReviewProjectEndDate(a))-getWeeklyReviewTimestamp(getWeeklyReviewProjectEndDate(b));
    if(diff)return diff;
    return String(a?.name||'').localeCompare(String(b?.name||''),'ko');
  });
  const oldestOverdueProject=overdueProjects[0]||null;
  const billedOutstandingAmount=(billingRows||[])
    .filter(row=>String(row?.status||'').trim()!=='수금완료')
    .reduce((sum,row)=>sum+Math.round(Number(row?.amount)||0),0);
  const nextWeekPriorityProjects=[...new Map(
    [...nextWeekStarts,...nextWeekEnds]
      .filter(Boolean)
      .map(project=>[String(project.id),project])
  ).values()].sort((a,b)=>{
    const amountDiff=getWeeklyReviewProjectBillingAmount(b)-getWeeklyReviewProjectBillingAmount(a);
    if(amountDiff)return amountDiff;
    return sortWeeklyReviewProjectsByEnd(a,b);
  });
  const leadNextWeekProject=nextWeekPriorityProjects[0]||null;
  const currentWeekLeaves=(schedules||[]).filter(schedule=>{
    const type=String(schedule?.schedule_type||'').trim();
    if(type!=='leave')return false;
    const startDate=getWeeklyReviewDate(schedule?.start||schedule?.start_date);
    const endDate=getWeeklyReviewDate(schedule?.end||schedule?.end_date||schedule?.start||schedule?.start_date);
    return !!startDate&&!!endDate&&startDate<=reviewBounds.end&&endDate>=reviewBounds.start;
  });
  const currentWeekFieldwork=(schedules||[]).filter(schedule=>{
    const type=String(schedule?.schedule_type||'').trim();
    if(type!=='fieldwork')return false;
    const startDate=getWeeklyReviewDate(schedule?.start||schedule?.start_date);
    const endDate=getWeeklyReviewDate(schedule?.end||schedule?.end_date||schedule?.start||schedule?.start_date);
    return !!startDate&&!!endDate&&startDate<=reviewBounds.end&&endDate>=reviewBounds.start;
  });
  const nextWeekLeaves=(schedules||[]).filter(schedule=>{
    const type=String(schedule?.schedule_type||'').trim();
    if(type!=='leave')return false;
    const startDate=getWeeklyReviewDate(schedule?.start||schedule?.start_date);
    const endDate=getWeeklyReviewDate(schedule?.end||schedule?.end_date||schedule?.start||schedule?.start_date);
    return !!startDate&&!!endDate&&startDate<=nextBounds.end&&endDate>=nextBounds.start;
  });
  const currentLeaveNames=[...new Set(currentWeekLeaves.flatMap(schedule=>getScheduleMemberNames(schedule)))];
  const currentFieldworkNames=[...new Set(currentWeekFieldwork.flatMap(schedule=>getScheduleMemberNames(schedule)))];
  const nextLeaveNames=[...new Set(nextWeekLeaves.flatMap(schedule=>getScheduleMemberNames(schedule)))];
  const unavailableMemberNames=new Set([...currentLeaveNames,...currentFieldworkNames]);
  const availableMemberCount=Math.max(0,(members||[]).length-unavailableMemberNames.size);
  const clientIssueMap=new Map();
  activeIssues.forEach(issue=>{
    const project=getWeeklyReviewIssueProject(issue);
    const client=getWeeklyReviewProjectClient(project);
    if(!client?.id)return;
    const key=String(client.id);
    const current=clientIssueMap.get(key)||{client,count:0};
    current.count+=1;
    clientIssueMap.set(key,current);
  });
  const clientIssueSummary=[...clientIssueMap.values()].sort((a,b)=>{
    const diff=b.count-a.count;
    if(diff)return diff;
    return String(a?.client?.name||'').localeCompare(String(b?.client?.name||''),'ko');
  });
  const topIssueClient=clientIssueSummary[0]||null;
  const hasPinnedActiveIssue=activeIssues.some(issue=>!!issue?.is_pinned);
  const completedProjectsByBilling=[...completedProjects].sort((a,b)=>{
    const amountDiff=getWeeklyReviewProjectBillingAmount(b)-getWeeklyReviewProjectBillingAmount(a);
    if(amountDiff)return amountDiff;
    return sortWeeklyReviewProjectsByCompletion(a,b);
  });
  const completedAverageAmount=completedProjectsByBilling.length
    ? Math.round(weeklyRevenue/completedProjectsByBilling.length)
    : 0;
  const completedUnbilledCount=completedProjectsByBilling.filter(project=>
    project?.is_billable&&String(project?.billing_status||'').trim()==='미청구'
  ).length;
  const urgentIssues=[...activeIssues]
    .filter(issue=>!!issue?.is_pinned||String(issue?.priority||'').trim().toLowerCase()==='high')
    .sort((a,b)=>{
      const pinnedDiff=Number(!!b?.is_pinned)-Number(!!a?.is_pinned);
      if(pinnedDiff)return pinnedDiff;
      const highDiff=Number(String(b?.priority||'').trim().toLowerCase()==='high')-Number(String(a?.priority||'').trim().toLowerCase()==='high');
      if(highDiff)return highDiff;
      return sortWeeklyReviewIssues(a,b);
    });
  const followUpProjects=completedProjects
    .filter(project=>!!project?.follow_up_needed)
    .sort(sortWeeklyReviewProjectsByCompletion);
  const cards=[
    {
      title:'이번 주 매출',
      badge:'이번 주',
      value:formatWeeklyReviewCurrency(weeklyRevenue),
      meta:`완료 ${completedProjects.length}건 · 해결 이슈 ${resolvedIssues.length}건 · ${formatWeeklyReviewCurrencyDelta(revenueDelta)}`,
      tone:weeklyRevenue?'success':''
    },
    {
      title:'리스크',
      badge:'현재',
      value:formatWeeklyReviewCount(overdueProjects.length),
      meta:`최장 지연 ${oldestOverdueProject?.name||'없음'} · 높음 우선 미해결 ${highPriorityActiveIssues.length}건`,
      tone:overdueProjects.length||highPriorityActiveIssues.length?'danger':'success'
    },
    {
      title:'수금 현황',
      badge:'실시간',
      value:formatWeeklyReviewCurrency(unbilledAmount),
      meta:`청구 후 미수금 ${formatWeeklyReviewCurrency(billedOutstandingAmount)} · 미청구 프로젝트 ${unbilledProjects.length}건`,
      tone:unbilledAmount||billedOutstandingAmount?'warning':'success'
    },
    {
      title:'차주 예정',
      badge:'다음 주',
      value:formatWeeklyReviewCount(nextWeekEnds.length),
      meta:`시작 ${nextWeekStarts.length}건 · 일정 ${nextWeekSchedules.length}건 · 대표 ${leadNextWeekProject?.name||'없음'}`,
      tone:nextWeekItemCount?'warning':'success'
    },
    {
      title:'인력 현황',
      badge:'이번 주',
      value:`${Number(availableMemberCount||0).toLocaleString()}명`,
      meta:`휴가 ${formatWeeklyReviewNameSummary(currentLeaveNames)} · 필드웍 ${currentFieldworkNames.length}명 · 다음 주 휴가 ${nextLeaveNames.length}명`,
      tone:availableMemberCount<(members||[]).length?'warning':'success'
    },
    {
      title:'고객 이슈',
      badge:'현재',
      value:`${Number(clientIssueSummary.length||0).toLocaleString()}곳`,
      meta:`최다 ${topIssueClient?`${topIssueClient.client.name} ${topIssueClient.count}건`:'없음'} · 고정 이슈 ${hasPinnedActiveIssue?'있음':'없음'}`,
      tone:clientIssueSummary.length?'warning':'success'
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
      title:'이번 주 완료 프로젝트',
      sub:'완료 처리된 프로젝트를 빌링 금액 기준으로 확인합니다.',
      groups:[
        {
          title:'이번 주 완료 프로젝트',
          variant:'table',
          tableTemplate:'1.1fr 1.6fr .9fr 1.2fr 1fr .9fr',
          tableHeaders:['고객사명','프로젝트명','유형','담당자','빌링 금액','빌링 상태'],
          items:completedProjectsByBilling.map(createWeeklyReviewCompletedProjectTableItem),
          summary:`합계 ${formatWeeklyReviewCurrency(weeklyRevenue)} · 평균 ${formatWeeklyReviewCurrency(completedAverageAmount)} · 비청구 프로젝트 ${completedUnbilledCount}건`
        }
      ]
    },
    {
      title:'지연 및 리스크',
      sub:'즉시 확인이 필요한 지연, 긴급 이슈, 후속 조치 항목입니다.',
      groups:[
        {
          title:'A. 지연 프로젝트',
          items:overdueProjects.map(project=>createWeeklyReviewProjectItem(project,{
            badgeLabel:'지연',
            badgeClass:'badge-red',
            sideText:`종료 ${getWeeklyReviewShortDate(getWeeklyReviewProjectEndDate(project))}`,
            action:"openProjModal('"+project.id+"')"
          }))
        },
        {
          title:'B. 긴급 이슈',
          items:urgentIssues.map(issue=>createWeeklyReviewIssueItem(issue,{
            badgeLabel:issue?.is_pinned?'고정':formatWeeklyReviewPriorityLabel(issue?.priority),
            badgeClass:issue?.is_pinned?'badge-red':getWeeklyReviewPriorityBadgeClass(issue?.priority),
            sideText:`변경 ${getWeeklyReviewShortDate(getIssueStatusChangedAt(issue))}`
          }))
        },
        {
          title:'C. 후속 조치 필요',
          items:followUpProjects.map(project=>createWeeklyReviewProjectItem(project,{
            badgeLabel:'후속조치',
            badgeClass:'badge-orange',
            sideText:project?.follow_up_note
              ? truncateText(project.follow_up_note,18)
              : `완료 ${getWeeklyReviewShortDate(getWeeklyReviewProjectCompletionDate(project))}`,
            action:"openProjModal('"+project.id+"',null,null,'completion')"
          }))
        }
      ]
    },
    {
      title:'다음 주 예정',
      sub:'다음 영업주 기준 마감, 신규 착수, 일정성 항목입니다.',
      groups:[
        {
          title:'A. 마감 예정',
          items:nextWeekEnds.map(project=>createWeeklyReviewProjectItem(project,{
            badgeLabel:'마감 예정',
            badgeClass:'badge-orange',
            sideText:`마감 ${getWeeklyReviewShortDate(getWeeklyReviewProjectEndDate(project))}`
          }))
        },
        {
          title:'B. 신규 착수',
          items:nextWeekStarts.map(project=>createWeeklyReviewProjectItem(project,{
            badgeLabel:'시작 예정',
            badgeClass:'badge-blue',
            sideText:`시작 ${getWeeklyReviewShortDate(getWeeklyReviewProjectStartDate(project))}`
          }))
        },
        {
          title:'C. 일정(휴가/필드웍/내부업무)',
          items:nextWeekSchedules.map(schedule=>createWeeklyReviewScheduleItem(schedule))
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
    {title:'이번 주 매출',badge:'이번 주',value:'...',meta:'불러오는 중...'},
    {title:'리스크',badge:'현재',value:'...',meta:'불러오는 중...'},
    {title:'수금 현황',badge:'실시간',value:'...',meta:'불러오는 중...'},
    {title:'차주 예정',badge:'다음 주',value:'...',meta:'불러오는 중...'},
    {title:'인력 현황',badge:'이번 주',value:'...',meta:'불러오는 중...'},
    {title:'고객 이슈',badge:'현재',value:'...',meta:'불러오는 중...'}
  ];
  el.innerHTML=renderWeeklyReviewPageMarkup(rangeLabel,navLabel,loadingCards,[]);
  const data=await getWeeklyReviewPageData(requestedOffset).catch(()=>({
    cards:[
      {title:'이번 주 매출',badge:'이번 주',value:'-',meta:'데이터를 불러오지 못했습니다.'},
      {title:'리스크',badge:'현재',value:'-',meta:'데이터를 불러오지 못했습니다.'},
      {title:'수금 현황',badge:'실시간',value:'-',meta:'데이터를 불러오지 못했습니다.'},
      {title:'차주 예정',badge:'다음 주',value:'-',meta:'데이터를 불러오지 못했습니다.'},
      {title:'인력 현황',badge:'이번 주',value:'-',meta:'데이터를 불러오지 못했습니다.'},
      {title:'고객 이슈',badge:'현재',value:'-',meta:'데이터를 불러오지 못했습니다.'}
    ],
    sections:[]
  }));
  if(curPage!=='weeklyReview'||weeklyReviewWeekOffset!==requestedOffset)return;
  el.innerHTML=renderWeeklyReviewPageMarkup(rangeLabel,navLabel,data.cards,data.sections);
}
