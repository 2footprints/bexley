let weeklyReviewWeekOffset=0;
let weeklyReviewMemberScope='me';
const WEEKLY_REVIEW_SECTION_DEFAULTS={
  completed:false,
  risks:false,
  next:false,
  billing:true,
  documents:true,
  members:true,
  comments:true
};
let weeklyReviewSectionCollapseState={...WEEKLY_REVIEW_SECTION_DEFAULTS};

function isWeeklyReviewSectionCollapsed(sectionId){
  if(!sectionId)return false;
  if(Object.prototype.hasOwnProperty.call(weeklyReviewSectionCollapseState,sectionId)){
    return !!weeklyReviewSectionCollapseState[sectionId];
  }
  return !!WEEKLY_REVIEW_SECTION_DEFAULTS[sectionId];
}
function toggleWeeklyReviewSection(sectionId){
  if(!sectionId)return;
  weeklyReviewSectionCollapseState={
    ...weeklyReviewSectionCollapseState,
    [sectionId]:!isWeeklyReviewSectionCollapsed(sectionId)
  };
  renderWeeklyReviewPage();
}

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
function getWeeklyReviewContract(contractId){
  return (contracts||[]).find(contract=>String(contract.id)===String(contractId||''))||null;
}
function getWeeklyReviewIssueProject(issue){
  return (projects||[]).find(project=>String(project.id)===String(issue?.project_id||''))||null;
}
function getWeeklyReviewProjectByContractId(contractId){
  const linkedProjects=(projects||[]).filter(project=>String(project?.contract_id||'')===String(contractId||''));
  if(!linkedProjects.length)return null;
  return [...linkedProjects].sort((a,b)=>{
    const completionDiff=getWeeklyReviewTimestamp(getWeeklyReviewProjectCompletionDate(b))-getWeeklyReviewTimestamp(getWeeklyReviewProjectCompletionDate(a));
    if(completionDiff)return completionDiff;
    return String(a?.name||'').localeCompare(String(b?.name||''),'ko');
  })[0]||null;
}
function getWeeklyReviewDayDiff(fromValue,toValue){
  const fromDate=getWeeklyReviewDate(fromValue);
  const toDateValue=getWeeklyReviewDate(toValue);
  if(!fromDate||!toDateValue)return null;
  const startOfFrom=new Date(fromDate.getFullYear(),fromDate.getMonth(),fromDate.getDate());
  const startOfTo=new Date(toDateValue.getFullYear(),toDateValue.getMonth(),toDateValue.getDate());
  return Math.round((startOfTo-startOfFrom)/86400000);
}
function formatWeeklyReviewDocumentElapsed(dueDate,baseDate){
  const diff=getWeeklyReviewDayDiff(dueDate,baseDate);
  if(diff===null)return '-';
  if(diff>0)return `경과 ${diff}일`;
  if(diff===0)return '오늘';
  return `D-${Math.abs(diff)}`;
}
function getWeeklyReviewDateKey(value){
  const date=getWeeklyReviewDate(value);
  if(!date)return '';
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}
function getWeeklyReviewOverlapDateKeys(rangeStart,rangeEnd,startValue,endValue){
  const startDate=getWeeklyReviewDate(startValue);
  const endDate=getWeeklyReviewDate(endValue||startValue);
  const fromDate=getWeeklyReviewDate(rangeStart);
  const toDateValue=getWeeklyReviewDate(rangeEnd);
  if(!startDate||!endDate||!fromDate||!toDateValue)return [];
  const start=Math.max(new Date(startDate.getFullYear(),startDate.getMonth(),startDate.getDate()).getTime(),new Date(fromDate.getFullYear(),fromDate.getMonth(),fromDate.getDate()).getTime());
  const end=Math.min(new Date(endDate.getFullYear(),endDate.getMonth(),endDate.getDate()).getTime(),new Date(toDateValue.getFullYear(),toDateValue.getMonth(),toDateValue.getDate()).getTime());
  if(start>end)return [];
  const cursor=new Date(start);
  const keys=[];
  while(cursor.getTime()<=end){
    keys.push(getWeeklyReviewDateKey(cursor));
    cursor.setDate(cursor.getDate()+1);
  }
  return keys;
}
function getWeeklyReviewScheduleDayCountForMember(scheduleRows,memberName,rangeStart,rangeEnd){
  const days=new Set();
  (scheduleRows||[]).forEach(schedule=>{
    if(!getScheduleMemberNames(schedule).includes(memberName))return;
    getWeeklyReviewOverlapDateKeys(
      rangeStart,
      rangeEnd,
      schedule?.start||schedule?.start_date,
      schedule?.end||schedule?.end_date||schedule?.start||schedule?.start_date
    ).forEach(key=>days.add(key));
  });
  return days.size;
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
    actionHint:options.actionHint||'프로젝트 상세를 열어 후속 작업을 확인하세요.',
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
    actionHint:options.actionHint||'이슈 상태와 담당자를 바로 확인하세요.',
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
    actionHint:options.actionHint||'관련 일정과 담당 멤버를 확인하세요.',
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
    actionHint:String(project?.billing_status||'').trim()==='誘몄껌援?'
      ? '청구 준비가 필요한 완료 프로젝트입니다.'
      : '완료 결과와 빌링 상태를 점검하세요.',
    badgeLabel:billingMeta.label,
    badgeClass:billingMeta.badgeClass
  };
}
function createWeeklyReviewBillingRecordItem(row){
  const contract=getWeeklyReviewContract(row?.contract_id);
  const project=getWeeklyReviewProjectByContractId(row?.contract_id);
  const client=getWeeklyReviewProjectClient(project);
  return {
    title:project?.name||contract?.contract_name||'계약 미지정 미수금',
    meta:[client?.name||'',contract?.contract_name||'',project?.type||''].filter(Boolean).join(' · '),
    badgeLabel:String(row?.status||'').trim()||'미수금',
    badgeClass:String(row?.status||'').trim()==='수금완료'?'badge-green':'badge-orange',
    sideText:formatWeeklyReviewCurrency(row?.amount||0),
    actionHint:'수금 예정과 리마인드 필요 여부를 확인하세요.',
    action:contract?.id?("openContractDetail('"+contract.id+"')"):(project?.id?("openProjModal('"+project.id+"',null,null,'completion')"):'')
  };
}
function createWeeklyReviewDocumentRequestTableItem(request,baseDate){
  const project=(projects||[]).find(item=>String(item.id)===String(request?.project_id||''))||null;
  const client=getWeeklyReviewProjectClient(project);
  return {
    action:project?.id?("openProjModal('"+project.id+"',null,null,'documents')"):'',
    columns:[
      client?.name||'-',
      project?.name||'-',
      request?.title||'자료명 없음',
      request?.due_date||'-',
      formatWeeklyReviewDocumentElapsed(request?.due_date,baseDate)
    ],
    actionHint:getWeeklyReviewDayDiff(request?.due_date,baseDate)>0
      ? '기한이 지난 자료 요청입니다. 회수가 필요합니다.'
      : '자료 제출 예정일과 담당자 커뮤니케이션을 확인하세요.'
  };
}
function createWeeklyReviewMemberSummary(member,context){
  const memberName=String(member?.name||'').trim();
  const completedProjects=(context?.completedProjects||[]).filter(project=>(project?.members||[]).includes(memberName));
  const completedAmount=completedProjects.reduce((sum,project)=>sum+getWeeklyReviewProjectBillingAmount(project),0);
  const resolvedIssues=(context?.resolvedIssues||[]).filter(issue=>issue?.assignee_name===memberName||issue?.owner_name===memberName);
  const activeProjects=(context?.activeProjects||[]).filter(project=>(project?.members||[]).includes(memberName));
  const nextWeekEnds=(context?.nextWeekEnds||[]).filter(project=>(project?.members||[]).includes(memberName));
  const leaveDays=getWeeklyReviewScheduleDayCountForMember(context?.leaveSchedules||[],memberName,context?.reviewStart,context?.reviewEnd);
  const fieldworkDays=getWeeklyReviewScheduleDayCountForMember(context?.fieldworkSchedules||[],memberName,context?.reviewStart,context?.reviewEnd);
  const workloadScore=(activeProjects.length*2)+(nextWeekEnds.length)+(leaveDays+fieldworkDays);
  return {
    name:memberName||'이름 없음',
    completedCount:completedProjects.length,
    completedAmount,
    resolvedIssueCount:resolvedIssues.length,
    activeProjectCount:activeProjects.length,
    nextWeekDeadlineCount:nextWeekEnds.length,
    leaveDays,
    fieldworkDays,
    workloadScore
  };
}
function renderWeeklyReviewMemberSummaryCardMarkup(summary,maxScore){
  const pct=maxScore>0?Math.max(12,Math.round((summary.workloadScore/maxScore)*100)):0;
  const toneColor=pct>=80?'var(--red)':pct>=50?'var(--orange)':'var(--blue)';
  return '<div class="card-sm" style="padding:16px;border:1px solid var(--border);border-radius:16px;background:var(--bg)">'
    +'<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px">'
      +'<div style="font-size:14px;font-weight:800;color:var(--navy)">'+esc(summary.name)+'</div>'
      +'<span class="badge badge-gray">워크로드 '+summary.workloadScore+'</span>'
    +'</div>'
    +'<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px">'
      +'<div><div style="font-size:11px;color:var(--text3)">완료 프로젝트</div><div style="font-size:15px;font-weight:800;color:var(--navy)">'+summary.completedCount+'건</div></div>'
      +'<div><div style="font-size:11px;color:var(--text3)">완료 금액</div><div style="font-size:15px;font-weight:800;color:var(--navy)">'+esc(formatWeeklyReviewCurrency(summary.completedAmount))+'</div></div>'
      +'<div><div style="font-size:11px;color:var(--text3)">해결 이슈</div><div style="font-size:15px;font-weight:800;color:var(--navy)">'+summary.resolvedIssueCount+'건</div></div>'
      +'<div><div style="font-size:11px;color:var(--text3)">진행중 프로젝트</div><div style="font-size:15px;font-weight:800;color:var(--navy)">'+summary.activeProjectCount+'건</div></div>'
      +'<div><div style="font-size:11px;color:var(--text3)">다음 주 마감</div><div style="font-size:15px;font-weight:800;color:var(--navy)">'+summary.nextWeekDeadlineCount+'건</div></div>'
      +'<div><div style="font-size:11px;color:var(--text3)">휴가/필드웍</div><div style="font-size:15px;font-weight:800;color:var(--navy)">'+summary.leaveDays+'일 / '+summary.fieldworkDays+'일</div></div>'
    +'</div>'
    +'<div style="margin-top:14px"><div style="display:flex;justify-content:space-between;gap:8px;font-size:11px;color:var(--text3);margin-bottom:6px"><span>워크로드 바</span><span>'+pct+'%</span></div><div style="height:8px;background:#E5EDF6;border-radius:999px;overflow:hidden"><div style="width:'+pct+'%;height:100%;border-radius:999px;background:'+toneColor+'"></div></div></div>'
  +'</div>';
}
function renderWeeklyReviewMemberSummaryGridMarkup(summaries){
  const maxScore=Math.max(0,...(summaries||[]).map(summary=>summary.workloadScore||0));
  if(!(summaries||[]).length)return '<div class="weekly-review-empty">표시할 멤버 요약이 없습니다.</div>';
  return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">'
    +(summaries||[]).map(summary=>renderWeeklyReviewMemberSummaryCardMarkup(summary,maxScore)).join('')
  +'</div>';
}
function renderWeeklyReviewKudosSummaryMarkup(votes){
  const tally={};
  (votes||[]).forEach(vote=>{
    const name=String(vote?.target_member_name||'').trim();
    if(!name)return;
    tally[name]=(tally[name]||0)+1;
  });
  const sorted=Object.entries(tally).sort((a,b)=>b[1]-a[1]||String(a[0]).localeCompare(String(b[0]),'ko'));
  if(!sorted.length){
    return '<div style="padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--bg);font-size:12px;color:var(--text3)">칭찬사원 투표 결과가 아직 없습니다.</div>';
  }
  return '<div style="display:flex;flex-wrap:wrap;gap:8px;margin-bottom:12px">'
    +sorted.slice(0,3).map(([name,count],index)=>{
      const tone=index===0?'badge-orange':'badge-gray';
      const label=index===0?'칭찬사원':'득표';
      return '<div style="padding:10px 12px;border:1px solid var(--border);border-radius:12px;background:var(--bg);display:flex;align-items:center;gap:8px">'
        +'<span class="badge '+tone+'">'+label+'</span>'
        +'<span style="font-size:13px;font-weight:800;color:var(--navy)">'+esc(name)+'</span>'
        +'<span style="font-size:12px;color:var(--text3)">'+count+'표</span>'
      +'</div>';
    }).join('')
  +'</div>';
}
function renderWeeklyReviewCommentsMarkup(reviews,isCurrentWeek){
  if(!(reviews||[]).length){
    return '<div class="weekly-review-empty">'+(isCurrentWeek?'아직 등록된 주간 코멘트가 없습니다.':'이 주차의 주간 코멘트가 없습니다.')+'</div>';
  }
  return '<div style="display:flex;flex-direction:column;gap:10px">'
    +(reviews||[]).map(review=>
      '<div class="card-sm" style="padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--bg)">'
        +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px">'
          +'<div><div style="font-size:13px;font-weight:800;color:var(--navy)">'+esc(review?.member_name||'익명')+'</div><div style="font-size:11px;color:var(--text3)">'+esc(formatCommentDate(review?.updated_at||review?.created_at||''))+'</div></div>'
          +(isCurrentWeek&&review?.created_by===currentUser?.id?'<button class="btn sm" data-id="'+review.id+'" onclick="openReviewModal(this.dataset.id)">수정</button>':'')
        +'</div>'
        +'<div style="font-size:12px;color:var(--text2);line-height:1.7;white-space:pre-wrap;word-break:break-word">'+esc(review?.content||'')+'</div>'
      +'</div>'
    ).join('')
  +'</div>';
}
function setWeeklyReviewMemberScope(scope){
  weeklyReviewMemberScope=scope==='all'?'all':'me';
  renderWeeklyReviewPage();
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
  const actionHintHtml=item?.actionHint?'<div class="weekly-review-item-action">'+esc(item.actionHint)+'</div>':'';
  const onclickAttr=item?.action?' onclick="'+item.action+'"':'';
  return '<button type="button" class="weekly-review-item"'+onclickAttr+'>'
    +'<div class="weekly-review-item-main">'
      +'<div class="weekly-review-item-title">'+esc(item?.title||'-')+'</div>'
      +(item?.meta?'<div class="weekly-review-item-meta">'+esc(item.meta)+'</div>':'')
      +actionHintHtml
    +'</div>'
    +'<div class="weekly-review-item-side">'
      +badgeHtml
      +sideTextHtml
    +'</div>'
  +'</button>';
}
function renderWeeklyReviewTableItemMarkup(item,templateColumns,appendBadge=true){
  const columns=Array.isArray(item?.columns)?item.columns:[];
  const onclickAttr=item?.action?' onclick="'+item.action+'"':'';
  const template=templateColumns||'1.1fr 1.6fr .9fr 1.1fr 1fr .9fr';
  return '<button type="button" class="weekly-review-item weekly-review-item--table"'+onclickAttr+'>'
    +'<div class="weekly-review-item-table-grid" style="grid-template-columns:'+template+'">'
      +columns.map((columnValue,index)=>{
        const align=index===4?'text-align:right;':'';
        return '<div style="min-width:0;font-size:12px;color:var(--text2);line-height:1.5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;'+align+'">'+esc(columnValue||'-')+'</div>';
      }).join('')
      +(appendBadge?'<div style="display:flex;justify-content:flex-end">'+(item?.badgeLabel?'<span class="badge '+esc(item?.badgeClass||'badge-gray')+'">'+esc(item.badgeLabel)+'</span>':'-')+'</div>':'')
    +'</div>'
    +(item?.actionHint?'<div class="weekly-review-item-action weekly-review-item-action--table">'+esc(item.actionHint)+'</div>':'')
  +'</button>';
}
function renderWeeklyReviewGroupMarkup(group){
  const items=Array.isArray(group?.items)?group.items:[];
  const emptyText=group?.emptyText||'?대떦 ??ぉ???놁뒿?덈떎.';
  const summaryHtml=group?.summary?'<div class="weekly-review-card-meta" style="padding-top:10px">'+esc(group.summary)+'</div>':'';
  if(group?.variant==='html'){
    return '<div class="weekly-review-section-group">'
      +'<div class="weekly-review-section-group-title">'
        +'<span>'+esc(group?.title||'')+'</span>'
        +'<span class="weekly-review-section-group-count">'+formatWeeklyReviewCount(items.length)+'</span>'
      +'</div>'
      +(group?.html||'<div class="weekly-review-empty">해당 항목이 없습니다.</div>')
      +summaryHtml
    +'</div>';
  }
  if(group?.variant==='table'){
    const template=group?.tableTemplate||'1.1fr 1.6fr .9fr 1.1fr 1fr .9fr';
    const appendBadge=group?.tableAppendBadge!==false;
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
        ? headerHtml+'<div class="weekly-review-list" style="margin-top:8px">'+items.map(item=>renderWeeklyReviewTableItemMarkup(item,template,appendBadge)).join('')+'</div>'
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
  const sectionId=section?.id||'';
  const isCollapsed=isWeeklyReviewSectionCollapsed(sectionId);
  return '<section class="card weekly-review-section">'
    +'<div class="weekly-review-section-head">'
      +'<div>'
        +'<div class="weekly-review-section-title">'+esc(section?.title||'')+'</div>'
        +(section?.sub?'<div class="weekly-review-section-sub">'+esc(section.sub)+'</div>':'')
      +'</div>'
      +'<div class="weekly-review-section-controls">'
        +(section?.actionsHtml||'')
        +'<button type="button" class="btn ghost sm" onclick="toggleWeeklyReviewSection(\''+sectionId+'\')">'+(isCollapsed?'펼치기':'접기')+'</button>'
      +'</div>'
    +'</div>'
    +'<div class="weekly-review-section-content'+(isCollapsed?' is-collapsed':'')+'">'
      +(isCollapsed
        ?'<div class="weekly-review-section-collapsed-note">'+esc(section?.collapsedSummary||'섹션을 펼쳐 상세 내용을 확인하세요.')+'</div>'
        :groups.map(renderWeeklyReviewGroupMarkup).join(''))
    +'</div>'
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
function renderWeeklyReviewPageMarkup(rangeLabel,navLabel,cards,sections){
  return '<div class="weekly-review-summary-shell">'
      +'<div class="weekly-review-head">'
        +'<div class="weekly-review-title-wrap">'
          +'<div class="weekly-review-kicker">Meeting Summary</div>'
          +'<h2 class="section-title">주간 리뷰</h2>'
          +'<div class="weekly-review-summary-copy">이번 주 실적과 리스크, 차주 일정과 수금 이슈를 회의 순서대로 빠르게 확인합니다.</div>'
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
    +'</div>'
    +'<div class="weekly-review-body">'
      +'<div class="weekly-review-body-grid">'
        +(sections||[]).map(renderWeeklyReviewSectionMarkup).join('')
      +'</div>'
    +'</div>';
}
function renderWeeklyReviewCardMarkup(card){
  const toneClass=card?.tone?` is-${card.tone}`:'';
  const badgeText=card?.badge||'';
  const helperText=card?.helper||'';
  return '<section class="card weekly-review-card">'
    +'<div class="weekly-review-card-head">'
      +'<div class="weekly-review-card-title">'+esc(card?.title||'')+'</div>'
      +(badgeText?'<span class="weekly-review-card-badge">'+esc(badgeText)+'</span>':'')
    +'</div>'
    +'<div class="weekly-review-card-value'+toneClass+'">'+esc(card?.value||'-')+'</div>'
    +(helperText?'<div class="weekly-review-card-helper">'+esc(helperText)+'</div>':'')
    +'<div class="weekly-review-card-meta">'+esc(card?.meta||'')+'</div>'
  +'</section>';
}
function renderWeeklyReviewSectionMarkup(section){
  const groups=Array.isArray(section?.groups)?section.groups:[];
  const sectionId=section?.id||'';
  const isCollapsed=isWeeklyReviewSectionCollapsed(sectionId);
  return '<section class="card weekly-review-section'+(isCollapsed?' is-collapsed':'')+'" data-section-id="'+esc(sectionId)+'">'
    +'<div class="weekly-review-section-head">'
      +'<div>'
        +'<div class="weekly-review-section-title">'+esc(section?.title||'')+'</div>'
        +(section?.sub?'<div class="weekly-review-section-sub">'+esc(section.sub)+'</div>':'')
      +'</div>'
      +'<div class="weekly-review-section-controls">'
        +(section?.collapsedSummary?'<div class="weekly-review-section-inline-summary"'+(isCollapsed?'':' style="display:none"')+'>'+esc(section.collapsedSummary)+'</div>':'')
        +(section?.actionsHtml||'')
        +'<button type="button" class="btn ghost sm" data-role="weekly-review-toggle" onclick="toggleWeeklyReviewSection(\''+sectionId+'\', this)">'+(isCollapsed?'펼치기':'접기')+'</button>'
      +'</div>'
    +'</div>'
    +'<div class="weekly-review-section-content'+(isCollapsed?' is-collapsed':'')+'">'
      +'<div class="weekly-review-section-collapsed-note">'+esc(section?.collapsedSummary||'섹션을 펼쳐 상세 내용을 확인하세요.')+'</div>'
      +'<div class="weekly-review-section-expanded-body">'
        +groups.map(renderWeeklyReviewGroupMarkup).join('')
      +'</div>'
    +'</div>'
  +'</section>';
}
function applyWeeklyReviewSectionCollapse(sectionId,collapsed){
  const sectionEl=document.querySelector('#pageWeeklyReview .weekly-review-section[data-section-id="'+sectionId+'"]');
  if(!sectionEl)return false;
  const contentEl=sectionEl.querySelector('.weekly-review-section-content');
  const toggleBtn=sectionEl.querySelector('[data-role="weekly-review-toggle"]');
  const inlineSummaryEl=sectionEl.querySelector('.weekly-review-section-inline-summary');
  const shouldCollapse=!!collapsed;
  sectionEl.classList.toggle('is-collapsed',shouldCollapse);
  if(contentEl)contentEl.classList.toggle('is-collapsed',shouldCollapse);
  if(toggleBtn)toggleBtn.textContent=shouldCollapse?'펼치기':'접기';
  if(inlineSummaryEl){
    inlineSummaryEl.style.display=shouldCollapse?'inline-flex':'none';
  }
  return true;
}
function applyWeeklyReviewEmptyStateLabels(){
  const mapping={
    completed:'이번 주 완료된 프로젝트가 없습니다. 이번 주 완료 실적은 다음 주차에서 다시 확인할 수 있습니다.',
    risks:'이번 주 즉시 다룰 지연이나 긴급 리스크가 없습니다.',
    documents:'대기 중인 자료 요청이 없습니다. 회수 관리가 필요한 항목이 없습니다.',
    comments:'이번 주 등록된 팀 코멘트가 없습니다. 회의 중 핵심 코멘트를 남겨보세요.'
  };
  Object.keys(mapping).forEach(sectionId=>{
    const sectionEl=document.querySelector('#pageWeeklyReview .weekly-review-section[data-section-id="'+sectionId+'"]');
    const emptyEls=sectionEl?.querySelectorAll('.weekly-review-empty')||[];
    emptyEls.forEach(el=>{el.textContent=mapping[sectionId];});
  });
}
function toggleWeeklyReviewSection(sectionId,trigger){
  if(!sectionId)return;
  const nextCollapsed=!isWeeklyReviewSectionCollapsed(sectionId);
  weeklyReviewSectionCollapseState={
    ...weeklyReviewSectionCollapseState,
    [sectionId]:nextCollapsed
  };
  if(applyWeeklyReviewSectionCollapse(sectionId,nextCollapsed))return;
  renderWeeklyReviewPage();
}
async function getWeeklyReviewPageData(offsetWeeks=weeklyReviewWeekOffset){
  const reviewBounds=getWeeklyReviewBusinessWeekBounds(offsetWeeks);
  const nextBounds=getWeeklyReviewBusinessWeekBounds(offsetWeeks+1);
  const previousBounds=getWeeklyReviewBusinessWeekBounds(offsetWeeks-1);
  const today=getHomeBaseDate();
  await loadContracts();
  const ws=getWeekStart(offsetWeeks);
  const [issueRows,billingRows,pendingDocumentRequests,weeklyReviews,kudosVotes]=await Promise.all([
    api('GET','project_issues?select=id,project_id,title,priority,status,resolved_at,updated_at,created_at,assignee_name,owner_name,is_pinned,status_changed_at').catch(()=>[]),
    api('GET','billing_records?select=id,contract_id,amount,status,billing_date,memo').catch(()=>[]),
    api('GET','document_requests?status=eq.pending&select=id,project_id,title,due_date,created_at').catch(()=>[]),
    api('GET','weekly_reviews?week_start=eq.'+ws+'&select=*&order=created_at.desc').catch(()=>[]),
    api('GET','kudos_votes?week_start=eq.'+ws+'&select=*').catch(()=>[])
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
  const outstandingBillingRows=(billingRows||[])
    .filter(row=>String(row?.status||'').trim()!=='수금완료')
    .sort((a,b)=>{
      const amountDiff=Math.round(Number(b?.amount)||0)-Math.round(Number(a?.amount)||0);
      if(amountDiff)return amountDiff;
      return getWeeklyReviewTimestamp(b?.billing_date)-getWeeklyReviewTimestamp(a?.billing_date);
    });
  const pendingDocumentRows=(pendingDocumentRequests||[])
    .filter(Boolean)
    .sort((a,b)=>{
      const aDue=getWeeklyReviewTimestamp(a?.due_date)||Number.MAX_SAFE_INTEGER;
      const bDue=getWeeklyReviewTimestamp(b?.due_date)||Number.MAX_SAFE_INTEGER;
      if(aDue!==bDue)return aDue-bDue;
      return String(a?.title||'').localeCompare(String(b?.title||''),'ko');
    });
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
  const activeProjectsNow=(projects||[]).filter(project=>isWeeklyReviewActiveProject(project));
  const adminCanViewAll=roleIsAdmin();
  const currentMemberName=String(currentMember?.name||'').trim();
  const visibleMembers=(adminCanViewAll&&(weeklyReviewMemberScope==='all'||!currentMemberName)
    ? [...(members||[])].filter(member=>String(member?.name||'').trim())
    : currentMemberName
      ? [{id:currentMember?.id||currentMemberName,name:currentMemberName}]
      : []
  ).sort((a,b)=>String(a?.name||'').localeCompare(String(b?.name||''),'ko'));
  const memberSummaries=visibleMembers.map(member=>createWeeklyReviewMemberSummary(member,{
    completedProjects,
    resolvedIssues,
    activeProjects:activeProjectsNow,
    nextWeekEnds,
    leaveSchedules:currentWeekLeaves,
    fieldworkSchedules:currentWeekFieldwork,
    reviewStart:reviewBounds.start,
    reviewEnd:reviewBounds.end
  }));
  const myWeeklyReview=(weeklyReviews||[]).find(review=>review?.created_by===currentUser?.id)||null;
  const commentsActionHtml=offsetWeeks===0
    ? '<button class="btn sm" onclick="openReviewModal('+(myWeeklyReview?'\''+myWeeklyReview.id+'\'':'')+')">'+(myWeeklyReview?'내 후기 수정':'+ 후기 작성')+'</button>'
    : '';
  const memberActionsHtml=adminCanViewAll
    ? '<div style="display:flex;gap:6px;flex-wrap:wrap">'
      +'<button class="btn sm '+(weeklyReviewMemberScope==='me'?'primary':'')+'" onclick="setWeeklyReviewMemberScope(\'me\')">내 기준</button>'
      +'<button class="btn sm '+(weeklyReviewMemberScope==='all'?'primary':'')+'" onclick="setWeeklyReviewMemberScope(\'all\')">전체 멤버</button>'
    +'</div>'
    : '';
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
  if(cards[0]){
    cards[0].helper=completedProjects.length
      ? `완료 ${completedProjects.length}건이 이번 주 실적으로 반영됩니다.`
      : '이번 주 완료 실적은 아직 없습니다.';
  }
  if(cards[1]){
    cards[1].helper=overdueProjects.length||highPriorityActiveIssues.length
      ? '지연 프로젝트와 긴급 이슈를 우선 점검해야 합니다.'
      : '즉시 회의가 필요한 큰 리스크는 없습니다.';
  }
  if(cards[2]){
    cards[2].helper=unbilledAmount||billedOutstandingAmount
      ? '청구와 수금 후속 조치를 회의에서 바로 정리하세요.'
      : '이번 주 기준 청구·수금 이슈가 크지 않습니다.';
  }
  if(cards[3]){
    cards[3].helper=nextWeekItemCount
      ? '차주 마감과 착수 준비 상태를 먼저 맞춰보세요.'
      : '다음 주 주요 일정은 비교적 안정적입니다.';
  }
  if(cards[4]){
    cards[4].helper=currentLeaveNames.length||currentFieldworkNames.length
      ? '부재와 필드웍에 따른 업무 커버 계획이 필요합니다.'
      : '이번 주 인력 가용성은 안정적인 편입니다.';
  }
  if(cards[5]){
    cards[5].helper=clientIssueSummary.length
      ? '고객사별 이슈 집중도를 같이 확인해 대응 우선순위를 맞추세요.'
      : '현재 고객 이슈는 비교적 안정적인 상태입니다.';
  }
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
    },
    {
      title:'수금 상세',
      sub:'미청구 프로젝트와 청구 후 미수금 항목을 분리해서 봅니다.',
      groups:[
        {
          title:'A. 미청구',
          items:unbilledProjects.map(project=>createWeeklyReviewProjectItem(project,{
            badgeLabel:'미청구',
            badgeClass:'badge-red',
            sideText:getWeeklyReviewProjectBillingAmount(project)
              ? formatWeeklyReviewCurrency(getWeeklyReviewProjectBillingAmount(project))
              : '금액 미입력',
            action:"openProjModal('"+project.id+"',null,null,'completion')"
          }))
        },
        {
          title:'B. 청구 후 미수금',
          items:outstandingBillingRows.map(createWeeklyReviewBillingRecordItem)
        }
      ]
    },
    {
      title:'자료 요청 현황',
      sub:'제출 대기 중인 자료 요청과 회수 희망일 기준 경과 현황입니다.',
      groups:[
        {
          title:'Pending 자료 요청',
          variant:'table',
          tableTemplate:'1.1fr 1.6fr 1.6fr .9fr .8fr',
          tableHeaders:['고객사','프로젝트명','자료명','회수 희망일','경과일'],
          tableAppendBadge:false,
          items:pendingDocumentRows.map(request=>createWeeklyReviewDocumentRequestTableItem(request,today))
        }
      ]
    },
    {
      title:'인력별 주간 요약',
      sub:'기본은 내 기준이며, 관리자는 전체 멤버 기준으로 확장해서 볼 수 있습니다.',
      actionsHtml:memberActionsHtml,
      groups:[
        {
          title:adminCanViewAll&&weeklyReviewMemberScope==='all'?'전체 멤버 요약':'내 주간 요약',
          variant:'html',
          items:memberSummaries,
          html:renderWeeklyReviewMemberSummaryGridMarkup(memberSummaries)
        }
      ]
    },
    {
      title:'주간 코멘트',
      sub:'weekly_reviews와 칭찬사원 결과를 함께 확인합니다.',
      actionsHtml:commentsActionHtml,
      groups:[
        {
          title:'이번 주 팀 한마디',
          variant:'html',
          items:weeklyReviews,
          html:renderWeeklyReviewKudosSummaryMarkup(kudosVotes)+renderWeeklyReviewCommentsMarkup(weeklyReviews,offsetWeeks===0)
        }
      ]
    }
  ];
  if(sections[0]){sections[0].id='completed';sections[0].collapsedSummary=`이번 주 완료 프로젝트 ${completedProjectsByBilling.length}건, 합계 ${formatWeeklyReviewCurrency(weeklyRevenue)}`;}
  if(sections[1]){sections[1].id='risks';sections[1].collapsedSummary=`지연 ${overdueProjects.length}건, 긴급 이슈 ${urgentIssues.length}건, 후속 조치 ${followUpProjects.length}건`;}
  if(sections[2]){sections[2].id='next';sections[2].collapsedSummary=`차주 마감 ${nextWeekEnds.length}건, 신규 착수 ${nextWeekStarts.length}건, 일정 ${nextWeekSchedules.length}건`;}
  if(sections[3]){sections[3].id='billing';sections[3].collapsedSummary=`미청구 ${unbilledProjects.length}건, 청구 후 미수금 ${outstandingBillingRows.length}건`;}
  if(sections[4]){sections[4].id='documents';sections[4].collapsedSummary=`회수 대기 자료 요청 ${pendingDocumentRows.length}건`;}
  if(sections[5]){sections[5].id='members';sections[5].collapsedSummary=`멤버 요약 ${memberSummaries.length}명`;}
  if(sections[6]){sections[6].id='comments';sections[6].collapsedSummary=`팀 코멘트 ${weeklyReviews.length}건`;}
  if(sections[0]?.groups?.[0])sections[0].groups[0].emptyText='이번 주 완료된 프로젝트가 없습니다. 다음 주차 실적을 기다리는 상태입니다.';
  if(sections[1]?.groups?.[0])sections[1].groups[0].emptyText='지연 프로젝트가 없습니다.';
  if(sections[1]?.groups?.[1])sections[1].groups[1].emptyText='즉시 점검할 긴급 이슈가 없습니다.';
  if(sections[1]?.groups?.[2])sections[1].groups[2].emptyText='후속 조치가 필요한 완료 프로젝트가 없습니다.';
  if(sections[2]?.groups?.[0])sections[2].groups[0].emptyText='다음 주 마감 예정 프로젝트가 없습니다.';
  if(sections[2]?.groups?.[1])sections[2].groups[1].emptyText='다음 주 신규 착수 프로젝트가 없습니다.';
  if(sections[2]?.groups?.[2])sections[2].groups[2].emptyText='다음 주 예정된 주요 일정이 없습니다.';
  if(sections[3]?.groups?.[0])sections[3].groups[0].emptyText='미청구 상태의 완료 프로젝트가 없습니다.';
  if(sections[3]?.groups?.[1])sections[3].groups[1].emptyText='청구 후 미수금 항목이 없습니다.';
  if(sections[4]?.groups?.[0])sections[4].groups[0].emptyText='대기 중인 자료 요청이 없습니다.';
  if(sections[5]?.groups?.[0])sections[5].groups[0].emptyText='표시할 멤버 요약이 없습니다.';
  if(sections[6]?.groups?.[0])sections[6].groups[0].emptyText=offsetWeeks===0?'이번 주 등록된 팀 코멘트가 없습니다.':'이 주차의 팀 코멘트가 없습니다.';
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
  applyWeeklyReviewEmptyStateLabels();
}
