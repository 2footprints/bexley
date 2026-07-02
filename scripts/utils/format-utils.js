function getProjectPriorityRank(priority){
  if(priority==='high')return 0;
  if(priority==='low')return 2;
  return 1;
}
function getProjectPriorityBadge(priority){
  if(priority==='high')return '<span class="badge badge-red myweek-row-badge">??</span>';
  if(priority==='low')return '<span class="badge badge-gray myweek-row-badge">??</span>';
  return '';
}
function normalizeIssueEstimatedHours(value){
  const raw=String(value??'').trim();
  if(!raw)return null;
  const hours=Number(raw.replace(',','.'));
  if(!Number.isFinite(hours)||hours<0)return null;
  return Math.round(hours*100)/100;
}
function formatIssueEstimatedHoursLabel(value){
  const hours=normalizeIssueEstimatedHours(value);
  if(hours===null)return '';
  return '?? '+hours.toLocaleString('ko-KR',{maximumFractionDigits:2})+'h';
}
