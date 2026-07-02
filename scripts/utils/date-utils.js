function getIssueStatusChangedAt(issue){
  return issue?.status_changed_at||issue?.updated_at||issue?.created_at||null;
}
function normalizeIssueDueDate(value){
  const raw=String(value||'').trim();
  if(!raw)return null;
  const normalized=typeof formatIssueDateInput==='function'
    ?formatIssueDateInput(raw)
    :raw.split('T')[0];
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized)?normalized:null;
}
function formatIssueDueDateLabel(value){
  const normalized=normalizeIssueDueDate(value);
  if(!normalized)return '';
  return normalized.replace(/-/g,'.');
}
