let issuesPageCache=[];
let issuesPageFilters={project_id:'',member_id:'',status:'all'};
let expandedIssuesPageIds=new Set();
let issuesPageCollapsedClients={};

function setIssuesPageFilter(key,value){
  issuesPageFilters[key]=value||'';
  renderIssuesPageFromCache();
}

function toggleIssuesPageStatus(status){
  issuesPageFilters.status=status;
  renderIssuesPageFromCache();
}

function toggleIssuesPageClientGroup(clientKey){
  issuesPageCollapsedClients[clientKey]=!issuesPageCollapsedClients[clientKey];
  renderIssuesPageFromCache();
}

function toggleIssuesPageAccordion(issueId){
  if(expandedIssuesPageIds.has(issueId))expandedIssuesPageIds.delete(issueId);
  else expandedIssuesPageIds.add(issueId);
  renderIssuesPageFromCache();
}

function getIssuesPageStatusMeta(issue){
  const statusMeta=getIssueStatusMeta(issue?.status);
  return {label:statusMeta.label,cls:statusMeta.badgeCls};
}

function getIssuesPagePriorityMeta(issue,project){
  const priority=String(issue?.priority||project?.priority||'medium').trim().toLowerCase();
  if(priority==='high')return {label:'높음',cls:'high'};
  if(priority==='low')return {label:'낮음',cls:'low'};
  return {label:'보통',cls:'medium'};
}

function getIssuesPageAssigneeMeta(issue){
  const label=issue?.assignee_name||issue?.owner_name||'미지정';
  const isMine=!!currentMember&&(
    String(issue?.assignee_member_id||issue?.assignee_id||'')===String(currentMember.id||'')
    || (!issue?.assignee_member_id&&(
      issue?.assignee_name===currentMember.name
      || String(issue?.owner_member_id||'')===String(currentMember.id||'')
      || issue?.owner_name===currentMember.name
    ))
  );
  return {isMine,label};
}

function getIssuesPageIssueRank(issue,project){
  return getProjectPriorityRank(issue?.priority||project?.priority||'medium');
}

function getIssuesPageAgingDays(issue){
  const baseTs=getIssueStatusChangedAt(issue);
  if(!baseTs)return null;
  const diffMs=Date.now()-new Date(baseTs).getTime();
  if(!Number.isFinite(diffMs))return null;
  return Math.max(0,Math.floor(diffMs/86400000));
}

function getIssuesPageAgingText(issue){
  const days=getIssuesPageAgingDays(issue);
  if(days===null)return '';
  return '에이징 '+days+'일';
}

function getIssuesPageDueDateText(issue){
  if(!issue?.due_date)return '';
  const dueDate=toDate(issue.due_date);
  if(Number.isNaN(dueDate.getTime()))return '';
  return '기한 '+formatRangeShort(issue.due_date,issue.due_date);
}

function getIssuesPageProjectContext(issue){
  const clientName=issue?issue._client?.name||'':'';
  const projectName=issue?issue._project?.name||'프로젝트 없음':'프로젝트 없음';
  return [clientName,projectName].filter(Boolean).join(' · ');
}

function getIssuesPageSummaryCounts(rows){
  const counts={all:rows.length,open:0,in_progress:0,waiting:0,resolved:0,mine:0};
  rows.forEach(issue=>{
    const status=normalizeIssueStatus(issue.status);
    if(counts[status]!==undefined)counts[status]+=1;
    if(getIssuesPageAssigneeMeta(issue).isMine)counts.mine+=1;
  });
  return counts;
}

function getIssuesPageRows(){
  return [...(issuesPageCache||[])]
    .filter(issue=>{
      if(issuesPageFilters.project_id&&issue.project_id!==issuesPageFilters.project_id)return false;
      if(issuesPageFilters.member_id){
        const memberMatch=String(issue.assignee_member_id||'')===String(issuesPageFilters.member_id)
          || String(issue.owner_member_id||'')===String(issuesPageFilters.member_id);
        if(!memberMatch)return false;
      }
      if(issuesPageFilters.status==='all')return true;
      return normalizeIssueStatus(issue.status)===issuesPageFilters.status;
    })
    .map(issue=>{
      const project=projects.find(projectItem=>projectItem.id===issue.project_id)||null;
      const client=project?clients.find(clientItem=>clientItem.id===project.client_id)||null:null;
      return {
        ...issue,
        _project:project,
        _client:client,
        _rank:getIssuesPageIssueRank(issue,project)
      };
    })
    .sort((a,b)=>{
      if(a._rank!==b._rank)return a._rank-b._rank;
      const aDue=a?.due_date?new Date(a.due_date).getTime():Number.POSITIVE_INFINITY;
      const bDue=b?.due_date?new Date(b.due_date).getTime():Number.POSITIVE_INFINITY;
      if(aDue!==bDue)return aDue-bDue;
      return new Date(b.created_at||0)-new Date(a.created_at||0);
    });
}

function renderIssuesPageSummaryCards(rows){
  const counts=getIssuesPageSummaryCounts(rows);
  const cards=[
    {label:'전체',value:counts.all},
    {label:'열림',value:counts.open},
    {label:'진행중',value:counts.in_progress},
    {label:'대기',value:counts.waiting},
    {label:'내 담당',value:counts.mine}
  ];
  return '<div class="issues-page-summary-grid">'+cards.map(card=>
    '<div class="issues-page-summary-card">'
      +'<div class="issues-page-summary-label">'+card.label+'</div>'
      +'<div class="issues-page-summary-value">'+card.value+'</div>'
    +'</div>'
  ).join('')+'</div>';
}

function renderIssuesPageFromCache(){
  const el=document.getElementById('pageIssues');
  if(!el)return;
  const projectOptions=['<option value="">전체 프로젝트</option>']
    .concat((projects||[]).map(project=>'<option value="'+project.id+'"'+(issuesPageFilters.project_id===project.id?' selected':'')+'>'+esc(project.name)+'</option>'))
    .join('');
  const memberOptions=['<option value="">전체 담당자</option>']
    .concat((members||[]).map(member=>'<option value="'+member.id+'"'+(issuesPageFilters.member_id===member.id?' selected':'')+'>'+esc(member.name)+'</option>'))
    .join('');
  const rows=getIssuesPageRows();
  const createBtn=canCreateIssueRole()?'<button class="btn primary sm" onclick="openIssueModal()">+ 이슈 등록</button>':'';
  const statusFilterButtons=[
    {value:'all',label:'전체'},
    {value:'open',label:'열림'},
    {value:'in_progress',label:'진행중'},
    {value:'waiting',label:'대기'},
    {value:'resolved',label:'해결'}
  ].map(filter=>'<button class="toggle-btn '+(issuesPageFilters.status===filter.value?'active':'')+'" onclick="toggleIssuesPageStatus(\''+filter.value+'\')">'+filter.label+'</button>').join('');

  const groupedClients=Object.values(rows.reduce((acc,issue)=>{
    const project=issue._project||null;
    const client=issue._client||null;
    const clientKey=client?.id||('client-'+(project?.client_id||'none'));
    const projectKey=project?.id||('project-'+issue.id);
    if(!acc[clientKey]){
      acc[clientKey]={
        key:clientKey,
        name:client?.name||'기타',
        projects:{}
      };
    }
    if(!acc[clientKey].projects[projectKey]){
      acc[clientKey].projects[projectKey]={
        id:project?.id||'',
        name:project?.name||'프로젝트 없음',
        issues:[]
      };
    }
    acc[clientKey].projects[projectKey].issues.push(issue);
    return acc;
  },{})).map(group=>({
    ...group,
    issueCount:Object.values(group.projects).reduce((sum,project)=>sum+project.issues.length,0),
    projects:Object.values(group.projects).map(project=>({
      ...project,
      issues:[...project.issues].sort((a,b)=>{
        if(a._rank!==b._rank)return a._rank-b._rank;
        return new Date(b.created_at||0)-new Date(a.created_at||0);
      })
    })).sort((a,b)=>{
      const aTop=a.issues[0]?a.issues[0]._rank:99;
      const bTop=b.issues[0]?b.issues[0]._rank:99;
      if(aTop!==bTop)return aTop-bTop;
      return a.name.localeCompare(b.name,'ko');
    })
  })).sort((a,b)=>a.name.localeCompare(b.name,'ko'));

  el.innerHTML='<div class="section-header" style="margin-bottom:16px"><h2 class="section-title">이슈</h2>'+createBtn+'</div>'
    +renderIssuesPageSummaryCards(rows)
    +'<div class="card issues-page-filter-card"><div class="filter-row" style="width:100%"><select onchange="setIssuesPageFilter(\'project_id\',this.value)">'+projectOptions+'</select><select onchange="setIssuesPageFilter(\'member_id\',this.value)">'+memberOptions+'</select><div class="toggle-wrap">'+statusFilterButtons+'</div></div></div>'
    +(groupedClients.length
      ?'<div class="issues-page-groups">'+groupedClients.map(group=>{
        const isCollapsed=!!issuesPageCollapsedClients[group.key];
        return '<div class="issues-page-client-group">'
          +'<button type="button" class="issues-page-client-head" onclick="toggleIssuesPageClientGroup(\''+group.key+'\')">'
            +'<span class="issues-page-client-name">'+esc(group.name)+'</span>'
            +'<span class="issues-page-client-count">'+group.issueCount+'건</span>'
            +'<span class="issues-page-client-toggle">'+(isCollapsed?'펼치기':'접기')+'</span>'
          +'</button>'
          +(isCollapsed?'':'<div class="issues-page-client-body">'+group.projects.map(project=>{
            return '<div class="issues-page-project">'
              +'<div class="issues-page-project-head">'
                +'<div class="issues-page-project-title">'+esc(project.name)+'</div>'
                +'<div class="issues-page-project-count">'+project.issues.length+'건</div>'
              +'</div>'
              +project.issues.map(issue=>{
                const statusMeta=getIssuesPageStatusMeta(issue);
                const priorityMeta=getIssuesPagePriorityMeta(issue,issue._project);
                const assigneeMeta=getIssuesPageAssigneeMeta(issue);
                const isExpanded=expandedIssuesPageIds.has(issue.id);
                const isOpen=isIssueActiveStatus(issue.status);
                const editable=canEditIssue(issue);
                const dueDateText=getIssuesPageDueDateText(issue);
                const agingText=getIssuesPageAgingText(issue);
                const projectContext=getIssuesPageProjectContext(issue);
                return '<div id="issue-card-'+issue.id+'" class="issues-page-row'+(assigneeMeta.isMine?' mine':'')+(isExpanded?' expanded':'')+'">'
                  +'<div class="issues-page-row-head" onclick="toggleIssuesPageAccordion(\''+issue.id+'\')">'
                    +'<div class="issues-page-row-main">'
                      +'<div class="issues-page-row-chipline">'
                        +'<span class="issues-page-priority '+priorityMeta.cls+'">'+priorityMeta.label+'</span>'
                        +'<span class="badge '+statusMeta.cls+' issues-page-row-status">'+statusMeta.label+'</span>'
                        +(assigneeMeta.isMine?'<span class="issues-page-inline-tag mine">내 담당</span>':'')
                        +(issue.is_pinned?'<span class="issues-page-inline-tag pinned">고정</span>':'')
                      +'</div>'
                      +'<div class="issues-page-row-title-line"><span class="issues-page-row-title">'+esc(issue.title||'제목 없음')+'</span></div>'
                      +'<div class="issues-page-row-subline">'
                        +(projectContext?'<span class="issues-page-inline-meta">'+esc(projectContext)+'</span>':'')
                        +'<span class="issues-page-inline-meta">담당 '+esc(assigneeMeta.label)+'</span>'
                        +(issue.category?'<span class="issues-page-inline-meta">분류 '+esc(issue.category)+'</span>':'')
                        +(dueDateText?'<span class="issues-page-inline-meta">'+esc(dueDateText)+'</span>':'')
                        +(agingText?'<span class="issues-page-inline-meta">'+esc(agingText)+'</span>':'')
                      +'</div>'
                    +'</div>'
                    +'<div class="issues-page-row-toggle">'+(isExpanded?'접기':'상세 보기')+'</div>'
                  +'</div>'
                  +(isExpanded
                    ?'<div class="issues-page-row-body">'
                      +'<div class="issues-page-detail-grid">'
                        +'<div class="issues-page-detail-card">'
                          +'<div class="issues-page-detail-kicker">요약</div>'
                          +'<div class="issues-page-row-meta">'
                            +(issue.author_name?'<span>작성자 '+esc(issue.author_name)+'</span>':'')
                            +(getIssueStatusChangedAt(issue)?'<span>상태 기준 '+formatCommentDate(getIssueStatusChangedAt(issue))+'</span>':'')
                            +(issue._project?.name?'<span>관련 프로젝트 '+esc(issue._project.name)+'</span>':'')
                          +'</div>'
                          +renderIssuePeopleBadges(issue||{})
                        +'</div>'
                        +'<div class="issues-page-detail-card">'
                          +'<div class="issues-page-detail-kicker">본문</div>'
                          +(issue.content?'<div class="issues-page-row-desc">'+esc(issue.content)+'</div>':'<div class="issues-page-empty">설명 없음</div>')
                        +'</div>'
                      +'</div>'
                      +(normalizeIssueStatus(issue.status)==='waiting'&&issue.waiting_reason?'<div class="helper-box issues-page-helper-box"><div class="helper-title">대기 사유</div><div class="helper-text">'+esc(issue.waiting_reason)+'</div></div>':'')
                      +'<div class="issues-page-action-row">'
                        +(isOpen?'<button class="issue-action-btn resolve-btn" onclick="event.stopPropagation();resolveIssue(\''+issue.id+'\')" title="해결"><span class="issue-action-label">해결</span></button>':'<button class="issue-action-btn" onclick="event.stopPropagation();reopenIssue(\''+issue.id+'\')" title="다시 열기"><span class="issue-action-label">재오픈</span></button>')
                        +(editable?'<button class="issue-action-btn" onclick="event.stopPropagation();openIssueModal(\''+(issue.project_id||'')+'\',\''+issue.id+'\')" title="수정"><span class="issue-action-label">수정</span></button>':'')
                        +(isAdmin&&isOpen?'<button class="issue-action-btn pin-btn '+(issue.is_pinned?'active':'')+'" onclick="event.stopPropagation();toggleIssuePin(\''+issue.id+'\','+(!issue.is_pinned)+')" title="고정"><span class="issue-action-label">고정</span></button>':'')
                        +(issue.project_id?'<button class="issue-action-btn" onclick="event.stopPropagation();openProjModal(\''+issue.project_id+'\')" title="프로젝트 보기"><span class="issue-action-label">프로젝트 보기</span></button>':'')
                        +'<button class="issue-action-btn" onclick="event.stopPropagation();openIssueComments(\''+issue.id+'\',true)" title="댓글"><span class="issue-action-label">댓글</span></button>'
                      +'</div>'
                      +'<div class="issues-page-comments-shell">'
                        +'<div class="issues-page-detail-kicker">댓글</div>'
                        +'<div id="comments-'+issue.id+'" style="display:none"></div>'
                      +'</div>'
                    +'</div>'
                    :'')
                +'</div>';
              }).join('')
            +'</div>';
          }).join('')+'</div>')
        +'</div>';
      }).join('')+'</div>'
      :'<div class="card"><div style="font-size:13px;color:var(--text3)">조건에 맞는 이슈가 없습니다.</div></div>');

  rows
    .filter(issue=>expandedIssuesPageIds.has(issue.id))
    .forEach(issue=>openIssueComments(issue.id,true));
}

async function renderIssuesPage(){
  const el=document.getElementById('pageIssues');
  if(!el)return;
  el.innerHTML='<div class="card"><div style="font-size:13px;color:var(--text3)">이슈를 불러오는 중...</div></div>';
  try{
    const rows=await api('GET','project_issues?select=*&order=created_at.desc');
    issuesPageCache=Array.isArray(rows)?rows.filter(Boolean):[];
    renderIssuesPageFromCache();
  }catch(e){
    el.innerHTML='<div class="card"><div style="font-size:13px;color:var(--red)">이슈를 불러오지 못했습니다.</div></div>';
  }
}
