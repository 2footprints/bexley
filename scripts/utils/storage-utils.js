const AUTH_ACCESS_TOKEN_KEY='sb_a';
const AUTH_REFRESH_TOKEN_KEY='sb_r';
const PORTAL_CLIENT_ID_KEY='portal_client_id';
const NOTICE_READ_KEY_PREFIX='notice_read_';
const BILLING_DRAFT_KEY_PREFIX='billing_draft_';
const GANTT_HIDE_COMPLETED_KEY='bexley_gantt_hide_completed';
const GANTT_SHOW_PERSONAL_OVERLAY_KEY='bexley_gantt_show_personal_overlay';
const GANTT_SHOW_PERSONAL_ROWS_KEY='bexley_gantt_show_personal_rows';
const GANTT_PERSONAL_OPTIONS_MIGRATION_KEY='bexley_gantt_personal_options_default_off_v1';
const GANTT_PROJECT_TASKS_COLLAPSED_KEY='bexley.ganttList.collapsedProjectTaskIds';
const GANTT_PROJECT_TASKS_COLLAPSED_LEGACY_KEY='bexley.ganttList.collapsedProjectIds';
const GANTT_LEFT_WIDTH_STORAGE_KEY='bexley.gantt.timelineLeftWidth';
const GANTT_LEFT_WIDTH_DEFAULT=400;
const GANTT_LEFT_WIDTH_MIN=280;
const GANTT_LEFT_WIDTH_MAX=720;

function safeJsonParse(value,fallback){
  try{return value==null?fallback:JSON.parse(value);}catch(e){return fallback;}
}
function safeJsonStringify(value,fallback='{}'){
  try{return JSON.stringify(value);}catch(e){return fallback;}
}
function getLocalStorageItem(key,fallback=null){
  try{
    const value=localStorage.getItem(key);
    return value===null?fallback:value;
  }catch(e){return fallback;}
}
function setLocalStorageItem(key,value){
  try{localStorage.setItem(key,value);return true;}catch(e){return false;}
}
function removeLocalStorageItem(key){
  try{localStorage.removeItem(key);return true;}catch(e){return false;}
}
function readStoredBoolean(key,fallback){
  const stored=getLocalStorageItem(key,null);
  if(stored===null)return fallback;
  return stored!=='0';
}
function writeStoredBoolean(key,value){
  setLocalStorageItem(key,value?'1':'0');
}
function readStoredNumber(key,fallback){
  const value=Number(getLocalStorageItem(key,null));
  return Number.isFinite(value)?value:fallback;
}
function writeStoredNumber(key,value){
  setLocalStorageItem(key,String(Math.round(value)));
}
function readStoredGanttToggle(key,fallback){
  return readStoredBoolean(key,fallback);
}
function writeStoredGanttToggle(key,value){
  writeStoredBoolean(key,value);
}
function noticeReadKey(id){return NOTICE_READ_KEY_PREFIX+(currentUser?.id||'guest')+'_'+id;}
function isNoticeRead(id){return getLocalStorageItem(noticeReadKey(id),null)==='1';}
function markNoticeRead(id){setLocalStorageItem(noticeReadKey(id),'1');}
function billingDraftKey(id){return BILLING_DRAFT_KEY_PREFIX+(currentUser?.id||'guest')+'_'+id;}
function getBillingDraft(id){return safeJsonParse(getLocalStorageItem(billingDraftKey(id),'{}'),{});}
function saveBillingDraft(id,data){setLocalStorageItem(billingDraftKey(id),safeJsonStringify(data||{},'{}'));}
function loadGanttCollapsedProjectTaskIds(){
  const raw=getLocalStorageItem(GANTT_PROJECT_TASKS_COLLAPSED_KEY,null)
    ||getLocalStorageItem(GANTT_PROJECT_TASKS_COLLAPSED_LEGACY_KEY,null);
  const ids=safeJsonParse(raw||'[]',[]);
  return new Set(Array.isArray(ids)?ids.map(id=>String(id)):[]);
}
function persistGanttCollapsedProjectTaskIds(){
  setLocalStorageItem(GANTT_PROJECT_TASKS_COLLAPSED_KEY,safeJsonStringify([...ganttCollapsedProjectTaskIds],'[]'));
}
function loadGanttTimelineLeftWidth(){
  const value=readStoredNumber(GANTT_LEFT_WIDTH_STORAGE_KEY,GANTT_LEFT_WIDTH_DEFAULT);
  return Number.isFinite(value)&&value>0?value:GANTT_LEFT_WIDTH_DEFAULT;
}
function persistGanttTimelineLeftWidth(value){
  writeStoredNumber(GANTT_LEFT_WIDTH_STORAGE_KEY,value);
}
