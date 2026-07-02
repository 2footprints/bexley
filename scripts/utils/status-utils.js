function normalizeAppRole(role){
  const normalized=String(role||'').trim().toLowerCase();
  if(normalized==='team lead'||normalized==='team-lead')return 'team_lead';
  if(normalized==='member')return 'staff';
  return normalized;
}
function isMemberRoleAdmin(member){
  return normalizeAppRole(member?.role)==='admin';
}
function getRoleLabel(role){
  const normalized=normalizeAppRole(role);
  return normalized==='admin'?'???':normalized==='partner'?'Partner':normalized==='team_lead'?'Team Lead':normalized==='manager'?'???':normalized==='staff'?'Staff':normalized==='observer'?'Observer':'???';
}
function getRequestedRoleLabel(role){
  if(!role)return '???';
  return getRoleLabel(role);
}
const ISSUE_ACTIVE_STATUSES=['open','in_progress','waiting'];
const ISSUE_STATUS_META={
  open:{label:'??',badgeCls:'badge-blue'},
  in_progress:{label:'???',badgeCls:'badge-orange'},
  waiting:{label:'??',badgeCls:'badge-gray'},
  resolved:{label:'??',badgeCls:'badge-green'}
};
const ISSUE_CATEGORY_OPTIONS=['??','?? ??????','???','?? ????','??'];
function normalizeIssueStatus(status){
  const value=(status||'').trim();
  return ISSUE_STATUS_META[value]?value:'open';
}
function isIssueResolvedStatus(status){
  return normalizeIssueStatus(status)==='resolved';
}
function isIssueActiveStatus(status){
  return ISSUE_ACTIVE_STATUSES.includes(normalizeIssueStatus(status));
}
function getIssueStatusMeta(status){
  return ISSUE_STATUS_META[normalizeIssueStatus(status)]||ISSUE_STATUS_META.open;
}
function getIssueActiveStatusFilter(){
  return 'status=in.(open,in_progress,waiting)';
}
function buildIssueCategoryOptions(selectedValue=''){
  const normalized=(selectedValue||'').trim();
  const options=[...ISSUE_CATEGORY_OPTIONS];
  if(normalized&&!options.includes(normalized))options.push(normalized);
  return options.map(option=>'<option value="'+esc(option)+'"'+(normalized===option?' selected':'')+'>'+esc(option)+'</option>').join('');
}
function getPortalDocumentRequestStatusMeta(status){
  if(status==='confirmed') return {label:'???? ?', badge:'badge-green'};
  if(status==='uploaded') return {label:'????', badge:'badge-blue'};
  return {label:'???', badge:'badge-gray'};
}
