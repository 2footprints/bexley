let weeklyReviewWeekOffset=0;
let weeklyReviewMemberScope='me';
const WEEKLY_REVIEW_MODE_STORAGE_KEY='weeklyReviewMode:v2';
const WEEKLY_REVIEW_SECTION_STATE_STORAGE_KEY='weeklyReviewSectionState:v1';
const WEEKLY_REVIEW_GROUP_STATE_STORAGE_KEY='weeklyReviewGroupState:v1';
const WEEKLY_REVIEW_SECTION_KEYS=['risks','billing','outputs','completed','next','comments'];
const WEEKLY_REVIEW_OVERDUE_TASK_DEFAULT_LIMIT=3;
const WEEKLY_REVIEW_OUTPUT_TABLE='project_outputs';
const WEEKLY_REVIEW_SNAPSHOT_TABLE='weekly_review_snapshots';
const WEEKLY_REVIEW_DEBUG_PREFIX='[weekly-review]';
const WEEKLY_REVIEW_MODE_DEFAULTS={
  management:{
    risks:false,
    billing:false,
    completed:false,
    next:false,
    comments:true
  },
  team:{
    risks:false,
    billing:false,
    completed:false,
    next:false,
    comments:true
  }
};
const WEEKLY_REVIEW_JUMP_ITEMS=[
  {id:'risks',label:'리스크 / 지연'},
  {id:'outputs',label:'산출물'},
  {id:'completed',label:'완료 및 산출물'},
  {id:'next-week',label:'차주 준비'},
  {id:'comments',label:'회의 메모'}
];
let weeklyReviewLastRenderPayload=null;
let weeklyReviewMode=loadStoredWeeklyReviewMode();
let weeklyReviewSectionCollapseState={...getWeeklyReviewModeDefaults(weeklyReviewMode)};
let weeklyReviewGroupExpansionState=loadStoredWeeklyReviewGroupState();
let weeklyReviewDebugEventsBound=false;
let weeklyReviewMeetingEditMode=false;
let weeklyReviewDraftItemCommentsByWeek={};

function formatWeeklyReviewDebugDate(value){
  const date=value instanceof Date?value:new Date(value);
  if(Number.isNaN(date.getTime()))return null;
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}

saveWeeklyReviewSnapshot=async function(){
  const offsetWeeks=weeklyReviewWeekOffset;
  const meta=getWeeklyReviewSnapshotWeekMeta(offsetWeeks);
  try{
    const existing=await getWeeklyReviewSnapshotAnyStatus(meta.weekStart);
    if(String(existing?.status||'draft')==='finalized'){
      alert('확정된 주간 리뷰는 바로 갱신할 수 없습니다. 먼저 확정 해제를 해주세요.');
      return;
    }
    const calculatedData=await getWeeklyReviewCalculatedPageData(offsetWeeks);
    const snapshotJson=buildWeeklyReviewSnapshotJson(calculatedData,offsetWeeks);
    if(Array.isArray(existing?.snapshot_json?.action_items)){
      snapshotJson.action_items=existing.snapshot_json.action_items;
    }
    const body={
      week_start:meta.weekStart,
      snapshot_json:snapshotJson,
      snapshot_version:1,
      base_date:snapshotJson.baseDate||null,
      status:'draft',
      finalized_at:null,
      finalized_by:null,
      discarded_at:null,
      discarded_by:null,
      created_by:currentUser?.id||null
    };
    if(existing?.id){
      await api('PATCH',WEEKLY_REVIEW_SNAPSHOT_TABLE+'?id=eq.'+existing.id,body);
    }else if(typeof apiEx==='function'){
      await apiEx('POST',WEEKLY_REVIEW_SNAPSHOT_TABLE+'?on_conflict=week_start',body,'resolution=merge-duplicates,return=representation');
    }else{
      await api('POST',WEEKLY_REVIEW_SNAPSHOT_TABLE,body);
    }
    await saveWeeklyReviewDraftItemComments(meta.weekStart);
    await renderWeeklyReviewPage(offsetWeeks);
    showWeeklyReviewToast(existing?.status==='discarded'?'주간 리뷰 초안을 다시 저장했습니다.':'주간 리뷰 초안이 저장되었습니다.');
  }catch(error){
    console.error('[weekly-review] snapshot save failed',error);
    const detail=typeof getWeeklyReviewApiErrorDetail==='function'?getWeeklyReviewApiErrorDetail(error):String(error?.message||error||'');
    alert('주간 리뷰 초안 저장에 실패했습니다.'+(detail?'\n\n오류: '+detail:''));
  }
};

async function discardWeeklyReviewDraft(){
  const offsetWeeks=weeklyReviewWeekOffset;
  const meta=getWeeklyReviewSnapshotWeekMeta(offsetWeeks);
  if(!confirm('이번 주 저장된 주간 리뷰 초안을 삭제할까요? 삭제하면 현재 화면은 최신 프로젝트 현황 기준으로 다시 표시됩니다.'))return;
  try{
    const existing=await getWeeklyReviewSnapshotAnyStatus(meta.weekStart);
    if(!existing?.id||String(existing?.status||'draft')==='discarded'){
      await renderWeeklyReviewPage(offsetWeeks);
      return;
    }
    if(String(existing.status||'draft')==='finalized'){
      alert('확정된 주간 리뷰는 초안 삭제할 수 없습니다. 관리자라면 먼저 확정 해제를 해주세요.');
      return;
    }
    await api('PATCH',WEEKLY_REVIEW_SNAPSHOT_TABLE+'?id=eq.'+existing.id,{
      status:'discarded',
      discarded_at:new Date().toISOString(),
      discarded_by:currentUser?.id||null
    });
    await renderWeeklyReviewPage(offsetWeeks);
    showWeeklyReviewToast('주간 리뷰 초안이 삭제되었습니다.');
  }catch(error){
    console.error('[weekly-review] draft discard failed',error);
    alert('주간 리뷰 초안 삭제에 실패했습니다. '+(error?.message||''));
  }
}

async function finalizeWeeklyReviewSnapshot(){
  const offsetWeeks=weeklyReviewWeekOffset;
  const meta=getWeeklyReviewSnapshotWeekMeta(offsetWeeks);
  if(!confirm('이번 주 주간 리뷰를 회의록으로 확정할까요?'))return;
  try{
    const existing=await getWeeklyReviewSnapshot(meta.weekStart);
    if(!existing?.id){alert('확정할 초안이 없습니다. 먼저 초안을 저장해주세요.');return;}
    await saveWeeklyReviewDraftItemComments(meta.weekStart);
    await api('PATCH',WEEKLY_REVIEW_SNAPSHOT_TABLE+'?id=eq.'+existing.id,{
      status:'finalized',
      finalized_at:new Date().toISOString(),
      finalized_by:currentUser?.id||null,
      discarded_at:null,
      discarded_by:null
    });
    await renderWeeklyReviewPage(offsetWeeks);
    showWeeklyReviewToast('주간 리뷰 회의록이 확정되었습니다.');
  }catch(error){
    console.error('[weekly-review] finalize failed',error);
    alert('회의록 확정에 실패했습니다. '+(error?.message||''));
  }
}

async function unfinalizeWeeklyReviewSnapshot(){
  if(!(typeof roleIsAdmin==='function'&&roleIsAdmin())){alert('관리자만 확정 해제할 수 있습니다.');return;}
  const offsetWeeks=weeklyReviewWeekOffset;
  const meta=getWeeklyReviewSnapshotWeekMeta(offsetWeeks);
  if(!confirm('확정된 주간 리뷰를 다시 초안 상태로 변경할까요?'))return;
  try{
    const existing=await getWeeklyReviewSnapshotAnyStatus(meta.weekStart);
    if(!existing?.id||String(existing.status||'')!=='finalized'){alert('확정된 주간 리뷰가 없습니다.');return;}
    await api('PATCH',WEEKLY_REVIEW_SNAPSHOT_TABLE+'?id=eq.'+existing.id,{
      status:'draft',
      finalized_at:null,
      finalized_by:null
    });
    await renderWeeklyReviewPage(offsetWeeks);
    showWeeklyReviewToast('확정이 해제되었습니다.');
  }catch(error){
    console.error('[weekly-review] unfinalize failed',error);
    alert('확정 해제에 실패했습니다. '+(error?.message||''));
  }
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
  return String(mode||'').trim()==='team'?'team':'management';
}
function getWeeklyReviewModeDefaults(mode){
  return {...(WEEKLY_REVIEW_MODE_DEFAULTS[normalizeWeeklyReviewMode(mode)]||WEEKLY_REVIEW_MODE_DEFAULTS.team)};
}
function loadStoredWeeklyReviewMode(){
  try{
    const stored=localStorage.getItem(WEEKLY_REVIEW_MODE_STORAGE_KEY);
    return stored?normalizeWeeklyReviewMode(stored):'management';
  }catch(e){
    return 'management';
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
function loadStoredWeeklyReviewGroupState(){
  try{
    const raw=localStorage.getItem(WEEKLY_REVIEW_GROUP_STATE_STORAGE_KEY);
    const parsed=raw?JSON.parse(raw):{};
    return parsed&&typeof parsed==='object'?parsed:{};
  }catch(e){
    return {};
  }
}
function persistWeeklyReviewGroupState(){
  try{
    localStorage.setItem(WEEKLY_REVIEW_GROUP_STATE_STORAGE_KEY,JSON.stringify(weeklyReviewGroupExpansionState||{}));
  }catch(e){}
}
function isWeeklyReviewGroupExpanded(key){
  return !!weeklyReviewGroupExpansionState?.[String(key||'')];
}
function toggleWeeklyReviewGroupExpansion(key){
  const groupKey=String(key||'');
  if(!groupKey)return;
  weeklyReviewGroupExpansionState={
    ...weeklyReviewGroupExpansionState,
    [groupKey]:!isWeeklyReviewGroupExpanded(groupKey)
  };
  persistWeeklyReviewGroupState();
  const scrollTop=window.scrollY||document.documentElement.scrollTop||0;
  if(weeklyReviewLastRenderPayload){
    const el=document.getElementById('pageWeeklyReview');
    if(el){
      el.innerHTML=renderWeeklyReviewPageMarkup(
        weeklyReviewLastRenderPayload.rangeLabel,
        weeklyReviewLastRenderPayload.navLabel,
        weeklyReviewLastRenderPayload.data.cards,
        weeklyReviewLastRenderPayload.data.sections,
        weeklyReviewLastRenderPayload.data._snapshotMeta,
        weeklyReviewLastRenderPayload.data
      );
      applyWeeklyReviewEmptyStateLabels();
      requestAnimationFrame(()=>window.scrollTo({top:scrollTop,left:0,behavior:'auto'}));
      return;
    }
  }
  renderWeeklyReviewPage().then(()=>window.scrollTo({top:scrollTop,left:0,behavior:'auto'}));
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
        weeklyReviewLastRenderPayload.data.sections,
        weeklyReviewLastRenderPayload.data._snapshotMeta,
        weeklyReviewLastRenderPayload.data
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
  if(typeof isGanttProjectCompleted==='function'){
    return isGanttProjectCompleted(project);
  }
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
function getWeeklyReviewProjectById(projectId){
  return (projects||[]).find(project=>String(project?.id||'')===String(projectId||''))||null;
}
function getWeeklyReviewProjectContextLabel(project,options={}){
  if(!project&&options.omitMissing)return '';
  const client=getWeeklyReviewProjectClient(project);
  const clientName=client?.name||'거래처 미지정';
  const projectName=project?.name||options.projectFallback||'프로젝트 미지정';
  return [clientName,projectName].filter(Boolean).join(' · ');
}
function getWeeklyReviewTaskContextLabel(task){
  return getWeeklyReviewProjectContextLabel(getWeeklyReviewProjectById(task?.project_id));
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
  if(raw==='완료'||raw==='done'||raw==='completed'||raw==='complete')return 'done';
  if(raw==='진행중'||raw==='in_progress'||raw==='active')return 'in_progress';
  if(raw==='대기'||raw==='waiting')return 'waiting';
  if(raw==='보류'||raw==='hold'||raw==='paused')return 'hold';
  return 'planned';
}
function isWeeklyReviewTaskCompleted(task){
  return normalizeWeeklyReviewTaskStatus(task?.status)==='done';
}
function getWeeklyReviewTaskCompletedAt(task){
  return task?.actual_done_at||task?.completed_at||task?.completed_date||task?.done_at||task?.finished_at||null;
}
function getWeeklyReviewTaskCompletionBasisDate(task){
  return getWeeklyReviewTaskCompletedAt(task)||task?.updated_at||null;
}
function isWeeklyReviewCompletedTaskInRange(task,start,end){
  if(!isWeeklyReviewTaskCompleted(task))return false;
  const completedAt=getWeeklyReviewTaskCompletedAt(task);
  if(completedAt)return isWeeklyReviewDateInRange(completedAt,start,end);
  return isWeeklyReviewDateInRange(task?.updated_at,start,end);
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
function getWeeklyReviewTaskAssigneeLabel(task){
  return (members||[]).find(member=>String(member?.id||'')===String(task?.assignee_member_id||''))?.name||'담당자 미정';
}
function getWeeklyReviewTaskStatusLabel(task){
  return String(task?.status||'예정').trim()||'예정';
}
function getWeeklyReviewTaskStatusBadgeClass(task){
  const status=normalizeWeeklyReviewTaskStatus(task?.status);
  if(status==='done')return 'badge-green';
  if(status==='waiting'||status==='hold')return 'badge-orange';
  if(getWeeklyReviewTaskDueMeta(task).tone==='danger')return 'badge-red';
  if(status==='in_progress')return 'badge-blue';
  return 'badge-gray';
}
function isWeeklyReviewTaskOverdue(task){
  return getWeeklyReviewTaskDueMeta(task).tone==='danger'&&!isWeeklyReviewTaskCompleted(task);
}
function getWeeklyReviewTaskCompletedDateLabel(task){
  const doneAt=getWeeklyReviewTaskCompletedAt(task);
  return doneAt?getWeeklyReviewShortDate(doneAt):'완료일 없음';
}
function getWeeklyReviewTaskWaitingReason(task){
  return String(task?.waiting_reason||task?.blocked_reason||task?.hold_reason||'').trim();
}
function renderWeeklyReviewTaskBreadcrumb(task,project=null){
  const targetProject=project||getWeeklyReviewProjectById(task?.project_id);
  const client=getWeeklyReviewProjectClient(targetProject);
  return '<div class="wr-task-breadcrumb">'+esc(client?.name||'거래처 미지정')+' <span>&gt;</span> '+esc(targetProject?.name||'프로젝트 미지정')+'</div>';
}
function renderWeeklyReviewTaskCardMeta(task){
  const dueMeta=getWeeklyReviewTaskDueMeta(task);
  const waitingReason=getWeeklyReviewTaskWaitingReason(task);
  const chips=[
    {label:'담당 '+getWeeklyReviewTaskAssigneeLabel(task),tone:''},
    {label:'상태 '+getWeeklyReviewTaskStatusLabel(task),tone:''},
    {label:'마감 '+(task?.due_date?getWeeklyReviewShortDate(task.due_date):'미정'),tone:dueMeta.tone==='danger'?'danger':dueMeta.tone==='warn'?'warn':''},
    isWeeklyReviewTaskCompleted(task)?{label:'완료 '+getWeeklyReviewTaskCompletedDateLabel(task),tone:'done'}:null,
    isWeeklyReviewTaskOverdue(task)?{label:'지연 '+Math.abs(dueMeta.days||0)+'일',tone:'danger'}:null,
    waitingReason?{label:'대기 '+waitingReason,tone:'warn'}:null
  ].filter(Boolean);
  return '<div class="wr-task-card-meta">'+chips.map(chip=>'<span class="'+(chip.tone?'is-'+chip.tone:'')+'">'+esc(chip.label)+'</span>').join('')+'</div>';
}
function isWeeklyReviewLeadershipRelevantTask(task){
  return /감사|audit|보고|리포트|report|결산|패키지|자료|문서|증빙|제출|고객|미팅|커뮤니케이션|청구|수금|계약|invoice|billing|collection|검토|신고/i.test(getWeeklyReviewTaskTextBlob(task));
}
function getWeeklyReviewTaskFollowUpLabel(task,flags={}){
  const textBlob=getWeeklyReviewTaskTextBlob(task);
  if(flags.issueLinked)return 'Work와 Issues 확인 필요';
  if(flags.docImpact||/자료|문서|증빙|제출/i.test(textBlob))return '확인 필요';
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
        reasons.push('확인 필요');
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
  const members=Array.isArray(project?.members)?project.members.filter(Boolean):[];
  const meta=[project?.type||'',members.join(', ')].filter(Boolean).join(' · ');
  const keyTasks=(Array.isArray(options?.keyTasks)?options.keyTasks:[]).slice(0,3);
  return {
    entity_type:'project',
    entity_id:String(project?.id||''),
    projectId:String(project?.id||''),
    title:String(project?.name||'이름 없는 프로젝트'),
    contextLabel:options.contextLabel||getWeeklyReviewProjectContextLabel(project),
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
  const meta=[issue?.assignee_name||issue?.owner_name||''].filter(Boolean).join(' · ');
  return {
    entity_type:'issue',
    entity_id:String(issue?.id||''),
    issueId:String(issue?.id||''),
    projectId:String(issue?.project_id||''),
    title:String(issue?.title||'제목 없는 이슈'),
    contextLabel:options.contextLabel||getWeeklyReviewProjectContextLabel(project,{omitMissing:!issue?.project_id}),
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
  const project=getWeeklyReviewProjectById(schedule?.project_id);
  return {
    source_type:options.source_type||schedule?.source_type||schedule?.item_type||'personal_schedule',
    item_type:options.item_type||schedule?.item_type||schedule?.source_type||scheduleType||'personal_schedule',
    schedule_type:scheduleType,
    projectId:String(schedule?.project_id||''),
    taskId:String(schedule?.task_id||''),
    title:String(schedule?.title||scheduleLabel(scheduleType)),
    contextLabel:options.contextLabel||getWeeklyReviewProjectContextLabel(project,{omitMissing:!schedule?.project_id}),
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
    entity_type:'project',
    entity_id:String(project?.id||''),
    projectId:String(project?.id||''),
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
function isWeeklyReviewClosedProjectCompletedInRange(project,start,end){
  const rawStatus=String(project?.status||'').trim();
  const statusKey=typeof getGanttProjectRawStatusKey==='function'
    ? getGanttProjectRawStatusKey(project)
    : normalizeWeeklyReviewProjectStatus(rawStatus);
  const isClosed=rawStatus==='완료'
    ||rawStatus==='완전종료'
    ||rawStatus==='완전 종료'
    ||statusKey==='completed'
    ||statusKey==='fully_closed';
  return isClosed
    &&!!project?.actual_end_date
    &&isWeeklyReviewDateInRange(project.actual_end_date,start,end);
}
function createWeeklyReviewCompletedProjectSummaryTableItem(project){
  const client=getWeeklyReviewProjectClient(project);
  const memberLabel=(Array.isArray(project?.members)?project.members.filter(Boolean):[]).join(', ')||'-';
  const billingMeta=getWeeklyReviewBillingStatusMeta(project);
  return {
    entity_type:'project',
    entity_id:String(project?.id||''),
    projectId:String(project?.id||''),
    action:"openProjModal('"+project.id+"',null,null,'completion')",
    columns:[
      client?.name||'고객사 미지정',
      project?.name||'이름 없는 프로젝트',
      getWeeklyReviewShortDate(project?.actual_end_date),
      memberLabel,
      formatWeeklyReviewCurrency(getWeeklyReviewProjectBillingAmount(project))
    ],
    actionHint:'완료일과 고객 공유, 빌링 후속 처리를 확인하세요.',
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
function getWeeklyReviewEmptyMeetingContent(){
  return {
    meeting_notes:'',
    decisions:'',
    action_items:'',
    next_week_checks:'',
    item_comments:[]
  };
}
function parseWeeklyReviewMeetingContent(content){
  const fallback=getWeeklyReviewEmptyMeetingContent();
  const raw=String(content||'').trim();
  if(!raw)return fallback;
  try{
    const parsed=JSON.parse(raw);
    if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed)){
      return {
        meeting_notes:String(parsed.meeting_notes||parsed.notes||''),
        decisions:String(parsed.decisions||''),
        action_items:String(parsed.action_items||''),
        next_week_checks:String(parsed.next_week_checks||''),
        item_comments:Array.isArray(parsed.item_comments)?parsed.item_comments:[]
      };
    }
  }catch(e){}
  return {...fallback,meeting_notes:raw};
}
function stringifyWeeklyReviewMeetingContent(content){
  return JSON.stringify({
    meeting_notes:String(content?.meeting_notes||'').trim(),
    decisions:String(content?.decisions||'').trim(),
    action_items:String(content?.action_items||'').trim(),
    next_week_checks:String(content?.next_week_checks||'').trim(),
    item_comments:Array.isArray(content?.item_comments)?content.item_comments:[]
  });
}
function hasWeeklyReviewMeetingContent(content){
  const parsed=parseWeeklyReviewMeetingContent(content);
  return ['meeting_notes','decisions','action_items','next_week_checks'].some(key=>String(parsed[key]||'').trim())
    ||(Array.isArray(parsed.item_comments)&&parsed.item_comments.length>0);
}
function getWeeklyReviewMeetingSections(){
  return [
    {key:'meeting_notes',label:'회의 메모',emptyText:'회의 중 논의한 내용을 자유롭게 기록해 주세요.'}
  ];
}
function getWeeklyReviewUnifiedMeetingText(content){
  const parsed=typeof content==='string'?parseWeeklyReviewMeetingContent(content):(content||{});
  const fields=[
    {label:'회의 메모',value:parsed.meeting_notes,primary:true},
    {label:'주요 결정사항',value:parsed.decisions},
    {label:'액션 메모',value:parsed.action_items},
    {label:'다음 주 확인사항',value:parsed.next_week_checks}
  ].map(field=>({...field,value:String(field.value||'').trim()})).filter(field=>field.value);
  if(!fields.length)return '';
  return fields.map(field=>field.primary?field.value:(field.label+'\n'+field.value)).join('\n\n');
}

function getWeeklyReviewCurrentWeekStart(){
  return getWeekStart(weeklyReviewWeekOffset);
}

function createWeeklyReviewItemCommentId(){
  return 'wr-comment-'+Date.now()+'-'+Math.random().toString(16).slice(2);
}

function getWeeklyReviewStableHash(value){
  const text=String(value||'');
  let hash=0;
  for(let i=0;i<text.length;i+=1){
    hash=((hash<<5)-hash)+text.charCodeAt(i);
    hash|=0;
  }
  return Math.abs(hash).toString(36);
}

function createWeeklyReviewLegacyItemCommentId({weekStart='',reviewId='',entityType='',entityId='',createdAt='',comment=''}={}){
  const source=[weekStart,reviewId,entityType,entityId,createdAt,comment].map(value=>String(value||'')).join('|');
  return 'wr-comment-legacy-'+getWeeklyReviewStableHash(source);
}

function normalizeWeeklyReviewItemComment(comment){
  const entityType=String(comment?.entity_type||'').trim();
  const entityId=String(comment?.entity_id||comment?.task_id||comment?.issue_id||comment?.project_id||'').trim();
  const text=String(comment?.comment||'').trim();
  if(!entityType||!entityId||!text)return null;
  const weekStart=String(comment?._week_start||comment?.week_start||'').trim();
  const reviewId=String(comment?._review_id||comment?.review_id||'').trim();
  const createdAt=comment?.created_at||new Date().toISOString();
  const stableId=String(comment?.id||comment?.client_temp_id||'').trim()
    ||(comment?.created_at||weekStart||reviewId
      ?createWeeklyReviewLegacyItemCommentId({weekStart,reviewId,entityType,entityId,createdAt,comment:text})
      :createWeeklyReviewItemCommentId());
  return {
    id:stableId,
    client_temp_id:String(comment?.client_temp_id||stableId),
    entity_type:entityType,
    entity_id:entityId,
    project_id:String(comment?.project_id||'').trim()||null,
    task_id:String(comment?.task_id||'').trim()||null,
    issue_id:String(comment?.issue_id||'').trim()||null,
    entity_label:String(comment?.entity_label||'').trim()||null,
    comment:text,
    is_starred:!!comment?.is_starred,
    followup_required:!!comment?.followup_required,
    owner_member_id:comment?.owner_member_id||null,
    due_date:comment?.due_date||null,
    status:String(comment?.status||'open').trim()||'open',
    resolved_at:comment?.resolved_at||null,
    created_at:createdAt,
    created_by:comment?.created_by||currentUser?.id||null,
    _week_start:weekStart||null,
    _review_id:reviewId||null
  };
}

function getWeeklyReviewItemCommentMergeKey(comment){
  const normalized=normalizeWeeklyReviewItemComment(comment);
  if(!normalized)return '';
  return String(normalized.id||normalized.client_temp_id||'').trim()
    ||[
      normalized.entity_type,
      normalized.entity_id,
      normalized.created_at,
      normalized.comment
    ].join(':');
}

function serializeWeeklyReviewItemComment(comment){
  const normalized=normalizeWeeklyReviewItemComment(comment);
  if(!normalized)return null;
  return {
    id:normalized.id,
    client_temp_id:normalized.client_temp_id,
    entity_type:normalized.entity_type,
    entity_id:normalized.entity_id,
    project_id:normalized.project_id,
    task_id:normalized.task_id,
    issue_id:normalized.issue_id,
    entity_label:normalized.entity_label,
    comment:normalized.comment,
    is_starred:normalized.is_starred,
    followup_required:normalized.followup_required,
    owner_member_id:normalized.owner_member_id,
    due_date:normalized.due_date,
    status:normalized.status,
    resolved_at:normalized.resolved_at,
    created_at:normalized.created_at,
    created_by:normalized.created_by
  };
}

function mergeWeeklyReviewItemComments(...commentLists){
  const byKey=new Map();
  commentLists.flat().forEach(comment=>{
    const normalized=normalizeWeeklyReviewItemComment(comment);
    if(!normalized)return;
    byKey.set(getWeeklyReviewItemCommentMergeKey(normalized),normalized);
  });
  return [...byKey.values()];
}

function getWeeklyReviewDraftItemComments(weekStart=getWeeklyReviewCurrentWeekStart()){
  const key=String(weekStart||'');
  if(!weeklyReviewDraftItemCommentsByWeek[key])weeklyReviewDraftItemCommentsByWeek[key]=[];
  return weeklyReviewDraftItemCommentsByWeek[key];
}

function getWeeklyReviewSavedItemComments(reviews){
  return (Array.isArray(reviews)?reviews:[])
    .flatMap(review=>(parseWeeklyReviewMeetingContent(review?.content||'').item_comments||[])
      .map(comment=>({...comment,_week_start:review?.week_start||null,_review_id:review?.id||null})))
    .map(normalizeWeeklyReviewItemComment)
    .filter(Boolean);
}

function getWeeklyReviewAllItemComments(data=weeklyReviewLastRenderPayload?.data){
  const weekStart=String(data?._snapshotMeta?.weekStart||getWeeklyReviewCurrentWeekStart());
  const saved=getWeeklyReviewSavedItemComments(data?.weeklyReviews||[]);
  const draft=getWeeklyReviewDraftItemComments(weekStart);
  return mergeWeeklyReviewItemComments(saved,draft);
}

function getWeeklyReviewEntityKey(entityType,entityId){
  return String(entityType||'')+':'+String(entityId||'');
}

function getWeeklyReviewCommentTargetFromItem(item){
  const taskId=String(item?.taskId||item?.task_id||item?._task?.id||'').trim();
  const issueId=String(item?.issueId||item?.issue_id||'').trim();
  const projectId=String(item?.projectId||item?.project_id||item?._task?.project_id||'').trim();
  if(taskId)return {entity_type:'task',entity_id:taskId,project_id:projectId||null,task_id:taskId};
  if(issueId)return {entity_type:'issue',entity_id:issueId,project_id:projectId||null,issue_id:issueId};
  if(projectId)return {entity_type:'project',entity_id:projectId,project_id:projectId};
  return null;
}

function getWeeklyReviewCommentsForTarget(target,data=weeklyReviewLastRenderPayload?.data){
  if(!target)return [];
  const key=getWeeklyReviewEntityKey(target.entity_type,target.entity_id);
  return getWeeklyReviewAllItemComments(data).filter(comment=>getWeeklyReviewEntityKey(comment.entity_type,comment.entity_id)===key);
}

function renderWeeklyReviewItemCommentBadges(target,data){
  const comments=getWeeklyReviewCommentsForTarget(target,data);
  if(!comments.length)return '';
  const hasStar=comments.some(comment=>comment.is_starred);
  const hasFollowup=comments.some(comment=>comment.followup_required&&String(comment.status||'open')==='open');
  return '<div class="wr-item-comment-badges">'
    +'<button type="button" class="wr-item-comment-badge" onclick="event.stopPropagation();openWeeklyReviewItemCommentsModal(\''+getWeeklyReviewJsString(target.entity_type)+'\',\''+getWeeklyReviewJsString(target.entity_id)+'\')">회의메모 '+comments.length+'건</button>'
    +(hasStar?'<span class="wr-item-comment-badge is-star">중요</span>':'')
    +(hasFollowup?'<span class="wr-item-comment-badge is-followup">팔로업 필요</span>':'')
  +'</div>';
}

function renderWeeklyReviewItemCommentButton(target){
  if(!target)return '';
  return '<button type="button" class="wr-item-comment-add" onclick="event.stopPropagation();openWeeklyReviewItemCommentModal(\''+getWeeklyReviewJsString(target.entity_type)+'\',\''+getWeeklyReviewJsString(target.entity_id)+'\',\''+getWeeklyReviewJsString(target.project_id||'')+'\',\''+getWeeklyReviewJsString(target.task_id||'')+'\',\''+getWeeklyReviewJsString(target.issue_id||'')+'\')">회의 코멘트 추가</button>';
}

function findWeeklyReviewTargetLabel(entityType,entityId){
  const type=String(entityType||'');
  const id=String(entityId||'');
  if(type==='task'){
    const task=(weeklyReviewLastRenderPayload?.data?.taskRows||[]).find(row=>String(row?.id||'')===id);
    return task?.title||'업무';
  }
  if(type==='issue'){
    const issue=(weeklyReviewLastRenderPayload?.data?._rawIssues||[]).find(row=>String(row?.id||'')===id);
    return issue?.title||'이슈';
  }
  if(type==='project'){
    const project=getWeeklyReviewProjectById(id);
    return project?.name||'프로젝트';
  }
  if(type==='output'){
    const output=(weeklyReviewLastRenderPayload?.data?.projectOutputs||[]).find(row=>String(row?.id||'')===id);
    return output?.title||'산출물';
  }
  return '회의 항목';
}

function findWeeklyReviewCommentLabel(comment){
  const label=String(comment?.entity_label||'').trim();
  return label||findWeeklyReviewTargetLabel(comment?.entity_type,comment?.entity_id);
}

function openWeeklyReviewItemCommentModal(entityType,entityId,projectId='',taskId='',issueId=''){
  const label=findWeeklyReviewTargetLabel(entityType,entityId);
  document.getElementById('modalArea').innerHTML=
    getInputModalOverlayHtml()
    +'<div class="modal" style="width:520px"><div class="modal-title">회의 코멘트 추가</div>'
    +'<div class="form-row"><label class="form-label">대상</label><input value="'+esc(label)+'" readonly style="background:var(--bg)"/></div>'
    +'<div class="form-row"><label class="form-label">코멘트</label><textarea id="wrItemCommentText" rows="4" placeholder="회의 중 확인한 내용, 결정, 후속 확인 사항을 적어주세요." style="resize:vertical"></textarea></div>'
    +'<div class="form-half"><label class="checkbox-row"><input type="checkbox" id="wrItemCommentStarred"/><span>중요 표시</span></label><label class="checkbox-row"><input type="checkbox" id="wrItemCommentFollowup"/><span>팔로업 필요</span></label></div>'
    +'<div class="modal-footer"><div class="muted">원본 프로젝트/업무/이슈는 수정하지 않고 이번 주 회의 기록에만 저장됩니다.</div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">취소</button><button class="btn primary" onclick="addWeeklyReviewItemComment(\''+getWeeklyReviewJsString(entityType)+'\',\''+getWeeklyReviewJsString(entityId)+'\',\''+getWeeklyReviewJsString(projectId||'')+'\',\''+getWeeklyReviewJsString(taskId||'')+'\',\''+getWeeklyReviewJsString(issueId||'')+'\')">추가</button></div></div>'
    +'</div></div>';
  lockBodyScroll();
  bindModalEscapeHandler();
  document.getElementById('wrItemCommentText')?.focus();
}

function addWeeklyReviewItemComment(entityType,entityId,projectId='',taskId='',issueId=''){
  const text=String(document.getElementById('wrItemCommentText')?.value||'').trim();
  if(!text){alert('코멘트 내용을 입력해주세요.');return;}
  const commentId=createWeeklyReviewItemCommentId();
  const comment=normalizeWeeklyReviewItemComment({
    id:commentId,
    client_temp_id:commentId,
    entity_type:entityType,
    entity_id:entityId,
    project_id:projectId||null,
    task_id:taskId||null,
    issue_id:issueId||null,
    entity_label:findWeeklyReviewTargetLabel(entityType,entityId),
    comment:text,
    is_starred:document.getElementById('wrItemCommentStarred')?.checked||false,
    followup_required:document.getElementById('wrItemCommentFollowup')?.checked||false,
    status:'open',
    created_at:new Date().toISOString()
  });
  if(!comment)return;
  getWeeklyReviewDraftItemComments().push(comment);
  closeModal();
  if(weeklyReviewLastRenderPayload){
    const el=document.getElementById('pageWeeklyReview');
    if(el){
      el.innerHTML=renderWeeklyReviewPageMarkup(
        weeklyReviewLastRenderPayload.rangeLabel,
        weeklyReviewLastRenderPayload.navLabel,
        weeklyReviewLastRenderPayload.data.cards,
        weeklyReviewLastRenderPayload.data.sections,
        weeklyReviewLastRenderPayload.data._snapshotMeta,
        weeklyReviewLastRenderPayload.data
      );
      applyWeeklyReviewEmptyStateLabels();
    }
  }
  showWeeklyReviewToast('회의 코멘트를 임시 추가했습니다. 회의자료 저장 시 함께 저장됩니다.');
}

function openWeeklyReviewItemCommentsModal(entityType,entityId){
  const comments=getWeeklyReviewCommentsForTarget({entity_type:entityType,entity_id:entityId});
  const label=findWeeklyReviewTargetLabel(entityType,entityId);
  document.getElementById('modalArea').innerHTML=
    getInputModalOverlayHtml()
    +'<div class="modal" style="width:560px"><div class="modal-title">회의 코멘트</div>'
    +'<div class="form-row"><label class="form-label">대상</label><input value="'+esc(label)+'" readonly style="background:var(--bg)"/></div>'
    +(comments.length?'<div class="wr-item-comment-list">'+comments.map(comment=>
      '<div class="wr-item-comment-row">'
        +'<div class="wr-item-comment-row-head">'
          +(comment.is_starred?'<span class="wr-item-comment-badge is-star">중요</span>':'')
          +(comment.followup_required?'<span class="wr-item-comment-badge is-followup">팔로업 필요</span>':'')
          +(String(comment.status||'open')==='done'?'<span class="wr-item-comment-badge">완료</span>':'')
          +'<span class="wr-item-comment-date">'+esc(formatCommentDate(comment.created_at))+'</span>'
        +'</div>'
        +'<div class="wr-item-comment-text">'+esc(comment.comment)+'</div>'
        +(comment.followup_required&&String(comment.status||'open')==='open'
          ?'<div class="wr-item-comment-actions"><button type="button" class="btn sm" onclick="completeWeeklyReviewItemComment(\''+getWeeklyReviewJsString(getWeeklyReviewItemCommentMergeKey(comment))+'\',\''+getWeeklyReviewJsString(comment._week_start||getWeeklyReviewCurrentWeekStart())+'\',\''+getWeeklyReviewJsString(comment._review_id||'')+'\')">완료 처리</button></div>'
          :'')
      +'</div>'
    ).join('')+'</div>':'<div class="weekly-review-empty">등록된 회의 코멘트가 없습니다.</div>')
    +'<div class="modal-footer"><div></div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">닫기</button></div></div>'
    +'</div></div>';
  lockBodyScroll();
  bindModalEscapeHandler();
}

function findWeeklyReviewItemCommentByKey(commentKey){
  const key=String(commentKey||'').trim();
  if(!key)return null;
  const draftComments=Object.values(weeklyReviewDraftItemCommentsByWeek||{}).flat();
  const all=mergeWeeklyReviewItemComments(
    getWeeklyReviewAllItemComments(),
    weeklyReviewLastRenderPayload?.data?._openFollowupComments||[],
    draftComments
  );
  return all.find(comment=>getWeeklyReviewItemCommentMergeKey(comment)===key)||null;
}

function renderWeeklyReviewItemCommentDetailRow(comment){
  if(!comment)return '';
  return '<div class="wr-item-comment-list"><div class="wr-item-comment-row">'
    +'<div class="wr-item-comment-row-head">'
      +(comment.is_starred?'<span class="wr-item-comment-badge is-star">중요</span>':'')
      +(comment.followup_required?'<span class="wr-item-comment-badge is-followup">팔로업 필요</span>':'')
      +(String(comment.status||'open')==='done'?'<span class="wr-item-comment-badge">완료</span>':'')
      +(comment._week_start?'<span class="wr-item-comment-badge">'+esc(comment._week_start)+'</span>':'')
      +'<span class="wr-item-comment-date">'+esc(formatCommentDate(comment.created_at))+'</span>'
    +'</div>'
    +'<div class="wr-item-comment-text">'+esc(comment.comment)+'</div>'
    +(comment.followup_required&&String(comment.status||'open')==='open'
      ?'<div class="wr-item-comment-actions"><button type="button" class="btn sm" onclick="completeWeeklyReviewItemComment(\''+getWeeklyReviewJsString(getWeeklyReviewItemCommentMergeKey(comment))+'\',\''+getWeeklyReviewJsString(comment._week_start||getWeeklyReviewCurrentWeekStart())+'\',\''+getWeeklyReviewJsString(comment._review_id||'')+'\')">완료 처리</button></div>'
      :'')
  +'</div></div>';
}

function openWeeklyReviewItemCommentDetailModal(commentKey){
  const comment=findWeeklyReviewItemCommentByKey(commentKey);
  if(!comment){alert('회의 코멘트를 찾지 못했습니다. 새로고침 후 다시 시도해주세요.');return;}
  document.getElementById('modalArea').innerHTML=
    getInputModalOverlayHtml()
    +'<div class="modal" style="width:560px"><div class="modal-title">회의 코멘트</div>'
    +'<div class="form-row"><label class="form-label">대상</label><input value="'+esc(findWeeklyReviewCommentLabel(comment))+'" readonly style="background:var(--bg)"/></div>'
    +renderWeeklyReviewItemCommentDetailRow(comment)
    +'<div class="modal-footer"><div></div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">닫기</button></div></div>'
    +'</div></div>';
  lockBodyScroll();
  bindModalEscapeHandler();
}

async function saveWeeklyReviewDraftItemComments(weekStart=getWeeklyReviewCurrentWeekStart()){
  const draft=getWeeklyReviewDraftItemComments(weekStart).map(normalizeWeeklyReviewItemComment).filter(Boolean);
  if(!draft.length)return;
  const memberName=currentMember?.name||currentUser?.email||'익명';
  const cached=(weeklyReviewLastRenderPayload?.data?.weeklyReviews||[]).find(review=>review?.created_by===currentUser?.id)||null;
  const rows=cached?.id
    ?[cached]
    :await api('GET','weekly_reviews?week_start=eq.'+weekStart+'&member_name=eq.'+encodeURIComponent(memberName)+'&select=*&order=created_at.desc&limit=1').catch(()=>[]);
  const existing=Array.isArray(rows)?rows[0]||null:rows||null;
  const parsed=parseWeeklyReviewMeetingContent(existing?.content||'');
  parsed.item_comments=mergeWeeklyReviewItemComments(parsed.item_comments||[],draft)
    .map(serializeWeeklyReviewItemComment)
    .filter(Boolean);
  const content=stringifyWeeklyReviewMeetingContent(parsed);
  const nowIso=new Date().toISOString();
  const body={week_start:weekStart,member_name:existing?.member_name||memberName,content,updated_at:nowIso};
  if(existing?.id){
    await api('PATCH','weekly_reviews?id=eq.'+existing.id,body);
    existing.content=content;
    existing.updated_at=nowIso;
  }else{
    await api('POST','weekly_reviews',{...body,created_by:currentUser?.id||null});
  }
  weeklyReviewDraftItemCommentsByWeek[String(weekStart)]=[];
}

async function loadWeeklyReviewOpenFollowupComments(limit=120){
  const rows=await api('GET','weekly_reviews?select=*&order=week_start.desc,created_at.desc&limit='+Number(limit||120)).catch(()=>[]);
  return mergeWeeklyReviewItemComments(
    (Array.isArray(rows)?rows:[]).flatMap(review=>
      (parseWeeklyReviewMeetingContent(review?.content||'').item_comments||[])
        .map(comment=>({...comment,_week_start:review?.week_start||null,_review_id:review?.id||null}))
    )
  ).filter(comment=>comment.followup_required&&String(comment.status||'open')==='open');
}

function refreshWeeklyReviewCurrentMarkup(){
  if(!weeklyReviewLastRenderPayload)return;
  const el=document.getElementById('pageWeeklyReview');
  if(!el)return;
  el.innerHTML=renderWeeklyReviewPageMarkup(
    weeklyReviewLastRenderPayload.rangeLabel,
    weeklyReviewLastRenderPayload.navLabel,
    weeklyReviewLastRenderPayload.data.cards,
    weeklyReviewLastRenderPayload.data.sections,
    weeklyReviewLastRenderPayload.data._snapshotMeta,
    weeklyReviewLastRenderPayload.data
  );
  applyWeeklyReviewEmptyStateLabels();
}

async function completeWeeklyReviewItemComment(commentKey,weekStart='',reviewId=''){
  const targetKey=String(commentKey||'').trim();
  if(!targetKey)return;
  const nowIso=new Date().toISOString();
  const draftWeekKeys=weekStart?[String(weekStart)]:Object.keys(weeklyReviewDraftItemCommentsByWeek||{});
  let updatedDraft=false;
  draftWeekKeys.forEach(key=>{
    const comments=getWeeklyReviewDraftItemComments(key);
    comments.forEach((comment,index)=>{
      const normalized=normalizeWeeklyReviewItemComment(comment);
      if(normalized&&getWeeklyReviewItemCommentMergeKey(normalized)===targetKey){
        comments[index]={...normalized,status:'done',resolved_at:nowIso};
        updatedDraft=true;
      }
    });
  });
  if(updatedDraft){
    closeModal();
    refreshWeeklyReviewCurrentMarkup();
    showWeeklyReviewToast('팔로업을 완료 처리했습니다.');
    return;
  }

  const rowQuery=reviewId
    ?'weekly_reviews?id=eq.'+encodeURIComponent(reviewId)+'&select=*&limit=1'
    :(weekStart
      ?'weekly_reviews?week_start=eq.'+encodeURIComponent(weekStart)+'&select=*&order=created_at.desc'
      :'weekly_reviews?select=*&order=week_start.desc,created_at.desc&limit=120');
  const rows=await api('GET',rowQuery).catch(error=>{
    console.error('[weekly-review] followup load failed',error);
    return [];
  });
  const reviewRows=Array.isArray(rows)?rows:[rows].filter(Boolean);
  for(const review of reviewRows){
    const parsed=parseWeeklyReviewMeetingContent(review?.content||'');
    let changed=false;
    const nextComments=(parsed.item_comments||[]).map(comment=>{
      const normalized=normalizeWeeklyReviewItemComment({...comment,_week_start:review?.week_start||null,_review_id:review?.id||null});
      if(normalized&&getWeeklyReviewItemCommentMergeKey(normalized)===targetKey){
        changed=true;
        return serializeWeeklyReviewItemComment({...normalized,status:'done',resolved_at:nowIso});
      }
      return serializeWeeklyReviewItemComment(comment);
    }).filter(Boolean);
    if(!changed)continue;
    parsed.item_comments=nextComments;
    const content=stringifyWeeklyReviewMeetingContent(parsed);
    await api('PATCH','weekly_reviews?id=eq.'+review.id,{content,updated_at:nowIso});
    const cached=(weeklyReviewLastRenderPayload?.data?.weeklyReviews||[]).find(item=>String(item?.id||'')===String(review.id));
    if(cached){
      cached.content=content;
      cached.updated_at=nowIso;
    }
    closeModal();
    await renderWeeklyReviewPage(weeklyReviewWeekOffset);
    showWeeklyReviewToast('팔로업을 완료 처리했습니다.');
    return;
  }
  alert('완료 처리할 팔로업을 찾지 못했습니다. 새로고침 후 다시 시도해주세요.');
}
function renderWeeklyReviewMeetingContentBlock(content){
  const value=getWeeklyReviewUnifiedMeetingText(content);
  return '<div style="font-size:12px;color:'+(value?'var(--text2)':'var(--text3)')+';line-height:1.7;white-space:pre-wrap;word-break:break-word">'
    +esc(value||'입력된 회의 메모가 없습니다.')
  +'</div>';
}
function renderWeeklyReviewMeetingFieldGroupMarkup(reviews,key,emptyText,isCurrentWeek=false){
  const isFinalized=weeklyReviewLastRenderPayload?.data?._snapshotMeta?.status==='finalized';
  const isEditable=isCurrentWeek&&!isFinalized;
  const currentReview=(reviews||[]).find(review=>review?.created_by===currentUser?.id)||null;
  const currentParsed=parseWeeklyReviewMeetingContent(currentReview?.content||'');
  const currentValue=getWeeklyReviewUnifiedMeetingText(currentParsed);
  const rows=(reviews||[])
    .map(review=>{
      const value=getWeeklyReviewUnifiedMeetingText(review?.content||'').trim();
      return {review,value};
    })
    .filter(row=>row.value&&(!isEditable||row.review?.created_by!==currentUser?.id));
  if(!isEditable&&!rows.length){
    return '<div class="weekly-review-empty">'+esc(emptyText||'입력된 회의 메모가 없습니다.')+'</div>';
  }
  const editableHtml=isEditable
    ?'<div class="card-sm" style="padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--bg)">'
      +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px">'
        +'<div><div style="font-size:13px;font-weight:800;color:var(--navy)">'+esc(currentReview?.member_name||currentMember?.name||currentUser?.email||'익명')+'</div><div style="font-size:11px;color:var(--text3)">자동저장</div></div>'
      +'</div>'
      +'<textarea id="wr-memo-meeting_notes" class="wr-memo-textarea" rows="7" placeholder="'+esc(emptyText||'')+'" onblur="autoSaveWeeklyReviewMeetingField(this,\'meeting_notes\')">'+esc(currentValue)+'</textarea>'
    +'</div>'
    :'';
  return '<div style="display:flex;flex-direction:column;gap:10px">'
    +editableHtml
    +rows.map(({review,value})=>
      '<div class="card-sm" style="padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--bg)">'
        +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px">'
          +'<div><div style="font-size:13px;font-weight:800;color:var(--navy)">'+esc(review?.member_name||'익명')+'</div><div style="font-size:11px;color:var(--text3)">'+esc(formatCommentDate(review?.updated_at||review?.created_at||''))+'</div></div>'
        +'</div>'
        +'<div style="font-size:12px;color:var(--text2);line-height:1.7;white-space:pre-wrap;word-break:break-word">'+esc(value)+'</div>'
      +'</div>'
    ).join('')
  +'</div>';
}
function renderWeeklyReviewCommentsMarkup(reviews,isCurrentWeek){
  if(!(reviews||[]).length){
    return '<div class="weekly-review-empty">'+(isCurrentWeek?'아직 등록된 회의 메모가 없습니다.':'이 주차에 회의 메모가 없습니다.')+'</div>';
  }
  return '<div style="display:flex;flex-direction:column;gap:10px">'
    +(reviews||[]).map(review=>
      '<div class="card-sm" style="padding:14px;border:1px solid var(--border);border-radius:14px;background:var(--bg)">'
        +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px">'
          +'<div><div style="font-size:13px;font-weight:800;color:var(--navy)">'+esc(review?.member_name||'익명')+'</div><div style="font-size:11px;color:var(--text3)">'+esc(formatCommentDate(review?.updated_at||review?.created_at||''))+'</div></div>'
        +'</div>'
        +'<div style="display:flex;flex-direction:column;gap:8px">'+renderWeeklyReviewMeetingContentBlock(review?.content||'')+'</div>'
      +'</div>'
    ).join('')
  +'</div>';
}
function getWeeklyReviewCurrentUserReview(reviewId=''){
  const reviews=weeklyReviewLastRenderPayload?.data?.weeklyReviews||[];
  const id=String(reviewId||'');
  if(id)return (reviews||[]).find(review=>String(review?.id||'')===id)||null;
  return (reviews||[]).find(review=>review?.created_by===currentUser?.id)||null;
}
function renderWeeklyReviewMeetingTextarea(id,label,value,placeholder='',rows=3){
  return '<div class="form-row">'
    +'<label class="form-label">'+esc(label)+'</label>'
    +'<textarea id="'+esc(id)+'" rows="'+rows+'" style="resize:vertical" placeholder="'+esc(placeholder)+'">'+esc(value||'')+'</textarea>'
  +'</div>';
}
function openWeeklyReviewMeetingMemoModal(reviewId=''){
  const review=getWeeklyReviewCurrentUserReview(reviewId);
  const parsed=parseWeeklyReviewMeetingContent(review?.content||'');
  const modalArea=document.getElementById('modalArea');
  if(!modalArea)return;
  const overlayHtml=typeof getInputModalOverlayHtml==='function'?getInputModalOverlayHtml():'<div class="overlay" data-modal-kind="input" data-backdrop-close="off">';
  const reviewIdValue=String(review?.id||'');
  const reviewIdJs=getWeeklyReviewJsString(reviewIdValue);
  const deleteButtonHtml=reviewIdValue
    ?'<button class="btn ghost" style="color:#B91C1C;border-color:rgba(239,68,68,.22);background:#FFF5F5" onclick="deleteWeeklyReviewMeetingMemo(\''+reviewIdJs+'\')">삭제</button>'
    :'<div class="muted">기존 일반 텍스트 메모는 회의 메모 영역에 그대로 표시됩니다.</div>';
  modalArea.innerHTML=''
    +overlayHtml
    +'<div class="modal ui-modal-600" style="width:600px">'
      +'<div class="modal-header"><div><div class="modal-title">'+(review?'회의 메모 수정':'회의 메모 작성')+'</div><div class="modal-sub">회의 중 기록할 내용, 결정사항, 후속 확인사항을 정리해 주세요.</div></div><button class="icon-btn" onclick="closeModal()">×</button></div>'
      +renderWeeklyReviewMeetingTextarea('weeklyReviewMeetingNotes','회의 메모',getWeeklyReviewUnifiedMeetingText(parsed),'회의 중 논의한 내용을 자유롭게 적어주세요.',8)
      +'<div class="modal-footer"><div>'+deleteButtonHtml+'</div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">취소</button><button class="btn primary" onclick="saveWeeklyReviewMeetingMemo(\''+reviewIdJs+'\')">저장</button></div></div>'
    +'</div></div>';
  if(typeof lockBodyScroll==='function')lockBodyScroll();
  if(typeof bindModalEscapeHandler==='function')bindModalEscapeHandler();
}
async function saveWeeklyReviewMeetingMemo(reviewId=''){
  const existing=getWeeklyReviewCurrentUserReview(reviewId);
  const previousContent=parseWeeklyReviewMeetingContent(existing?.content||'');
  const contentData={
    meeting_notes:document.getElementById('weeklyReviewMeetingNotes')?.value||'',
    decisions:'',
    action_items:'',
    next_week_checks:'',
    item_comments:previousContent.item_comments||[]
  };
  const content=stringifyWeeklyReviewMeetingContent(contentData);
  if(!hasWeeklyReviewMeetingContent(content)){
    alert('저장할 회의 메모 내용을 입력해 주세요.');
    return;
  }
  const nowIso=new Date().toISOString();
  const body={
    week_start:getWeekStart(weeklyReviewWeekOffset),
    member_name:existing?.member_name||currentMember?.name||currentUser?.email||'익명',
    content,
    updated_at:nowIso
  };
  try{
    if(existing?.id){
      await api('PATCH','weekly_reviews?id=eq.'+existing.id,body);
    }else{
      await api('POST','weekly_reviews',{...body,created_by:currentUser?.id||null});
    }
    closeModal();
    await renderWeeklyReviewPage(weeklyReviewWeekOffset);
  }catch(error){
    console.error('[weekly-review] weekly_reviews save failed',error);
    alert('회의 메모 저장에 실패했습니다. 권한 또는 네트워크 상태를 확인해 주세요.');
  }
}
async function deleteWeeklyReviewMeetingMemo(reviewId=''){
  const existing=getWeeklyReviewCurrentUserReview(reviewId);
  if(!existing?.id||existing?.created_by!==currentUser?.id){
    alert('삭제할 회의 메모를 찾지 못했습니다.');
    return;
  }
  if(!confirm('이 주간 회의 메모를 삭제할까요? 삭제 후에는 복구할 수 없습니다.'))return;
  try{
    await api('DELETE','weekly_reviews?id=eq.'+existing.id);
    closeModal();
    await renderWeeklyReviewPage(weeklyReviewWeekOffset);
  }catch(error){
    console.error('[weekly-review] weekly_reviews delete failed',error);
    alert('회의 메모 삭제에 실패했습니다.');
  }
}
/* ── Inline meeting memo edit ── */
function getWeeklyReviewCachedReviews(){
  return weeklyReviewLastRenderPayload?.data?.weeklyReviews||[];
}
function getWeeklyReviewCachedKudosVotes(){
  return weeklyReviewLastRenderPayload?.data?.kudosVotes||[];
}
function renderWeeklyReviewMeetingInlineForm(review){
  const parsed=parseWeeklyReviewMeetingContent(review?.content||'');
  const fields=[
    {key:'meeting_notes',label:'회의 메모',rows:8,placeholder:'회의 중 논의한 내용을 자유롭게 적어주세요.',value:getWeeklyReviewUnifiedMeetingText(parsed)}
  ];
  return '<div class="wr-meeting-inline-form">'
    +fields.map(f=>'<div class="wr-meeting-inline-field"><div class="wr-meeting-inline-label">'+esc(f.label)+'</div><textarea id="wrMemo_'+f.key+'" class="wr-meeting-inline-textarea" rows="'+f.rows+'" placeholder="'+esc(f.placeholder)+'">'+esc(f.value||'')+'</textarea></div>').join('')
  +'</div>';
}
function buildWeeklyReviewCommentsSectionData(){
  const reviews=getWeeklyReviewCachedReviews();
  const kudosVotes=getWeeklyReviewCachedKudosVotes();
  const isCurrentWeek=weeklyReviewWeekOffset===0;
  const myReview=(reviews||[]).find(r=>r?.created_by===currentUser?.id)||null;
  let actionsHtml='';
  const reviewIdJs=myReview?.id?getWeeklyReviewJsString(String(myReview.id)):'';
  const deleteHtml=myReview?.id?'<button type="button" class="btn ghost sm" style="color:#B91C1C;border-color:rgba(239,68,68,.22);background:#FFF5F5" onclick="deleteWeeklyReviewMeetingMemoInline(\''+reviewIdJs+'\')">삭제</button>':'';
  if(isCurrentWeek){
    actionsHtml=deleteHtml||'';
  }
  const contentHtml=renderWeeklyReviewKudosSummaryMarkup(kudosVotes)+renderWeeklyReviewCommentsMarkup(reviews,isCurrentWeek);
  return {
    id:'comments',
    title:'주간 코멘트',
    sub:'weekly_reviews와 칭찬사원 결과를 함께 확인합니다.',
    actionsHtml,
    collapsedSummary:'팀 코멘트 '+(reviews||[]).length+'건',
    groups:[{title:'이번 주 팀 한마디',variant:'html',items:reviews,html:contentHtml}]
  };
}
function enterWeeklyReviewMeetingEditMode(){}
function cancelWeeklyReviewMeetingEditMode(){}
async function saveWeeklyReviewMeetingMemoInline(){
  const reviews=getWeeklyReviewCachedReviews();
  const existing=(reviews||[]).find(r=>r?.created_by===currentUser?.id)||null;
  const previousContent=parseWeeklyReviewMeetingContent(existing?.content||'');
  const contentData={
    meeting_notes:document.getElementById('wrMemo_meeting_notes')?.value||'',
    decisions:'',
    action_items:'',
    next_week_checks:'',
    item_comments:previousContent.item_comments||[]
  };
  const content=stringifyWeeklyReviewMeetingContent(contentData);
  if(!hasWeeklyReviewMeetingContent(content)){alert('저장할 회의 메모 내용을 입력해 주세요.');return;}
  const nowIso=new Date().toISOString();
  const body={
    week_start:getWeekStart(weeklyReviewWeekOffset),
    member_name:existing?.member_name||currentMember?.name||currentUser?.email||'익명',
    content,
    updated_at:nowIso
  };
  try{
    if(existing?.id){
      await api('PATCH','weekly_reviews?id=eq.'+existing.id,body);
    }else{
      await api('POST','weekly_reviews',{...body,created_by:currentUser?.id||null});
    }
    weeklyReviewMeetingEditMode=false;
    await renderWeeklyReviewPage(weeklyReviewWeekOffset);
  }catch(error){
    console.error('[weekly-review] weekly_reviews save failed',error);
    alert('회의 메모 저장에 실패했습니다. 권한 또는 네트워크 상태를 확인해 주세요.');
  }
}
async function deleteWeeklyReviewMeetingMemoInline(reviewId){
  const reviews=getWeeklyReviewCachedReviews();
  const existing=(reviews||[]).find(r=>String(r?.id||'')===String(reviewId||''))||null;
  if(!existing?.id||existing?.created_by!==currentUser?.id){alert('삭제할 회의 메모를 찾지 못했습니다.');return;}
  if(!confirm('이 주간 회의 메모를 삭제할까요? 삭제 후에는 복구할 수 없습니다.'))return;
  try{
    await api('DELETE','weekly_reviews?id=eq.'+existing.id);
    weeklyReviewMeetingEditMode=false;
    await renderWeeklyReviewPage(weeklyReviewWeekOffset);
  }catch(error){
    console.error('[weekly-review] weekly_reviews delete failed',error);
    alert('회의 메모 삭제에 실패했습니다.');
  }
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
let weeklyReviewProjectTaskRefreshPending=false;
function getWeeklyReviewJsString(value){
  return String(value??'').replace(/\\/g,'\\\\').replace(/'/g,"\\'").replace(/\r/g,'\\r').replace(/\n/g,'\\n');
}
async function openWeeklyReviewProjectTaskModal(projectId,taskId){
  const projectKey=String(projectId||'');
  const taskKey=String(taskId||'');
  if(!projectKey||!taskKey){
    alert('업무 정보를 찾지 못했습니다.');
    return;
  }
  if(typeof loadGanttProjectTasks==='function'){
    await loadGanttProjectTasks(projectKey,true);
  }
  if(typeof openProjectTaskModal==='function'){
    const taskExists=typeof getGanttProjectTasks==='function'
      ?((getGanttProjectTasks(projectKey)||[]).some(task=>String(task?.id||'')===taskKey)||!!getWeeklyReviewTaskFromCache(projectKey,taskKey))
      :true;
    if(!taskExists){
      alert('업무 상세 정보를 불러오지 못했습니다.');
      return;
    }
    openWeeklyReviewTaskDetailPanel(projectKey,taskKey);
    return;
  }
  openWeeklyReviewTaskDetailPanel(projectKey,taskKey);
}

async function openWeeklyReviewProjectTaskEditModal(projectId,taskId){
  const projectKey=String(projectId||'');
  const taskKey=String(taskId||'');
  if(!projectKey||!taskKey){alert('업무 정보를 찾지 못했습니다.');return;}
  if(typeof loadGanttProjectTasks==='function')await loadGanttProjectTasks(projectKey,true);
  if(typeof openProjectTaskModal==='function'){
    weeklyReviewProjectTaskRefreshPending=true;
    openProjectTaskModal(projectKey,taskKey);
    return;
  }
  alert('업무 수정 화면을 열 수 없습니다.');
}

function getWeeklyReviewTaskFromCache(projectId,taskId){
  const projectKey=String(projectId||'');
  const taskKey=String(taskId||'');
  return (typeof getGanttProjectTasks==='function'?(getGanttProjectTasks(projectKey)||[]):[])
    .find(task=>String(task?.id||'')===taskKey)
    ||(weeklyReviewLastRenderPayload?.data?.taskRows||[])
      .find(task=>String(task?.id||'')===taskKey)
    ||null;
}

function getWeeklyReviewTaskRelatedIssues(task){
  const taskId=String(task?.id||'');
  const projectId=String(task?.project_id||'');
  return (weeklyReviewLastRenderPayload?.data?._rawIssues||[])
    .filter(issue=>
      String(issue?.task_id||'')===taskId
      ||(!String(issue?.task_id||'').trim()&&projectId&&String(issue?.project_id||'')===projectId)
    )
    .slice(0,5);
}

function getWeeklyReviewTaskRelatedOutputs(task){
  const taskId=String(task?.id||'');
  const projectId=String(task?.project_id||'');
  return (weeklyReviewLastRenderPayload?.data?.projectOutputs||[])
    .filter(output=>
      String(output?.task_id||'')===taskId
      ||(!String(output?.task_id||'').trim()&&projectId&&String(output?.project_id||'')===projectId)
    )
    .slice(0,5);
}

function renderWeeklyReviewTaskDetailField(label,value,tone=''){
  return '<div class="wr-task-detail-field">'
    +'<span>'+esc(label)+'</span>'
    +'<strong class="'+(tone?'is-'+esc(tone):'')+'">'+esc(value||'-')+'</strong>'
  +'</div>';
}

function renderWeeklyReviewTaskDetailIssues(task,projectId){
  const issues=getWeeklyReviewTaskRelatedIssues(task);
  if(!issues.length)return '<div class="wr-task-detail-empty">관련 이슈 없음</div>';
  return '<div class="wr-task-detail-list">'
    +issues.map(issue=>
      '<button type="button" class="wr-task-detail-list-item" onclick="openIssueModal(\''+getWeeklyReviewJsString(issue?.project_id||projectId||'')+'\',\''+getWeeklyReviewJsString(issue?.id||'')+'\')">'
        +'<span class="badge '+(issue?.is_pinned||String(issue?.priority||'')==='high'?'badge-red':'badge-blue')+'">'+esc(issue?.is_pinned?'고정':formatWeeklyReviewPriorityLabel(issue?.priority))+'</span>'
        +'<strong>'+esc(issue?.title||'제목 없는 이슈')+'</strong>'
        +'<em>'+esc(issue?.assignee_name||issue?.owner_name||'담당자 미정')+'</em>'
      +'</button>'
    ).join('')
  +'</div>';
}

function renderWeeklyReviewTaskDetailOutputs(task){
  const outputs=getWeeklyReviewTaskRelatedOutputs(task);
  if(!outputs.length)return '<div class="wr-task-detail-empty">관련 산출물 없음</div>';
  return '<div class="wr-task-detail-list">'
    +outputs.map(output=>
      '<button type="button" class="wr-task-detail-list-item" onclick="openWeeklyReviewOutputUrl(\''+getWeeklyReviewJsString(output?.onedrive_url||'')+'\')">'
        +'<span class="badge badge-blue">산출물</span>'
        +'<strong>'+esc(output?.title||'산출물 링크')+'</strong>'
        +'<em>'+esc(formatCommentDate(output?.created_at||''))+'</em>'
      +'</button>'
    ).join('')
  +'</div>';
}

function renderWeeklyReviewTaskDetailComments(task){
  const target={entity_type:'task',entity_id:String(task?.id||''),project_id:String(task?.project_id||''),task_id:String(task?.id||'')};
  const comments=getWeeklyReviewCommentsForTarget(target);
  return '<div class="wr-task-detail-comments">'
    +'<div class="wr-task-detail-section-head"><strong>회의 코멘트</strong>'+renderWeeklyReviewItemCommentButton(target)+'</div>'
    +(comments.length
      ?'<div class="wr-task-detail-comment-list">'+comments.map(renderWeeklyReviewItemCommentDetailRow).join('')+'</div>'
      :'<div class="wr-task-detail-empty">이번 주 회의 코멘트 없음</div>')
  +'</div>';
}

function renderWeeklyReviewTaskDetailFollowups(task){
  const taskKey=String(task?.id||'');
  const comments=mergeWeeklyReviewItemComments(
    weeklyReviewLastRenderPayload?.data?._openFollowupComments||[],
    getWeeklyReviewAllItemComments()
  ).filter(comment=>
    comment.entity_type==='task'
    &&String(comment.entity_id||'')===taskKey
    &&comment.followup_required
    &&String(comment.status||'open')==='open'
  );
  if(!comments.length)return '<div class="wr-task-detail-empty">미해결 팔로업 없음</div>';
  return '<div class="wr-task-detail-list">'
    +comments.map(comment=>
      '<div class="wr-task-detail-list-item">'
        +'<span class="badge badge-blue">팔로업</span>'
        +(comment._week_start?'<em>'+esc(comment._week_start)+'</em>':'')
        +'<strong>'+esc(truncateText(comment.comment,96))+'</strong>'
        +'<button type="button" class="btn sm" onclick="completeWeeklyReviewItemComment(\''+getWeeklyReviewJsString(getWeeklyReviewItemCommentMergeKey(comment))+'\',\''+getWeeklyReviewJsString(comment._week_start||getWeeklyReviewCurrentWeekStart())+'\',\''+getWeeklyReviewJsString(comment._review_id||'')+'\')">완료 처리</button>'
      +'</div>'
    ).join('')
  +'</div>';
}

function openWeeklyReviewTaskDetailPanel(projectId,taskId){
  const projectKey=String(projectId||'');
  const taskKey=String(taskId||'');
  const task=getWeeklyReviewTaskFromCache(projectKey,taskKey);
  const project=getWeeklyReviewProjectById(projectKey||task?.project_id);
  if(!task||!project){alert('업무 상세 정보를 찾지 못했습니다.');return;}
  const client=getWeeklyReviewProjectClient(project);
  const dueMeta=getWeeklyReviewTaskDueMeta(task);
  const isOverdue=isWeeklyReviewTaskOverdue(task);
  const waitingReason=getWeeklyReviewTaskWaitingReason(task);
  const projectIdJs=getWeeklyReviewJsString(project?.id||projectKey);
  const taskIdJs=getWeeklyReviewJsString(task?.id||taskKey);
  document.getElementById('modalArea').innerHTML=
    getInputModalOverlayHtml()
    +'<div class="modal wr-task-detail-modal">'
      +'<div class="modal-header">'
        +'<div>'
          +'<div class="modal-title">회의용 업무 상세</div>'
          +'<div class="modal-sub">'+esc(client?.name||'거래처 미지정')+' &gt; <button type="button" class="wr-task-project-link" onclick="closeModal();openProjModal(\''+projectIdJs+'\',null,null,\'work\')">'+esc(project?.name||'프로젝트 미지정')+'</button></div>'
        +'</div>'
        +'<button class="icon-btn" onclick="closeModal()">×</button>'
      +'</div>'
      +'<div class="wr-task-detail-hero">'
        +renderWeeklyReviewTaskBreadcrumb(task,project)
        +'<h3>'+esc(task?.title||'제목 없는 업무')+'</h3>'
        +'<div class="wr-task-card-meta">'
          +'<span>'+esc(getWeeklyReviewTaskAssigneeLabel(task))+'</span>'
          +'<span class="'+(isOverdue?'is-danger':'')+'">'+esc(isOverdue?'지연':'정상')+'</span>'
          +'<span>'+esc(getWeeklyReviewTaskStatusLabel(task))+'</span>'
        +'</div>'
      +'</div>'
      +'<div class="wr-task-detail-grid">'
        +renderWeeklyReviewTaskDetailField('거래처',client?.name||'거래처 미지정')
        +renderWeeklyReviewTaskDetailField('프로젝트',project?.name||'프로젝트 미지정')
        +renderWeeklyReviewTaskDetailField('담당자',getWeeklyReviewTaskAssigneeLabel(task))
        +renderWeeklyReviewTaskDetailField('상태',getWeeklyReviewTaskStatusLabel(task))
        +renderWeeklyReviewTaskDetailField('우선순위',formatWeeklyReviewPriorityLabel(task?.priority))
        +renderWeeklyReviewTaskDetailField('시작일',task?.start_date||'시작일 없음')
        +renderWeeklyReviewTaskDetailField('마감일',task?.due_date||'마감일 없음',dueMeta.tone==='danger'?'danger':dueMeta.tone==='warn'?'warn':'')
        +renderWeeklyReviewTaskDetailField('완료일',getWeeklyReviewTaskCompletedDateLabel(task))
        +renderWeeklyReviewTaskDetailField('지연 여부',isOverdue?('지연 '+Math.abs(dueMeta.days||0)+'일'):'아님',isOverdue?'danger':'')
        +renderWeeklyReviewTaskDetailField('대기 사유',waitingReason||'없음',waitingReason?'warn':'')
      +'</div>'
      +(task?.description?'<div class="wr-task-detail-note">'+esc(task.description)+'</div>':'')
      +'<div class="wr-task-detail-columns">'
        +'<section><div class="wr-task-detail-section-head"><strong>관련 이슈</strong></div>'+renderWeeklyReviewTaskDetailIssues(task,project?.id)+'</section>'
        +'<section><div class="wr-task-detail-section-head"><strong>관련 산출물</strong></div>'+renderWeeklyReviewTaskDetailOutputs(task)+'</section>'
      +'</div>'
      +renderWeeklyReviewTaskDetailComments(task)
      +'<section class="wr-task-detail-followups"><div class="wr-task-detail-section-head"><strong>미해결 팔로업</strong></div>'+renderWeeklyReviewTaskDetailFollowups(task)+'</section>'
      +'<div class="modal-footer"><div class="muted">회의용 상세는 원본 업무를 직접 수정하지 않습니다.</div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">닫기</button><button class="btn primary" onclick="openWeeklyReviewProjectTaskEditModal(\''+projectIdJs+'\',\''+taskIdJs+'\')">업무 수정</button></div></div>'
    +'</div></div>';
  lockBodyScroll();
  bindModalEscapeHandler();
}
async function getWeeklyReviewProjectOutputs(weekStart){
  if(!weekStart)return [];
  try{
    return await api('GET',WEEKLY_REVIEW_OUTPUT_TABLE+'?week_start=eq.'+weekStart+'&select=*&order=created_at.desc')||[];
  }catch(error){
    console.error('[weekly-review] project_outputs select failed',error);
    return [];
  }
}
function getWeeklyReviewOutputProject(output){
  return (projects||[]).find(project=>String(project?.id||'')===String(output?.project_id||''))||null;
}
function getWeeklyReviewOutputTask(output,taskRowsOverride=null){
  const taskRows=Array.isArray(taskRowsOverride)?taskRowsOverride:(weeklyReviewLastRenderPayload?.data?.taskRows||[]);
  return (taskRows||[]).find(task=>String(task?.id||'')===String(output?.task_id||''))||null;
}
function getWeeklyReviewOutputAuthorLabel(output){
  const authorId=String(output?.author_id||'');
  if(authorId&&currentUser?.id&&authorId===String(currentUser.id))return currentMember?.name||currentUser?.email||'나';
  const member=(members||[]).find(item=>String(item?.auth_user_id||'')===authorId||String(item?.id||'')===authorId);
  return member?.name||output?.author_name||'작성자 미확인';
}
function canManageWeeklyReviewOutput(output){
  if(!output?.id)return false;
  if(typeof roleIsAdmin==='function'&&roleIsAdmin())return true;
  return !!(currentUser?.id&&String(output?.author_id||'')===String(currentUser.id));
}
function getWeeklyReviewOutputById(outputId){
  const key=String(outputId||'');
  if(!key)return null;
  return (weeklyReviewLastRenderPayload?.data?.projectOutputs||[]).find(output=>String(output?.id||'')===key)||null;
}
function normalizeWeeklyReviewOutputUrl(url){
  const raw=String(url||'').trim();
  if(!raw)return '';
  return /^https?:\/\//i.test(raw)?raw:'https://'+raw;
}
function getWeeklyReviewApiErrorDetail(error){
  const raw=String(error?.message||error?.code||error||'').trim();
  if(!raw)return '';
  try{
    const parsed=JSON.parse(raw);
    return [
      parsed.message,
      parsed.code?'code: '+parsed.code:'',
      parsed.details,
      parsed.hint
    ].filter(Boolean).join(' / ');
  }catch(parseError){
    return raw;
  }
}
function openWeeklyReviewOutputUrl(url){
  const normalized=normalizeWeeklyReviewOutputUrl(url);
  if(!normalized){
    alert('열 수 있는 링크가 없습니다.');
    return;
  }
  window.open(normalized,'_blank','noopener,noreferrer');
}
function getWeeklyReviewOutputQcBadges(output){
  const status=String(output?.qc_status||'none').trim();
  const statusMeta={
    requested:{label:'QC 요청중',cls:'badge-orange'},
    revision_requested:{label:'수정요청',cls:'badge-red'},
    approved:{label:'승인완료',cls:'badge-green'}
  }[status];
  const badges=[];
  if(statusMeta)badges.push('<span class="badge '+statusMeta.cls+'">'+statusMeta.label+'</span>');
  if(output?.requires_partner_review)badges.push('<span class="wr-output-badge is-partner">파트너 리뷰 필요</span>');
  return badges.join('');
}
function renderWeeklyReviewOutputToggle(output){
  const outputId=String(output?.id||'');
  if(!outputId)return '';
  return '<label class="wr-output-toggle" title="회의 포함 여부">'
    +'<input type="checkbox" '+(output?.share_in_weekly_review?'checked':'')+' onchange="toggleWeeklyReviewOutputIncluded(\''+getWeeklyReviewJsString(outputId)+'\',this.checked)">'
    +'<span>회의 포함</span>'
  +'</label>';
}
async function toggleWeeklyReviewOutputIncluded(outputId,checked){
  const key=String(outputId||'');
  if(!key)return;
  try{
    await api('PATCH',WEEKLY_REVIEW_OUTPUT_TABLE+'?id=eq.'+key,{share_in_weekly_review:!!checked});
    const rows=weeklyReviewLastRenderPayload?.data?.projectOutputs;
    if(Array.isArray(rows)){
      const idx=rows.findIndex(output=>String(output?.id||'')===key);
      if(idx!==-1)rows[idx]={...rows[idx],share_in_weekly_review:!!checked};
    }
    await renderWeeklyReviewPage(weeklyReviewWeekOffset);
  }catch(error){
    alert('회의 포함 여부 저장에 실패했습니다. '+(error?.message||error));
    await renderWeeklyReviewPage(weeklyReviewWeekOffset);
  }
}
function renderWeeklyReviewOutputTaskOptions(projectId,selectedTaskId=''){
  const taskRows=weeklyReviewLastRenderPayload?.data?.taskRows||[];
  const rows=(taskRows||[]).filter(task=>String(task?.project_id||'')===String(projectId||''));
  const selectedTask=selectedTaskId
    ? (taskRows||[]).find(task=>String(task?.id||'')===String(selectedTaskId||''))
    : null;
  const missingSelectedTask=selectedTaskId&&!rows.some(task=>String(task?.id||'')===String(selectedTaskId||''));
  return '<option value="">태스크 선택 안 함</option>'
    +(missingSelectedTask?'<option value="'+esc(selectedTaskId)+'" selected>'+(selectedTask?esc(selectedTask.title||'제목 없는 태스크'):'삭제된 태스크')+'</option>':'')
    +rows.map(task=>'<option value="'+esc(task?.id||'')+'"'+(String(task?.id||'')===String(selectedTaskId||'')?' selected':'')+'>'+esc(task?.title||'제목 없는 태스크')+'</option>').join('');
}
let weeklyOutputProjectCombobox=null;
let weeklyOutputTaskCombobox=null;

function getWeeklyOutputProjectClientName(project){
  return (clients||[]).find(client=>String(client?.id||'')===String(project?.client_id||''))?.name||'';
}

function getWeeklyOutputProjectContractText(project){
  const contract=(contracts||[]).find(row=>String(row?.id||'')===String(project?.contract_id||''))||null;
  if(!contract)return '';
  return [contract.contract_name||contract.title||contract.name||'',contract.contract_code||contract.contract_no||''].filter(Boolean).join(' ');
}

function getWeeklyOutputProjectSubLabel(project){
  const parts=[];
  const clientName=getWeeklyOutputProjectClientName(project);
  if(clientName)parts.push(clientName);
  if(Array.isArray(project?.members)&&project.members.length)parts.push(project.members.join(', '));
  if(project?.status)parts.push(project.status);
  const endDate=project?.end_date||project?.end;
  if(endDate)parts.push('마감 '+endDate);
  return parts.join(' · ');
}

function getWeeklyOutputProjectSearchText(project){
  return [
    project?.name,
    getWeeklyOutputProjectClientName(project),
    Array.isArray(project?.members)?project.members.join(' '):'',
    project?.status,
    project?.service_type,
    project?.type,
    project?.project_code,
    project?.code,
    getWeeklyOutputProjectContractText(project)
  ].filter(Boolean).join(' ');
}

function getWeeklyOutputProjectItems(selectedProjectId=''){
  const rows=[...(projects||[])].sort((a,b)=>String(a?.name||'').localeCompare(String(b?.name||''),'ko'));
  const selectedKey=String(selectedProjectId||'');
  if(selectedKey&&!rows.some(project=>String(project?.id||'')===selectedKey)){
    rows.unshift({id:selectedKey,name:'삭제된 프로젝트'});
  }
  return rows;
}

function mountWeeklyOutputProjectCombobox(selectedProjectId=''){
  const mount=document.getElementById('weeklyOutputProjectCombo');
  if(!mount||typeof createCombobox!=='function')return;
  if(weeklyOutputProjectCombobox&&typeof weeklyOutputProjectCombobox.destroy==='function'){
    weeklyOutputProjectCombobox.destroy();
  }
  weeklyOutputProjectCombobox=createCombobox({
    mount,
    items:getWeeklyOutputProjectItems(selectedProjectId),
    getLabel:item=>item?.name||'프로젝트명 없음',
    getSubLabel:getWeeklyOutputProjectSubLabel,
    getSearchText:getWeeklyOutputProjectSearchText,
    getValue:item=>item?.id||'',
    value:selectedProjectId||'',
    placeholder:'프로젝트명을 입력하세요',
    disabled:false,
    required:true,
    maxItems:10,
    allowClear:true,
    onSelect:()=>updateWeeklyReviewOutputTaskOptions(),
    onClear:()=>updateWeeklyReviewOutputTaskOptions()
  });
}

function getWeeklyOutputProjectIdFromForm(){
  if(weeklyOutputProjectCombobox&&typeof weeklyOutputProjectCombobox.getValue==='function'){
    return weeklyOutputProjectCombobox.getValue()||'';
  }
  return document.getElementById('weeklyOutputProject')?.value||'';
}

function validateWeeklyOutputProjectSelection(){
  if(weeklyOutputProjectCombobox&&typeof weeklyOutputProjectCombobox.hasUncommittedText==='function'&&weeklyOutputProjectCombobox.hasUncommittedText()){
    alert('목록에서 프로젝트를 선택해 주세요.');
    weeklyOutputProjectCombobox.input?.focus();
    return false;
  }
  return true;
}

function getWeeklyOutputTaskProjectName(task){
  const project=(projects||[]).find(row=>String(row?.id||'')===String(task?.project_id||''))||null;
  return project?.name||'';
}

function getWeeklyOutputTaskAssigneeName(task){
  return (members||[]).find(member=>String(member?.id||'')===String(task?.assignee_member_id||''))?.name||'';
}

function getWeeklyOutputTaskItems(projectId){
  const taskRows=weeklyReviewLastRenderPayload?.data?.taskRows||[];
  const projectKey=String(projectId||'');
  if(!projectKey)return [];
  return (taskRows||[])
    .filter(task=>String(task?.project_id||'')===projectKey)
    .sort((a,b)=>String(a?.title||a?.name||'').localeCompare(String(b?.title||b?.name||''),'ko'));
}

function getWeeklyOutputTaskSubLabel(task){
  return [
    getWeeklyOutputTaskAssigneeName(task),
    task?.status,
    task?.priority,
    task?.due_date?('마감 '+task.due_date):''
  ].filter(Boolean).join(' · ');
}

function getWeeklyOutputTaskSearchText(task){
  return [
    task?.title,
    task?.name,
    task?.status,
    task?.priority,
    getWeeklyOutputTaskAssigneeName(task),
    task?.due_date,
    getWeeklyOutputTaskProjectName(task)
  ].filter(Boolean).join(' ');
}

function mountWeeklyOutputTaskCombobox(selectedTaskId=''){
  const mount=document.getElementById('weeklyOutputTaskCombo');
  if(!mount||typeof createCombobox!=='function')return;
  if(weeklyOutputTaskCombobox&&typeof weeklyOutputTaskCombobox.destroy==='function'){
    weeklyOutputTaskCombobox.destroy();
  }
  const projectId=getWeeklyOutputProjectIdFromForm();
  const taskItems=getWeeklyOutputTaskItems(projectId);
  const validTaskId=taskItems.some(task=>String(task?.id||'')===String(selectedTaskId||''))?selectedTaskId:'';
  weeklyOutputTaskCombobox=createCombobox({
    mount,
    items:taskItems,
    getLabel:item=>item?.title||item?.name||'제목 없는 태스크',
    getSubLabel:getWeeklyOutputTaskSubLabel,
    getSearchText:getWeeklyOutputTaskSearchText,
    getValue:item=>item?.id||'',
    value:validTaskId||'',
    placeholder:projectId?'태스크명을 입력하세요':'프로젝트를 먼저 선택하세요',
    disabled:!projectId,
    required:false,
    maxItems:10,
    allowClear:true
  });
}

function getWeeklyOutputTaskIdFromForm(){
  if(weeklyOutputTaskCombobox&&typeof weeklyOutputTaskCombobox.getValue==='function'){
    return weeklyOutputTaskCombobox.getValue()||'';
  }
  return document.getElementById('weeklyOutputTask')?.value||'';
}

function validateWeeklyOutputTaskSelection(){
  if(weeklyOutputTaskCombobox&&typeof weeklyOutputTaskCombobox.hasUncommittedText==='function'&&weeklyOutputTaskCombobox.hasUncommittedText()){
    alert('목록에서 태스크를 선택해 주세요.');
    weeklyOutputTaskCombobox.input?.focus();
    return false;
  }
  return true;
}

function updateWeeklyReviewOutputTaskOptions(preferredTaskId){
  const currentTaskId=preferredTaskId!==undefined?preferredTaskId:getWeeklyOutputTaskIdFromForm();
  mountWeeklyOutputTaskCombobox(currentTaskId);
}
function openWeeklyReviewOutputModal(outputId=''){
  const modalArea=document.getElementById('modalArea');
  if(!modalArea)return;
  const existing=getWeeklyReviewOutputById(outputId);
  if(outputId&&!existing){
    alert('산출물 링크 정보를 찾지 못했습니다.');
    return;
  }
  if(existing&&!canManageWeeklyReviewOutput(existing)){
    alert('산출물 링크를 수정할 권한이 없습니다.');
    return;
  }
  const isEdit=!!existing?.id;
  const sortedProjects=(projects||[]).slice().sort((a,b)=>String(a?.name||'').localeCompare(String(b?.name||''),'ko'));
  const selectedProjectId=String(existing?.project_id||sortedProjects[0]?.id||'');
  const outputIdJs=getWeeklyReviewJsString(existing?.id||'');
  const selectedTaskId=String(existing?.task_id||'');
  const deleteButtonHtml=isEdit
    ?'<button class="btn ghost" style="color:#B91C1C;border-color:rgba(239,68,68,.22);background:#FFF5F5" onclick="deleteWeeklyReviewOutput(\''+outputIdJs+'\')">삭제</button>'
    :'<div class="muted">링크만 저장하며 문서 내용은 원드라이브에서 관리합니다.</div>';
  const overlayHtml=typeof getInputModalOverlayHtml==='function'?getInputModalOverlayHtml():'<div class="overlay" data-modal-kind="input" data-backdrop-close="off">';
  modalArea.innerHTML=''
    +overlayHtml
    +'<div class="modal ui-modal-540" style="width:540px">'
      +'<div class="modal-header"><div><div class="modal-title">'+(isEdit?'산출물 링크 수정':'산출물 링크 추가')+'</div><div class="modal-sub">이번 주 회의에서 공유할 결과물 위치와 맥락을 등록합니다.</div></div><button class="icon-btn" onclick="closeModal()">×</button></div>'
      +'<div class="form-row"><label class="form-label">관련 프로젝트</label><div id="weeklyOutputProjectCombo"></div></div>'
      +'<div class="form-row"><label class="form-label">관련 태스크 <span style="font-size:10px;color:var(--text3);font-weight:400">선택사항</span></label><div id="weeklyOutputTaskCombo"></div></div>'
      +'<div class="form-row"><label class="form-label">제목</label><input id="weeklyOutputTitle" value="'+esc(existing?.title||'')+'" placeholder="예: 5월 결산 결과보고 초안"/></div>'
      +'<div class="form-row"><label class="form-label">원드라이브 링크</label><input id="weeklyOutputUrl" value="'+esc(existing?.onedrive_url||'')+'" placeholder="https://..."/></div>'
      +'<div class="form-row"><label class="form-label">메모 <span style="font-size:10px;color:var(--text3);font-weight:400">선택사항</span></label><textarea id="weeklyOutputMemo" class="project-modal-memo" rows="3" placeholder="회의에서 설명할 맥락이나 확인 포인트">'+esc(existing?.memo||'')+'</textarea></div>'
      +'<label style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:13px;color:var(--text2);font-weight:700"><input id="weeklyOutputShare" type="checkbox" '+(existing?.share_in_weekly_review===false?'':'checked')+'/> 이번 주 회의에서 공유</label>'
      +'<div class="modal-footer"><div>'+deleteButtonHtml+'</div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">취소</button><button class="btn primary" onclick="saveWeeklyReviewOutput(\''+outputIdJs+'\')">저장</button></div></div>'
    +'</div></div>';
  mountWeeklyOutputProjectCombobox(selectedProjectId);
  mountWeeklyOutputTaskCombobox(selectedTaskId);
  if(typeof lockBodyScroll==='function')lockBodyScroll();
  if(typeof bindModalEscapeHandler==='function')bindModalEscapeHandler();
}
async function saveWeeklyReviewOutput(outputId=''){
  const existing=getWeeklyReviewOutputById(outputId);
  if(outputId&&(!existing||!canManageWeeklyReviewOutput(existing))){
    alert('산출물 링크를 수정할 권한이 없습니다.');
    return;
  }
  if(!validateWeeklyOutputProjectSelection())return;
  if(!validateWeeklyOutputTaskSelection())return;
  const projectId=String(getWeeklyOutputProjectIdFromForm()||'').trim();
  const taskId=String(getWeeklyOutputTaskIdFromForm()||'').trim();
  const title=String(document.getElementById('weeklyOutputTitle')?.value||'').trim();
  const onedriveUrl=String(document.getElementById('weeklyOutputUrl')?.value||'').trim();
  const memo=String(document.getElementById('weeklyOutputMemo')?.value||'').trim();
  const shareInWeeklyReview=!!document.getElementById('weeklyOutputShare')?.checked;
  if(!projectId){
    alert('관련 프로젝트를 선택해 주세요.');
    return;
  }
  if(!title){
    alert('산출물 제목을 입력해 주세요.');
    return;
  }
  if(!onedriveUrl){
    alert('원드라이브 링크를 입력해 주세요.');
    return;
  }
  const body={
    project_id:projectId,
    task_id:taskId||null,
    title,
    onedrive_url:onedriveUrl,
    memo:memo||null,
    share_in_weekly_review:shareInWeeklyReview
  };
  try{
    if(existing){
      await api('PATCH',WEEKLY_REVIEW_OUTPUT_TABLE+'?id=eq.'+existing.id,body);
    }else{
      await api('POST',WEEKLY_REVIEW_OUTPUT_TABLE,{
        ...body,
        week_start:getWeekStart(weeklyReviewWeekOffset),
        author_id:currentUser?.id||null
      });
    }
    closeModal();
    await renderWeeklyReviewPage(weeklyReviewWeekOffset);
  }catch(error){
    const detail=getWeeklyReviewApiErrorDetail(error);
    console.error(existing?'[weekly-review] project_outputs update failed':'[weekly-review] project_outputs insert failed',error);
    alert((existing?'산출물 링크 수정에 실패했습니다.':'산출물 링크 저장에 실패했습니다.')+(detail?'\n\n오류: '+detail:''));
  }
}
async function deleteWeeklyReviewOutput(outputId=''){
  const existing=getWeeklyReviewOutputById(outputId);
  if(!existing?.id||!canManageWeeklyReviewOutput(existing)){
    alert('산출물 링크를 삭제할 권한이 없습니다.');
    return;
  }
  if(!confirm('이 산출물 링크를 삭제할까요? 삭제 후에는 복구할 수 없습니다.'))return;
  try{
    await api('DELETE',WEEKLY_REVIEW_OUTPUT_TABLE+'?id=eq.'+existing.id);
    closeModal();
    await renderWeeklyReviewPage(weeklyReviewWeekOffset);
  }catch(error){
    console.error('[weekly-review] project_outputs delete failed',error);
    alert('산출물 링크 삭제에 실패했습니다.');
  }
}
if(typeof saveProjectTask==='function'&&!saveProjectTask.__weeklyReviewRefreshWrapped){
  const saveProjectTaskBase=saveProjectTask;
  saveProjectTask=async function(){
    const shouldRefreshWeeklyReview=weeklyReviewProjectTaskRefreshPending&&curPage==='weeklyReview';
    await saveProjectTaskBase();
    if(shouldRefreshWeeklyReview&&!document.getElementById('taskTitle')){
      weeklyReviewProjectTaskRefreshPending=false;
      await renderWeeklyReviewPage(weeklyReviewWeekOffset);
    }
  };
  saveProjectTask.__weeklyReviewRefreshWrapped=true;
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
  const onclickAttr=item?.action?' onclick="'+item.action+'" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();'+item.action+';}"':'';
  const contextHtml=item?.contextLabel?'<div class="weekly-review-item-meta weekly-review-item-context">'+esc(item.contextLabel)+'</div>':'';
  const commentTarget=getWeeklyReviewCommentTargetFromItem(item);
  const preTitleHtml=item?.preTitleHtml||'';
  const taskCardHtml=item?.taskCardHtml||'';
  return '<div role="button" tabindex="0" class="weekly-review-item"'+onclickAttr+'>'
    +'<div class="weekly-review-item-main">'
      +contextHtml
      +preTitleHtml
      +'<div class="weekly-review-item-title">'+esc(item?.title||'-')+'</div>'
      +(item?.meta?'<div class="weekly-review-item-meta">'+esc(item.meta)+'</div>':'')
      +taskCardHtml
      +keyTaskHtml
      +actionHintHtml
      +renderWeeklyReviewItemCommentBadges(commentTarget)
    +'</div>'
    +'<div class="weekly-review-item-side">'
      +badgeHtml
      +sideTextHtml
      +renderWeeklyReviewItemCommentButton(commentTarget)
    +'</div>'
  +'</div>';
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
  const groupCountLabel=group?.countLabel||formatWeeklyReviewCount(items.length);
  const expandKey=String(group?.expandKey||'');
  const defaultVisibleCount=Number(group?.defaultVisibleCount||0);
  const canExpand=!!expandKey&&defaultVisibleCount>0&&items.length>defaultVisibleCount;
  const isExpanded=canExpand&&isWeeklyReviewGroupExpanded(expandKey);
  const visibleItems=canExpand&&!isExpanded?items.slice(0,defaultVisibleCount):items;
  const hiddenCount=Math.max(0,items.length-visibleItems.length);
  const expandButtonHtml=canExpand
    ?'<div style="display:flex;justify-content:flex-end;margin-top:10px"><button type="button" class="btn ghost sm" onclick="toggleWeeklyReviewGroupExpansion(\''+getWeeklyReviewJsString(expandKey)+'\')" style="font-size:12px">'+(isExpanded?'접기':('+ '+hiddenCount+'건 더 보기'))+'</button></div>'
    :'';
  if(group?.variant==='html'){
    return '<div class="weekly-review-section-group">'
      +'<div class="weekly-review-section-group-title">'
        +'<span>'+esc(group?.title||'')+'</span>'
        +'<span class="weekly-review-section-group-count">'+esc(groupCountLabel)+'</span>'
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
        +'<span class="weekly-review-section-group-count">'+esc(groupCountLabel)+'</span>'
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
      +'<span class="weekly-review-section-group-count">'+esc(groupCountLabel)+'</span>'
    +'</div>'
    +(items.length
      ? '<div class="weekly-review-list">'+visibleItems.map(renderWeeklyReviewItemMarkup).join('')+'</div>'+expandButtonHtml
      : '<div class="weekly-review-empty">해당 항목이 없습니다.</div>')
    +summaryHtml
  +'</div>';
}
function renderWeeklyReviewSectionMarkup(section){
  const groups=Array.isArray(section?.groups)?section.groups:[];
  const sectionId=section?.id||'';
  const isCollapsed=isWeeklyReviewSectionCollapsed(sectionId);
  return '<section class="card weekly-review-section" data-section-id="'+esc(sectionId)+'">'
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

async function loadWeeklyReviewTaskRows(){
  const baseSelect='id,project_id,title,status,start_date,due_date,priority,assignee_member_id,description,actual_done_at,created_at,updated_at';
  const extendedSelect=baseSelect+',waiting_reason';
  const extended=await api('GET','project_tasks?select='+extendedSelect).catch(()=>null);
  if(Array.isArray(extended))return extended;
  return await api('GET','project_tasks?select='+baseSelect).catch(()=>[]);
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
  availableIds.add('next-week');
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
    ? '리스크·지연 → 완료 업무 → 차주 계획 → 회의 메모 순으로 회의를 진행하는 주간 리뷰 화면입니다.'
    : '리스크·지연 → 완료 업무 → 차주 계획 → 회의 메모 순으로 회의를 진행하는 실무 회의 화면입니다.';
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
        +(modeIsManagement?renderWeeklyReviewQuickJumpMarkup(sections):'')
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
  const tone=String(card?.tone||'').trim();
  const key=String(card?.key||'').trim();
  const variant=key==='risks'
    ? 'danger'
    : key==='completed'
      ? 'success'
      : key==='outputs'
        ? 'neutral'
        : key==='next'
          ? 'upcoming'
          : tone==='danger'
            ? 'danger'
            : tone==='success'
              ? 'success'
              : tone==='warning'
                ? 'upcoming'
                : 'neutral';
  const tagClass=variant==='danger'
    ? 'warn'
    : variant==='success'
      ? 'ok'
      : variant==='upcoming'
        ? 'amber'
        : 'blue';
  const badgeText=card?.badge||'';
  const helperText=card?.helper||'';
  const cardKey=card?.key?` data-card-key="${esc(card.key)}"`:'';
  const breakdownItems=String(card?.meta||'').split('·').map(item=>item.trim()).filter(Boolean);
  const breakdownHtml=breakdownItems.map(item=>{
    const match=item.match(/^(.*?)([-+]?\d[\d,]*(?:\.\d+)?\s*(?:건|명|%|원|만원|억원)?)$/);
    if(!match)return '<span>'+esc(item)+'</span>';
    return '<span>'+esc(match[1].trim())+' <b>'+esc(match[2].trim())+'</b></span>';
  }).join('');
  return '<section class="wr-kpi-card '+variant+'"'+cardKey+'>'
    +'<div class="wr-kpi-top">'
      +'<span class="wr-kpi-label">'+esc(card?.title||'')+'</span>'
      +(badgeText?'<span class="wr-kpi-tag '+tagClass+'">'+esc(badgeText)+'</span>':'')
    +'</div>'
    +'<div class="wr-kpi-value">'+esc(card?.value||'-')+'</div>'
    +(helperText?'<div class="wr-kpi-desc">'+esc(helperText)+'</div>':'')
    +(breakdownItems.length?'<div class="wr-kpi-breakdown">'+breakdownHtml+'</div>':'')
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
  weeklyReviewDebugLog('staff capacity query start',{selectedWeek:offsetWeeks});
  await loadContracts();
  const ws=getWeekStart(offsetWeeks);
  const [issueRows,billingRows,pendingDocumentRequests,weeklyReviews,kudosVotes,taskRows,projectOutputs,checklistRows]=await Promise.all([
    api('GET','project_issues?select=id,project_id,task_id,title,priority,status,resolved_at,updated_at,created_at,assignee_name,owner_name,is_pinned,status_changed_at').catch(()=>[]),
    api('GET','billing_records?select=id,contract_id,amount,status,billing_date,memo').catch(()=>[]),
    api('GET','document_requests?status=eq.pending&select=id,project_id,title,due_date,created_at').catch(()=>[]),
    api('GET','weekly_reviews?week_start=eq.'+ws+'&select=*&order=created_at.desc').catch(()=>[]),
    api('GET','kudos_votes?week_start=eq.'+ws+'&select=*').catch(()=>[]),
    loadWeeklyReviewTaskRows(),
    getWeeklyReviewProjectOutputs(ws),
    api('GET','project_checklist_items?select=id,project_id,status,is_required,weight').catch(()=>[])
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
  const checklistProjectMap=new Map();
  (checklistRows||[]).forEach(item=>{
    const key=String(item?.project_id||'').trim();
    if(!key)return;
    const current=checklistProjectMap.get(key)||{total:0,doneWeight:0,totalWeight:0,requiredOpen:0};
    const weight=Number(item?.weight||1);
    const status=String(item?.status||'not_started');
    const done=status==='completed'||status==='not_applicable';
    current.total+=1;
    current.totalWeight+=weight;
    if(done)current.doneWeight+=weight;
    if(item?.is_required&&!done)current.requiredOpen+=1;
    checklistProjectMap.set(key,current);
  });
  const activeChecklistSummaries=activeProjectsNow
    .map(project=>({project,summary:checklistProjectMap.get(String(project.id))}))
    .filter(row=>row.summary&&row.summary.total>0);
  const checklistAverageCompletion=activeChecklistSummaries.length
    ?Math.round(activeChecklistSummaries.reduce((sum,row)=>sum+(row.summary.totalWeight?row.summary.doneWeight/row.summary.totalWeight*100:0),0)/activeChecklistSummaries.length)
    :0;
  const checklistRequiredOpenCount=activeChecklistSummaries.reduce((sum,row)=>sum+Number(row.summary.requiredOpen||0),0);
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
  weeklyReviewDebugLog('staff capacity query result',{
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
  const commentsActionHtml='';
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
      title:'체크리스트',
      badge:'진행률',
      value:activeChecklistSummaries.length?`${checklistAverageCompletion}%`:'없음',
      meta:`적용 프로젝트 ${activeChecklistSummaries.length}건 · 필수 미완료 ${checklistRequiredOpenCount}건`,
      tone:checklistRequiredOpenCount?'warning':(activeChecklistSummaries.length?'success':'')
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
  if(cards[2])cards[2].key='checklist';
  if(cards[3])cards[3].key='billing';
  if(cards[4])cards[4].key='next';
  if(cards[5])cards[5].key='resources';
  if(cards[6])cards[6].key='customers';
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
    cards[2].helper=activeChecklistSummaries.length
      ? `체크리스트 적용 프로젝트 ${activeChecklistSummaries.length}건의 평균 완료율입니다.`
      : '체크리스트가 적용된 진행 프로젝트가 아직 없습니다.';
  }
  if(cards[3]){
    cards[3].helper=unbilledAmount||billedOutstandingAmount
      ? '청구와 수금 후속 조치를 회의에서 바로 정리하세요.'
      : '이번 주 기준 청구·수금 이슈가 크지 않습니다.';
  }
  if(cards[4]){
    cards[4].helper=nextWeekItemCount
      ? '차주 마감과 착수 준비 상태를 먼저 맞춰보세요.'
      : '다음 주 주요 일정은 비교적 안정적입니다.';
  }
  if(cards[5]){
    cards[5].title='인력 가용성';
    cards[5].badge=absenceImpactCount?'확인':'이번 주';
    cards[5].value=absenceImpactCount
      ? `부재 영향 ${absenceImpactCount}명`
      : currentLeaveCount
        ? `휴가 ${currentLeaveCount}명`
        : currentFieldworkCount
          ? `필드웍 ${currentFieldworkCount}명`
          : '안정';
    cards[5].meta=`휴가 ${currentLeaveCount}명 · 이번 주 필드웍 ${currentFieldworkCount}명 · 다음 주 필드웍 ${nextFieldworkCount}명`;
    cards[5].helper=absenceImpactCount
      ? '휴가·필드웍이 진행 프로젝트와 겹치는 인원을 먼저 확인합니다.'
      : currentLeaveCount||currentFieldworkCount||nextFieldworkCount
        ? '휴가와 필드웍 기준으로 팀 가용성을 간단히 확인합니다.'
        : '이번 주 인력 가용성은 안정적인 편입니다.';
    cards[5].tone=absenceImpactCount||currentLeaveCount||currentFieldworkCount||nextFieldworkCount?'warning':'success';
  }
  if(cards[6]){
    cards[6].helper=clientIssueSummary.length
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
  return {
    cards,
    sections,
    memberSectionsByScope,
    completedProjects,
    resolvedIssues,
    billingRows,
    projectOutputs,
    taskRows,
    _rawIssues:issueRows,
    nextWeekStarts,
    nextWeekEnds,
    weeklyRevenue,
    weeklyReviews,
    kudosVotes
  };
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
  const contextLabel=[columns?.[0]||'거래처 미지정',columns?.[1]||'프로젝트 미지정'].filter(Boolean).join(' · ');
  return {
    title:String(columns?.[2]||'자료 요청'),
    contextLabel,
    meta:[elapsedLabel||''].filter(Boolean).join(' · '),
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
  const contextLabel=String(item?.contextLabel||'').trim();
  return {
    source_type:item?.source_type||item?.sourceType||'',
    item_type:item?.item_type||item?.itemType||'',
    schedule_type:item?.schedule_type||item?.scheduleType||'',
    projectId:item?.projectId||item?.project_id||'',
    taskId:item?.taskId||item?.task_id||'',
    action:item?.action||'',
    columns:[
      getWeeklyReviewItemOwnerLabel(item),
      [contextLabel,actionLabel,item?.title||'-'].filter(Boolean).join(' · '),
      item?.sideText||'-',
      item?.badgeLabel||'-'
    ],
    actionHint:item?.actionHint||'연결 화면에서 후속 조치를 확인하세요.'
  };
}
function createWeeklyReviewThisWeekActionTableItem(item,actionLabel,options={}){
  const contextLabel=String(options.contextLabel||item?.contextLabel||'').trim();
  return {
    source_type:options.source_type||item?.source_type||item?.sourceType||'',
    item_type:options.item_type||item?.item_type||item?.itemType||'',
    schedule_type:options.schedule_type||item?.schedule_type||item?.scheduleType||'',
    projectId:options.projectId||item?.projectId||item?.project_id||'',
    taskId:options.taskId||item?.taskId||item?.task_id||'',
    action:options.action||item?.action||'',
    columns:[
      options.owner||getWeeklyReviewItemOwnerLabel(item),
      [contextLabel,actionLabel,options.title||item?.title||'-'].filter(Boolean).join(' · '),
      options.due||item?.sideText||'-',
      options.status||item?.badgeLabel||'-'
    ],
    actionHint:options.actionHint||item?.actionHint||'연결 화면에서 이번 주 후속 조치를 확인하세요.'
  };
}
function createWeeklyReviewCompletedTaskItem(task){
  const project=getWeeklyReviewProjectById(task?.project_id);
  const basisDate=getWeeklyReviewTaskCompletionBasisDate(task);
  const taskId=String(task?.id||'');
  const projectId=String(task?.project_id||'');
  return {
    entity_type:'task',
    entity_id:taskId,
    taskId,
    projectId,
    _task:task,
    title:String(task?.title||'완료 업무'),
    contextLabel:getWeeklyReviewProjectContextLabel(project),
    preTitleHtml:renderWeeklyReviewTaskBreadcrumb(task,project),
    meta:[getWeeklyReviewTaskAssigneeLabel(task),String(task?.status||'완료')||'완료'].filter(Boolean).join(' · '),
    taskCardHtml:renderWeeklyReviewTaskCardMeta(task),
    badgeLabel:String(task?.status||'완료')||'완료',
    badgeClass:'badge-green',
    sideText:basisDate?('완료 '+getWeeklyReviewShortDate(basisDate)):'완료일 없음',
    actionHint:'Work 탭에서 완료 처리된 업무와 남은 후속 영향 여부를 확인하세요.',
    action:projectId&&taskId
      ?("openWeeklyReviewProjectTaskModal('"+getWeeklyReviewJsString(projectId)+"','"+getWeeklyReviewJsString(taskId)+"')")
      :''
  };
}
function renderWeeklyReviewOutputRows(outputs,taskRows=[]){
  const rows=Array.isArray(outputs)?outputs:[];
  if(!rows.length)return '<div class="weekly-review-empty">표시할 산출물이 없습니다.</div>';
  return '<div class="wr-output-list">'
      +rows.map(output=>{
        const project=getWeeklyReviewOutputProject(output);
        const task=getWeeklyReviewOutputTask(output,taskRows);
        const contextLabel=getWeeklyReviewProjectContextLabel(project);
        const taskLabel=task?.title?('태스크 '+task.title):'';
        const meta=[getWeeklyReviewOutputAuthorLabel(output),formatCommentDate(output?.created_at||'')].filter(Boolean).join(' · ');
        const outputIdJs=getWeeklyReviewJsString(output?.id||'');
        const editButtonHtml=canManageWeeklyReviewOutput(output)
          ?'<button type="button" class="btn ghost sm" onclick="openWeeklyReviewOutputModal(\''+outputIdJs+'\')" style="font-size:12px">수정</button>'
          :'';
        return '<div class="weekly-review-item wr-output-item" style="align-items:flex-start;cursor:default">'
          +'<div class="weekly-review-item-main wr-output-main">'
            +'<div class="weekly-review-item-meta weekly-review-item-context">'+esc(contextLabel)+'</div>'
            +(taskLabel?'<div class="weekly-review-item-meta">'+esc(taskLabel)+'</div>':'')
            +'<div class="weekly-review-item-title">'+esc(output?.title||'제목 없는 산출물')+'</div>'
            +'<div class="weekly-review-item-meta">'+esc(meta)+'</div>'
            +(output?.memo?'<div style="font-size:12px;color:var(--text2);line-height:1.6;margin-top:6px;white-space:pre-wrap;word-break:break-word">'+esc(output.memo)+'</div>':'')
          +'</div>'
          +'<div class="weekly-review-item-side wr-output-side">'
            +'<div class="wr-output-badges">'+getWeeklyReviewOutputQcBadges(output)+'</div>'
            +renderWeeklyReviewOutputToggle(output)
            +'<button type="button" class="btn ghost sm" onclick="openWeeklyReviewOutputUrl(\''+getWeeklyReviewJsString(output?.onedrive_url||'')+'\')" style="font-size:12px">OneDrive</button>'
            +editButtonHtml
          +'</div>'
        +'</div>';
      }).join('')
    +'</div>';
}
function renderWeeklyReviewOutputsMarkup(outputs,taskRows=[]){
  const rows=Array.isArray(outputs)?outputs:[];
  const listHtml=rows.length
    ?renderWeeklyReviewOutputRows(rows,taskRows)
    :'<div class="weekly-review-empty">이번 주에 등록된 산출물 링크가 없습니다.</div>';
  return '<div style="padding:14px 2px 8px">'
    +'<div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button type="button" class="btn sm ghost" onclick="openWeeklyReviewOutputModal()" style="font-size:12px">+ 산출물 링크 추가</button></div>'
    +listHtml
  +'</div>';
}
function renderWeeklyReviewIncludedOutputsMarkup(outputs,taskRows=[]){
  const rows=Array.isArray(outputs)?outputs:[];
  if(!rows.length)return '<div class="weekly-review-empty">회의 포함으로 체크된 산출물이 없습니다.</div>';
  return '<div class="wr-output-featured">'+renderWeeklyReviewOutputRows(rows,taskRows)+'</div>';
}
function groupWeeklyReviewOutputsByProject(outputs=[]){
  const map=new Map();
  (outputs||[]).forEach(output=>{
    const project=getWeeklyReviewOutputProject(output);
    const key=String(output?.project_id||project?.id||'no-project');
    if(!map.has(key)){
      map.set(key,{
        key,
        project,
        label:project?.name||'프로젝트 미지정',
        rows:[]
      });
    }
    map.get(key).rows.push(output);
  });
  return [...map.values()].sort((a,b)=>String(a.label||'').localeCompare(String(b.label||''),'ko'));
}
function renderWeeklyReviewOutputsByProjectMarkup(outputs,taskRows=[]){
  const rows=Array.isArray(outputs)?outputs:[];
  if(!rows.length)return '<div class="weekly-review-empty">이번 주 등록된 산출물이 없습니다.</div>';
  return '<div class="wr-output-project-groups">'
    +groupWeeklyReviewOutputsByProject(rows).map(group=>
      '<div class="wr-output-project-group">'
        +'<div class="wr-output-project-head"><strong>'+esc(group.label)+'</strong><span>'+formatWeeklyReviewCount(group.rows.length)+'</span></div>'
        +renderWeeklyReviewOutputRows(group.rows,taskRows)
      +'</div>'
    ).join('')
  +'</div>';
}
function createWeeklyReviewResolvedIssueSummaryItem(issue){
  const baseItem=createWeeklyReviewIssueItem(issue,{
    badgeLabel:'해결',
    badgeClass:'badge-green',
    sideText:`해결 ${getWeeklyReviewShortDate(issue?.resolved_at||issue?.updated_at||issue?.created_at)}`
  });
  return {
    ...baseItem,
    actionHint:'Issues 탭에서 해결 처리된 이슈와 재발 여부를 함께 확인하세요.'
  };
}
function createWeeklyReviewCompletedBillingItem(row){
  const baseItem=createWeeklyReviewBillingRecordItem(row);
  return {
    ...baseItem,
    badgeLabel:'청구 완료',
    badgeClass:String(row?.status||'').trim()==='수금완료'?'badge-green':'badge-blue',
    actionHint:'계약 탭에서 이번 주 청구 완료 내역과 다음 수금 계획을 확인하세요.'
  };
}
function renderWeeklyReviewCompletionSummaryGrid(stats){
  const items=[
    {label:'완료 task',value:formatWeeklyReviewCount(stats?.taskCount||0),meta:stats?.taskMeta||'이번 주 완료 처리 기준'},
    {label:'종료 프로젝트',value:formatWeeklyReviewCount(stats?.projectCount||0),meta:stats?.projectMeta||'완전 종료/완료 처리 기준'},
    {label:'청구 완료',value:formatWeeklyReviewCurrency(stats?.billingAmount||0),meta:stats?.billingMeta||'이번 주 청구 완료 금액'},
    {label:'해결 이슈',value:formatWeeklyReviewCount(stats?.resolvedIssueCount||0),meta:stats?.issueMeta||'이번 주 해결 처리 기준'}
  ];
  return '<div class="weekly-review-summary-grid weekly-review-completion-grid">'
    +items.map(item=>
      '<div class="weekly-review-summary-card is-completion">'
        +'<div class="weekly-review-summary-label">'+esc(item.label)+'</div>'
        +'<div class="weekly-review-summary-value">'+esc(item.value)+'</div>'
        +'<div class="weekly-review-summary-meta">'+esc(item.meta)+'</div>'
      +'</div>'
    ).join('')
  +'</div>';
}
function getWeeklyReviewProjectMeetingActionProjectId(action){
  const raw=String(action||'');
  const patterns=[
    /openProjModal\('([^']+)'/,
    /openWeeklyReviewProjectTaskModal\('([^']+)'/,
    /openIssueModal\('([^']+)'/
  ];
  for(const pattern of patterns){
    const match=raw.match(pattern);
    if(match?.[1])return match[1];
  }
  return '';
}
function splitWeeklyReviewProjectMeetingContext(contextLabel){
  const raw=String(contextLabel||'').trim();
  if(!raw)return {clientName:'',projectName:''};
  const parts=raw.split(/\s*(?:·|\||쨌|›|>)\s*/).map(part=>part.trim()).filter(Boolean);
  if(parts.length>=2)return {clientName:parts[0],projectName:parts.slice(1).join(' · ')};
  return {clientName:'',projectName:raw};
}
function getWeeklyReviewProjectMeetingBillingLabel(project){
  if(!project)return '';
  if(project?.is_billable===false)return '비청구';
  return String(project?.billing_status||'미청구').trim()||'미청구';
}
function getWeeklyReviewProjectMeetingStatusLabel(project){
  if(!project)return '';
  if(isWeeklyReviewCompletedProject(project))return String(project?.status||'완료').trim()||'완료';
  if(isWeeklyReviewProjectOverdue(project))return '지연';
  return String(project?.status||'진행중').trim()||'진행중';
}
function addWeeklyReviewProjectMeetingBadge(item,label,tone='neutral'){
  if(!item||!label)return;
  const key=String(label);
  if(!item.badges.some(badge=>String(badge.label)===key))item.badges.push({label:key,tone});
}
function pushWeeklyReviewProjectMeetingText(list,value,limit=4){
  const text=String(value||'').trim();
  if(!text||!Array.isArray(list)||list.includes(text)||list.length>=limit)return;
  list.push(text);
}
function ensureWeeklyReviewProjectMeetingItem(map,key,seed={}){
  if(!key)return null;
  if(!map.has(key)){
    map.set(key,{
      key,
      projectId:seed.projectId||'',
      projectName:seed.projectName||'프로젝트명 미정',
      clientName:seed.clientName||'거래처 미정',
      status:seed.status||'',
      assignee:seed.assignee||'담당자 미정',
      dueDate:seed.dueDate||'',
      billingStatus:seed.billingStatus||'',
      badges:[],
      tasks:[],
      risks:[],
      nextActions:[],
      counts:{completed:0,overdueTasks:0,open:0,next:0,issues:0,documents:0},
      sortScore:0,
      sortDate:Number.MAX_SAFE_INTEGER
    });
  }
  return map.get(key);
}
function applyWeeklyReviewProjectMeetingCurrentProject(item,project,preferCurrent=false){
  if(!item||!project)return item;
  const client=getWeeklyReviewProjectClient(project);
  const members=Array.isArray(project?.members)?project.members.filter(Boolean):[];
  const dueValue=getWeeklyReviewProjectEndDate(project);
  if(preferCurrent||!item.projectId)item.projectId=String(project?.id||item.projectId||'');
  if(preferCurrent||!item.projectName||item.projectName==='프로젝트명 미정')item.projectName=String(project?.name||item.projectName||'프로젝트명 미정');
  if(preferCurrent||!item.clientName||item.clientName==='거래처 미정')item.clientName=String(client?.name||item.clientName||'거래처 미정');
  if(preferCurrent||!item.status)item.status=getWeeklyReviewProjectMeetingStatusLabel(project);
  if(preferCurrent||!item.assignee||item.assignee==='담당자 미정')item.assignee=members.join(', ')||'담당자 미정';
  if(preferCurrent||!item.dueDate)item.dueDate=getWeeklyReviewShortDate(dueValue);
  if(preferCurrent||!item.billingStatus)item.billingStatus=getWeeklyReviewProjectMeetingBillingLabel(project);
  const dueTimestamp=getWeeklyReviewTimestamp(dueValue);
  if(dueTimestamp)item.sortDate=Math.min(item.sortDate,dueTimestamp);
  if(isWeeklyReviewProjectOverdue(project)){
    addWeeklyReviewProjectMeetingBadge(item,'지연','danger');
    item.sortScore=Math.max(item.sortScore,100);
  }
  if(project?.is_billable!==false&&String(project?.billing_status||'').trim()==='미청구'){
    addWeeklyReviewProjectMeetingBadge(item,'미청구','warn');
    item.sortScore=Math.max(item.sortScore,80);
  }
  return item;
}
const WEEKLY_REVIEW_PERSONAL_REVIEW_TYPES=new Set([
  'personal_schedule',
  'leave',
  'vacation',
  'personal',
  'calendar_event',
  'holiday',
  'absence',
  '병원',
  '백신',
  '연차',
  '휴가',
  '개인 일정',
  '개인일정'
]);
function normalizeWeeklyReviewTypeValue(value){
  return String(value||'').trim().toLowerCase().replace(/[\s-]+/g,'_');
}
function getWeeklyReviewTaskProjectIdByTaskId(taskId,data){
  const key=String(taskId||'').trim();
  if(!key)return '';
  const task=(data?.taskRows||[]).find(row=>String(row?.id||'')===key)||null;
  return String(task?.project_id||'').trim();
}
function getWeeklyReviewProjectMeetingItemTaskId(item){
  const direct=String(item?.taskId||item?.task_id||'').trim();
  if(direct)return direct;
  const typeText=String(item?.source_type||item?.item_type||item?.kind||'').toLowerCase();
  return typeText.includes('task')?String(item?.id||'').trim():'';
}
function getWeeklyReviewProjectMeetingItemProjectId(item,data){
  const direct=String(
    item?.projectId||
    item?.project_id||
    item?.project?.id||
    item?.project?.project_id||
    ''
  ).trim();
  if(direct)return direct;
  const actionProjectId=getWeeklyReviewProjectMeetingActionProjectId(item?.action);
  if(actionProjectId)return String(actionProjectId).trim();
  return getWeeklyReviewTaskProjectIdByTaskId(getWeeklyReviewProjectMeetingItemTaskId(item),data);
}
function isWeeklyReviewPersonalReviewType(item){
  const values=[
    item?.source_type,
    item?.sourceType,
    item?.item_type,
    item?.itemType,
    item?.schedule_type,
    item?.scheduleType,
    item?.type,
    item?.kind
  ].map(normalizeWeeklyReviewTypeValue).filter(Boolean);
  return values.some(value=>WEEKLY_REVIEW_PERSONAL_REVIEW_TYPES.has(value));
}
function shouldIncludeWeeklyReviewProjectMeetingSourceItem(item,data){
  const projectId=getWeeklyReviewProjectMeetingItemProjectId(item,data);
  if(!projectId)return false;
  if(isWeeklyReviewPersonalReviewType(item)){
    return !!(String(item?.projectId||item?.project_id||'').trim()||getWeeklyReviewTaskProjectIdByTaskId(getWeeklyReviewProjectMeetingItemTaskId(item),data));
  }
  return true;
}
function getWeeklyReviewProjectMeetingSeedFromItem(item,sectionId,groupIndex,data){
  const projectId=getWeeklyReviewProjectMeetingItemProjectId(item,data);
  if(!projectId)return null;
  const columns=Array.isArray(item?.columns)?item.columns:[];
  const context=splitWeeklyReviewProjectMeetingContext(item?.contextLabel||'');
  const project=getWeeklyReviewProjectById(projectId);
  const client=getWeeklyReviewProjectClient(project);
  const projectName=String(project?.name||item?.projectName||columns[1]||context.projectName||item?.title||'프로젝트명 미정');
  const clientName=String(client?.name||item?.clientName||columns[0]||context.clientName||'거래처 미정');
  const key=projectId?('id:'+projectId):('name:'+clientName+'|'+projectName);
  return {
    key,
    projectId,
    projectName,
    clientName,
    assignee:String(item?.assigneeName||columns[3]||''),
    dueDate:String(item?.dueDate||item?.sideText||''),
    billingStatus:String(item?.billingStatus||item?.badgeLabel||''),
    project,
    sectionId,
    groupIndex
  };
}
function applyWeeklyReviewProjectMeetingSignal(item,sourceItem,sectionId,groupIndex){
  if(!item)return;
  const columns=Array.isArray(sourceItem?.columns)?sourceItem.columns:[];
  const title=String(sourceItem?.title||columns[1]||item.projectName||'').trim();
  const badgeLabel=String(sourceItem?.badgeLabel||'').trim();
  const sideText=String(sourceItem?.sideText||'').trim();
  const actionHint=String(sourceItem?.actionHint||'').trim();
  if(sectionId==='risks'){
    if(groupIndex===0){
      addWeeklyReviewProjectMeetingBadge(item,'지연','danger');
      pushWeeklyReviewProjectMeetingText(item.risks,title||'지연 프로젝트');
      item.sortScore=Math.max(item.sortScore,100);
    }else if(groupIndex===1){
      addWeeklyReviewProjectMeetingBadge(item,'이슈','danger');
      pushWeeklyReviewProjectMeetingText(item.risks,title||'긴급 이슈');
      item.counts.issues+=1;
      item.sortScore=Math.max(item.sortScore,92);
    }else if(groupIndex===2){
      addWeeklyReviewProjectMeetingBadge(item,'지연 태스크','danger');
      pushWeeklyReviewProjectMeetingText(item.tasks,title||'지연 태스크');
      item.counts.overdueTasks+=1;
      item.sortScore=Math.max(item.sortScore,90);
    }else if(groupIndex===3){
      addWeeklyReviewProjectMeetingBadge(item,'자료 대기','warn');
      pushWeeklyReviewProjectMeetingText(item.risks,title||'자료 요청 대기');
      item.counts.documents+=1;
      item.sortScore=Math.max(item.sortScore,75);
    }else if(groupIndex===4){
      addWeeklyReviewProjectMeetingBadge(item,'미청구','warn');
      item.billingStatus=item.billingStatus||'미청구';
      pushWeeklyReviewProjectMeetingText(item.risks,sideText?('청구 확인: '+sideText):'청구 확인 필요');
      item.sortScore=Math.max(item.sortScore,80);
    }
  }else if(sectionId==='billing'){
    addWeeklyReviewProjectMeetingBadge(item,'청구 확인','warn');
    item.billingStatus=item.billingStatus||badgeLabel||'청구 확인';
    pushWeeklyReviewProjectMeetingText(item.risks,sideText?('청구 확인: '+sideText):'청구/수금 확인 필요');
    item.sortScore=Math.max(item.sortScore,80);
  }else if(sectionId==='next'){
    addWeeklyReviewProjectMeetingBadge(item,groupIndex===1?'착수 예정':'차주 액션','neutral');
    pushWeeklyReviewProjectMeetingText(item.nextActions,[title,sideText].filter(Boolean).join(' · ')||actionHint||'차주 일정 확인');
    item.counts.next+=1;
    item.sortScore=Math.max(item.sortScore,60);
  }else if(sectionId==='completed'){
    if(groupIndex===0){
      addWeeklyReviewProjectMeetingBadge(item,'완료 공유','good');
      item.counts.completed+=1;
      pushWeeklyReviewProjectMeetingText(item.tasks,title||'완료 프로젝트');
      item.sortScore=Math.max(item.sortScore,20);
    }else if(groupIndex===1){
      item.counts.completed+=1;
      pushWeeklyReviewProjectMeetingText(item.tasks,title||'완료 업무');
      item.sortScore=Math.max(item.sortScore,25);
    }
  }else if(sectionId==='documents'){
    addWeeklyReviewProjectMeetingBadge(item,'자료 대기','warn');
    pushWeeklyReviewProjectMeetingText(item.risks,title||'자료 요청 대기');
    item.counts.documents+=1;
    item.sortScore=Math.max(item.sortScore,75);
  }
  if(badgeLabel&&['미청구','지연','청구완료','수금완료'].some(label=>badgeLabel.includes(label))){
    addWeeklyReviewProjectMeetingBadge(item,badgeLabel,badgeLabel.includes('지연')?'danger':'warn');
  }
  if(badgeLabel&&!item.status)item.status=badgeLabel;
  if(sideText&&!item.dueDate)item.dueDate=sideText;
  if(actionHint)pushWeeklyReviewProjectMeetingText(item.nextActions,actionHint,3);
}
function buildWeeklyReviewProjectMeetingItems(data){
  const map=new Map();
  const isSnapshot=data?._snapshotMeta?.mode==='snapshot';
  (data?.sections||[]).forEach(section=>{
    const sectionId=String(section?.id||'');
    if(sectionId==='comments')return;
    (section?.groups||[]).forEach((group,groupIndex)=>{
      if(group?.variant==='html')return;
      (Array.isArray(group?.items)?group.items:[]).forEach(sourceItem=>{
        if(!shouldIncludeWeeklyReviewProjectMeetingSourceItem(sourceItem,data))return;
        const seed=getWeeklyReviewProjectMeetingSeedFromItem(sourceItem,sectionId,groupIndex,data);
        if(!seed?.projectId)return;
        if(!seed.projectId&&(!seed.projectName||seed.projectName==='프로젝트명 미정'))return;
        const item=ensureWeeklyReviewProjectMeetingItem(map,seed.key,seed);
        if(seed.project&&!isSnapshot)applyWeeklyReviewProjectMeetingCurrentProject(item,seed.project,true);
        applyWeeklyReviewProjectMeetingSignal(item,sourceItem,sectionId,groupIndex);
      });
    });
  });
  if(!isSnapshot){
    (projects||[]).forEach(project=>{
      const shouldInclude=isWeeklyReviewActiveProject(project)||isWeeklyReviewProjectOverdue(project)||isWeeklyReviewPendingBillingProject(project);
      if(!shouldInclude)return;
      const projectId=String(project?.id||'');
      const item=ensureWeeklyReviewProjectMeetingItem(map,'id:'+projectId,{projectId});
      applyWeeklyReviewProjectMeetingCurrentProject(item,project,true);
      item.sortScore=Math.max(item.sortScore,isWeeklyReviewActiveProject(project)?40:10);
    });
    (data?.taskRows||[]).forEach(task=>{
      const projectId=String(task?.project_id||'');
      if(!projectId)return;
      const project=getWeeklyReviewProjectById(projectId);
      const item=ensureWeeklyReviewProjectMeetingItem(map,'id:'+projectId,{projectId});
      applyWeeklyReviewProjectMeetingCurrentProject(item,project,true);
      if(isWeeklyReviewTaskCompleted(task))item.counts.completed+=1;
      else item.counts.open+=1;
      const dueMeta=getWeeklyReviewTaskDueMeta(task);
      if(dueMeta?.tone==='danger'){
        addWeeklyReviewProjectMeetingBadge(item,'지연 태스크','danger');
        pushWeeklyReviewProjectMeetingText(item.tasks,String(task?.title||'지연 태스크'));
        item.counts.overdueTasks+=1;
        item.sortScore=Math.max(item.sortScore,90);
      }
    });
  }
  return [...map.values()]
    .map(item=>({
      ...item,
      badges:item.badges.slice(0,4),
      risks:item.risks.slice(0,4),
      tasks:item.tasks.slice(0,4),
      nextActions:item.nextActions.slice(0,3)
    }))
    .sort((a,b)=>{
      if(b.sortScore!==a.sortScore)return b.sortScore-a.sortScore;
      if(a.sortDate!==b.sortDate)return a.sortDate-b.sortDate;
      return String(a.clientName+' '+a.projectName).localeCompare(String(b.clientName+' '+b.projectName),'ko');
    });
}
function renderWeeklyReviewProjectMeetingBadges(item){
  if(!item?.badges?.length)return '<span class="weekly-review-project-meeting-badge is-neutral">확인</span>';
  return item.badges.map(badge=>'<span class="weekly-review-project-meeting-badge is-'+esc(badge.tone||'neutral')+'">'+esc(badge.label)+'</span>').join('');
}
function renderWeeklyReviewProjectMeetingList(title,items,emptyText){
  const rows=(Array.isArray(items)?items:[]).filter(Boolean);
  return '<div class="weekly-review-project-meeting-block">'
    +'<div class="weekly-review-project-meeting-block-title">'+esc(title)+'</div>'
    +(rows.length
      ?'<ul>'+rows.slice(0,3).map(item=>'<li>'+esc(item)+'</li>').join('')+'</ul>'
      :'<div class="weekly-review-project-meeting-muted">'+esc(emptyText)+'</div>')
  +'</div>';
}
function renderWeeklyReviewProjectMeetingCard(item,snapshotMeta){
  const isSnapshot=snapshotMeta?.mode==='snapshot';
  const projectId=String(item?.projectId||'');
  const projectIdJs=projectId?getWeeklyReviewJsString(projectId):'';
  const commentTarget=projectId?{entity_type:'project',entity_id:projectId,project_id:projectId}:null;
  const countChips=[
    item?.counts?.completed?('완료 '+item.counts.completed):'',
    item?.counts?.overdueTasks?('지연 태스크 '+item.counts.overdueTasks):'',
    item?.counts?.open?('진행 업무 '+item.counts.open):'',
    item?.counts?.next?('차주 액션 '+item.counts.next):'',
    item?.counts?.documents?('자료 대기 '+item.counts.documents):''
  ].filter(Boolean);
  return '<article class="weekly-review-project-meeting-card is-score-'+(Number(item?.sortScore||0)>=90?'danger':Number(item?.sortScore||0)>=60?'warn':'neutral')+'">'
    +'<div class="weekly-review-project-meeting-card-head">'
      +'<div class="weekly-review-project-meeting-badges">'+renderWeeklyReviewProjectMeetingBadges(item)+'</div>'
      +'<div class="weekly-review-project-meeting-status">'+esc(item?.status||'상태 미정')+'</div>'
    +'</div>'
    +'<div class="weekly-review-project-meeting-title">'+esc(item?.projectName||'프로젝트명 미정')+'</div>'
    +'<div class="weekly-review-project-meeting-client">'+esc(item?.clientName||'거래처 미정')+'</div>'
    +'<div class="weekly-review-project-meeting-meta-grid">'
      +'<div><span>담당자</span><strong>'+esc(item?.assignee||'담당자 미정')+'</strong></div>'
      +'<div><span>마감일</span><strong>'+esc(item?.dueDate||'-')+'</strong></div>'
      +'<div><span>청구 상태</span><strong>'+esc(item?.billingStatus||'확인 필요')+'</strong></div>'
    +'</div>'
    +(countChips.length?'<div class="weekly-review-project-meeting-counts">'+countChips.map(chip=>'<span>'+esc(chip)+'</span>').join('')+'</div>':'')
    +renderWeeklyReviewItemCommentBadges(commentTarget)
    +renderWeeklyReviewProjectMeetingList('이번 주 이슈',item?.risks||[],'이번 주 회의에서 별도 이슈로 잡힌 항목은 없습니다.')
    +renderWeeklyReviewProjectMeetingList('업무 현황',item?.tasks||[],'진행/완료 업무 요약은 현재 표시할 항목이 없습니다.')
    +renderWeeklyReviewProjectMeetingList('다음 액션',item?.nextActions||[],'다음 확인은 프로젝트 상세에서 이어서 봅니다.')
    +'<div class="weekly-review-project-meeting-footer">'
      +(isSnapshot?'<span>스냅샷 기준 표시 · 상세 열기는 현재 데이터 기준</span>':'<span>현재 계산 기준</span>')
      +renderWeeklyReviewItemCommentButton(commentTarget)
      +(projectId?'<button type="button" class="btn ghost sm" onclick="openProjModal(\''+projectIdJs+'\')">'+(isSnapshot?'현재 상세 열기':'프로젝트 상세 열기')+'</button>':'<span class="weekly-review-project-meeting-muted">상세 연결 없음</span>')
    +'</div>'
  +'</article>';
}
function renderWeeklyReviewProjectMeetingView(data){
  const items=buildWeeklyReviewProjectMeetingItems(data||{});
  const isSnapshot=data?._snapshotMeta?.mode==='snapshot';
  return '<div class="weekly-review-project-meeting-view">'
    +'<section class="card weekly-review-project-meeting-intro">'
      +'<div>'
        +'<div class="weekly-review-section-title">프로젝트별 회의</div>'
        +'<div class="weekly-review-section-sub">'+(isSnapshot?'저장된 스냅샷에 포함된 프로젝트/업무/청구 신호를 프로젝트별로 묶어 보여줍니다.':'현재 계산된 리스크, 완료 업무, 차주 계획과 진행중 프로젝트를 묶어 회의 순서로 보여줍니다.')+'</div>'
      +'</div>'
      +'<div class="weekly-review-project-meeting-total">'+items.length+'건</div>'
    +'</section>'
    +(items.length
      ?'<div class="weekly-review-project-meeting-grid">'+items.map(item=>renderWeeklyReviewProjectMeetingCard(item,data?._snapshotMeta)).join('')+'</div>'
      :'<div class="weekly-review-empty">프로젝트별 회의에 표시할 프로젝트가 없습니다.</div>')
  +'</div>';
}

function renderWeeklyReviewOpenFollowups(data){
  const savedOpen=Array.isArray(data?._openFollowupComments)?data._openFollowupComments:[];
  const currentWeek=String(data?._snapshotMeta?.weekStart||getWeeklyReviewCurrentWeekStart());
  const draftOpen=getWeeklyReviewDraftItemComments(currentWeek);
  const comments=mergeWeeklyReviewItemComments(savedOpen,draftOpen)
    .filter(comment=>comment.followup_required&&String(comment.status||'open')==='open');
  if(!comments.length)return '';
  return '<section class="card wr-open-followups">'
    +'<div class="weekly-review-section-head">'
      +'<div><div class="weekly-review-section-title">미해결 팔로업</div><div class="weekly-review-section-sub">회의 코멘트 중 팔로업 필요로 표시된 미완료 항목입니다.</div></div>'
      +'<span class="weekly-review-section-group-count">'+comments.length+'건</span>'
    +'</div>'
    +'<div class="wr-open-followup-list">'
      +comments.slice(0,5).map(comment=>
        '<div class="wr-open-followup-item">'
          +'<button type="button" class="wr-open-followup-main" onclick="openWeeklyReviewItemCommentDetailModal(\''+getWeeklyReviewJsString(getWeeklyReviewItemCommentMergeKey(comment))+'\')">'
            +'<span class="wr-item-comment-badge is-followup">팔로업 필요</span>'
            +(comment.is_starred?'<span class="wr-item-comment-badge is-star">중요</span>':'')
            +(comment._week_start?'<span class="wr-item-comment-badge">'+esc(comment._week_start)+'</span>':'')
            +'<strong>'+esc(findWeeklyReviewCommentLabel(comment))+'</strong>'
            +'<span>'+esc(truncateText(comment.comment,80))+'</span>'
          +'</button>'
          +'<button type="button" class="btn sm wr-open-followup-complete" onclick="completeWeeklyReviewItemComment(\''+getWeeklyReviewJsString(getWeeklyReviewItemCommentMergeKey(comment))+'\',\''+getWeeklyReviewJsString(comment._week_start||currentWeek)+'\',\''+getWeeklyReviewJsString(comment._review_id||'')+'\')">완료 처리</button>'
        +'</div>'
      ).join('')
    +'</div>'
  +'</section>';
}

function renderWeeklyReviewSnapshotNotice(snapshotMeta){
  if(!snapshotMeta?.mode)return '';
  const isSnapshot=snapshotMeta.mode==='snapshot';
  const message=isSnapshot
    ? '이 화면은 저장된 주간회의 스냅샷 기준입니다. 현재 프로젝트 상태와 다를 수 있습니다. 상세 열기는 현재 데이터 기준으로 열립니다.'
    : '이 주차의 회의자료는 아직 저장되지 않았습니다. 현재 프로젝트 상태를 기준으로 임시 계산된 화면입니다.';
  const buttonLabel=isSnapshot?'스냅샷 갱신':'회의자료 저장';
  const warning=snapshotMeta.warning?'<div style="font-size:11px;color:#B45309;margin-top:4px">'+esc(snapshotMeta.warning)+'</div>':'';
  const metaText=isSnapshot&&snapshotMeta.updatedAt
    ? '최근 갱신 '+formatCommentDate(snapshotMeta.updatedAt)
    : (snapshotMeta.baseDate?'기준일 '+esc(snapshotMeta.baseDate):'');
  return '<div class="weekly-review-snapshot-notice" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px;padding:12px 14px;border:1px solid rgba(37,99,235,.16);border-radius:14px;background:#F8FBFF">'
    +'<div style="min-width:0;flex:1 1 360px">'
      +'<div style="font-size:12px;font-weight:800;color:var(--navy);line-height:1.5">'+esc(message)+'</div>'
      +(metaText?'<div style="font-size:11px;color:var(--text3);margin-top:3px">'+metaText+'</div>':'')
      +warning
    +'</div>'
    +'<button type="button" class="btn primary sm" onclick="saveWeeklyReviewSnapshot()">'+esc(buttonLabel)+'</button>'
  +'</div>';
}
function showWeeklyReviewToast(message){
  const toast=document.createElement('div');
  toast.style.cssText='position:fixed;right:24px;bottom:24px;z-index:9999;padding:12px 16px;border-radius:12px;background:var(--navy);color:#fff;font-size:13px;font-weight:700;box-shadow:0 12px 30px rgba(15,23,42,.22);transition:opacity .22s ease,transform .22s ease';
  toast.textContent=message;
  document.body.appendChild(toast);
  setTimeout(()=>{
    toast.style.opacity='0';
    toast.style.transform='translateY(8px)';
    setTimeout(()=>toast.remove(),260);
  },2600);
}

renderWeeklyReviewSnapshotNotice=function(snapshotMeta){
  if(!snapshotMeta?.mode)return '';
  const isSnapshot=snapshotMeta.mode==='snapshot';
  const status=String(snapshotMeta.status||'draft').trim()||'draft';
  const isFinalized=isSnapshot&&status==='finalized';
  const message=isSnapshot
    ?(isFinalized?'확정된 주간 리뷰입니다. 확정된 회의록은 관리자만 다시 초안으로 되돌릴 수 있습니다.':'저장된 주간 리뷰 초안 기준입니다. 현재 프로젝트 상태와 다를 수 있습니다.')
    :'이번 주 주간 리뷰 초안이 아직 저장되지 않았습니다. 현재 프로젝트 현황 기준으로 표시됩니다.';
  const warning=snapshotMeta.warning?'<div style="font-size:11px;color:#B45309;margin-top:4px">'+esc(snapshotMeta.warning)+'</div>':'';
  const metaText=isSnapshot&&snapshotMeta.updatedAt
    ?'최근 갱신 '+formatCommentDate(snapshotMeta.updatedAt)+(status==='finalized'?' · 회의록 확정':' · 초안')
    :(snapshotMeta.baseDate?'기준일 '+esc(snapshotMeta.baseDate):'');
  const primaryButton=isSnapshot
    ?(isFinalized?'':'<button type="button" class="btn primary sm" onclick="saveWeeklyReviewSnapshot()">최신 현황 반영</button>')
    :'<button type="button" class="btn primary sm" onclick="saveWeeklyReviewSnapshot()">초안 저장</button>';
  const discardButton=isSnapshot&&!isFinalized
    ?'<button type="button" class="btn ghost sm" onclick="discardWeeklyReviewDraft()">초안 삭제</button>'
    :'';
  const finalizeButton=isSnapshot&&!isFinalized
    ?'<button type="button" class="btn sm" onclick="finalizeWeeklyReviewSnapshot()">회의록 확정</button>'
    :'';
  const unfinalizeButton=isFinalized&&typeof roleIsAdmin==='function'&&roleIsAdmin()
    ?'<button type="button" class="btn sm" onclick="unfinalizeWeeklyReviewSnapshot()">확정 해제</button>'
    :'';
  return '<div class="weekly-review-snapshot-notice" style="display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px;padding:12px 14px;border:1px solid rgba(37,99,235,.16);border-radius:14px;background:#F8FBFF">'
    +'<div style="min-width:0;flex:1 1 360px">'
      +'<div style="font-size:12px;font-weight:800;color:var(--navy);line-height:1.5">'+esc(message)+'</div>'
      +(metaText?'<div style="font-size:11px;color:var(--text3);margin-top:3px">'+metaText+'</div>':'')
      +warning
    +'</div>'
    +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'+primaryButton+discardButton+finalizeButton+unfinalizeButton+'</div>'
  +'</div>';
};

renderWeeklyReviewModeToggleMarkup=function(){
  return '<div class="weekly-review-mode-toggle" role="tablist" aria-label="주간 리뷰 보기 모드">'
    +'<button type="button" class="weekly-review-mode-btn'+(weeklyReviewMode==='management'?' is-active':'')+'" onclick="setWeeklyReviewMode(\'management\')">경영 요약</button>'
    +'<button type="button" class="weekly-review-mode-btn'+(weeklyReviewMode==='team'?' is-active':'')+'" onclick="setWeeklyReviewMode(\'team\')">프로젝트별 회의</button>'
  +'</div>';
};
renderWeeklyReviewPageMarkup=function(rangeLabel,navLabel,cards,sections,snapshotMeta=null,data=null){
  const modeIsManagement=weeklyReviewMode==='management';
  const pageData=data||weeklyReviewLastRenderPayload?.data||{cards,sections,_snapshotMeta:snapshotMeta};
  const commentsSection=(sections||[]).find(s=>s?.id==='comments');
  const bodyHtml=modeIsManagement
    ? '<div class="weekly-review-body-grid">'
        +(sections||[]).filter(s=>s?.id!=='comments').map(renderWeeklyReviewSectionMarkup).join('')
        +renderWeeklyReviewNextWeekSection(pageData)
      +'</div>'
    : renderWeeklyReviewProjectMeetingView(pageData);
  const shellClass=modeIsManagement?' is-management-mode':' is-team-mode';
  const kickerLabel=modeIsManagement?'운영 회의':'실무 회의';
  const summaryCopy=modeIsManagement
    ? '이번 주 경고, 우선 액션, 다음 주 액션을 회의 흐름대로 점검하는 운영 보드입니다.'
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
        +(modeIsManagement?renderWeeklyReviewQuickJumpMarkup(sections):'')
      +'</div>'
      +renderWeeklyReviewSnapshotNotice(snapshotMeta)
      +renderWeeklyReviewOpenFollowups(pageData)
      +(modeIsManagement&&commentsSection?'<div class="weekly-review-top-comments">'+renderWeeklyReviewSectionMarkup(commentsSection)+'</div>':'')
      +'<div class="wr-kpi-grid">'
        +(cards||[]).map(renderWeeklyReviewCardMarkup).join('')
      +'</div>'
    +'</div>'
    +'<div class="weekly-review-body">'
      +bodyHtml
    +'</div>'
  +'</div>';
};
applyWeeklyReviewEmptyStateLabels=function(){
  const mapping={
    risks:'이번 주 회의에서 먼저 다룰 경고 항목이 없습니다.',
    billing:'이번 주 바로 실행할 우선 액션 항목은 많지 않습니다.',
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
  const allOutputs=data.projectOutputs||[];
  const includedOutputs=allOutputs.filter(output=>output?.share_in_weekly_review);

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
  const reassignmentSummaries=memberSummaries.filter(summary=>['leave-impact','fieldwork-impact'].includes(summary?._operationalState?.level));
  const nextAttentionCount=nextEndItems.length+nextStartItems.length+nextScheduleItems.length;
  const scheduleAdjustmentItems=[...new Map(
    [...overdueItems,...nextEndItems].map(item=>[
      [item?.title||'',item?.meta||'',item?.sideText||''].join('|'),
      item
    ])
  ).values()];
  const unbilledFollowUpItems=unbilledItems.map(item=>({
    ...item,
    actionHint:'청구 발행 시점과 책임자, 이번 주 후속 확인 일정을 맞춰 보세요.'
  }));
  const partnerReviewItems=urgentIssueItems.map(item=>({
    ...item,
    actionHint:'영향 범위와 고객 대응 필요 여부를 파트너와 함께 점검하세요.'
  }));
  const warningSummary=`지연 ${overdueItems.length}건 · 미청구 ${unbilledItems.length}건`;
  const decisionSummary=`재배정 ${reassignmentSummaries.length}건 · 일정 조정 ${scheduleAdjustmentItems.length}건 · 미청구 확인 ${unbilledFollowUpItems.length}건 · 파트너 검토 ${partnerReviewItems.length}건`;
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
      key:'outputs',
      title:'이번 주 산출물',
      badge:'회의 자료',
      value:formatWeeklyReviewCount(includedOutputs.length),
      helper:includedOutputs.length
        ?'회의에 포함할 산출물을 먼저 공유하세요.'
        :'회의 포함으로 표시된 산출물이 없습니다.',
      meta:`전체 산출물 ${allOutputs.length}건 · 회의 포함 ${includedOutputs.length}건`,
      tone:includedOutputs.length?'success':''
    }
  ];

  if(risksSection){
    risksSection.title='이번 주 경고';
    risksSection.sub='이번 주 회의에서 먼저 다뤄야 할 지연과 계약 경고를 한 번에 확인합니다.';
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
      }
    ];
  }
  if(billingSection){
    billingSection.title='이번 주 우선 액션';
    billingSection.sub='경고를 다시 나열하지 않고, 이번 주 안에 바로 실행해야 할 조치만 행동 중심으로 정리합니다.';
    billingSection.collapsedSummary=decisionSummary;
    billingSection.actionsHtml=renderWeeklyReviewSectionActionButtons([
      {label:'프로젝트 관리',action:"setPage('gantt')"},
      {label:'거래처 보기',action:"setPage('clients')"},
      {label:'계약 보기',action:"setPage('contracts')"}
    ]);
    billingSection.groups=[
      {
        title:'담당자 재배정 필요',
        variant:'table',
        tableTemplate:'.9fr 2fr 1fr .9fr',
        tableHeaders:['누가','무엇을','언제','상태'],
        tableAppendBadge:false,
        items:reassignmentSummaries.map(summary=>createWeeklyReviewThisWeekActionTableItem(summary,'담당자 재배정',{
          owner:String(summary?.name||'담당 확인'),
          title:String(summary?.name||'담당 확인')+' 커버 조정',
          due:summary?._operationalState?.note||'이번 주',
          status:summary?._operationalState?.label||'확인',
          action:"setPage('gantt')",
          actionHint:'휴가·필드웍 일정과 겹치는 프로젝트 커버를 이번 주 안에 정리하세요.'
        })),
        emptyText:'즉시 재배정이 필요한 인원은 없습니다.'
      },
      {
        title:'일정 조정 필요',
        variant:'table',
        tableTemplate:'.9fr 2fr 1fr .9fr',
        tableHeaders:['누가','무엇을','언제','상태'],
        tableAppendBadge:false,
        items:scheduleAdjustmentItems.map(item=>createWeeklyReviewThisWeekActionTableItem(item,'일정 재조정',{
          status:item?.badgeLabel||'확인',
          actionHint:'이번 주 일정 회복 계획이나 마감 재설정을 바로 확정하세요.'
        })),
        emptyText:'회의에서 바로 일정 조정이 필요한 항목은 없습니다.'
      },
      {
        title:'미청구 후속 확인 필요',
        variant:'table',
        tableTemplate:'.9fr 2fr 1fr .9fr',
        tableHeaders:['누가','무엇을','언제','상태'],
        tableAppendBadge:false,
        items:unbilledFollowUpItems.map(item=>createWeeklyReviewThisWeekActionTableItem(item,'미청구 후속 확인',{
          status:item?.badgeLabel||'미청구',
          actionHint:item?.actionHint||'청구 발행 시점과 이번 주 확인 일정을 바로 맞춰 보세요.'
        })),
        emptyText:'이번 주 우선 확인할 미청구 후속 항목은 없습니다.'
      },
      {
        title:'파트너 검토 필요',
        variant:'table',
        tableTemplate:'.9fr 2fr 1fr .9fr',
        tableHeaders:['누가','무엇을','언제','상태'],
        tableAppendBadge:false,
        items:partnerReviewItems.map(item=>createWeeklyReviewThisWeekActionTableItem(item,'파트너 검토 요청',{
          status:item?.badgeLabel||'이슈'
        })),
        emptyText:'즉시 파트너 검토가 필요한 이슈는 없습니다.'
      }
    ];
  }
  const outputsSection={
    id:'outputs',
    title:'이번 주 산출물',
    sub:'이번 주 등록된 산출물을 프로젝트별로 확인하고 회의 포함 여부와 QC 상태를 정리합니다.',
    collapsedSummary:`회의 포함 ${includedOutputs.length}건 · 전체 산출물 ${allOutputs.length}건`,
    actionsHtml:renderWeeklyReviewSectionActionButtons([
      {label:'프로젝트 관리',action:"setPage('gantt')"}
    ]),
    groups:[
      {
        title:'이번 주 회의 포함 산출물',
        variant:'html',
        countLabel:formatWeeklyReviewCount(includedOutputs.length),
        html:renderWeeklyReviewIncludedOutputsMarkup(includedOutputs,data.taskRows||[])
      },
      {
        title:'프로젝트별 산출물',
        variant:'html',
        countLabel:formatWeeklyReviewCount(allOutputs.length),
        html:renderWeeklyReviewOutputsByProjectMarkup(allOutputs,data.taskRows||[])
      }
    ]
  };
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
  data._raw_nextWeekEnds = data.nextWeekEnds||[];
  data._raw_nextWeekStarts = data.nextWeekStarts||[];
  data.sections=[
    risksSection,
    billingSection,
    outputsSection,
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
  weeklyReviewMeetingEditMode=false;
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
    {title:'리스크 / 지연',badge:'이번 주 경고',value:'...',meta:'불러오는 중...'},
    {title:'이번 주 완료',badge:'실적',value:'...',meta:'불러오는 중...'},
    {title:'차주 준비',badge:'다음 주',value:'...',meta:'불러오는 중...'},
    {title:'인력 현황',badge:'이번 주',value:'...',meta:'불러오는 중...'}
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
      {title:'리스크 / 지연',badge:'이번 주 경고',value:'-',meta:'데이터를 불러오지 못했습니다.'},
      {title:'이번 주 완료',badge:'실적',value:'-',meta:'데이터를 불러오지 못했습니다.'},
      {title:'차주 준비',badge:'다음 주',value:'-',meta:'데이터를 불러오지 못했습니다.'},
      {title:'인력 현황',badge:'이번 주',value:'-',meta:'데이터를 불러오지 못했습니다.'}
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
  el.innerHTML=renderWeeklyReviewPageMarkup(rangeLabel,navLabel,data.cards,data.sections,data._snapshotMeta,data);
  applyWeeklyReviewEmptyStateLabels();
  weeklyReviewDebugLog('render complete',{
    selectedWeek:requestedOffset,
    cards:Array.isArray(data?.cards)?data.cards.length:0,
    sections:Array.isArray(data?.sections)?data.sections.length:0
  });
}
applyWeeklyReviewEmptyStateLabels=function(){};
async function getWeeklyReviewCalculatedPageData(offsetWeeks=weeklyReviewWeekOffset){
  const data=await getWeeklyReviewPageDataBase(offsetWeeks);
  const reviewBounds=getWeeklyReviewBusinessWeekBounds(offsetWeeks);
  const today=getHomeBaseDate();
  const completedSection=getWeeklyReviewDataSection(data,'completed');
  const risksSection=getWeeklyReviewDataSection(data,'risks');
  const billingSection=getWeeklyReviewDataSection(data,'billing');
  const membersSection=getWeeklyReviewDataSection(data,'members');
  const nextSection=getWeeklyReviewDataSection(data,'next');
  const documentsSection=getWeeklyReviewDataSection(data,'documents');
  const commentsSection=getWeeklyReviewDataSection(data,'comments');
  const allOutputs=data.projectOutputs||[];
  const includedOutputs=allOutputs.filter(output=>output?.share_in_weekly_review);
  const completedItems=getWeeklyReviewSectionGroupItems(completedSection,0);
  const overdueItems=getWeeklyReviewSectionGroupItems(risksSection,0);
  const urgentIssueItems=getWeeklyReviewSectionGroupItems(risksSection,1);
  const unbilledItems=getWeeklyReviewSectionGroupItems(billingSection,0);
  const memberSummaries=getWeeklyReviewSectionGroupItems(membersSection,0).map(summary=>({
    ...summary,
    _operationalState:getWeeklyReviewOperationalMemberState(summary)
  }));
  const nextEndItems=getWeeklyReviewSectionGroupItems(nextSection,0);
  const nextStartItems=getWeeklyReviewSectionGroupItems(nextSection,1);
  const nextScheduleItems=getWeeklyReviewSectionGroupItems(nextSection,2);
  const documentItems=getWeeklyReviewSectionGroupItems(documentsSection,0);
  const overdueTaskItems=(data.taskRows||[])
    .filter(task=>{
      const status=String(task?.status||'').trim().toLowerCase();
      if(status==='done'||status==='completed'||status==='complete'||status==='완료')return false;
      if(!task?.due_date)return false;
      const due=getWeeklyReviewDate(task.due_date);
      return !!due&&due<today;
    })
    .sort((a,b)=>getWeeklyReviewTimestamp(a?.due_date)-getWeeklyReviewTimestamp(b?.due_date))
    .map(task=>{
      const project=getWeeklyReviewProjectById(task?.project_id);
      const taskId=String(task?.id||'');
      const projectId=String(task?.project_id||project?.id||'');
      return {
        taskId,
        projectId,
        entity_type:'task',
        entity_id:taskId,
        title:String(task?.title||'미완료 업무'),
        contextLabel:'',
        preTitleHtml:renderWeeklyReviewTaskBreadcrumb(task,project),
        meta:[getWeeklyReviewTaskAssigneeLabel(task),String(task?.status||'미완료')||'미완료'].filter(Boolean).join(' · '),
        taskCardHtml:renderWeeklyReviewTaskCardMeta(task),
        badgeLabel:'지연',
        badgeClass:'badge-red',
        sideText:getWeeklyReviewShortDate(task?.due_date)||'-',
        actionHint:'업무 상세에서 진행 상황과 완료 예정 일정을 확인하세요.',
        action:projectId&&taskId
          ?("openWeeklyReviewProjectTaskModal('"+getWeeklyReviewJsString(projectId)+"','"+getWeeklyReviewJsString(taskId)+"')")
          :'',
      };
    });
  const completedTaskItems=(data.taskRows||[])
    .filter(task=>isWeeklyReviewCompletedTaskInRange(task,reviewBounds.start,reviewBounds.end))
    .sort((a,b)=>getWeeklyReviewTimestamp(getWeeklyReviewTaskCompletionBasisDate(b))-getWeeklyReviewTimestamp(getWeeklyReviewTaskCompletionBasisDate(a)))
    .map(task=>createWeeklyReviewCompletedTaskItem(task));
  const completedProjectItems=(data.completedProjects||[])
    .filter(project=>isWeeklyReviewClosedProjectCompletedInRange(project,reviewBounds.start,reviewBounds.end))
    .sort((a,b)=>{
      const amountDiff=getWeeklyReviewProjectBillingAmount(b)-getWeeklyReviewProjectBillingAmount(a);
      if(amountDiff)return amountDiff;
      return sortWeeklyReviewProjectsByCompletion(a,b);
    })
    .map(project=>createWeeklyReviewCompletedProjectSummaryTableItem(project));
  const riskTotal=overdueItems.length+urgentIssueItems.length+overdueTaskItems.length;
  const completedTotal=completedTaskItems.length+completedProjectItems.length;
  const nextTotal=nextEndItems.length+nextStartItems.length;
  const commentCount=(data.weeklyReviews||[]).length;
  data.cards=[
    {
      key:'risks',
      title:'리스크 / 지연',
      badge:'이번 주 경고',
      value:formatWeeklyReviewCount(riskTotal),
      helper:riskTotal
        ?'지연 프로젝트·태스크와 긴급 이슈를 먼저 확인하세요.'
        :'이번 주 즉시 논의할 경고 항목이 없습니다.',
      meta:`지연 프로젝트 ${overdueItems.length}건 · 긴급 이슈 ${urgentIssueItems.length}건 · 지연 태스크 ${overdueTaskItems.length}건`,
      tone:overdueItems.length?'danger':urgentIssueItems.length||overdueTaskItems.length?'warning':'success'
    },
    {
      key:'completed',
      title:'이번 주 완료',
      badge:'실적',
      value:formatWeeklyReviewCount(completedTotal),
      helper:completedTotal
        ?'이번 주 완료 처리된 업무와 프로젝트를 공유하세요.'
        :'이번 주 완료된 업무와 프로젝트가 없습니다.',
      meta:`완료 태스크 ${completedTaskItems.length}건 · 완료 프로젝트 ${completedProjectItems.length}건 · 미청구 ${unbilledItems.length}건`,
      tone:completedTotal?'success':''
    },
    {
      key:'outputs',
      title:'이번 주 산출물',
      badge:'회의 자료',
      value:formatWeeklyReviewCount(includedOutputs.length),
      helper:includedOutputs.length
        ?'회의에 포함할 산출물을 먼저 공유하세요.'
        :'회의 포함으로 표시된 산출물이 없습니다.',
      meta:`전체 산출물 ${allOutputs.length}건 · 회의 포함 ${includedOutputs.length}건`,
      tone:includedOutputs.length?'success':''
    },
    {
      key:'next',
      title:'차주 준비',
      badge:'다음 주',
      value:formatWeeklyReviewCount(nextTotal),
      helper:nextTotal
        ?'차주 마감과 신규 착수 준비 상태를 확인하세요.'
        :'다음 주 주요 일정이 비교적 안정적입니다.',
      meta:`마감 ${nextEndItems.length}건 · 착수 ${nextStartItems.length}건 · 일정 ${nextScheduleItems.length}건`,
      tone:nextTotal?'warning':'success'
    }
  ];
  if(risksSection){
    risksSection.title='1. 리스크 / 이슈 / 지연';
    risksSection.sub='이번 주 먼저 다뤄야 할 지연 프로젝트·태스크, 긴급 이슈, 미청구를 확인합니다.';
    risksSection.collapsedSummary=`지연 프로젝트 ${overdueItems.length}건 · 긴급 이슈 ${urgentIssueItems.length}건 · 지연 태스크 ${overdueTaskItems.length}건 · 미청구 ${unbilledItems.length}건`;
    risksSection.actionsHtml=renderWeeklyReviewSectionActionButtons([
      {label:'프로젝트 관리',action:"setPage('gantt')"},
      {label:'계약 확인',action:"setPage('contracts')"}
    ]);
    risksSection.groups=[
      {title:'지연 프로젝트',items:overdueItems,emptyText:'이번 주 바로 논의할 지연 프로젝트는 없습니다.'},
      {title:'긴급 이슈',items:urgentIssueItems,emptyText:'즉시 점검할 긴급 이슈가 없습니다.'},
      {title:'지연 태스크',items:overdueTaskItems,emptyText:'마감이 경과된 미완료 태스크가 없습니다.',expandKey:'overdueTasks',defaultVisibleCount:WEEKLY_REVIEW_OVERDUE_TASK_DEFAULT_LIMIT},
      {title:'미청구',items:unbilledItems,emptyText:'이번 주 우선 확인할 미청구 항목은 없습니다.'}
    ];
  }
  if(completedSection){
    completedSection.title='2. 이번 주 완료';
    completedSection.sub='이번 주 완료된 업무와 프로젝트를 모아 진행 결과와 후속 영향을 확인합니다.';
    completedSection.collapsedSummary=`완료 업무 ${completedTaskItems.length}건 · 완료 프로젝트 ${completedProjectItems.length}건`;
    completedSection.actionsHtml=renderWeeklyReviewSectionActionButtons([
      {label:'프로젝트 관리',action:"setPage('gantt')"}
    ]);
    completedSection.groups=[
      {
        title:'완료 업무',
        variant:'html',
        countLabel:formatWeeklyReviewCount(completedTaskItems.length),
        html:completedTaskItems.length
            ?completedTaskItems.map(item=>{
              const task=item._task||{};
              const project=getWeeklyReviewProjectById(item.projectId||task?.project_id);
              const commentTarget=getWeeklyReviewCommentTargetFromItem(item);
              const detailAction="openWeeklyReviewProjectTaskModal('"+getWeeklyReviewJsString(item.projectId||task?.project_id||'')+"','"+getWeeklyReviewJsString(item.taskId||task?.id||'')+"')";
              return '<div class="wr-completed-card" role="button" tabindex="0" onclick="'+detailAction+'" onkeydown="if(event.key===\'Enter\'||event.key===\' \'){event.preventDefault();'+detailAction+';}">'
                +'<div class="wr-completed-card-main">'
                  +renderWeeklyReviewTaskBreadcrumb(task,project)
                  +'<div class="wr-completed-card-title">'+esc(item.title||'')+'</div>'
                  +renderWeeklyReviewTaskCardMeta(task)
                  +renderWeeklyReviewItemCommentBadges(commentTarget)
                +'</div>'
                +'<div class="wr-completed-card-side">'
                  +'<span class="badge badge-green">완료</span>'
                  +'<div class="wr-completed-card-date">'+esc(item.sideText||'')+'</div>'
                  +'<button type="button" class="btn ghost sm" onclick="event.stopPropagation();'+detailAction+'">상세</button>'
                  +renderWeeklyReviewItemCommentButton(commentTarget)
                +'</div>'
              +'</div>';
            }).join('')
          :'<div class="weekly-review-empty">이번 주에 완료된 업무가 없습니다.</div>'
      },
      {
        title:'이번 주 완료 프로젝트',
        variant:'table',
        tableTemplate:'1.1fr 1.6fr .75fr 1.1fr 1fr .9fr',
        tableHeaders:['고객사명','프로젝트명','완료일','담당자','빌링 금액','빌링 상태'],
        items:completedProjectItems,
        summary:`완료 프로젝트 ${completedProjectItems.length}건`
      }
    ];
  }
  const outputsSection={
    id:'outputs',
    title:'이번 주 산출물',
    sub:'이번 주 등록된 산출물을 프로젝트별로 확인하고 회의 포함 여부와 QC 상태를 정리합니다.',
    collapsedSummary:`회의 포함 ${includedOutputs.length}건 · 전체 산출물 ${allOutputs.length}건`,
    actionsHtml:renderWeeklyReviewSectionActionButtons([
      {label:'프로젝트 관리',action:"setPage('gantt')"}
    ]),
    groups:[
      {
        title:'이번 주 회의 포함 산출물',
        variant:'html',
        countLabel:formatWeeklyReviewCount(includedOutputs.length),
        html:renderWeeklyReviewIncludedOutputsMarkup(includedOutputs,data.taskRows||[])
      },
      {
        title:'프로젝트별 산출물',
        variant:'html',
        countLabel:formatWeeklyReviewCount(allOutputs.length),
        html:renderWeeklyReviewOutputsByProjectMarkup(allOutputs,data.taskRows||[])
      }
    ]
  };
  if(commentsSection){
    const actionSnapshot=await getWeeklyReviewSnapshotAnyStatus(getWeekStart(offsetWeeks)).catch(()=>null);
    const isFinalized=String(actionSnapshot?.status||'')==='finalized';
    const meetingSections=getWeeklyReviewMeetingSections();
    commentsSection.title='회의 메모';
    commentsSection.sub='회의 중 논의한 내용을 한 곳에 자유롭게 기록합니다.';
    commentsSection.collapsedSummary=`메모 ${commentCount}건`;
    commentsSection.groups=[
      {title:'회의 메모',variant:'html',countLabel:`메모 ${commentCount}건`,html:renderWeeklyReviewMeetingFieldGroupMarkup(data.weeklyReviews||[],meetingSections[0].key,meetingSections[0].emptyText,weeklyReviewWeekOffset===0&&!isFinalized)}
    ];
  }
  data._raw_nextWeekEnds=data.nextWeekEnds||[];
  data._raw_nextWeekStarts=data.nextWeekStarts||[];
  data.sections=[risksSection,completedSection,outputsSection,commentsSection].filter(Boolean);
  return data;
}
async function getWeeklyReviewSnapshot(weekStart){
  const key=String(weekStart||'').trim();
  if(!key)return null;
  const rows=await api('GET',WEEKLY_REVIEW_SNAPSHOT_TABLE+'?week_start=eq.'+key+'&status=neq.discarded&select=*&limit=1');
  return Array.isArray(rows)&&rows.length?rows[0]:null;
}
async function getWeeklyReviewSnapshotAnyStatus(weekStart){
  const key=String(weekStart||'').trim();
  if(!key)return null;
  const rows=await api('GET',WEEKLY_REVIEW_SNAPSHOT_TABLE+'?week_start=eq.'+key+'&select=*&limit=1');
  return Array.isArray(rows)&&rows.length?rows[0]:null;
}
function cloneWeeklyReviewSnapshotValue(value){
  try{
    return JSON.parse(JSON.stringify(value,(key,item)=>{
      if(key==='actionsHtml')return undefined;
      if(typeof item==='function')return undefined;
      return item;
    }));
  }catch(error){
    console.warn('[weekly-review] snapshot value clone failed',error);
    return null;
  }
}
function sanitizeWeeklyReviewSnapshotHtml(html){
  let next=String(html||'');
  next=next.replace(/<div style="display:flex;justify-content:flex-end;margin-bottom:10px"><button[^>]*onclick="openWeeklyReviewOutputModal\(\)"[^>]*>[\s\S]*?<\/button><\/div>/g,'');
  next=next.replace(/<button[^>]*onclick="openWeeklyReviewOutputModal\('[^']*'\)"[^>]*>수정<\/button>/g,'');
  next=next.replace(/<button[^>]*onclick="deleteWeeklyReviewOutput\('[^']*'\)"[^>]*>[\s\S]*?<\/button>/g,'');
  next=next.replace(/ onchange="toggleWeeklyReviewOutputIncluded\('[^']*',this\.checked\)"/g,' disabled');
  return next;
}
function sanitizeWeeklyReviewSnapshotItem(item){
  if(!item||typeof item!=='object')return item;
  const next={...item};
  const action=String(next.action||'');
  const canOpenCurrentDetail=/^(openProjModal|openWeeklyReviewProjectTaskModal)\(/.test(action);
  if(!canOpenCurrentDetail)delete next.action;
  return next;
}
function sanitizeWeeklyReviewSnapshotSections(sections=[]){
  return (Array.isArray(sections)?sections:[]).map(section=>{
    const next={...section};
    delete next.actionsHtml;
    if(Array.isArray(next.groups)){
      next.groups=next.groups.map(group=>{
        const cleanGroup={...group};
        if(typeof cleanGroup.html==='string'){
          cleanGroup.html=sanitizeWeeklyReviewSnapshotHtml(cleanGroup.html);
        }
        if(Array.isArray(cleanGroup.items)){
          cleanGroup.items=cleanGroup.items.map(sanitizeWeeklyReviewSnapshotItem);
        }
        return cleanGroup;
      });
    }
    return next;
  });
}
function getWeeklyReviewSnapshotWeekMeta(offsetWeeks=weeklyReviewWeekOffset){
  const bounds=getWeeklyReviewBusinessWeekBounds(offsetWeeks);
  return {
    weekStart:getWeekStart(offsetWeeks),
    weekEnd:getWeeklyReviewDateKey(bounds.end),
    baseDate:getWeeklyReviewDateKey(getHomeBaseDate())
  };
}
function getWeeklyReviewSnapshotSummary(cards=[],sections=[]){
  const groupCount=(sectionId,groupTitle)=>{
    const section=(sections||[]).find(item=>String(item?.id||'')===sectionId);
    const group=(section?.groups||[]).find(item=>String(item?.title||'').includes(groupTitle));
    if(Array.isArray(group?.items))return group.items.length;
    return parseWeeklyReviewMetricNumber(group?.countLabel||0);
  };
  return {
    cardCount:Array.isArray(cards)?cards.length:0,
    sectionCount:Array.isArray(sections)?sections.length:0,
    overdueProjectCount:groupCount('risks','지연 프로젝트'),
    overdueTaskCount:groupCount('risks','지연 태스크'),
    unbilledProjectCount:groupCount('risks','미청구'),
    completedProjectCount:groupCount('completed','완료 프로젝트'),
    completedTaskCount:groupCount('completed','완료 업무'),
    nextDeadlineCount:groupCount('next','마감'),
    nextStartCount:groupCount('next','착수')
  };
}
function getWeeklyReviewSnapshotDisplayItems(sections=[]){
  const displayItems={};
  (sections||[]).forEach(section=>{
    const sectionKey=String(section?.id||section?.title||'section');
    displayItems[sectionKey]=(section?.groups||[]).map(group=>({
      title:group?.title||'',
      count:Array.isArray(group?.items)?group.items.length:0,
      items:(Array.isArray(group?.items)?group.items:[]).map(item=>({
        id:item?.id||item?.projectId||item?.taskId||null,
        projectId:item?.projectId||null,
        taskId:item?.taskId||null,
        title:item?.title||'',
        clientName:item?.clientName||'',
        projectName:item?.projectName||'',
        contextLabel:item?.contextLabel||'',
        status:item?.status||item?.badgeLabel||'',
        assigneeName:item?.assigneeName||'',
        dueDate:item?.dueDate||'',
        billingStatus:item?.billingStatus||'',
        amount:item?.amount||item?.sideText||'',
        meta:item?.meta||'',
        sideText:item?.sideText||'',
        badgeLabel:item?.badgeLabel||'',
        columns:Array.isArray(item?.columns)?item.columns:[]
      }))
    }));
  });
  return displayItems;
}
function buildWeeklyReviewSnapshotJson(calculatedData,offsetWeeks=weeklyReviewWeekOffset){
  const meta=getWeeklyReviewSnapshotWeekMeta(offsetWeeks);
  const cards=cloneWeeklyReviewSnapshotValue(calculatedData?.cards||[])||[];
  const sections=sanitizeWeeklyReviewSnapshotSections(cloneWeeklyReviewSnapshotValue(
    (calculatedData?.sections||[]).filter(section=>String(section?.id||'')!=='comments')
  )||[]);
  const actionItems=Array.isArray(calculatedData?._snapshotMeta?.action_items)?calculatedData._snapshotMeta.action_items:[];
  return {
    schema:'weekly-review-snapshot',
    snapshotVersion:1,
    weekStart:meta.weekStart,
    weekEnd:meta.weekEnd,
    generatedAt:new Date().toISOString(),
    baseDate:meta.baseDate,
    source:'calculated-current-db',
    summary:getWeeklyReviewSnapshotSummary(cards,sections),
    action_items:actionItems,
    cards,
    sections,
    displayItems:getWeeklyReviewSnapshotDisplayItems(sections)
  };
}
async function getWeeklyReviewSnapshotCommentsSection(weekStart,offsetWeeks=weeklyReviewWeekOffset,actionItems=[],isFinalized=false){
  const weeklyReviews=await api('GET','weekly_reviews?week_start=eq.'+weekStart+'&select=*&order=created_at.desc').catch(error=>{
    console.warn('[weekly-review] snapshot comments load failed',error);
    return [];
  });
  const commentCount=(weeklyReviews||[]).length;
  const meetingSections=getWeeklyReviewMeetingSections();
  const commentsSection={
    id:'comments',
    title:'회의 메모',
    sub:'회의 중 논의한 내용을 한 곳에 자유롭게 기록합니다.',
    collapsedSummary:`메모 ${commentCount}건`,
    groups:[
      {title:'회의 메모',variant:'html',countLabel:`메모 ${commentCount}건`,html:renderWeeklyReviewMeetingFieldGroupMarkup(weeklyReviews||[],meetingSections[0].key,meetingSections[0].emptyText,offsetWeeks===0&&!isFinalized)}
    ]
  };
  return {commentsSection,weeklyReviews};
}
async function getWeeklyReviewSnapshotPageData(snapshot,offsetWeeks=weeklyReviewWeekOffset){
  const snapshotJson=snapshot?.snapshot_json||{};
  const weekStart=String(snapshot?.week_start||snapshotJson.weekStart||getWeekStart(offsetWeeks));
  const actionItems=Array.isArray(snapshotJson.action_items)?snapshotJson.action_items:[];
  const isFinalized=String(snapshot?.status||'draft').trim()==='finalized';
  const {commentsSection,weeklyReviews}=await getWeeklyReviewSnapshotCommentsSection(weekStart,offsetWeeks,actionItems,isFinalized);
  const sections=sanitizeWeeklyReviewSnapshotSections(
    (Array.isArray(snapshotJson.sections)?snapshotJson.sections:[])
      .filter(section=>String(section?.id||'')!=='comments')
  );
  return {
    cards:Array.isArray(snapshotJson.cards)?snapshotJson.cards:[],
    sections:[...sections,commentsSection],
    weeklyReviews,
    projectOutputs:[],
    taskRows:[],
    _rawIssues:[],
    _snapshotMeta:{
      mode:'snapshot',
      snapshotId:String(snapshot?.id||'')||null,
      status:String(snapshot?.status||'draft').trim()||'draft',
      generatedAt:snapshotJson.generatedAt||null,
      updatedAt:snapshot?.updated_at||snapshot?.created_at||null,
      weekStart,
      baseDate:snapshotJson.baseDate||snapshot?.base_date||null,
      action_items:actionItems
    }
  };
}
getWeeklyReviewPageData=async function(offsetWeeks=weeklyReviewWeekOffset){
  const meta=getWeeklyReviewSnapshotWeekMeta(offsetWeeks);
  let snapshot=null;
  let snapshotWarning='';
  let pageData=null;
  try{
    snapshot=await getWeeklyReviewSnapshot(meta.weekStart);
  }catch(error){
    console.warn('[weekly-review] snapshot lookup failed; falling back to live data',error);
    snapshotWarning='스냅샷 조회에 실패하여 현재 상태 기준으로 표시합니다.';
  }
  if(snapshot?.snapshot_json){
    try{
      pageData=await getWeeklyReviewSnapshotPageData(snapshot,offsetWeeks);
    }catch(error){
      console.warn('[weekly-review] snapshot render failed; falling back to live data',error);
      snapshotWarning='저장된 스냅샷을 표시하지 못해 현재 상태 기준으로 표시합니다.';
    }
  }
  if(!pageData){
    pageData=await getWeeklyReviewCalculatedPageData(offsetWeeks);
    pageData._snapshotMeta={
      mode:'live',
      snapshotId:null,
      status:'live',
      generatedAt:null,
      updatedAt:null,
      weekStart:meta.weekStart,
      baseDate:meta.baseDate,
      action_items:[],
      warning:snapshotWarning
    };
  }
  pageData._openFollowupComments=await loadWeeklyReviewOpenFollowupComments().catch(error=>{
    console.warn('[weekly-review] open followup load failed',error);
    return [];
  });
  return pageData;
};
async function saveWeeklyReviewSnapshot(){
  const offsetWeeks=weeklyReviewWeekOffset;
  const meta=getWeeklyReviewSnapshotWeekMeta(offsetWeeks);
  try{
    const calculatedData=await getWeeklyReviewCalculatedPageData(offsetWeeks);
    const snapshotJson=buildWeeklyReviewSnapshotJson(calculatedData,offsetWeeks);
    const existing=await getWeeklyReviewSnapshotAnyStatus(meta.weekStart);
    if(Array.isArray(existing?.snapshot_json?.action_items)){
      snapshotJson.action_items=existing.snapshot_json.action_items;
    }
    const body={
      week_start:meta.weekStart,
      snapshot_json:snapshotJson,
      snapshot_version:1,
      base_date:snapshotJson.baseDate||null,
      created_by:currentUser?.id||null
    };
    if(typeof apiEx==='function'){
      await apiEx('POST',WEEKLY_REVIEW_SNAPSHOT_TABLE+'?on_conflict=week_start',body,'resolution=merge-duplicates,return=representation');
    }else{
      if(existing?.id){
        await api('PATCH',WEEKLY_REVIEW_SNAPSHOT_TABLE+'?id=eq.'+existing.id,body);
      }else{
        await api('POST',WEEKLY_REVIEW_SNAPSHOT_TABLE,body);
      }
    }
    await saveWeeklyReviewDraftItemComments(meta.weekStart);
    await renderWeeklyReviewPage(offsetWeeks);
    alert('주간회의 스냅샷을 저장했습니다.');
  }catch(error){
    console.error('[weekly-review] snapshot save failed',error);
    const detail=typeof getWeeklyReviewApiErrorDetail==='function'?getWeeklyReviewApiErrorDetail(error):String(error?.message||error||'');
    alert('주간회의 스냅샷 저장에 실패했습니다.'+(detail?'\n\n오류: '+detail:''));
  }
}

function renderWeeklyReviewNextWeekSection(data) {
  if (!data) return '';
  const nextBounds = getWeeklyReviewBusinessWeekBounds(weeklyReviewWeekOffset + 1);
  const deadlineProjects = (data._raw_nextWeekEnds || [])
    .map(project => {
      const endDate = getWeeklyReviewProjectEndDate(project);
      const today = getHomeBaseDate();
      const dDiff = endDate
        ? Math.ceil((getWeeklyReviewDate(endDate) - today) / (1000 * 60 * 60 * 24))
        : null;
      const isOverdue = dDiff !== null && dDiff < 0;
      const memberNames = (projectMemberLinks || [])
        .filter(link => String(link.project_id) === String(project.id))
        .map(link => members.find(m => m.id === link.member_id)?.name || '')
        .filter(Boolean);
      const statusLabel = isWeeklyReviewProjectOverdue(project, today) ? '지연' : String(project.status || '진행중');
      const toneClass = isOverdue ? 'wr-nw-date--danger' : dDiff !== null && dDiff <= 7 ? 'wr-nw-date--warn' : '';
      const dLabel = dDiff === null ? '' : dDiff < 0 ? `D+${Math.abs(dDiff)}` : `D-${dDiff}`;
      return { project, endDate, dDiff, dLabel, toneClass, statusLabel, memberNames, isOverdue };
    })
    .sort((a, b) => (a.dDiff ?? 999) - (b.dDiff ?? 999));
  const nextLeaves = (schedules || []).filter(schedule => {
    const type = String(schedule?.schedule_type || '').trim();
    if (type !== 'leave') return false;
    const startDate = getWeeklyReviewDate(schedule?.start || schedule?.start_date);
    const endDate = getWeeklyReviewDate(schedule?.end || schedule?.end_date || schedule?.start || schedule?.start_date);
    return !!startDate && !!endDate && startDate <= nextBounds.end && endDate >= nextBounds.start && scheduleHasOperationalMember(schedule);
  });
  const nextFieldwork = (schedules || []).filter(schedule => {
    const type = String(schedule?.schedule_type || '').trim();
    if (type !== 'fieldwork') return false;
    const startDate = getWeeklyReviewDate(schedule?.start || schedule?.start_date);
    const endDate = getWeeklyReviewDate(schedule?.end || schedule?.end_date || schedule?.start || schedule?.start_date);
    return !!startDate && !!endDate && startDate <= nextBounds.end && endDate >= nextBounds.start && scheduleHasOperationalMember(schedule);
  });
  const nextStarts = (data._raw_nextWeekStarts || []);
  const deadlineRows = deadlineProjects.length
    ? deadlineProjects.map(({ project, dLabel, toneClass, statusLabel, memberNames }) => {
        const badgeCls = statusLabel === '지연' ? 'badge-red' : 'badge-gray';
        return `<div class="wr-nw-deadline-row"><div><div class="wr-nw-proj-name">${esc(project.name || '')}</div><div class="wr-nw-proj-owner">${esc(memberNames.slice(0, 2).join(', ') || '-')}</div></div><div><span class="badge ${badgeCls}">${esc(statusLabel)}</span></div><div class="wr-nw-date ${toneClass}">${esc(getWeeklyReviewProjectEndDate(project) || '-')}${dLabel ? ` <span class="wr-nw-d-chip">(${dLabel})</span>` : ''}</div></div>`;
      }).join('')
    : `<div class="weekly-review-empty">다음 주 마감 예정 프로젝트가 없습니다.</div>`;
  const leaveRows = nextLeaves.length
    ? [...new Set(nextLeaves.flatMap(s => getOperationalScheduleMemberNames(s)))].map(name => {
        const sched = nextLeaves.find(s => getOperationalScheduleMemberNames(s).includes(name));
        const start = sched?.start || sched?.start_date || '';
        const end = sched?.end || sched?.end_date || start;
        const days = start && end ? Math.round((getWeeklyReviewDate(end) - getWeeklyReviewDate(start)) / (1000 * 60 * 60 * 24)) + 1 : null;
        return `<div class="wr-nw-absence-item"><span class="wr-nw-absence-who">${esc(name)}</span><div style="display:flex;align-items:center;gap:6px"><span class="wr-nw-absence-period">${esc(start.slice(5).replace('-', '/') || '')}</span>${days ? `<span class="wr-nw-absence-days">${days}일</span>` : ''}</div></div>`;
      }).join('')
    : `<div class="wr-nw-absence-empty">차주 휴가·부재 없음</div>`;
  const fieldRows = nextFieldwork.length
    ? nextFieldwork.slice(0, 3).map(sched => {
        const names = getOperationalScheduleMemberNames(sched).join(', ');
        const start = sched?.start || sched?.start_date || '';
        return `<div class="wr-nw-field-item"><div class="wr-nw-field-who">${esc(names)}</div><div class="wr-nw-field-desc">${esc(sched.title || '필드 일정')}</div><div class="wr-nw-field-date">${esc(start.slice(5).replace('-', '/') || '')}</div></div>`;
      }).join('')
    : `<div class="wr-nw-absence-empty">차주 필드 일정 없음</div>`;
  const startRows = nextStarts.length
    ? nextStarts.slice(0, 3).map(project => {
        const startDate = getWeeklyReviewProjectStartDate(project);
        const memberNames = (projectMemberLinks || [])
          .filter(link => String(link.project_id) === String(project.id))
          .map(link => members.find(m => m.id === link.member_id)?.name || '')
          .filter(Boolean);
        return `<div class="wr-nw-new-item"><div style="display:flex;align-items:center;gap:6px;margin-bottom:2px"><div class="wr-nw-proj-name">${esc(project.name || '')}</div><span class="badge badge-blue" style="font-size:10px">신규</span></div><div class="wr-nw-proj-owner">담당: ${esc(memberNames.slice(0, 2).join(', ') || '-')} · ${esc(startDate ? startDate.slice(5).replace('-', '/') : '')} 착수</div></div>`;
      }).join('')
    : `<div class="wr-nw-absence-empty">차주 신규 착수 프로젝트 없음</div>`;
  return `<section class="card weekly-review-section" data-section-id="next-week" style="margin-top:0">
    <div class="weekly-review-section-head">
      <div>
        <div class="weekly-review-section-title">차주 준비</div>
        <div class="weekly-review-section-sub">다음 주 마감·착수·일정을 한눈에 점검합니다.</div>
      </div>
      <div class="weekly-review-section-controls">
        <button type="button" class="btn ghost sm" onclick="setPage('gantt')">프로젝트 관리</button>
      </div>
    </div>
    <div class="weekly-review-section-content">
      <div class="weekly-review-section-expanded-body">
        <div class="weekly-review-group">
          <div class="weekly-review-group-title">차주 마감 예정</div>
          <div class="wr-nw-deadline-list">
            <div class="wr-nw-deadline-header"><span>프로젝트</span><span>상태</span><span>마감일</span></div>
            ${deadlineRows}
          </div>
        </div>
        <div class="wr-nw-three-col">
          <div class="wr-nw-col-card"><div class="wr-nw-col-label">🏖 휴가 · 부재</div>${leaveRows}</div>
          <div class="wr-nw-col-card"><div class="wr-nw-col-label">📍 필드 · 외부일정</div>${fieldRows}</div>
          <div class="wr-nw-col-card"><div class="wr-nw-col-label">🚀 신규 착수</div>${startRows}</div>
        </div>
      </div>
    </div>
  </section>`;
}

function renderWeeklyReviewActionItems(actionItems,weekStart,isFinalized){
  const items=Array.isArray(actionItems)?actionItems:[];
  const today=getHomeBaseDate();
  today.setHours(0,0,0,0);
  const itemsHtml=items.length
    ?items.map(item=>{
        const isDone=!!item.done;
        const due=item.due?new Date(item.due):null;
        if(due)due.setHours(0,0,0,0);
        const isOverdue=due&&!isDone&&due<today;
        const dueLabel=item.due?String(item.due).slice(5).replace('-','/'):'';
        const dueCls=isOverdue?'wr-action-due--danger':'';
        return '<div class="wr-action-item" data-id="'+esc(item.id||'')+'">'
          +'<button type="button" class="wr-action-check'+(isDone?' is-done':'')+'" '
          +'onclick="toggleWeeklyReviewActionItem(\''+esc(weekStart)+'\',\''+esc(item.id||'')+'\')">'
          +(isDone?'✓':'')
          +'</button>'
          +'<div class="wr-action-body'+(isDone?' is-done':'')+'">'
          +'<div class="wr-action-text">'+esc(item.text||'')+'</div>'
          +'<div class="wr-action-meta">'
          +(item.assignee?'<span class="wr-action-assignee">'+esc(item.assignee)+'</span>':'')
          +(dueLabel?'<span class="wr-action-due '+dueCls+'">'+esc(dueLabel)+'</span>':'')
          +'</div>'
          +'</div>'
          +(!isFinalized?'<button type="button" class="wr-action-delete" onclick="deleteWeeklyReviewActionItem(\''+esc(weekStart)+'\',\''+esc(item.id||'')+'\')">×</button>':'')
          +'</div>';
      }).join('')
    :'<div class="wr-action-empty">등록된 액션 아이템이 없습니다.</div>';
  const addButton=!isFinalized
    ?'<button type="button" class="btn ghost sm" style="margin-top:8px" onclick="openWeeklyReviewActionItemModal(\''+esc(weekStart)+'\')">+ 액션 아이템 추가</button>'
    :'';
  return '<div class="wr-action-list">'+itemsHtml+'</div>'+addButton;
}

function openWeeklyReviewActionItemModal(weekStart){
  const memberOptions=(members||[])
    .filter(member=>member.name)
    .map(member=>'<option value="'+esc(member.name)+'">'+esc(member.name)+'</option>')
    .join('');
  document.getElementById('modalArea').innerHTML=
    getInputModalOverlayHtml()
    +'<div class="modal" style="width:420px"><div class="modal-title">액션 아이템 추가</div>'
    +'<div class="form-row"><label class="form-label">내용</label>'
    +'<input id="wrActionText" placeholder="예) 자료 전달, 일정 확인" autofocus/></div>'
    +'<div class="form-half">'
    +'<div class="form-row"><label class="form-label">담당자</label>'
    +'<select id="wrActionAssignee"><option value="">선택 안 함</option>'+memberOptions+'</select></div>'
    +'<div class="form-row"><label class="form-label">마감일</label>'
    +'<input type="date" id="wrActionDue"/></div>'
    +'</div>'
    +'<div class="modal-footer"><div></div>'
    +'<div class="modal-footer-right">'
    +'<button class="btn ghost" onclick="closeModal()">취소</button>'
    +'<button class="btn primary" onclick="saveWeeklyReviewActionItem(\''+esc(weekStart)+'\')">추가</button>'
    +'</div>'
    +'</div>'
    +'</div></div>';
  lockBodyScroll();
  bindModalEscapeHandler();
}

async function getWeeklyReviewActionItems(weekStart){
  try{
    const snap=await getWeeklyReviewSnapshotAnyStatus(weekStart);
    const items=snap?.snapshot_json?.action_items;
    return Array.isArray(items)?items:[];
  }catch(e){
    return [];
  }
}

async function saveWeeklyReviewActionItems(weekStart,items){
  try{
    const snap=await getWeeklyReviewSnapshotAnyStatus(weekStart);
    if(!snap?.id){
      alert('먼저 초안을 저장해주세요.');
      return false;
    }
    const nextJson={...(snap.snapshot_json||{}),action_items:items};
    await api('PATCH',WEEKLY_REVIEW_SNAPSHOT_TABLE+'?id=eq.'+snap.id,{
      snapshot_json:nextJson
    });
    return true;
  }catch(e){
    alert('저장 실패: '+(e?.message||''));
    return false;
  }
}

async function saveWeeklyReviewActionItem(weekStart){
  const text=document.getElementById('wrActionText')?.value.trim();
  if(!text){alert('내용을 입력해주세요.');return;}
  const assignee=document.getElementById('wrActionAssignee')?.value||'';
  const due=document.getElementById('wrActionDue')?.value||'';
  const items=await getWeeklyReviewActionItems(weekStart);
  const newItem={
    id:typeof crypto!=='undefined'&&typeof crypto.randomUUID==='function'
      ?crypto.randomUUID()
      :Date.now().toString(36)+Math.random().toString(36).slice(2),
    text,
    assignee,
    due,
    done:false,
    created_at:new Date().toISOString()
  };
  const ok=await saveWeeklyReviewActionItems(weekStart,[...items,newItem]);
  if(ok){
    closeModal();
    await renderWeeklyReviewPage(weeklyReviewWeekOffset);
  }
}

async function toggleWeeklyReviewActionItem(weekStart,itemId){
  const items=await getWeeklyReviewActionItems(weekStart);
  const next=items.map(item=>
    String(item.id)===String(itemId)?{...item,done:!item.done}:item
  );
  const ok=await saveWeeklyReviewActionItems(weekStart,next);
  if(ok)await renderWeeklyReviewPage(weeklyReviewWeekOffset);
}

async function deleteWeeklyReviewActionItem(weekStart,itemId){
  if(!confirm('이 액션 아이템을 삭제할까요?'))return;
  const items=await getWeeklyReviewActionItems(weekStart);
  const ok=await saveWeeklyReviewActionItems(weekStart,items.filter(item=>String(item.id)!==String(itemId)));
  if(ok)await renderWeeklyReviewPage(weeklyReviewWeekOffset);
}

async function autoSaveWeeklyReviewMeetingField(el,key){
  if(!el)return;
  const value=el.value||'';
  el.style.borderColor='var(--color-info)';
  try{
    const weekStart=getWeekStart(weeklyReviewWeekOffset);
    const memberName=currentMember?.name||currentUser?.email||'익명';
    const cached=(weeklyReviewLastRenderPayload?.data?.weeklyReviews||[]).find(review=>review?.created_by===currentUser?.id)||null;
    const rows=cached?.id
      ?[cached]
      :await api('GET','weekly_reviews?week_start=eq.'+weekStart+'&member_name=eq.'+encodeURIComponent(memberName)+'&select=*&order=created_at.desc&limit=1').catch(()=>[]);
    const existing=Array.isArray(rows)?rows[0]||null:rows||null;
    if(!existing?.id&&!String(value).trim()){
      el.style.borderColor='';
      return;
    }
    const parsed=parseWeeklyReviewMeetingContent(existing?.content||'');
    parsed[key]=value;
    if(key==='meeting_notes'){
      parsed.decisions='';
      parsed.action_items='';
      parsed.next_week_checks='';
    }
    const content=stringifyWeeklyReviewMeetingContent(parsed);
    const nowIso=new Date().toISOString();
    const body={
      week_start:weekStart,
      member_name:existing?.member_name||memberName,
      content,
      updated_at:nowIso
    };
    if(existing?.id){
      await api('PATCH','weekly_reviews?id=eq.'+existing.id,body);
      existing.content=content;
      existing.updated_at=nowIso;
    }else{
      const inserted=await api('POST','weekly_reviews',{...body,created_by:currentUser?.id||null});
      const nextRow=Array.isArray(inserted)?inserted[0]:null;
      if(nextRow&&weeklyReviewLastRenderPayload?.data?.weeklyReviews){
        weeklyReviewLastRenderPayload.data.weeklyReviews.unshift(nextRow);
      }
    }
    el.style.borderColor='var(--color-success)';
    setTimeout(()=>{if(el)el.style.borderColor='';},1200);
  }catch(error){
    el.style.borderColor='var(--color-danger)';
    console.error('[weekly-review] autoSave failed',error);
  }
}

