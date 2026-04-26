let issuesPageCache=[];
let issuesPageFilters={project_id:'',client_id:'',member_id:'',status:'all',focus:'all'};
let expandedIssuesPageIds=new Set();
let issuesPageCollapsedClients={};
let issuesPageTaskTitleMap={};

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
  if(priority==='high')return {label:'우선 확인',cls:'high'};
  if(priority==='low')return {label:'일반',cls:'low'};
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

function getIssuesPageTextBlob(issue){
  return [
    issue?.title||'',
    issue?.content||'',
    issue?.waiting_reason||'',
    issue?.category||''
  ].join(' ');
}

function getIssuesPageCompactText(text,maxLength=18){
  const value=String(text||'').trim();
  if(!value)return '';
  return value.length>maxLength?(value.slice(0,maxLength-1)+'…'):value;
}

function getIssuesPageWeekBounds(baseDate=new Date()){
  const start=new Date(baseDate);
  start.setHours(0,0,0,0);
  const day=start.getDay();
  const diff=day===0?-6:1-day;
  start.setDate(start.getDate()+diff);
  const end=new Date(start);
  end.setDate(end.getDate()+7);
  return {start,end};
}

function isIssuesPageLongOpen(issue){
  return isIssueActiveStatus(issue?.status)&&Number(issue?._agingDays??getIssuesPageAgingDays(issue)??0)>=14;
}

function getIssuesPageThisWeekNewCount(rows){
  const {start,end}=getIssuesPageWeekBounds();
  return rows.filter(issue=>{
    const createdAt=issue?.created_at?new Date(issue.created_at):null;
    if(!createdAt||Number.isNaN(createdAt.getTime()))return false;
    return createdAt>=start&&createdAt<end;
  }).length;
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

function getIssuesPageDueMeta(issue){
  if(!issue?.due_date)return {tone:'neutral',label:'',days:null};
  const dueDate=toDate(issue.due_date);
  if(Number.isNaN(dueDate.getTime()))return {tone:'neutral',label:'',days:null};
  const today=new Date();
  today.setHours(0,0,0,0);
  dueDate.setHours(0,0,0,0);
  const diff=Math.round((dueDate.getTime()-today.getTime())/86400000);
  if(diff<0)return {tone:'danger',label:'기한 경과',days:diff};
  if(diff===0)return {tone:'warn',label:'오늘 기한',days:diff};
  if(diff<=2)return {tone:'warn',label:'기한 임박',days:diff};
  return {tone:'neutral',label:'',days:diff};
}

function getIssuesPageNextCheckMeta(issue){
  const dueMeta=getIssuesPageDueMeta(issue);
  if(issue?.due_date){
    return {
      label:formatRangeShort(issue.due_date,issue.due_date),
      tone:dueMeta.tone,
      helper:dueMeta.label||'다음 확인일'
    };
  }
  return {label:'미정',tone:'neutral',helper:'다음 확인일 미정'};
}

function getIssuesPageProjectContext(issue){
  const clientName=issue?issue._client?.name||'':'';
  const projectName=issue?issue._project?.name||'프로젝트 없음':'프로젝트 없음';
  return [clientName,projectName].filter(Boolean).join(' · ');
}

function getIssuesPageCategoryMeta(issue){
  const raw=String(issue?.category||'').trim();
  const textBlob=getIssuesPageTextBlob(issue);
  if(raw==='자료'||/자료|문서|증빙|파일|제출/.test(textBlob))return {label:'자료',cls:'documents'};
  if(raw==='내부검토'||/검토|리뷰|승인|내부/.test(textBlob))return {label:'내부검토',cls:'review'};
  if(raw==='일정리스크'||/일정|마감|기한|지연/.test(textBlob))return {label:'일정리스크',cls:'schedule'};
  if(raw==='청구/계약'||/청구|수금|계약|정산|세금계산서|invoice|billing/i.test(textBlob))return {label:'청구/계약',cls:'billing'};
  if(raw==='고객 커뮤니케이션'||/고객|거래처|미팅|커뮤니케이션/.test(textBlob))return {label:'고객 대응',cls:'client'};
  return {label:raw||'기타',cls:'general'};
}

function getIssuesPageBlockedReason(issue){
  const waitingReason=getIssuesPageCompactText(issue?.waiting_reason||'',44);
  if(waitingReason)return waitingReason;
  const firstLine=getIssuesPageCompactText(String(issue?.content||'').split('\n').find(Boolean)||'',44);
  if(firstLine)return firstLine;
  const categoryMeta=issue?._category||getIssuesPageCategoryMeta(issue);
  if(categoryMeta.cls==='documents')return '자료 회신 또는 제출 확인이 필요합니다.';
  if(categoryMeta.cls==='review')return '내부 검토가 완료되지 않았습니다.';
  if(categoryMeta.cls==='schedule')return '일정 조정과 마감 재확인이 필요합니다.';
  if(categoryMeta.cls==='billing')return '청구 또는 계약 확인이 남아 있습니다.';
  if(categoryMeta.cls==='client')return '고객 회신 또는 커뮤니케이션 확인이 필요합니다.';
  if(String(issue?.task_id||'').trim())return '연결 업무 확인이 필요한 상태입니다.';
  return '현재 막힌 이유를 추가로 확인해야 합니다.';
}

function getIssuesPageQuickActionMeta(issue){
  if(issue?.project_id&&String(issue?.task_id||'').trim()){
    return {
      label:'연결 업무 보기',
      action:'openGanttProjectWorkTab(\''+issue.project_id+'\')'
    };
  }
  if(issue?.project_id){
    return {
      label:'프로젝트 보기',
      action:'openProjModal(\''+issue.project_id+'\')'
    };
  }
  return {label:'다음 확인',action:''};
}

async function loadIssuesPageTaskTitles(force=false){
  if(!force&&Object.keys(issuesPageTaskTitleMap||{}).length)return issuesPageTaskTitleMap;
  try{
    const rows=await api('GET','project_tasks?select=id,title');
    issuesPageTaskTitleMap=Object.fromEntries((Array.isArray(rows)?rows:[]).map(task=>[String(task?.id||''),task?.title||'']));
  }catch(e){
    issuesPageTaskTitleMap={};
  }
  return issuesPageTaskTitleMap;
}

function getIssuesPageScopeMeta(issue){
  const taskId=String(issue?.task_id||'').trim();
  const taskTitle=String(issue?._taskTitle||'').trim();
  if(taskId){
    return {
      label:taskTitle?('업무 · '+getIssuesPageCompactText(taskTitle,20)):'업무 연결 이슈',
      cls:'task'
    };
  }
  return {
    label:'프로젝트 이슈',
    cls:'project'
  };
}

function getIssuesPageImpactMeta(issue){
  const status=normalizeIssueStatus(issue?.status);
  const agingDays=issue?._agingDays??getIssuesPageAgingDays(issue);
  const dueMeta=getIssuesPageDueMeta(issue);
  const priority=String(issue?.priority||issue?._project?.priority||'medium').trim().toLowerCase();
  const textBlob=getIssuesPageTextBlob(issue);
  if(status==='resolved')return {label:'해결됨',tone:'ok',rank:9};
  if(status==='waiting')return {label:'실행 영향',tone:'danger',rank:0};
  if(dueMeta.tone==='danger')return {label:'실행 영향',tone:'danger',rank:1};
  if(priority==='high'||!!issue?.is_pinned)return {label:'우선 확인',tone:'warn',rank:2};
  if(agingDays!==null&&agingDays>=14)return {label:'장기 미해결',tone:'warn',rank:3};
  if(String(issue?.category||'').trim()==='고객 커뮤니케이션'||/고객|거래처/.test(textBlob))return {label:'고객 영향 가능',tone:'warn',rank:4};
  return {label:'확인 필요',tone:'neutral',rank:5};
}

function getIssuesPageFollowUpMeta(issue){
  const status=normalizeIssueStatus(issue?.status);
  const textBlob=getIssuesPageTextBlob(issue);
  const isTaskLinked=!!String(issue?.task_id||'').trim();
  const dueMeta=getIssuesPageDueMeta(issue);
  if(isTaskLinked)return {label:'Work에서 조정 필요',destination:'work'};
  if(status==='waiting'){
    if(/자료|문서|증빙|파일/.test(textBlob))return {label:'자료 확인 필요',destination:'documents'};
    return {label:'프로젝트 일정 점검 필요',destination:'project'};
  }
  if(/청구|수금|계약|정산|세금계산서|invoice|billing/i.test(textBlob))return {label:'계약/청구 확인 필요',destination:'contracts'};
  if(String(issue?.category||'').trim()==='자료'||/자료|문서|증빙|파일/.test(textBlob))return {label:'자료 확인 필요',destination:'documents'};
  if(String(issue?.category||'').trim()==='고객 커뮤니케이션'||/고객|거래처|미팅|커뮤니케이션/.test(textBlob))return {label:'거래처 follow-up 필요',destination:'clients'};
  if(dueMeta.tone==='danger')return {label:'프로젝트 일정 점검 필요',destination:'project'};
  return {label:'프로젝트 점검 필요',destination:'project'};
}

function getIssuesPageSummaryCounts(rows){
  const openRows=rows.filter(issue=>isIssueActiveStatus(issue.status));
  const longOpenRows=openRows.filter(issue=>(issue?._agingDays??0)>=14);
  const affectedProjects=new Set(openRows.map(issue=>String(issue?.project_id||'')).filter(Boolean));
  const counts={
    open:openRows.length,
    longOpen:longOpenRows.length,
    projects:affectedProjects.size,
    newThisWeek:getIssuesPageThisWeekNewCount(rows)
  };
  return counts;
}

function getIssuesPageRows(){
  return [...(issuesPageCache||[])]
    .map(issue=>{
      const project=projects.find(projectItem=>projectItem.id===issue.project_id)||null;
      const client=project?clients.find(clientItem=>clientItem.id===project.client_id)||null:null;
      const agingDays=getIssuesPageAgingDays(issue);
      const enrichedIssue={
        ...issue,
        _project:project,
        _client:client,
        _rank:getIssuesPageIssueRank(issue,project),
        _agingDays:agingDays,
        _taskTitle:issuesPageTaskTitleMap[String(issue?.task_id||'')]||''
      };
      return {
        ...enrichedIssue,
        _scope:getIssuesPageScopeMeta(enrichedIssue),
        _impact:getIssuesPageImpactMeta(enrichedIssue),
        _followUp:getIssuesPageFollowUpMeta(enrichedIssue),
        _category:getIssuesPageCategoryMeta(enrichedIssue),
        _blockedReason:getIssuesPageBlockedReason(enrichedIssue),
        _nextCheck:getIssuesPageNextCheckMeta(enrichedIssue)
      };
    })
    .filter(issue=>{
      if(issuesPageFilters.project_id&&issue.project_id!==issuesPageFilters.project_id)return false;
      if(issuesPageFilters.client_id&&String(issue?._client?.id||'')!==String(issuesPageFilters.client_id))return false;
      if(issuesPageFilters.member_id){
        const memberMatch=String(issue.assignee_member_id||'')===String(issuesPageFilters.member_id)
          || String(issue.owner_member_id||'')===String(issuesPageFilters.member_id);
        if(!memberMatch)return false;
      }
      if(issuesPageFilters.status!=='all'&&normalizeIssueStatus(issue.status)!==issuesPageFilters.status)return false;
      if(issuesPageFilters.focus==='impact'&&!['실행 영향','우선 확인'].includes(issue?._impact?.label||''))return false;
      if(issuesPageFilters.focus==='long_open'&&!((issue?._agingDays??0)>=14&&isIssueActiveStatus(issue.status)))return false;
      if(issuesPageFilters.focus==='task'&&!String(issue?.task_id||'').trim())return false;
      return true;
    })
    .sort((a,b)=>{
      if((a?._impact?.rank||99)!==(b?._impact?.rank||99))return (a?._impact?.rank||99)-(b?._impact?.rank||99);
      if(a._rank!==b._rank)return a._rank-b._rank;
      const aDue=a?.due_date?new Date(a.due_date).getTime():Number.POSITIVE_INFINITY;
      const bDue=b?.due_date?new Date(b.due_date).getTime():Number.POSITIVE_INFINITY;
      if(aDue!==bDue)return aDue-bDue;
      const agingDiff=Number(b?._agingDays??-1)-Number(a?._agingDays??-1);
      if(agingDiff)return agingDiff;
      return new Date(b.created_at||0)-new Date(a.created_at||0);
    });
}

function renderIssuesPageSummaryCards(rows){
  const counts=getIssuesPageSummaryCounts(rows);
  const cards=[
    {label:'열린 이슈 수',value:counts.open,sub:'현재 후속 확인이 필요한 이슈',tone:counts.open?'warn':'quiet'},
    {label:'장기 미해결 이슈 수',value:counts.longOpen,sub:'14일 이상 열린 이슈',tone:counts.longOpen?'danger':'quiet'},
    {label:'영향 프로젝트 수',value:counts.projects,sub:'열린 이슈가 걸린 프로젝트 기준',tone:counts.projects?'info':'quiet'},
    {label:'이번 주 신규 이슈',value:counts.newThisWeek,sub:'이번 주 새로 등록된 리스크',tone:counts.newThisWeek?'warn':'quiet'}
  ];
  return '<div class="issues-page-summary-grid">'+cards.map(card=>
    '<div class="issues-page-summary-card'+(card.tone?' is-'+card.tone:'')+'">'
      +'<div class="issues-page-summary-label">'+card.label+'</div>'
      +'<div class="issues-page-summary-value">'+card.value+'</div>'
      +(card.sub?'<div class="issues-page-summary-sub">'+card.sub+'</div>':'')
    +'</div>'
  ).join('')+'</div>';
}

function renderIssuesPageFromCache(){
  const el=document.getElementById('pageIssues');
  if(!el)return;
  const projectOptions=['<option value="">전체 프로젝트</option>']
    .concat((projects||[]).map(project=>'<option value="'+project.id+'"'+(issuesPageFilters.project_id===project.id?' selected':'')+'>'+esc(project.name)+'</option>'))
    .join('');
  const clientIdsWithIssues=new Set((issuesPageCache||[]).map(issue=>{
    const project=projects.find(projectItem=>projectItem.id===issue.project_id)||null;
    return String(project?.client_id||'');
  }).filter(Boolean));
  const clientOptions=['<option value="">전체 거래처</option>']
    .concat((clients||[])
      .filter(client=>clientIdsWithIssues.has(String(client.id||'')))
      .map(client=>'<option value="'+client.id+'"'+(issuesPageFilters.client_id===client.id?' selected':'')+'>'+esc(client.name)+'</option>'))
    .join('');
  const memberOptions=['<option value="">전체 담당자</option>']
    .concat((members||[]).map(member=>'<option value="'+member.id+'"'+(issuesPageFilters.member_id===member.id?' selected':'')+'>'+esc(member.name)+'</option>'))
    .join('');
  const focusOptions=[
    {value:'all',label:'전체 관점'},
    {value:'impact',label:'실행 영향'},
    {value:'long_open',label:'장기 미해결'},
    {value:'task',label:'업무 연결'}
  ].map(option=>'<option value="'+option.value+'"'+(issuesPageFilters.focus===option.value?' selected':'')+'>'+option.label+'</option>').join('');
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
    topRank:Math.min(...Object.values(group.projects).flatMap(project=>project.issues.map(issue=>issue?._impact?.rank??99)),99),
    projects:Object.values(group.projects).map(project=>({
      ...project,
      issues:[...project.issues].sort((a,b)=>{
        if((a?._impact?.rank||99)!==(b?._impact?.rank||99))return (a?._impact?.rank||99)-(b?._impact?.rank||99);
        if(a._rank!==b._rank)return a._rank-b._rank;
        return new Date(b.created_at||0)-new Date(a.created_at||0);
      })
    })).sort((a,b)=>{
      const aTop=a.issues[0]?a.issues[0]._impact?.rank??a.issues[0]._rank:99;
      const bTop=b.issues[0]?b.issues[0]._impact?.rank??b.issues[0]._rank:99;
      if(aTop!==bTop)return aTop-bTop;
      return a.name.localeCompare(b.name,'ko');
    })
  })).sort((a,b)=>{
    if(a.topRank!==b.topRank)return a.topRank-b.topRank;
    if(a.issueCount!==b.issueCount)return b.issueCount-a.issueCount;
    return a.name.localeCompare(b.name,'ko');
  });

  el.innerHTML='<div class="section-header" style="margin-bottom:12px"><h2 class="section-title">이슈 리스크 보드</h2>'+createBtn+'</div>'
    +'<div class="issues-page-intro">열린 이슈와 장기 미해결 이슈를 먼저 보고, 다음 확인과 연결 업무로 바로 이어지는 리스크 관리 화면입니다.</div>'
    +renderIssuesPageSummaryCards(rows)
    +'<div class="card issues-page-filter-card"><div class="filter-row issues-page-filter-row" style="width:100%"><select onchange="setIssuesPageFilter(\'client_id\',this.value)">'+clientOptions+'</select><select onchange="setIssuesPageFilter(\'project_id\',this.value)">'+projectOptions+'</select><select onchange="setIssuesPageFilter(\'member_id\',this.value)">'+memberOptions+'</select><select onchange="setIssuesPageFilter(\'focus\',this.value)">'+focusOptions+'</select><div class="toggle-wrap">'+statusFilterButtons+'</div></div></div>'
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
                const scopeMeta=issue._scope||getIssuesPageScopeMeta(issue);
                const impactMeta=issue._impact||getIssuesPageImpactMeta(issue);
                const followUpMeta=issue._followUp||getIssuesPageFollowUpMeta(issue);
                const categoryMeta=issue._category||getIssuesPageCategoryMeta(issue);
                const blockedReason=issue._blockedReason||getIssuesPageBlockedReason(issue);
                const nextCheckMeta=issue._nextCheck||getIssuesPageNextCheckMeta(issue);
                const quickActionMeta=getIssuesPageQuickActionMeta(issue);
                const isExpanded=expandedIssuesPageIds.has(issue.id);
                const isOpen=isIssueActiveStatus(issue.status);
                const isLongOpen=isIssuesPageLongOpen(issue);
                const isResolved=normalizeIssueStatus(issue.status)==='resolved';
                const editable=canEditIssue(issue);
                const projectContext=getIssuesPageProjectContext(issue);
                const relatedLabel=issue._taskTitle?('관련 업무 '+getIssuesPageCompactText(issue._taskTitle,24)):(projectContext||'프로젝트 컨텍스트');
                return '<div id="issue-card-'+issue.id+'" class="issues-page-row'+(assigneeMeta.isMine?' mine':'')+(isExpanded?' expanded':'')+(isLongOpen?' is-long-open':'')+(impactMeta.tone==='danger'&&!isResolved?' is-danger':'')+(isResolved?' is-resolved':'')+'">'
                  +'<div class="issues-page-row-head" onclick="toggleIssuesPageAccordion(\''+issue.id+'\')">'
                    +'<div class="issues-page-row-main">'
                      +'<div class="issues-page-row-chipline">'
                        +'<span class="issues-page-category is-'+categoryMeta.cls+'">'+esc(categoryMeta.label)+'</span>'
                        +'<span class="issues-page-scope '+scopeMeta.cls+'">'+esc(scopeMeta.label)+'</span>'
                        +'<span class="issues-page-impact is-'+impactMeta.tone+'">'+esc(impactMeta.label)+'</span>'
                        +(isLongOpen?'<span class="issues-page-inline-tag long-open">장기 미해결</span>':'')
                        +(priorityMeta.cls==='high'?'<span class="issues-page-priority '+priorityMeta.cls+'">'+priorityMeta.label+'</span>':'')
                        +'<span class="badge '+statusMeta.cls+' issues-page-row-status">'+statusMeta.label+'</span>'
                        +(assigneeMeta.isMine?'<span class="issues-page-inline-tag mine">내 담당</span>':'')
                        +(issue.is_pinned?'<span class="issues-page-inline-tag pinned">고정</span>':'')
                      +'</div>'
                      +'<div class="issues-page-row-title-line"><span class="issues-page-row-title">'+esc(issue.title||'제목 없음')+'</span></div>'
                      +'<div class="issues-page-row-reason"><span class="issues-page-row-reason-label">막힌 이유</span><strong>'+esc(blockedReason)+'</strong></div>'
                      +'<div class="issues-page-row-core">'
                        +'<div class="issues-page-row-core-item"><span class="issues-page-row-core-label">책임자</span><strong class="issues-page-row-core-value">'+esc(assigneeMeta.label)+'</strong></div>'
                        +'<div class="issues-page-row-core-item"><span class="issues-page-row-core-label">다음 확인일</span><strong class="issues-page-row-core-value is-'+nextCheckMeta.tone+'">'+esc(nextCheckMeta.label)+'</strong></div>'
                        +'<div class="issues-page-row-core-item"><span class="issues-page-row-core-label">'+(issue._taskTitle?'연결 업무':'영향 범위')+'</span><strong class="issues-page-row-core-value">'+esc(relatedLabel)+'</strong></div>'
                      +'</div>'
                      +'<div class="issues-page-row-subline">'
                        +(projectContext?'<span class="issues-page-inline-meta">'+esc(projectContext)+'</span>':'')
                        +(getIssuesPageAgingText(issue)?'<span class="issues-page-inline-meta">'+esc(getIssuesPageAgingText(issue))+'</span>':'')
                      +'</div>'
                      +'<div class="issues-page-followup-line"><span class="issues-page-followup-label">다음 행동</span><span class="issues-page-followup-text">'+esc(followUpMeta.label)+'</span>'+(quickActionMeta.action?'<button type="button" class="issues-page-followup-action" onclick="event.stopPropagation();'+quickActionMeta.action+'">'+esc(quickActionMeta.label)+'</button>':'')+'</div>'
                    +'</div>'
                    +'<div class="issues-page-row-toggle">'+(isExpanded?'접기':'상세 보기')+'</div>'
                  +'</div>'
                  +(isExpanded
                    ?'<div class="issues-page-row-body">'
                      +'<div class="issues-page-detail-grid">'
                        +'<div class="issues-page-detail-card">'
                          +'<div class="issues-page-detail-kicker">컨텍스트</div>'
                          +'<div class="issues-page-detail-list">'
                            +'<div class="issues-page-detail-row"><span>구분</span><strong>'+esc(scopeMeta.label)+'</strong></div>'
                            +'<div class="issues-page-detail-row"><span>영향</span><strong>'+esc(impactMeta.label)+'</strong></div>'
                            +'<div class="issues-page-detail-row"><span>다음 확인</span><strong>'+esc(followUpMeta.label)+'</strong></div>'
                            +(issue.author_name?'<div class="issues-page-detail-row"><span>작성자</span><strong>'+esc(issue.author_name)+'</strong></div>':'')
                            +(getIssueStatusChangedAt(issue)?'<div class="issues-page-detail-row"><span>상태 기준</span><strong>'+formatCommentDate(getIssueStatusChangedAt(issue))+'</strong></div>':'')
                            +(issue._project?.name?'<div class="issues-page-detail-row"><span>관련 프로젝트</span><strong>'+esc(issue._project.name)+'</strong></div>':'')
                          +'</div>'
                          +renderIssuePeopleBadges(issue||{})
                        +'</div>'
                        +'<div class="issues-page-detail-card">'
                          +'<div class="issues-page-detail-kicker">설명</div>'
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
      :'<div class="card"><div style="font-size:13px;color:var(--text3)">현재 조건에서 확인할 이슈가 없습니다. 세부 실행 조정은 프로젝트 관리의 Work/Issues에서 이어집니다.</div></div>');

  rows
    .filter(issue=>expandedIssuesPageIds.has(issue.id))
    .forEach(issue=>openIssueComments(issue.id,true));
}

async function renderIssuesPage(){
  const el=document.getElementById('pageIssues');
  if(!el)return;
  el.innerHTML='<div class="card"><div style="font-size:13px;color:var(--text3)">이슈를 불러오는 중...</div></div>';
  try{
    const [rows]=await Promise.all([
      api('GET','project_issues?select=*&order=created_at.desc'),
      loadIssuesPageTaskTitles()
    ]);
    issuesPageCache=Array.isArray(rows)?rows.filter(Boolean):[];
    renderIssuesPageFromCache();
  }catch(e){
    el.innerHTML='<div class="card"><div style="font-size:13px;color:var(--red)">이슈를 불러오지 못했습니다.</div></div>';
  }
}
