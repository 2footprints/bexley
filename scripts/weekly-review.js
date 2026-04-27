let weeklyReviewWeekOffset=0;
let weeklyReviewMemberScope='me';
const WEEKLY_REVIEW_MODE_STORAGE_KEY='weeklyReviewMode:v1';
const WEEKLY_REVIEW_SECTION_STATE_STORAGE_KEY='weeklyReviewSectionState:v1';
const WEEKLY_REVIEW_SECTION_KEYS=['risks','billing','next','comments'];
const WEEKLY_REVIEW_DEBUG_PREFIX='[weekly-review]';
const WEEKLY_REVIEW_MODE_DEFAULTS={
  management:{
    risks:false,
    billing:false,
    next:false,
    comments:true
  },
  team:{
    risks:false,
    billing:false,
    next:false,
    comments:true
  }
};
const WEEKLY_REVIEW_JUMP_ITEMS=[
  {id:'risks',label:'이번 주 경고'},
  {id:'billing',label:'의사결정'},
  {id:'next',label:'다음 주 액션'},
  {id:'comments',label:'코멘트'}
];
let weeklyReviewLastRenderPayload=null;
let weeklyReviewMode=loadStoredWeeklyReviewMode();
let weeklyReviewSectionCollapseState={...getWeeklyReviewModeDefaults(weeklyReviewMode)};
let weeklyReviewDebugEventsBound=false;

function formatWeeklyReviewDebugDate(value){
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))return null;
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}
function weeklyReviewDebugLog(message,payload){
  try{
    if(payload!==undefined)console.log(`${WEEKLY_REVIEW_DEBUG_PREFIX} ${message}`,payload);
    else console.log(`${WEEKLY_REVIEW_DEBUG_PREFIX} ${message}`);
  }catch(e){}
}
function bindWeeklyReviewDebugEvents(){
  if(weeklyReviewDebugEventsBound)return;
  weeklyReviewDebugEventsBound=true;
  ['navWeeklyReview','mNavWeeklyReview'].forEach(id=>{
    const el=document.getElementById(id);
    if(!el||el.dataset.weeklyReviewDebugBound==='1')return;
    el.dataset.weeklyReviewDebugBound='1';
    el.addEventListener('click',()=>weeklyReviewDebugLog('tab clicked'));
  });
}
if(document.readyState==='loading'){
  document.addEventListener('DOMContentLoaded',bindWeeklyReviewDebugEvents,{once:true});
}else{
  bindWeeklyReviewDebugEvents();
}
window.addEventListener('load',bindWeeklyReviewDebugEvents,{once:true});

function normalizeWeeklyReviewMode(mode){
  return String(mode||'').trim()==='management'?'management':'team';
}
function getWeeklyReviewModeDefaults(mode){
  return {...(WEEKLY_REVIEW_MODE_DEFAULTS[normalizeWeeklyReviewMode(mode)]||WEEKLY_REVIEW_MODE_DEFAULTS.team)};
}
function loadStoredWeeklyReviewMode(){
  try{
    const stored=localStorage.getItem(WEEKLY_REVIEW_MODE_STORAGE_KEY);
    return normalizeWeeklyReviewMode(stored);
  }catch(e){
    return 'team';
  }
}
function persistWeeklyReviewMode(){
  try{localStorage.setItem(WEEKLY_REVIEW_MODE_STORAGE_KEY,weeklyReviewMode);}catch(e){}
}
function loadStoredWeeklyReviewSectionStates(){
  try{
    const raw=localStorage.getItem(WEEKLY_REVIEW_SECTION_STATE_STORAGE_KEY);
    const parsed=raw?JSON.parse(raw):{};
    return parsed&&typeof parsed==='object'?parsed:{};
  }catch(e){
    return {};
  }
}
function getWeeklyReviewModeSectionState(mode,data){
  const nextMode=normalizeWeeklyReviewMode(mode);
  const defaults=getWeeklyReviewModeDefaults(nextMode);
  const stored=loadStoredWeeklyReviewSectionStates()?.[nextMode];
  const merged={...defaults,...(stored&&typeof stored==='object'?stored:{})};
  if(data?.sections?.length){
    return data.sections.reduce((acc,section)=>{
      if(section?.id)acc[section.id]=!!merged[section.id];
      return acc;
    },{});
  }
  return merged;
}
function persistWeeklyReviewSectionState(){
  try{
    const stored=loadStoredWeeklyReviewSectionStates();
    stored[weeklyReviewMode]=WEEKLY_REVIEW_SECTION_KEYS.reduce((acc,key)=>{
      if(Object.prototype.hasOwnProperty.call(weeklyReviewSectionCollapseState,key)){
        acc[key]=!!weeklyReviewSectionCollapseState[key];
      }
      return acc;
    },{});
    localStorage.setItem(WEEKLY_REVIEW_SECTION_STATE_STORAGE_KEY,JSON.stringify(stored));
  }catch(e){}
}
function setWeeklyReviewMode(mode){
  const nextMode=normalizeWeeklyReviewMode(mode);
  if(nextMode===weeklyReviewMode)return;
  weeklyReviewMode=nextMode;
  persistWeeklyReviewMode();
  weeklyReviewSectionCollapseState=getWeeklyReviewModeSectionState(nextMode,weeklyReviewLastRenderPayload?.data);
  const scrollTop=window.scrollY||document.documentElement.scrollTop||0;
  if(weeklyReviewLastRenderPayload){
    const el=document.getElementById('pageWeeklyReview');
    if(el){
      el.innerHTML=renderWeeklyReviewPageMarkup(
        weeklyReviewLastRenderPayload.rangeLabel,
        weeklyReviewLastRenderPayload.navLabel,
        weeklyReviewLastRenderPayload.data.cards,
        weeklyReviewLastRenderPayload.data.sections
      );
      applyWeeklyReviewEmptyStateLabels();
      requestAnimationFrame(()=>window.scrollTo({top:scrollTop,left:0,behavior:'auto'}));
      return;
    }
  }
  renderWeeklyReviewPage();
}
function jumpToWeeklyReviewSection(sectionId){
  if(!sectionId)return;
  if(isWeeklyReviewSectionCollapsed(sectionId)){
    weeklyReviewSectionCollapseState={
      ...weeklyReviewSectionCollapseState,
      [sectionId]:false
    };
    persistWeeklyReviewSectionState();
    applyWeeklyReviewSectionCollapse(sectionId,false);
  }
  const target=document.querySelector('#pageWeeklyReview .weekly-review-section[data-section-id="'+sectionId+'"]');
  if(target)target.scrollIntoView({behavior:'smooth',block:'start'});
}

function isWeeklyReviewSectionCollapsed(sectionId){
  if(!sectionId)return false;
  if(Object.prototype.hasOwnProperty.call(weeklyReviewSectionCollapseState,sectionId)){
    return !!weeklyReviewSectionCollapseState[sectionId];
  }
  return !!getWeeklyReviewModeDefaults(weeklyReviewMode)[sectionId];
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
function isWeeklyReviewPendingBillingProject(project){
  const isCompletedLike=typeof isGanttProjectCompleted==='function'
    ? isGanttProjectCompleted(project)
    : isWeeklyReviewCompletedProject(project);
  if(!isCompletedLike)return false;
  if(project?.is_billable===false)return false;
  return String(project?.billing_status||'').trim()==='미청구';
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
function normalizeWeeklyReviewTaskStatus(status){
  const raw=String(status||'').trim().toLowerCase().replace(/[\s-]+/g,'_');
  if(raw==='완료'||raw==='done'||raw==='completed')return 'done';
  if(raw==='진행중'||raw==='in_progress'||raw==='active')return 'in_progress';
  if(raw==='대기'||raw==='waiting')return 'waiting';
  if(raw==='보류'||raw==='hold'||raw==='paused')return 'hold';
  return 'planned';
}
function isWeeklyReviewTaskCompleted(task){
  return normalizeWeeklyReviewTaskStatus(task?.status)==='done';
}
function getWeeklyReviewTaskTextBlob(task){
  return [task?.title||'',task?.description||''].join(' ');
}
function getWeeklyReviewTaskDueMeta(task,baseDate=getHomeBaseDate()){
  const dueDate=getWeeklyReviewDate(task?.due_date);
  if(!dueDate)return {tone:'neutral',label:'기한 미정',days:null};
  const base=new Date(baseDate.getFullYear(),baseDate.getMonth(),baseDate.getDate());
  const due=new Date(dueDate.getFullYear(),dueDate.getMonth(),dueDate.getDate());
  const diff=Math.round((due.getTime()-base.getTime())/86400000);
  if(diff<0)return {tone:'danger',label:'기한 경과',days:diff};
  if(diff===0)return {tone:'warn',label:'오늘 마감',days:diff};
  if(diff===1)return {tone:'warn',label:'D-1',days:diff};
  if(diff<=7)return {tone:'neutral',label:'D-'+diff,days:diff};
  return {tone:'neutral',label:getWeeklyReviewShortDate(task?.due_date),days:diff};
}
function isWeeklyReviewLeadershipRelevantTask(task){
  return /감사|audit|보고|리포트|report|결산|패키지|자료|문서|증빙|제출|고객|미팅|커뮤니케이션|청구|수금|계약|invoice|billing|collection|검토|신고/i.test(getWeeklyReviewTaskTextBlob(task));
}
function getWeeklyReviewTaskFollowUpLabel(task,flags={}){
  const textBlob=getWeeklyReviewTaskTextBlob(task);
  if(flags.issueLinked)return 'Work와 Issues 확인 필요';
  if(flags.docImpact||/자료|문서|증빙|제출/i.test(textBlob))return '자료 확인 필요';
  if(/청구|수금|계약|invoice|billing|collection/i.test(textBlob))return '계약/청구 확인 필요';
  if(/고객|미팅|커뮤니케이션/i.test(textBlob))return '고객 대응 일정 확인 필요';
  return 'Project Management > Work 확인 필요';
}
function getWeeklyReviewProjectKeyTasks(project,context={}){
  const projectId=String(project?.id||'');
  if(!projectId)return [];
  const tasks=(context.projectTaskMap?.get(projectId)||[]).filter(task=>!isWeeklyReviewTaskCompleted(task));
  if(!tasks.length)return [];
  const pendingDocCount=Number(context.pendingDocumentCountMap?.get(projectId)||0);
  return tasks.map(task=>{
    const dueMeta=getWeeklyReviewTaskDueMeta(task,context.baseDate||getHomeBaseDate());
    const issueLinkedCount=Number(context.taskIssueCountMap?.get(String(task?.id||''))||0);
    const statusKey=normalizeWeeklyReviewTaskStatus(task?.status);
    const leadershipRelevant=isWeeklyReviewLeadershipRelevantTask(task);
    const highPriority=String(task?.priority||'').trim().toLowerCase()==='high';
    const reasons=[];
    let score=0;
    if(dueMeta.tone==='danger'){
      score+=100;
      reasons.push('기한 경과');
    }else if(isWeeklyReviewDateInRange(task?.due_date,context.nextBounds?.start,context.nextBounds?.end)){
      score+=70;
      reasons.push('다음 주 마감');
    }
    if(issueLinkedCount>0){
      score+=60;
      reasons.push(`관련 이슈 ${issueLinkedCount}건`);
    }
    if((statusKey==='waiting'||statusKey==='hold')&&pendingDocCount>0){
      score+=55;
      reasons.push('프로젝트 자료 요청 영향');
    }else if(statusKey==='waiting'||statusKey==='hold'){
      score+=40;
      reasons.push('대기 상태');
    }
    if(leadershipRelevant){
      score+=45;
      if(/청구|수금|계약|invoice|billing|collection/i.test(getWeeklyReviewTaskTextBlob(task))){
        reasons.push('청구/수금 영향');
      }else if(/고객|미팅|커뮤니케이션/i.test(getWeeklyReviewTaskTextBlob(task))){
        reasons.push('고객 대응 영향 가능');
      }else if(/자료|문서|증빙|제출/i.test(getWeeklyReviewTaskTextBlob(task))){
        reasons.push('자료 확인 필요');
      }else{
        reasons.push('주간 주요 항목');
      }
    }
    if(highPriority)score+=20;
    if(!String(task?.assignee_member_id||'').trim()&&score>0)reasons.push('담당 확인 필요');
    if(score<50)return null;
    const uniqueReasons=[...new Set(reasons)].slice(0,3);
    return {
      title:String(task?.title||'핵심 Task'),
      meta:uniqueReasons.join(' · '),
      tone:dueMeta.tone==='danger'?'danger':(dueMeta.tone==='warn'||statusKey==='waiting'||statusKey==='hold'?'warn':'neutral'),
      followUp:getWeeklyReviewTaskFollowUpLabel(task,{
        issueLinked:issueLinkedCount>0,
        docImpact:(statusKey==='waiting'||statusKey==='hold')&&pendingDocCount>0
      }),
      sortScore:score,
      sortDate:getWeeklyReviewTimestamp(task?.due_date)||Number.MAX_SAFE_INTEGER
    };
  }).filter(Boolean).sort((a,b)=>{
    if(b.sortScore!==a.sortScore)return b.sortScore-a.sortScore;
    if(a.sortDate!==b.sortDate)return a.sortDate-b.sortDate;
    return String(a?.title||'').localeCompare(String(b?.title||''),'ko');
  }).slice(0,3);
}
function getWeeklyReviewProjectKeyTaskActionHint(tasks,fallback){
  const rows=Array.isArray(tasks)?tasks:[];
  if(!rows.length)return fallback;
  return '다음 주 확인: '+String(rows[0]?.followUp||fallback||'Project Management > Work 확인 필요');
}
function createWeeklyReviewProjectItem(project,options={}){
  const client=getWeeklyReviewProjectClient(project);
  const members=Array.isArray(project?.members)?project.members.filter(Boolean):[];
  const meta=[client?.name||'',project?.type||'',members.join(', ')].filter(Boolean).join(' · ');
  const keyTasks=(Array.isArray(options?.keyTasks)?options.keyTasks:[]).slice(0,3);
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
    actionHint:options.actionHint||getWeeklyReviewProjectKeyTaskActionHint(keyTasks,'프로젝트 상세를 열어 후속 작업을 확인하세요.'),
    keyTasks,
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
function getWeeklyReviewVisibleMembersForScope(scope,adminCanViewAll,currentMemberName){
  return (adminCanViewAll&&(scope==='all'||!currentMemberName)
    ? getOperationalMembers()
    : currentMemberName
      ? [{id:currentMember?.id||currentMemberName,name:currentMemberName}]
      : []
  ).sort((a,b)=>String(a?.name||'').localeCompare(String(b?.name||''),'ko'));
}
function buildWeeklyReviewMemberScopeActionsHtml(adminCanViewAll,scope){
  if(!adminCanViewAll)return '';
  return '<div style="display:flex;gap:6px;flex-wrap:wrap">'
    +'<button class="btn sm '+(scope==='me'?'primary':'')+'" onclick="setWeeklyReviewMemberScope(\'me\')">내 기준</button>'
    +'<button class="btn sm '+(scope==='all'?'primary':'')+'" onclick="setWeeklyReviewMemberScope(\'all\')">전체 멤버</button>'
  +'</div>';
}
function createWeeklyReviewMemberSection(scope,context){
  const normalizedScope=scope==='all'?'all':'me';
  const adminCanViewAll=!!context?.adminCanViewAll;
  const currentMemberName=String(context?.currentMemberName||'').trim();
  const visibleMembers=getWeeklyReviewVisibleMembersForScope(normalizedScope,adminCanViewAll,currentMemberName);
  const memberSummaries=visibleMembers.map(member=>createWeeklyReviewMemberSummary(member,{
    completedProjects:context?.completedProjects||[],
    resolvedIssues:context?.resolvedIssues||[],
    activeProjects:context?.activeProjects||[],
    nextWeekEnds:context?.nextWeekEnds||[],
    leaveSchedules:context?.leaveSchedules||[],
    fieldworkSchedules:context?.fieldworkSchedules||[],
    reviewStart:context?.reviewStart,
    reviewEnd:context?.reviewEnd
  }));
  return {
    id:'members',
    title:'인력별 주간 요약',
    sub:'기본은 내 기준이고, 관리자만 전체 멤버 기준으로 넓혀서 볼 수 있습니다.',
    actionsHtml:buildWeeklyReviewMemberScopeActionsHtml(adminCanViewAll,normalizedScope),
    collapsedSummary:`멤버 요약 ${memberSummaries.length}명`,
    groups:[
      {
        title:adminCanViewAll&&normalizedScope==='all'?'전체 멤버 요약':'내 주간 요약',
        variant:'html',
        items:memberSummaries,
        html:renderWeeklyReviewMemberSummaryGridMarkup(memberSummaries),
        emptyText:'표시할 멤버 요약이 없습니다.'
      }
    ]
  };
}
function replaceWeeklyReviewSectionMarkup(section){
  const sectionId=String(section?.id||'');
  if(!sectionId)return false;
  const currentSection=document.querySelector('#pageWeeklyReview .weekly-review-section[data-section-id="'+sectionId+'"]');
  if(!currentSection)return false;
  currentSection.outerHTML=renderWeeklyReviewSectionMarkup(section);
  applyWeeklyReviewEmptyStateLabels();
  return true;
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
  const nextScope=scope==='all'?'all':'me';
  if(nextScope===weeklyReviewMemberScope)return;
  weeklyReviewMemberScope=nextScope;
  const cachedSections=weeklyReviewLastRenderPayload?.data?.memberSectionsByScope;
  const nextSection=cachedSections?.[nextScope]||cachedSections?.me||null;
  const scrollTop=window.scrollY||document.documentElement.scrollTop||0;
  if(nextSection&&replaceWeeklyReviewSectionMarkup(nextSection)){
    if(Array.isArray(weeklyReviewLastRenderPayload?.data?.sections)){
      weeklyReviewLastRenderPayload.data.sections=weeklyReviewLastRenderPayload.data.sections.map(section=>
        String(section?.id||'')==='members'?nextSection:section
      );
    }
    requestAnimationFrame(()=>window.scrollTo({top:scrollTop,left:0,behavior:'auto'}));
    return;
  }
  renderWeeklyReviewPage().then(()=>window.scrollTo({top:scrollTop,left:0,behavior:'auto'}));
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
function renderWeeklyReviewKeyTaskListMarkup(tasks){
  const rows=(Array.isArray(tasks)?tasks:[]).slice(0,3);
  if(!rows.length)return '';
  return '<div class="weekly-review-keytask-list">'
    +'<div class="weekly-review-keytask-head">핵심 Task</div>'
    +rows.map(task=>
      '<div class="weekly-review-keytask-item is-'+esc(task?.tone||'neutral')+'">'
        +'<div class="weekly-review-keytask-title">'+esc(task?.title||'핵심 Task')+'</div>'
        +(task?.meta?'<div class="weekly-review-keytask-meta">'+esc(task.meta)+'</div>':'')
      +'</div>'
    ).join('')
  +'</div>';
}
function renderWeeklyReviewItemMarkup(item){
  const badgeHtml=item?.badgeLabel?'<span class="badge '+esc(item?.badgeClass||'badge-gray')+'">'+esc(item.badgeLabel)+'</span>':'';
  const sideTextHtml=item?.sideText?'<div class="weekly-review-item-side-text">'+esc(item.sideText)+'</div>':'';
  const keyTaskHtml=renderWeeklyReviewKeyTaskListMarkup(item?.keyTasks);
  const actionHintHtml=item?.actionHint?'<div class="weekly-review-item-action">'+esc(item.actionHint)+'</div>':'';
  const onclickAttr=item?.action?' onclick="'+item.action+'"':'';
  return '<button type="button" class="weekly-review-item"'+onclickAttr+'>'
    +'<div class="weekly-review-item-main">'
      +'<div class="weekly-review-item-title">'+esc(item?.title||'-')+'</div>'
      +(item?.meta?'<div class="weekly-review-item-meta">'+esc(item.meta)+'</div>':'')
      +keyTaskHtml
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
function renderWeeklyReviewModeToggleMarkup(){
  return '<div class="weekly-review-mode-toggle" role="tablist" aria-label="주간 리뷰 보기 모드">'
    +'<button type="button" class="weekly-review-mode-btn'+(weeklyReviewMode==='management'?' is-active':'')+'" onclick="setWeeklyReviewMode(\'management\')">경영 요약</button>'
    +'<button type="button" class="weekly-review-mode-btn'+(weeklyReviewMode==='team'?' is-active':'')+'" onclick="setWeeklyReviewMode(\'team\')">실무 회의</button>'
  +'</div>';
}
function renderWeeklyReviewQuickJumpMarkup(sections){
  const availableIds=new Set((Array.isArray(sections)?sections:[]).map(section=>String(section?.id||'')).filter(Boolean));
  const items=WEEKLY_REVIEW_JUMP_ITEMS.filter(item=>availableIds.has(item.id));
  if(!items.length)return '';
  return '<div class="weekly-review-jump-row" aria-label="주간 리뷰 빠른 이동">'
    +items.map(item=>
      '<button type="button" class="weekly-review-jump-btn" onclick="jumpToWeeklyReviewSection(\''+item.id+'\')">'+esc(item.label)+'</button>'
    ).join('')
  +'</div>';
}
function renderWeeklyReviewPageMarkup(rangeLabel,navLabel,cards,sections){
  const modeIsManagement=weeklyReviewMode==='management';
  const shellClass=modeIsManagement?' is-management-mode':' is-team-mode';
  const summaryCopy=modeIsManagement
    ? '이번 주 실적, 리스크, 청구·수금 이슈를 먼저 빠르게 확인하는 경영 요약 화면입니다.'
    : '완료·지연·다음 주 일정 순으로 액션 아이템을 따라가며 회의를 진행하는 실무 회의 화면입니다.';
  return '<div class="weekly-review-shell'+shellClass+'">'
    +'<div class="weekly-review-summary-shell">'
      +'<div class="weekly-review-head">'
        +'<div class="weekly-review-title-wrap">'
          +'<div class="weekly-review-kicker">'+(modeIsManagement?'Management Summary':'Team Meeting')+'</div>'
          +'<h2 class="section-title">주간 리뷰</h2>'
          +'<div class="weekly-review-summary-copy">'+esc(summaryCopy)+'</div>'
          +'<div class="weekly-review-range">'+esc(rangeLabel)+'</div>'
        +'</div>'
        +'<div class="month-nav weekly-review-nav">'
          +'<button type="button" class="month-nav-btn" onclick="renderWeeklyReviewPage('+(weeklyReviewWeekOffset-1)+')">&#8249;</button>'
          +'<div class="weekly-review-nav-label">'+esc(navLabel)+'</div>'
          +'<button type="button" class="month-nav-btn" onclick="renderWeeklyReviewPage('+(weeklyReviewWeekOffset+1)+')">&#8250;</button>'
        +'</div>'
      +'</div>'
      +'<div class="weekly-review-toolbar">'
        +renderWeeklyReviewModeToggleMarkup()
        +renderWeeklyReviewQuickJumpMarkup(sections)
      +'</div>'
      +'<div class="weekly-review-grid">'
        +(cards||[]).map(renderWeeklyReviewCardMarkup).join('')
      +'</div>'
    +'</div>'
    +'<div class="weekly-review-body">'
      +'<div class="weekly-review-body-grid">'
        +(sections||[]).map(renderWeeklyReviewSectionMarkup).join('')
      +'</div>'
    +'</div>'
  +'</div>';
}
function renderWeeklyReviewCardMarkup(card){
  const toneClass=card?.tone?` is-${card.tone}`:'';
  const badgeText=card?.badge||'';
  const helperText=card?.helper||'';
  const cardKey=card?.key?` data-card-key="${esc(card.key)}"`:'';
  return '<section class="card weekly-review-card"'+cardKey+'>'
    +'<div class="weekly-review-card-head">'
      +'<div class="weekly-review-card-title">'+esc(card?.title||'')+'</div>'
      +(badgeText?'<span class="weekly-review-card-badge">'+esc(badgeText)+'</span>':'')
    +'</div>'
    +'<div class="weekly-review-card-value'+toneClass+'">'+esc(card?.value||'-')+'</div>'
    +(helperText?'<div class="weekly-review-card-helper">'+esc(helperText)+'</div>':'')
    +'<div class="weekly-review-card-meta">'+esc(card?.meta||'')+'</div>'
  +'</section>';
}
function toggleWeeklyReviewSection(sectionId,trigger){
  if(!sectionId)return;
  const nextCollapsed=!isWeeklyReviewSectionCollapsed(sectionId);
  weeklyReviewSectionCollapseState={
    ...weeklyReviewSectionCollapseState,
    [sectionId]:nextCollapsed
  };
  persistWeeklyReviewSectionState();
  if(applyWeeklyReviewSectionCollapse(sectionId,nextCollapsed))return;
  renderWeeklyReviewPage();
}
async function getWeeklyReviewPageData(offsetWeeks=weeklyReviewWeekOffset){
  const reviewBounds=getWeeklyReviewBusinessWeekBounds(offsetWeeks);
  const nextBounds=getWeeklyReviewBusinessWeekBounds(offsetWeeks+1);
  const previousBounds=getWeeklyReviewBusinessWeekBounds(offsetWeeks-1);
  const today=getHomeBaseDate();
  weeklyReviewDebugLog('loadWeeklyReview start',{selectedWeek:offsetWeeks});
  weeklyReviewDebugLog('range',{
    startDate:formatWeeklyReviewDebugDate(reviewBounds.start),
    endDate:formatWeeklyReviewDebugDate(reviewBounds.end),
    selectedWeek:offsetWeeks
  });
  weeklyReviewDebugLog('delayed query start',{selectedWeek:offsetWeeks});
  weeklyReviewDebugLog('unbilled query start',{selectedWeek:offsetWeeks});
  weeklyReviewDebugLog('pending materials query start',{selectedWeek:offsetWeeks});
  weeklyReviewDebugLog('overloaded staff query start',{selectedWeek:offsetWeeks});
  await loadContracts();
  const ws=getWeekStart(offsetWeeks);
  const [issueRows,billingRows,pendingDocumentRequests,weeklyReviews,kudosVotes,taskRows]=await Promise.all([
    api('GET','project_issues?select=id,project_id,task_id,title,priority,status,resolved_at,updated_at,created_at,assignee_name,owner_name,is_pinned,status_changed_at').catch(()=>[]),
    api('GET','billing_records?select=id,contract_id,amount,status,billing_date,memo').catch(()=>[]),
    api('GET','document_requests?status=eq.pending&select=id,project_id,title,due_date,created_at').catch(()=>[]),
    api('GET','weekly_reviews?week_start=eq.'+ws+'&select=*&order=created_at.desc').catch(()=>[]),
    api('GET','kudos_votes?week_start=eq.'+ws+'&select=*').catch(()=>[]),
    api('GET','project_tasks?select=id,project_id,title,status,due_date,priority,assignee_member_id,description,created_at,updated_at').catch(()=>[])
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
  const unbilledProjects=(projects||[]).filter(isWeeklyReviewPendingBillingProject).sort(sortWeeklyReviewProjectsByCompletion);
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
  weeklyReviewDebugLog('delayed query result',{
    count:overdueProjects.length,
    oldestProject:oldestOverdueProject?.name||null
  });
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
  weeklyReviewDebugLog('unbilled query result',{
    count:unbilledProjects.length,
    amount:unbilledAmount,
    outstandingAmount:billedOutstandingAmount
  });
  weeklyReviewDebugLog('pending materials query result',{
    count:pendingDocumentRows.length
  });
  const weeklyReviewTaskContext={
    baseDate:today,
    nextBounds,
    projectTaskMap:new Map(),
    taskIssueCountMap:new Map(),
    pendingDocumentCountMap:new Map()
  };
  (taskRows||[]).filter(task=>task?.project_id).forEach(task=>{
    const key=String(task.project_id);
    const current=weeklyReviewTaskContext.projectTaskMap.get(key)||[];
    current.push(task);
    weeklyReviewTaskContext.projectTaskMap.set(key,current);
  });
  activeIssues
    .filter(issue=>String(issue?.task_id||'').trim())
    .forEach(issue=>{
      const key=String(issue.task_id);
      weeklyReviewTaskContext.taskIssueCountMap.set(key,Number(weeklyReviewTaskContext.taskIssueCountMap.get(key)||0)+1);
    });
  pendingDocumentRows.forEach(request=>{
    const key=String(request?.project_id||'').trim();
    if(!key)return;
    weeklyReviewTaskContext.pendingDocumentCountMap.set(key,Number(weeklyReviewTaskContext.pendingDocumentCountMap.get(key)||0)+1);
  });
  const weeklyReviewProjectKeyTaskCache=new Map();
  const getWeeklyReviewProjectKeyTasksCached=project=>{
    const key=String(project?.id||'');
    if(!key)return [];
    if(!weeklyReviewProjectKeyTaskCache.has(key)){
      weeklyReviewProjectKeyTaskCache.set(key,getWeeklyReviewProjectKeyTasks(project,weeklyReviewTaskContext));
    }
    return weeklyReviewProjectKeyTaskCache.get(key)||[];
  };
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
    return !!startDate&&!!endDate&&startDate<=reviewBounds.end&&endDate>=reviewBounds.start&&scheduleHasOperationalMember(schedule);
  });
  const currentWeekFieldwork=(schedules||[]).filter(schedule=>{
    const type=String(schedule?.schedule_type||'').trim();
    if(type!=='fieldwork')return false;
    const startDate=getWeeklyReviewDate(schedule?.start||schedule?.start_date);
    const endDate=getWeeklyReviewDate(schedule?.end||schedule?.end_date||schedule?.start||schedule?.start_date);
    return !!startDate&&!!endDate&&startDate<=reviewBounds.end&&endDate>=reviewBounds.start&&scheduleHasOperationalMember(schedule);
  });
  const nextWeekLeaves=(schedules||[]).filter(schedule=>{
    const type=String(schedule?.schedule_type||'').trim();
    if(type!=='leave')return false;
    const startDate=getWeeklyReviewDate(schedule?.start||schedule?.start_date);
    const endDate=getWeeklyReviewDate(schedule?.end||schedule?.end_date||schedule?.start||schedule?.start_date);
    return !!startDate&&!!endDate&&startDate<=nextBounds.end&&endDate>=nextBounds.start&&scheduleHasOperationalMember(schedule);
  });
  const nextWeekFieldwork=(schedules||[]).filter(schedule=>{
    const type=String(schedule?.schedule_type||'').trim();
    if(type!=='fieldwork')return false;
    const startDate=getWeeklyReviewDate(schedule?.start||schedule?.start_date);
    const endDate=getWeeklyReviewDate(schedule?.end||schedule?.end_date||schedule?.start||schedule?.start_date);
    return !!startDate&&!!endDate&&startDate<=nextBounds.end&&endDate>=nextBounds.start&&scheduleHasOperationalMember(schedule);
  });
  const operationalMembers=getOperationalMembers();
  const operationalMemberCount=operationalMembers.length;
  const currentLeaveNames=[...new Set(currentWeekLeaves.flatMap(schedule=>getOperationalScheduleMemberNames(schedule)))];
  const currentFieldworkNames=[...new Set(currentWeekFieldwork.flatMap(schedule=>getOperationalScheduleMemberNames(schedule)))];
  const nextLeaveNames=[...new Set(nextWeekLeaves.flatMap(schedule=>getOperationalScheduleMemberNames(schedule)))];
  const nextFieldworkNames=[...new Set(nextWeekFieldwork.flatMap(schedule=>getOperationalScheduleMemberNames(schedule)))];
  const unavailableMemberNames=new Set([...currentLeaveNames,...currentFieldworkNames]);
  const availableMemberCount=Math.max(0,operationalMemberCount-unavailableMemberNames.size);
  const activeProjectsNow=(projects||[]).filter(project=>isWeeklyReviewActiveProject(project));
  const currentLeaveCount=currentLeaveNames.length;
  const currentFieldworkCount=currentFieldworkNames.length;
  const nextFieldworkCount=nextFieldworkNames.length;
  const absenceImpactCount=operationalMembers.filter(member=>{
    const memberName=String(member?.name||'').trim();
    if(!memberName||!unavailableMemberNames.has(memberName))return false;
    const hasActiveProject=activeProjectsNow.some(project=>(project?.members||[]).includes(memberName));
    const hasNextWeekDeadline=nextWeekEnds.some(project=>(project?.members||[]).includes(memberName));
    return hasActiveProject||hasNextWeekDeadline;
  }).length;
  weeklyReviewDebugLog('overloaded staff query result',{
    count:absenceImpactCount,
    leaveCount:currentLeaveCount,
    currentFieldworkCount,
    nextFieldworkCount
  });
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
  const completedUnbilledCount=completedProjectsByBilling.filter(isWeeklyReviewPendingBillingProject).length;
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
  const adminCanViewAll=roleIsAdmin();
  const currentMemberName=String(currentMember?.name||'').trim();
  const memberSectionContext={
    adminCanViewAll,
    currentMemberName,
    completedProjects,
    resolvedIssues,
    activeProjects:activeProjectsNow,
    nextWeekEnds,
    leaveSchedules:currentWeekLeaves,
    fieldworkSchedules:currentWeekFieldwork,
    reviewStart:reviewBounds.start,
    reviewEnd:reviewBounds.end
  };
  const memberSectionsByScope={
    me:createWeeklyReviewMemberSection('me',memberSectionContext),
    all:createWeeklyReviewMemberSection('all',memberSectionContext)
  };
  const memberSection=memberSectionsByScope[adminCanViewAll&&weeklyReviewMemberScope==='all'?'all':'me'];
  const myWeeklyReview=(weeklyReviews||[]).find(review=>review?.created_by===currentUser?.id)||null;
  const commentsActionHtml=offsetWeeks===0
    ? '<button class="btn sm" onclick="openReviewModal('+(myWeeklyReview?'\''+myWeeklyReview.id+'\'':'')+')">'+(myWeeklyReview?'내 후기 수정':'+ 후기 작성')+'</button>'
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
      meta:`휴가 ${currentLeaveCount}명 · 이번 주 필드웍 ${currentFieldworkCount}명 · 다음 주 필드웍 ${nextFieldworkCount}명`,
      tone:availableMemberCount<operationalMemberCount?'warning':'success'
    },
    {
      title:'고객 이슈',
      badge:'현재',
      value:`${Number(clientIssueSummary.length||0).toLocaleString()}곳`,
      meta:`최다 ${topIssueClient?`${topIssueClient.client.name} ${topIssueClient.count}건`:'없음'} · 고정 이슈 ${hasPinnedActiveIssue?'있음':'없음'}`,
      tone:clientIssueSummary.length?'warning':'success'
    }
  ];
  if(cards[0])cards[0].key='revenue';
  if(cards[1])cards[1].key='risks';
  if(cards[2])cards[2].key='billing';
  if(cards[3])cards[3].key='next';
  if(cards[4])cards[4].key='resources';
  if(cards[5])cards[5].key='customers';
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
    cards[4].title='인력 가용성';
    cards[4].badge=absenceImpactCount?'확인':'이번 주';
    cards[4].value=absenceImpactCount
      ? `부재 영향 ${absenceImpactCount}명`
      : currentLeaveCount
        ? `휴가 ${currentLeaveCount}명`
        : currentFieldworkCount
          ? `필드웍 ${currentFieldworkCount}명`
          : '안정';
    cards[4].meta=`휴가 ${currentLeaveCount}명 · 이번 주 필드웍 ${currentFieldworkCount}명 · 다음 주 필드웍 ${nextFieldworkCount}명`;
    cards[4].helper=absenceImpactCount
      ? '휴가·필드웍이 진행 프로젝트와 겹치는 인원을 먼저 확인합니다.'
      : currentLeaveCount||currentFieldworkCount||nextFieldworkCount
        ? '휴가와 필드웍 기준으로 팀 가용성을 간단히 확인합니다.'
        : '이번 주 인력 가용성은 안정적인 편입니다.';
    cards[4].tone=absenceImpactCount||currentLeaveCount||currentFieldworkCount||nextFieldworkCount?'warning':'success';
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
            keyTasks:getWeeklyReviewProjectKeyTasksCached(project),
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
            keyTasks:getWeeklyReviewProjectKeyTasksCached(project),
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
            sideText:`마감 ${getWeeklyReviewShortDate(getWeeklyReviewProjectEndDate(project))}`,
            keyTasks:getWeeklyReviewProjectKeyTasksCached(project)
          }))
        },
        {
          title:'B. 신규 착수',
          items:nextWeekStarts.map(project=>createWeeklyReviewProjectItem(project,{
            badgeLabel:'시작 예정',
            badgeClass:'badge-blue',
            sideText:`시작 ${getWeeklyReviewShortDate(getWeeklyReviewProjectStartDate(project))}`,
            keyTasks:getWeeklyReviewProjectKeyTasksCached(project)
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
      actionsHtml:memberSection.actionsHtml,
      groups:[
        {
          title:adminCanViewAll&&weeklyReviewMemberScope==='all'?'전체 멤버 요약':'내 주간 요약',
          variant:'html',
          items:memberSection.groups[0]?.items||[],
          html:memberSection.groups[0]?.html||renderWeeklyReviewMemberSummaryGridMarkup([])
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
  if(sections[5]){sections[5].id='members';sections[5].collapsedSummary=memberSection.collapsedSummary||`멤버 요약 ${(memberSection.groups?.[0]?.items||[]).length}명`;}
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
  return {cards,sections,memberSectionsByScope};
}
function parseWeeklyReviewMetricNumber(value){
  const cleaned=String(value??'').replace(/[^\d-]/g,'');
  return cleaned?Number(cleaned):0;
}
function getWeeklyReviewOperationalMemberState(summary){
  const activeCount=Number(summary?.activeProjectCount||0);
  const nextDeadlineCount=Number(summary?.nextWeekDeadlineCount||0);
  const leaveDays=Number(summary?.leaveDays||0);
  const fieldworkDays=Number(summary?.fieldworkDays||0);
  const hasCurrentLoad=activeCount>0||nextDeadlineCount>0;
  if(leaveDays>0&&hasCurrentLoad){
    return {
      level:'leave-impact',
      label:'휴가 영향',
      badgeClass:'badge-orange',
      note:`이번 주 휴가 ${leaveDays}일`,
      followUp:'휴가 기간 담당 공백과 일정 공유 여부를 확인하세요.'
    };
  }
  if(fieldworkDays>0&&hasCurrentLoad){
    return {
      level:'fieldwork-impact',
      label:'필드웍 영향',
      badgeClass:'badge-orange',
      note:`이번 주 필드웍 ${fieldworkDays}일`,
      followUp:'현장 일정과 프로젝트 마감 일정이 겹치는지 확인하세요.'
    };
  }
  if(leaveDays>0){
    return {
      level:'leave',
      label:'휴가',
      badgeClass:'badge-gray',
      note:`이번 주 휴가 ${leaveDays}일`,
      followUp:'인수인계가 필요한 일정이 있는지 확인하세요.'
    };
  }
  if(fieldworkDays>0){
    return {
      level:'fieldwork',
      label:'필드웍',
      badgeClass:'badge-orange',
      note:`이번 주 필드웍 ${fieldworkDays}일`,
      followUp:'현장 일정 공유와 커버 필요 여부를 확인하세요.'
    };
  }
  if(activeCount>=4||nextDeadlineCount>=2){
    return {
      level:'schedule-check',
      label:'일정 확인',
      badgeClass:'badge-orange',
      note:`진행 ${activeCount}건 · 다음 주 마감 ${nextDeadlineCount}건`,
      followUp:'다음 주 마감 준비 상태만 간단히 점검하세요.'
    };
  }
  return {
    level:'stable',
    label:'안정',
    badgeClass:'badge-green',
    note:'현재 운영 범위 안에서 진행 중입니다.',
    followUp:'이번 주 계획 기준으로 진행합니다.'
  };
}
function renderWeeklyReviewOperationalMemberSummaryGridMarkup(summaries){
  const items=Array.isArray(summaries)?summaries:[];
  if(!items.length)return '<div class="weekly-review-empty">표시할 인력 요약이 없습니다.</div>';
  return '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(260px,1fr));gap:12px">'
    +items.map(summary=>{
      const state=summary?._operationalState||getWeeklyReviewOperationalMemberState(summary);
      return '<div class="card-sm" style="padding:16px;border:1px solid var(--border);border-radius:16px;background:var(--bg)">'
        +'<div style="display:flex;align-items:center;justify-content:space-between;gap:12px;margin-bottom:12px">'
          +'<div style="font-size:14px;font-weight:800;color:var(--navy)">'+esc(summary?.name||'이름 없음')+'</div>'
          +'<span class="badge '+esc(state.badgeClass||'badge-gray')+'">'+esc(state.label||'안정')+'</span>'
        +'</div>'
        +'<div style="display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px 14px">'
          +'<div><div style="font-size:11px;color:var(--text3)">진행 프로젝트</div><div style="font-size:15px;font-weight:800;color:var(--navy)">'+Number(summary?.activeProjectCount||0)+'건</div></div>'
          +'<div><div style="font-size:11px;color:var(--text3)">다음 주 마감</div><div style="font-size:15px;font-weight:800;color:var(--navy)">'+Number(summary?.nextWeekDeadlineCount||0)+'건</div></div>'
          +'<div><div style="font-size:11px;color:var(--text3)">이번 주 휴가</div><div style="font-size:15px;font-weight:800;color:var(--navy)">'+Number(summary?.leaveDays||0)+'일</div></div>'
          +'<div><div style="font-size:11px;color:var(--text3)">이번 주 필드웍</div><div style="font-size:15px;font-weight:800;color:var(--navy)">'+Number(summary?.fieldworkDays||0)+'일</div></div>'
        +'</div>'
        +'<div style="margin-top:12px;padding-top:10px;border-top:1px dashed rgba(148,163,184,.28)">'
          +'<div style="font-size:11px;color:var(--text3);margin-bottom:4px">'+esc(state.note||'')+'</div>'
          +'<div style="font-size:12px;font-weight:700;color:var(--text2);line-height:1.5">검토 포인트: '+esc(state.followUp||'')+'</div>'
        +'</div>'
      +'</div>';
    }).join('')
  +'</div>';
}
function getWeeklyReviewDataSection(data,sectionId){
  return (data?.sections||[]).find(section=>String(section?.id||'')===String(sectionId||''))||null;
}
function getWeeklyReviewSectionGroupItems(section,groupIndex){
  return Array.isArray(section?.groups?.[groupIndex]?.items)?section.groups[groupIndex].items:[];
}
const getWeeklyReviewPageDataBase=getWeeklyReviewPageData;
function renderWeeklyReviewSectionActionButtons(actions){
  const items=(Array.isArray(actions)?actions:[]).filter(action=>action?.label&&action?.action);
  if(!items.length)return '';
  return '<div class="weekly-review-section-action-row">'
    +items.map(action=>
      '<button type="button" class="btn ghost sm" onclick="'+esc(action.action)+'">'+esc(action.label)+'</button>'
    ).join('')
  +'</div>';
}
function getWeeklyReviewItemMetaParts(item){
  return String(item?.meta||'')
    .split('·')
    .map(part=>String(part||'').trim())
    .filter(Boolean);
}
function getWeeklyReviewItemOwnerLabel(item){
  const parts=getWeeklyReviewItemMetaParts(item);
  return parts[parts.length-1]||'담당 확인';
}
function createWeeklyReviewDocumentListItem(item,options={}){
  const columns=Array.isArray(item?.columns)?item.columns:[];
  const elapsedLabel=String(columns?.[4]||'').trim();
  const dueLabel=String(columns?.[3]||'').trim();
  const isOverdue=/경과/.test(elapsedLabel);
  return {
    title:String(columns?.[2]||'자료 요청'),
    meta:[columns?.[0]||'',columns?.[1]||'',elapsedLabel||''].filter(Boolean).join(' · '),
    badgeLabel:options.badgeLabel||'자료',
    badgeClass:options.badgeClass||(isOverdue?'badge-red':'badge-orange'),
    sideText:dueLabel||elapsedLabel||'-',
    actionHint:options.actionHint||(
      isOverdue
        ? '고객 자료 회신 지연 원인과 follow-up 일정을 확인하세요.'
        : '고객 자료 회신 일정과 담당 follow-up 여부를 확인하세요.'
    ),
    action:options.action||item?.action||''
  };
}
function createWeeklyReviewOperationalMemberItem(summary,options={}){
  const state=summary?._operationalState||getWeeklyReviewOperationalMemberState(summary);
  return {
    title:String(summary?.name||'이름 없음'),
    meta:options.meta||`진행 ${Number(summary?.activeProjectCount||0)}건 · 다음 주 마감 ${Number(summary?.nextWeekDeadlineCount||0)}건`,
    badgeLabel:options.badgeLabel||state.label||'안정',
    badgeClass:options.badgeClass||state.badgeClass||'badge-gray',
    sideText:options.sideText||state.note||'-',
    actionHint:options.actionHint||('프로젝트 관리에서 '+String(state.followUp||'담당 조정 필요 여부를 확인하세요.')),
    action:options.action||"setPage('gantt')"
  };
}
function createWeeklyReviewActionPlanTableItem(item,actionLabel){
  return {
    action:item?.action||'',
    columns:[
      getWeeklyReviewItemOwnerLabel(item),
      [actionLabel,item?.title||'-'].filter(Boolean).join(' · '),
      item?.sideText||'-',
      item?.badgeLabel||'-'
    ],
    actionHint:item?.actionHint||'연결 화면에서 후속 조치를 확인하세요.'
  };
}
renderWeeklyReviewPageMarkup=function(rangeLabel,navLabel,cards,sections){
  const modeIsManagement=weeklyReviewMode==='management';
  const shellClass=modeIsManagement?' is-management-mode':' is-team-mode';
  const kickerLabel=modeIsManagement?'운영 회의':'실무 회의';
  const summaryCopy=modeIsManagement
    ? '이번 주 경고, 의사결정, 다음 주 액션을 회의 흐름대로 점검하는 운영 보드입니다.'
    : '경고, 의사결정, 실행 계획을 한 화면에서 정리해 바로 후속 조치로 이어갑니다.';
  return '<div class="weekly-review-shell'+shellClass+'">'
    +'<div class="weekly-review-summary-shell">'
      +'<div class="weekly-review-head">'
        +'<div class="weekly-review-title-wrap">'
          +'<div class="weekly-review-kicker">'+esc(kickerLabel)+'</div>'
          +'<h2 class="section-title">주간 리뷰</h2>'
          +'<div class="weekly-review-summary-copy">'+esc(summaryCopy)+'</div>'
          +'<div class="weekly-review-range">'+esc(rangeLabel)+'</div>'
        +'</div>'
        +'<div class="month-nav weekly-review-nav">'
          +'<button type="button" class="month-nav-btn" onclick="renderWeeklyReviewPage('+(weeklyReviewWeekOffset-1)+')">&#8249;</button>'
          +'<div class="weekly-review-nav-label">'+esc(navLabel)+'</div>'
          +'<button type="button" class="month-nav-btn" onclick="renderWeeklyReviewPage('+(weeklyReviewWeekOffset+1)+')">&#8250;</button>'
        +'</div>'
      +'</div>'
      +'<div class="weekly-review-toolbar">'
        +renderWeeklyReviewModeToggleMarkup()
        +renderWeeklyReviewQuickJumpMarkup(sections)
      +'</div>'
      +'<div class="weekly-review-grid">'
        +(cards||[]).map(renderWeeklyReviewCardMarkup).join('')
      +'</div>'
    +'</div>'
    +'<div class="weekly-review-body">'
      +'<div class="weekly-review-body-grid">'
        +(sections||[]).map(renderWeeklyReviewSectionMarkup).join('')
      +'</div>'
    +'</div>'
  +'</div>';
};
applyWeeklyReviewEmptyStateLabels=function(){
  const mapping={
    risks:'이번 주 회의에서 먼저 다룰 경고 항목이 없습니다.',
    billing:'이번 회의에서 별도 의사결정이 필요한 항목이 많지 않습니다.',
    next:'다음 주 액션으로 이어질 주요 항목이 현재 적습니다.',
    comments:'이번 주 회의 메모가 없습니다. 필요하면 회의 중 메모를 남겨 주세요.'
  };
  Object.keys(mapping).forEach(sectionId=>{
    const sectionEl=document.querySelector('#pageWeeklyReview .weekly-review-section[data-section-id="'+sectionId+'"]');
    const emptyEls=sectionEl?.querySelectorAll('.weekly-review-empty')||[];
    emptyEls.forEach(el=>{el.textContent=mapping[sectionId];});
  });
};
getWeeklyReviewPageData=async function(offsetWeeks=weeklyReviewWeekOffset){
  const data=await getWeeklyReviewPageDataBase(offsetWeeks);
  const reviewBounds=getWeeklyReviewBusinessWeekBounds(offsetWeeks);
  const nextBounds=getWeeklyReviewBusinessWeekBounds(offsetWeeks+1);
  weeklyReviewDebugLog('init start',{selectedWeek:offsetWeeks});
  weeklyReviewDebugLog('range',{
    startDate:formatWeeklyReviewDebugDate(reviewBounds.start),
    endDate:formatWeeklyReviewDebugDate(reviewBounds.end),
    selectedWeek:offsetWeeks
  });
  const completedSection=getWeeklyReviewDataSection(data,'completed');
  const risksSection=getWeeklyReviewDataSection(data,'risks');
  const billingSection=getWeeklyReviewDataSection(data,'billing');
  const membersSection=getWeeklyReviewDataSection(data,'members');
  const nextSection=getWeeklyReviewDataSection(data,'next');
  const documentsSection=getWeeklyReviewDataSection(data,'documents');
  const commentsSection=getWeeklyReviewDataSection(data,'comments');

  const completedItems=getWeeklyReviewSectionGroupItems(completedSection,0);
  const overdueItems=getWeeklyReviewSectionGroupItems(risksSection,0);
  const urgentIssueItems=getWeeklyReviewSectionGroupItems(risksSection,1);
  const followUpItems=getWeeklyReviewSectionGroupItems(risksSection,2);
  const unbilledItems=getWeeklyReviewSectionGroupItems(billingSection,0);
  const outstandingItems=getWeeklyReviewSectionGroupItems(billingSection,1);
  const memberSummaries=getWeeklyReviewSectionGroupItems(membersSection,0).map(summary=>({
    ...summary,
    _operationalState:getWeeklyReviewOperationalMemberState(summary)
  }));
  const nextEndItems=getWeeklyReviewSectionGroupItems(nextSection,0);
  const nextStartItems=getWeeklyReviewSectionGroupItems(nextSection,1);
  const nextScheduleItems=getWeeklyReviewSectionGroupItems(nextSection,2);
  const documentItems=getWeeklyReviewSectionGroupItems(documentsSection,0);
  const commentItems=getWeeklyReviewSectionGroupItems(commentsSection,0);
  const currentWeekLeaves=(schedules||[]).filter(schedule=>{
    const type=String(schedule?.schedule_type||'').trim();
    if(type!=='leave')return false;
    const startDate=getWeeklyReviewDate(schedule?.start||schedule?.start_date);
    const endDate=getWeeklyReviewDate(schedule?.end||schedule?.end_date||schedule?.start||schedule?.start_date);
    return !!startDate&&!!endDate&&startDate<=reviewBounds.end&&endDate>=reviewBounds.start&&scheduleHasOperationalMember(schedule);
  });
  const currentWeekFieldwork=(schedules||[]).filter(schedule=>{
    const type=String(schedule?.schedule_type||'').trim();
    if(type!=='fieldwork')return false;
    const startDate=getWeeklyReviewDate(schedule?.start||schedule?.start_date);
    const endDate=getWeeklyReviewDate(schedule?.end||schedule?.end_date||schedule?.start||schedule?.start_date);
    return !!startDate&&!!endDate&&startDate<=reviewBounds.end&&endDate>=reviewBounds.start&&scheduleHasOperationalMember(schedule);
  });
  const nextWeekFieldwork=(schedules||[]).filter(schedule=>{
    const type=String(schedule?.schedule_type||'').trim();
    if(type!=='fieldwork')return false;
    const startDate=getWeeklyReviewDate(schedule?.start||schedule?.start_date);
    const endDate=getWeeklyReviewDate(schedule?.end||schedule?.end_date||schedule?.start||schedule?.start_date);
    return !!startDate&&!!endDate&&startDate<=nextBounds.end&&endDate>=nextBounds.start&&scheduleHasOperationalMember(schedule);
  });
  const currentLeaveCount=[...new Set(currentWeekLeaves.flatMap(schedule=>getOperationalScheduleMemberNames(schedule)))].length;
  const currentFieldworkCount=[...new Set(currentWeekFieldwork.flatMap(schedule=>getOperationalScheduleMemberNames(schedule)))].length;
  const nextFieldworkCount=[...new Set(nextWeekFieldwork.flatMap(schedule=>getOperationalScheduleMemberNames(schedule)))].length;

  const completedAmount=completedItems.reduce((sum,item)=>sum+parseWeeklyReviewMetricNumber(item?.columns?.[4]),0);
  const unbilledAmount=unbilledItems.reduce((sum,item)=>sum+parseWeeklyReviewMetricNumber(item?.sideText),0);
  const outstandingAmount=outstandingItems.reduce((sum,item)=>sum+parseWeeklyReviewMetricNumber(item?.sideText),0);
  const documentOverdueCount=documentItems.filter(item=>getWeeklyReviewDayDiff(item?.columns?.[3],getHomeBaseDate())>0).length;
  const documentDueSoonCount=documentItems.filter(item=>{
    const diff=getWeeklyReviewDayDiff(item?.columns?.[3],getHomeBaseDate());
    return diff!==null&&diff<=0&&diff>=-7;
  }).length;
  const absenceImpactMemberCount=memberSummaries.filter(summary=>['leave-impact','fieldwork-impact'].includes(summary?._operationalState?.level)).length;
  const scheduleCheckSummaries=memberSummaries.filter(summary=>summary?._operationalState?.level==='schedule-check');
  const overloadedSummaries=memberSummaries.filter(summary=>['leave-impact','fieldwork-impact','schedule-check'].includes(summary?._operationalState?.level));
  const reassignmentSummaries=memberSummaries.filter(summary=>['leave-impact','fieldwork-impact'].includes(summary?._operationalState?.level));
  const nextAttentionCount=nextEndItems.length+nextStartItems.length+nextScheduleItems.length;
  const documentListItems=documentItems.map(item=>createWeeklyReviewDocumentListItem(item));
  const scheduleAdjustmentItems=[...new Map(
    [...overdueItems,...nextEndItems].map(item=>[
      [item?.title||'',item?.meta||'',item?.sideText||''].join('|'),
      item
    ])
  ).values()];
  const customerCommunicationItems=[
    ...documentListItems.map(item=>({
      ...item,
      actionHint:'고객 자료 회신 일정과 follow-up 여부를 회의에서 정리하세요.'
    })),
    ...outstandingItems.map(item=>({
      ...item,
      actionHint:'고객 커뮤니케이션과 수금 확인 일정을 함께 맞춰 보세요.'
    }))
  ];
  const partnerReviewItems=urgentIssueItems.map(item=>({
    ...item,
    actionHint:'영향 범위와 고객 대응 필요 여부를 파트너와 함께 점검하세요.'
  }));
  const warningSummary=`지연 ${overdueItems.length}건 · 미청구 ${unbilledItems.length}건 · 자료 미수령 ${documentItems.length}건 · 과부하 인력 ${overloadedSummaries.length}명`;
  const decisionSummary=`재배정 ${reassignmentSummaries.length}건 · 일정 조정 ${scheduleAdjustmentItems.length}건 · 고객 커뮤니케이션 ${customerCommunicationItems.length}건 · 파트너 검토 ${partnerReviewItems.length}건`;
  const nextSummary=`마감 준비 ${nextEndItems.length}건 · 착수 준비 ${nextStartItems.length}건 · 일정 공유 ${nextScheduleItems.length}건`;

  data.cards=[
    {
      key:'risks',
      title:'지연 프로젝트',
      badge:'이번 주 경고',
      value:formatWeeklyReviewCount(overdueItems.length),
      helper:overdueItems.length
        ? '즉시 일정 회복 계획이 필요한 프로젝트입니다.'
        : '현재 회의에서 바로 다룰 지연 프로젝트는 없습니다.',
      meta:`실행 영향 이슈 ${urgentIssueItems.length}건 · 후속 조정 ${followUpItems.length}건`,
      tone:overdueItems.length?'danger':urgentIssueItems.length?'warning':'success'
    },
    {
      key:'billing',
      title:'미청구',
      badge:'계약 확인',
      value:formatWeeklyReviewCurrency(unbilledAmount),
      helper:unbilledItems.length
        ? '완료 이후 청구 정리가 필요한 금액입니다.'
        : '이번 주 기준 미청구 follow-up은 크지 않습니다.',
      meta:`미청구 ${unbilledItems.length}건 · 수금 확인 ${outstandingItems.length}건`,
      tone:unbilledAmount?'warning':outstandingAmount?'danger':'success'
    },
    {
      key:'documents',
      title:'자료 미수령',
      badge:'고객 대기',
      value:formatWeeklyReviewCount(documentItems.length),
      helper:documentItems.length
        ? '자료 회신 지연이 차주 일정에 영향을 줄 수 있습니다.'
        : '회수 관리가 필요한 자료 요청은 현재 적습니다.',
      meta:`기한 경과 ${documentOverdueCount}건 · 이번 주 확인 ${documentDueSoonCount}건`,
      tone:documentOverdueCount?'danger':documentItems.length?'warning':'success'
    },
    {
      key:'resources',
      title:'과부하 인력',
      badge:'인력 확인',
      value:`${Number(overloadedSummaries.length||0).toLocaleString()}명`,
      helper:overloadedSummaries.length
        ? '휴가·필드웍 또는 일정 집중으로 회의 확인이 필요한 인원입니다.'
        : '즉시 조정이 필요한 인력 이슈는 크지 않습니다.',
      meta:`부재 영향 ${absenceImpactMemberCount}명 · 일정 확인 ${scheduleCheckSummaries.length}명`,
      tone:absenceImpactMemberCount?'danger':overloadedSummaries.length?'warning':'success'
    }
  ];

  if(risksSection){
    risksSection.title='이번 주 경고';
    risksSection.sub='이번 주 회의에서 먼저 다뤄야 할 지연, 계약, 자료, 인력 경고를 한 번에 확인합니다.';
    risksSection.collapsedSummary=warningSummary;
    risksSection.actionsHtml=renderWeeklyReviewSectionActionButtons([
      {label:'프로젝트 관리',action:"setPage('gantt')"},
      {label:'계약 확인',action:"setPage('contracts')"}
    ]);
    risksSection.groups=[
      {
        title:'지연 프로젝트',
        items:overdueItems.map(item=>({
          ...item,
          actionHint:'프로젝트 관리에서 지연 원인과 일정 회복 계획을 바로 확인하세요.'
        })),
        emptyText:'이번 주 바로 논의할 지연 프로젝트는 없습니다.'
      },
      {
        title:'미청구',
        items:unbilledItems.map(item=>({
          ...item,
          actionHint:'계약 탭에서 청구 발행 시점과 책임자를 맞춰 확인하세요.'
        })),
        emptyText:'이번 주 우선 확인할 미청구 항목은 없습니다.'
      },
      {
        title:'자료 미수령',
        items:documentListItems.map(item=>({
          ...item,
          actionHint:'고객 자료 회신 일정과 담당자 follow-up 여부를 확인하세요.'
        })),
        emptyText:'이번 주 경고 수준의 자료 미수령 항목은 없습니다.'
      },
      {
        title:'과부하 인력',
        items:overloadedSummaries.map(summary=>createWeeklyReviewOperationalMemberItem(summary,{
          actionHint:'프로젝트 관리에서 담당 분산과 차주 마감 커버 필요 여부를 확인하세요.'
        })),
        emptyText:'즉시 조정이 필요한 인력 이슈는 없습니다.'
      }
    ];
  }
  if(billingSection){
    billingSection.title='의사결정 필요';
    billingSection.sub='회의 중 바로 판단해야 할 재배정, 일정 조정, 고객 커뮤니케이션, 파트너 검토 항목입니다.';
    billingSection.collapsedSummary=decisionSummary;
    billingSection.actionsHtml=renderWeeklyReviewSectionActionButtons([
      {label:'프로젝트 관리',action:"setPage('gantt')"},
      {label:'거래처 보기',action:"setPage('clients')"},
      {label:'계약 보기',action:"setPage('contracts')"}
    ]);
    billingSection.groups=[
      {
        title:'담당자 재배정 필요',
        items:reassignmentSummaries.map(summary=>createWeeklyReviewOperationalMemberItem(summary,{
          actionHint:'휴가·필드웍 일정과 겹치는 프로젝트 담당 재배정이 필요한지 결정하세요.'
        })),
        emptyText:'즉시 재배정이 필요한 인원은 없습니다.'
      },
      {
        title:'일정 조정 필요',
        items:scheduleAdjustmentItems.map(item=>({
          ...item,
          actionHint:'차주 일정 조정이나 마감 재설정이 필요한지 회의에서 바로 판단하세요.'
        })),
        emptyText:'회의에서 바로 일정 조정이 필요한 항목은 없습니다.'
      },
      {
        title:'고객 커뮤니케이션 필요',
        items:customerCommunicationItems.map(item=>({
          ...item,
          actionHint:item?.actionHint||'고객 커뮤니케이션과 follow-up 방향을 정리하세요.'
        })),
        emptyText:'고객 커뮤니케이션이 필요한 항목은 현재 많지 않습니다.'
      },
      {
        title:'파트너 검토 필요',
        items:partnerReviewItems,
        emptyText:'즉시 파트너 검토가 필요한 이슈는 없습니다.'
      }
    ];
  }
  if(nextSection){
    nextSection.title='다음 주 액션';
    nextSection.sub='회의가 끝난 뒤 바로 실행할 항목을 누가, 무엇을, 언제까지 기준으로 정리합니다.';
    nextSection.collapsedSummary=nextSummary;
    nextSection.actionsHtml=renderWeeklyReviewSectionActionButtons([
      {label:'프로젝트 관리',action:"setPage('gantt')"}
    ]);
    nextSection.groups=[
      {
        title:'마감 준비',
        variant:'table',
        tableTemplate:'.9fr 2fr 1fr .9fr',
        tableHeaders:['누가','무엇을','언제까지','상태'],
        tableAppendBadge:false,
        items:nextEndItems.map(item=>createWeeklyReviewActionPlanTableItem({
          ...item,
          actionHint:'프로젝트 관리에서 차주 마감 준비 상태를 확인하세요.'
        },'마감 준비')),
        emptyText:'다음 주 마감 준비 항목은 없습니다.'
      },
      {
        title:'착수 준비',
        variant:'table',
        tableTemplate:'.9fr 2fr 1fr .9fr',
        tableHeaders:['누가','무엇을','언제까지','상태'],
        tableAppendBadge:false,
        items:nextStartItems.map(item=>createWeeklyReviewActionPlanTableItem({
          ...item,
          actionHint:'담당, 자료, 일정 준비가 맞춰졌는지 확인하세요.'
        },'착수 준비')),
        emptyText:'다음 주 착수 준비 항목은 없습니다.'
      },
      {
        title:'일정 공유',
        variant:'table',
        tableTemplate:'.9fr 2fr 1fr .9fr',
        tableHeaders:['누가','무엇을','언제까지','상태'],
        tableAppendBadge:false,
        items:nextScheduleItems.map(item=>createWeeklyReviewActionPlanTableItem({
          ...item,
          actionHint:'팀 일정과 커버 계획을 함께 공유하세요.'
        },'일정 공유')),
        emptyText:'다음 주 일정 공유 항목은 없습니다.'
      }
    ];
  }
  if(commentsSection){
    commentsSection.title='회의 메모';
    commentsSection.sub='결정 사항과 코멘트는 참고용으로만 간단히 확인합니다.';
    commentsSection.collapsedSummary=`메모 ${commentItems.length}건`;
    commentsSection.actionsHtml=commentsSection.actionsHtml||'';
    if(commentsSection.groups?.[0]){
      commentsSection.groups[0].title='회의 메모';
      commentsSection.groups[0].emptyText='이번 주 회의 메모가 없습니다. 필요하면 회의 중 메모를 남겨 주세요.';
    }
  }
  data.sections=[
    risksSection,
    billingSection,
    nextSection,
    commentsSection
  ].filter(Boolean);
  return data;
};
async function getWeeklyReviewSummaryCards(offsetWeeks=weeklyReviewWeekOffset){
  const data=await getWeeklyReviewPageData(offsetWeeks);
  return data.cards;
}
async function renderWeeklyReviewPage(offset){
  bindWeeklyReviewDebugEvents();
  if(offset!==undefined)weeklyReviewWeekOffset=offset;
  weeklyReviewDebugLog('init start',{selectedWeek:weeklyReviewWeekOffset});
  const el=document.getElementById('pageWeeklyReview');
  if(!el){
    weeklyReviewDebugLog('render target missing',{targetId:'pageWeeklyReview'});
    return;
  }
  const requestedOffset=weeklyReviewWeekOffset;
  const rangeLabel=getWeeklyReviewWeekRangeLabel();
  const requestedBounds=getWeeklyReviewBusinessWeekBounds(requestedOffset);
  weeklyReviewDebugLog('loadWeeklyReview start',{selectedWeek:requestedOffset});
  weeklyReviewDebugLog('range',{
    startDate:formatWeeklyReviewDebugDate(requestedBounds.start),
    endDate:formatWeeklyReviewDebugDate(requestedBounds.end),
    selectedWeek:requestedOffset
  });
  const navLabel=weeklyReviewWeekOffset===0
    ? '이번 주'
    : weeklyReviewWeekOffset>0
      ? `${weeklyReviewWeekOffset}주 후`
      : `${Math.abs(weeklyReviewWeekOffset)}주 전`;
  const loadingCards=[
    {title:'지연 프로젝트',badge:'이번 주 경고',value:'...',meta:'불러오는 중...'},
    {title:'미청구',badge:'계약 확인',value:'...',meta:'불러오는 중...'},
    {title:'자료 미수령',badge:'고객 대기',value:'...',meta:'불러오는 중...'},
    {title:'과부하 인력',badge:'인력 확인',value:'...',meta:'불러오는 중...'}
  ];
  el.innerHTML=renderWeeklyReviewPageMarkup(rangeLabel,navLabel,loadingCards,[]);
  const data=await getWeeklyReviewPageData(requestedOffset).catch(error=>{
    weeklyReviewDebugLog('loadWeeklyReview error',{
      selectedWeek:requestedOffset,
      message:error?.message||String(error)
    });
    console.error(`${WEEKLY_REVIEW_DEBUG_PREFIX} load failed`,error);
    return ({
      cards:[
      {title:'지연 프로젝트',badge:'이번 주 경고',value:'-',meta:'데이터를 불러오지 못했습니다.'},
      {title:'미청구',badge:'계약 확인',value:'-',meta:'데이터를 불러오지 못했습니다.'},
      {title:'자료 미수령',badge:'고객 대기',value:'-',meta:'데이터를 불러오지 못했습니다.'},
      {title:'과부하 인력',badge:'인력 확인',value:'-',meta:'데이터를 불러오지 못했습니다.'}
      ],
      sections:[]
    });
  });
  if(curPage!=='weeklyReview'||weeklyReviewWeekOffset!==requestedOffset){
    weeklyReviewDebugLog('render aborted',{
      currentPage:curPage,
      requestedWeek:requestedOffset,
      activeWeek:weeklyReviewWeekOffset
    });
    return;
  }
  weeklyReviewSectionCollapseState=getWeeklyReviewModeSectionState(weeklyReviewMode,data);
  weeklyReviewLastRenderPayload={rangeLabel,navLabel,data};
  el.innerHTML=renderWeeklyReviewPageMarkup(rangeLabel,navLabel,data.cards,data.sections);
  applyWeeklyReviewEmptyStateLabels();
  weeklyReviewDebugLog('render complete',{
    selectedWeek:requestedOffset,
    cards:Array.isArray(data?.cards)?data.cards.length:0,
    sections:Array.isArray(data?.sections)?data.sections.length:0
  });
}
