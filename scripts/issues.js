let issuesPageCache=[];
let issuesPageFilters={project_id:'',member_id:'',status:'open'};
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

function getIssuesPageStatusMeta(issue,project){
  const statusMeta=getIssueStatusMeta(issue?.status);
  return {label:statusMeta.label,cls:statusMeta.badgeCls};
}

function getIssuesPagePriorityMeta(issue,project){
  const priority=issue?.priority||project?.priority||'medium';
  if(priority==='high')return {label:'높음',cls:'high'};
  if(priority==='low')return {label:'낮음',cls:'low'};
  return {label:'보통',cls:'medium'};
}

function getIssuesPageAssigneeMeta(issue){
  const isMine=!!currentMember&&(
    issue?.assignee_member_id===currentMember.id||
    issue?.assignee_id===currentMember.id||
    (!issue?.assignee_member_id&&(
      issue?.assignee_name===currentMember.name||
      issue?.owner_member_id===currentMember.id||
      issue?.owner_name===currentMember.name
    ))
  );
  return {
    isMine,
    label:isMine?'나':(issue?.assignee_name||issue?.owner_name||'미지정')
  };
}

function getIssuesPageIssueRank(issue,project){
  return getProjectPriorityRank(issue?.priority||project?.priority||'medium');
}

function getIssuesPageRows(){
  return [...(issuesPageCache||[])].filter(issue=>{
    if(issuesPageFilters.project_id&&issue.project_id!==issuesPageFilters.project_id)return false;
    if(issuesPageFilters.member_id){
      const memberMatch=issue.assignee_member_id===issuesPageFilters.member_id||issue.owner_member_id===issuesPageFilters.member_id;
      if(!memberMatch)return false;
    }
    if(issuesPageFilters.status==='pinned')return !!issue.is_pinned;
    if(issuesPageFilters.status==='resolved')return isIssueResolvedStatus(issue.status);
    return isIssueActiveStatus(issue.status);
  }).map(issue=>{
    const project=projects.find(p=>p.id===issue.project_id)||null;
    const client=project?clients.find(c=>c.id===project.client_id):null;
    return {
      ...issue,
      _project:project,
      _client:client,
      _rank:getIssuesPageIssueRank(issue,project)
    };
  }).sort((a,b)=>{
    if(a._rank!==b._rank)return a._rank-b._rank;
    return new Date(b.created_at||0)-new Date(a.created_at||0);
  });
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
    +'<div class="card" style="margin-bottom:14px;padding:14px 16px"><div class="filter-row" style="width:100%"><select onchange="setIssuesPageFilter(\'project_id\',this.value)">'+projectOptions+'</select><select onchange="setIssuesPageFilter(\'member_id\',this.value)">'+memberOptions+'</select><div class="toggle-wrap"><button class="toggle-btn '+(issuesPageFilters.status==='open'?'active':'')+'" onclick="toggleIssuesPageStatus(\'open\')">OPEN</button><button class="toggle-btn '+(issuesPageFilters.status==='pinned'?'active':'')+'" onclick="toggleIssuesPageStatus(\'pinned\')">PINNED</button><button class="toggle-btn '+(issuesPageFilters.status==='resolved'?'active':'')+'" onclick="toggleIssuesPageStatus(\'resolved\')">RESOLVED</button></div></div></div>'
    +(groupedClients.length
      ?'<div class="issues-page-groups">'+groupedClients.map(group=>{
        return '<div>'
          +'<div class="issues-page-client-name">'+esc(group.name)+'</div>'
          +group.projects.map(project=>{
            return '<div class="issues-page-project">'
              +'<div class="issues-page-project-title">'+esc(project.name)+'</div>'
              +project.issues.map(issue=>{
                const statusMeta=getIssuesPageStatusMeta(issue,issue._project);
                const priorityMeta=getIssuesPagePriorityMeta(issue,issue._project);
                const assigneeMeta=getIssuesPageAssigneeMeta(issue);
                const isExpanded=expandedIssuesPageIds.has(issue.id);
                const isOpen=isIssueActiveStatus(issue.status);
                const editable=canEditIssue(issue);
                return '<div id="issue-card-'+issue.id+'" class="issues-page-row'+(assigneeMeta.isMine?' mine':'')+'" onclick="toggleIssuesPageAccordion(\''+issue.id+'\')">'
                  +'<div class="issues-page-row-head">'
                    +'<span class="issues-page-priority '+priorityMeta.cls+'">'+priorityMeta.label+'</span>'
                    +'<span class="issues-page-row-title">'+esc(issue.title||'제목 없음')+'</span>'
                    +'<span class="issues-page-row-assignee">담당자 '+esc(assigneeMeta.label)+'</span>'
                    +'<span class="badge '+statusMeta.cls+' issues-page-row-status">'+statusMeta.label+'</span>'
                  +'</div>'
                  +(isExpanded
                    ?'<div class="issues-page-row-body">'
                      +(issue.content?'<div class="issues-page-row-desc">'+esc(issue.content)+'</div>':'<div class="issues-page-empty">설명 없음</div>')
                      +'<div class="issues-page-row-meta">'
                        +(issue.author_name?'<span>작성자 '+esc(issue.author_name)+'</span>':'')
                        +(issue.created_at?'<span>'+formatCommentDate(issue.created_at)+'</span>':'')
                        +(issue.is_pinned?'<span>고정됨</span>':'')
                      +'</div>'
                      +'<div class="issue-actions" style="margin-top:10px">'
                        +(isOpen?'<button class="issue-action-btn resolve-btn" onclick="event.stopPropagation();resolveIssue(\''+issue.id+'\')" title="해결"><span class="issue-action-label">해결</span></button>':'')
                        +(editable?'<button class="issue-action-btn" onclick="event.stopPropagation();openIssueModal(\''+(issue.project_id||'')+'\',\''+issue.id+'\')" title="수정"><span class="issue-action-label">수정</span></button>':'')
                        +(isAdmin&&isOpen?'<button class="issue-action-btn pin-btn '+(issue.is_pinned?'active':'')+'" onclick="event.stopPropagation();toggleIssuePin(\''+issue.id+'\','+(!issue.is_pinned)+')" title="고정"><span class="issue-action-label">고정</span></button>':'')
                        +(issue.project_id?'<button class="issue-action-btn" onclick="event.stopPropagation();openProjModal(\''+issue.project_id+'\')" title="프로젝트 보기"><span class="issue-action-label">프로젝트 보기</span></button>':'')
                        +'<button class="issue-action-btn" onclick="event.stopPropagation();openIssueComments(\''+issue.id+'\',true)" title="댓글"><span class="issue-action-label">댓글</span></button>'
                      +'</div>'
                      +'<div id="comments-'+issue.id+'" style="display:none"></div>'
                    +'</div>'
                    :'')
                +'</div>';
              }).join('')
            +'</div>';
          }).join('')
        +'</div>';
      }).join('')+'</div>'
      :'<div class="card"><div style="font-size:13px;color:var(--text3)">조건에 맞는 이슈가 없습니다.</div></div>');
  rows.filter(issue=>expandedIssuesPageIds.has(issue.id)).forEach(issue=>openIssueComments(issue.id,true));
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
