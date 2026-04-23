function getAlerts(){
  const today=new Date();today.setHours(0,0,0,0);
  const overdue=[],unbilled=[],followups=[];
  projects.forEach(p=>{
    if(toDate(p.end)<today&&p.status!=='완료')overdue.push({id:p.id,name:p.name});
    if(p.status==='완료'&&p.is_billable&&p.billing_status==='미청구')unbilled.push({id:p.id,name:p.name});
    if(p.status==='완료'&&p.follow_up_needed)followups.push({id:p.id,name:p.name,note:p.follow_up_note||''});
  });
  return{overdue,unbilled,followups};
}

function openAlertProject(id){
  if(!id)return;
  openProjModal(id);
}

function renderAlerts(){
  const{overdue=[],unbilled=[],followups=[]}=getAlerts()||{};
  const el=document.getElementById('alertWrap');
  if(!el)return;
  let html='';
  if(overdue.length){
    html+=`<div class="alert-card red" style="margin-bottom:8px"><div class="alert-icon">⏰</div><div class="alert-body"><div class="alert-title red" style="font-size:13px;font-weight:800">기한 초과 미완료 프로젝트 ${overdue.length}건</div><div class="alert-items" style="margin-top:5px">${overdue.map(x=>`<button class="alert-tag red" onclick="openProjModal('${x.id}')">${esc(x.name)}</button>`).join('')}</div></div></div>`;
  }
  if(unbilled.length){
    html+=`<div class="alert-card orange" style="margin-bottom:8px"><div class="alert-icon">💰</div><div class="alert-body"><div class="alert-title orange" style="font-size:13px;font-weight:800">완료됐으나 빌링 미처리 ${unbilled.length}건</div><div class="alert-items" style="margin-top:5px">${unbilled.map(x=>`<button class="alert-tag orange" onclick="openProjModal('${x.id}',null,null,'completion')">${esc(x.name)}</button>`).join('')}</div></div></div>`;
  }
  if(followups.length){
    html+=`<div class="alert-card orange" style="margin-bottom:8px"><div class="alert-icon">📍</div><div class="alert-body"><div class="alert-title orange" style="font-size:13px;font-weight:800">완료 후 후속 조치 필요 ${followups.length}건</div><div class="alert-items" style="margin-top:5px">${followups.map(x=>`<button class="alert-tag orange" onclick="openProjModal('${x.id}',null,null,'completion')">${esc(x.name)}</button>`).join('')}</div></div></div>`;
  }
  el.innerHTML=html?'<div style="margin-bottom:16px">'+html+'</div>':'';
}

function renderPinned(){
  const pinned=notices.find(n=>n.is_pinned);
  const el=document.getElementById('pinnedWrap');if(!el)return;
  el.innerHTML=pinned
    ?'<div class="pinned-card" onclick="openNoticeDetail(this.dataset.id)" data-id="'+pinned.id+'" style="margin-bottom:12px">'
      +'<span style="color:var(--blue);font-size:16px;flex-shrink:0">📌</span>'
      +'<div class="pinned-card-text"><div class="pinned-card-title">'+esc(pinned.title)+'</div>'
      +'<div class="pinned-card-preview">'+esc(pinned.content.substring(0,80))+'</div></div>'
      +'<div class="pinned-card-date">'+formatDate(pinned.created_at)+'</div>'
      +'</div>':'';
}

let myFilterActive=true;
function toggleMyFilter(){
  myFilterActive=!myFilterActive;
  document.getElementById('myFilterBtn').classList.toggle('active',myFilterActive);
  document.getElementById('allFilterBtn').classList.toggle('active',!myFilterActive);
  renderClients();
}

function renderClients(){
  const myOnly=myFilterActive;
  const psf=document.getElementById('projStatusFilter')?.value||'';
  let filtered=clients.filter(c=>{
    if(myOnly&&currentMember&&!projects.filter(p=>p.client_id===c.id).some(p=>p.members.includes(currentMember.name)))return false;
    if(psf==='active'&&!projects.some(p=>p.client_id===c.id&&p.status==='진행중'))return false;
    return true;
  });
  const grid=document.getElementById('clientGrid');
  if(!filtered.length){grid.innerHTML='<div class="empty-state"><span class="empty-icon">🏢</span>고객사가 없습니다<br><br><button class="btn primary sm" onclick="openClientModal()">+ 고객사 추가</button></div>';return;}
  const today=new Date();
  grid.innerHTML=filtered.map(c=>{
    const cp=projects.filter(p=>p.client_id===c.id);
    const cc=contracts.filter(ct=>ct.client_id===c.id);
    const active=cp.filter(p=>p.status==='진행중');
    const mems=[...new Set(cp.flatMap(p=>p.members))];
    const chips=cp.slice(0,3).map(p=>'<span class="chip" style="background:'+TYPES[p.type]+'">'+p.type+'</span>').join('');
    const warns=cp.filter(p=>(toDate(p.end)<today&&p.status!=='완료')||(p.status==='완료'&&p.is_billable&&p.billing_status==='미청구')).length;
    const activeContracts=cc.filter(ct=>ct.contract_status==='진행중').length;
    return '<div class="client-card" onclick="openClientDetail(this.dataset.id)" data-id="'+c.id+'">'
      +'<div class="client-card-head"><div class="client-avatar">'+esc(c.name.charAt(0))+'</div>'
      +(warns?'<span class="client-warn">'+warns+'</span>':'')+'</div>'
      +'<div class="client-name">'+esc(c.name)+'</div>'
      +'<div class="client-industry">'+(c.industry||'업종 미입력')+'</div>'
      +'<div class="chip-row">'+chips+(cp.length>3?'<span style="font-size:11px;color:var(--text3);padding:3px 0">외 '+(cp.length-3)+'건</span>':'')+'</div>'
      +'<div class="client-footer"><span class="client-members">'+mems.slice(0,3).join(' · ')+'</span>'
      +'<span class="client-active">'+active.length+'건 진행중'+(activeContracts?' · 계약 '+activeContracts:'')+'</span></div>'
      +'</div>';
  }).join('');
}

let clientDetailRenderSequence=0;

function formatClientDetailCurrency(amount){
  return Number(amount||0).toLocaleString()+'원';
}

function formatClientDetailRelativeText(value){
  const time=getClientDateValue(value);
  if(!time)return '기록 없음';
  const diff=Math.max(0,Math.floor((Date.now()-time)/(1000*60*60*24)));
  if(diff===0)return '오늘';
  if(diff===1)return '1일 전';
  return diff+'일 전';
}

async function fetchClientDetailIssues(clientProjects){
  if(!Array.isArray(clientProjects)||!clientProjects.length)return [];
  const ids=clientProjects.map(project=>project.id).filter(Boolean);
  if(!ids.length)return [];
  try{
    return await api('GET','project_issues?project_id=in.('+ids.join(',')+')&select=id,project_id,title,priority,is_pinned,status,created_at,updated_at,status_changed_at');
  }catch(e){
    return [];
  }
}

async function fetchClientDocuments(clientId){
  if(!clientId)return [];
  try{
    return await api('GET','client_documents?client_id=eq.'+clientId+'&select=*&order=created_at.desc');
  }catch(e){
    return [];
  }
}

async function fetchClientAssignmentLogs(clientId){
  if(!clientId)return [];
  try{
    return await api('GET','client_assignment_logs?client_id=eq.'+clientId+'&select=*&order=created_at.desc&limit=10');
  }catch(e){
    return [];
  }
}

async function fetchClientPortalAccessLogs(clientId){
  if(!clientId)return [];
  try{
    const rows=await api('GET','client_portal_access_logs?client_id=eq.'+clientId+'&select=*&order=accessed_at.desc&limit=10');
    clientPortalAccessLogCache[clientId]=rows||[];
    return rows||[];
  }catch(e){
    clientPortalAccessLogCache[clientId]=[];
    return [];
  }
}

function buildClientAssignmentHistoryHtml(logs){
  if(!(logs||[]).length)return '<div class="client-detail-empty">담당 히스토리가 없습니다.</div>';
  return '<div class="client-detail-timeline-list">'+logs.slice(0,6).map(log=>
    '<div class="client-detail-timeline-item" style="cursor:default">'
      +'<span class="client-detail-timeline-kind">'+esc(log.action==='removed'?'해제':'배정')+'</span>'
      +'<div class="client-detail-timeline-body"><strong>'+esc(log.member_name||'담당자')+'</strong><span>'+(log.note?esc(log.note):'담당 이력이 기록되었습니다.')+'</span></div>'
      +'<span class="client-detail-timeline-time">'+esc(formatCommentDate(log.created_at))+'</span>'
    +'</div>'
  ).join('')+'</div>';
}

function buildClientDocumentsHtml(documents){
  if(!(documents||[]).length)return '<div class="client-detail-empty">관련 문서 링크가 없습니다.</div>';
  return '<div class="client-detail-timeline-list">'+documents.slice(0,6).map(doc=>
    '<a class="client-detail-timeline-item" href="'+esc(doc.url||'#')+'" target="_blank">'
      +'<span class="client-detail-timeline-kind">'+esc(doc.file_type||'문서')+'</span>'
      +'<div class="client-detail-timeline-body"><strong>'+esc(doc.title||'문서')+'</strong><span>'+esc(doc.note||doc.url||'링크 열기')+'</span></div>'
      +'<span class="client-detail-timeline-time">'+esc(formatCommentDate(doc.created_at))+'</span>'
    +'</a>'
  ).join('')+'</div>';
}

function buildClientDetailTimeline(client, clientProjects, clientContracts, clientIssues, pendingDocs){
  const items=[];
  clientProjects.forEach(project=>{
    const completionTime=isClientProjectCompleted(project)
      ?(project.actual_end_date||project.updated_at||project.end||project.end_date)
      :null;
    if(completionTime){
      items.push({
        time:getClientDateValue(completionTime),
        kind:'프로젝트 완료',
        title:project.name||'프로젝트',
        sub:(client?.name||'거래처')+' · '+(project.type||'유형 미지정'),
        action:'openProjModal(\''+project.id+'\',null,null,\'completion\')'
      });
    }else if(project?.updated_at||project?.created_at){
      items.push({
        time:getClientDateValue(project.updated_at||project.created_at),
        kind:project?.updated_at&&project?.created_at&&project.updated_at!==project.created_at?'프로젝트 변경':'프로젝트 등록',
        title:project.name||'프로젝트',
        sub:(client?.name||'거래처')+' · '+(project.status||'상태 미지정'),
        action:'openProjModal(\''+project.id+'\')'
      });
    }
  });
  clientContracts.forEach(contract=>{
    const changedAt=contract?.updated_at||contract?.created_at||contract?.contract_start_date;
    if(!changedAt)return;
    items.push({
      time:getClientDateValue(changedAt),
      kind:contract?.updated_at&&contract?.created_at&&contract.updated_at!==contract.created_at?'계약 변경':'계약 등록',
      title:contract.contract_name||'계약',
      sub:(contract.contract_status||'상태 미지정')+(contract.contract_amount?' · '+formatClientDetailCurrency(contract.contract_amount):''),
      action:'openContractDetail(\''+contract.id+'\')'
    });
  });
  clientIssues.forEach(issue=>{
    const createdAt=issue?.created_at||issue?.updated_at;
    if(createdAt){
      items.push({
        time:getClientDateValue(createdAt),
        kind:'이슈 등록',
        title:issue.title||'이슈',
        sub:(issue.priority==='high'||issue.is_pinned?'긴급 · ':'')+(getIssueStatusMeta(issue.status)?.label||'상태 미지정'),
        action:'openIssueModal(\''+(issue.project_id||'')+'\',\''+issue.id+'\')'
      });
    }
    const statusChangedAt=getIssueStatusChangedAt(issue);
    if(isIssueResolvedStatus(issue?.status)&&statusChangedAt&&statusChangedAt!==createdAt){
      items.push({
        time:getClientDateValue(statusChangedAt),
        kind:'이슈 해결',
        title:issue.title||'이슈',
        sub:'상태 변경',
        action:'openIssueModal(\''+(issue.project_id||'')+'\',\''+issue.id+'\')'
      });
    }
  });
  pendingDocs.forEach(request=>{
    const relatedProject=clientProjects.find(project=>project.id===request.project_id);
    items.push({
      time:getClientDateValue(request?.created_at||request?.due_date),
      kind:'자료 요청',
      title:request?.title||'자료 요청',
      sub:(relatedProject?.name||client?.name||'프로젝트')+(request?.due_date?' · 회수 희망 '+request.due_date:''),
      action:relatedProject?'openProjModal(\''+relatedProject.id+'\',null,null,\'documents\')':'openClientDetail(\''+client.id+'\',\'projects\')'
    });
  });
  return items
    .filter(item=>item.time)
    .sort((a,b)=>b.time-a.time)
    .slice(0,5);
}

function getClientDetailDashboardMetrics(client, clientProjects, clientContracts, clientIssues, pendingDocs){
  const activeProjects=clientProjects.filter(isClientProjectActive);
  const overdueProjects=clientProjects.filter(isClientProjectOverdue);
  const completedProjects=clientProjects.filter(isClientProjectCompleted);
  const unbilledProjects=completedProjects.filter(project=>project?.is_billable&&String(project?.billing_status||'').trim()==='미청구');
  const openIssues=clientIssues.filter(issue=>isIssueActiveStatus(issue?.status));
  const urgentIssues=openIssues.filter(issue=>String(issue?.priority||'').trim()==='high'||issue?.is_pinned);
  return {
    activeProjects,
    overdueProjects,
    completedProjects,
    unbilledProjects,
    openIssues,
    urgentIssues,
    unbilledAmount:unbilledProjects.reduce((sum,project)=>sum+getClientBillingAmount(project),0),
    pendingDocs,
    projectBillingTotal:clientProjects.reduce((sum,project)=>sum+getClientBillingAmount(project),0),
    contractAmountTotal:clientContracts.reduce((sum,contract)=>sum+Number(contract?.contract_amount||0),0),
    billedContractAmount:clientProjects.reduce((sum,project)=>{
      if(!project?.billing_amount)return sum;
      return String(project?.billing_status||'').trim()==='미청구'?sum:sum+Number(project.billing_amount||0);
    },0)
  };
}

function buildClientDetailProjectSummaryHtml(clientId, clientProjects, metrics){
  return '<div class="client-detail-tab-summary" id="client-project-summary-'+clientId+'">'
    +'<div class="client-detail-tab-summary-card"><span class="client-detail-tab-summary-label">전체</span><strong>'+clientProjects.length+'</strong></div>'
    +'<div class="client-detail-tab-summary-card"><span class="client-detail-tab-summary-label">진행중</span><strong>'+metrics.activeProjects.length+'</strong></div>'
    +'<div class="client-detail-tab-summary-card"><span class="client-detail-tab-summary-label">완료</span><strong>'+metrics.completedProjects.length+'</strong></div>'
    +'<div class="client-detail-tab-summary-card"><span class="client-detail-tab-summary-label">총 빌링 금액</span><strong>'+formatClientDetailCurrency(metrics.projectBillingTotal)+'</strong></div>'
    +'</div>';
}

function buildClientDetailContractSummaryHtml(clientId, clientContracts, metrics){
  const activeContracts=clientContracts.filter(contract=>String(contract?.contract_status||'').trim()==='진행중');
  const progressPct=metrics.contractAmountTotal>0
    ?Math.min(100,Math.round((metrics.billedContractAmount/metrics.contractAmountTotal)*100))
    :0;
  return '<div class="client-detail-tab-summary" id="client-contract-summary-'+clientId+'">'
    +'<div class="client-detail-tab-summary-card"><span class="client-detail-tab-summary-label">전체</span><strong>'+clientContracts.length+'</strong></div>'
    +'<div class="client-detail-tab-summary-card"><span class="client-detail-tab-summary-label">활성</span><strong>'+activeContracts.length+'</strong></div>'
    +'<div class="client-detail-tab-summary-card"><span class="client-detail-tab-summary-label">계약 금액 합계</span><strong>'+formatClientDetailCurrency(metrics.contractAmountTotal)+'</strong></div>'
    +'<div class="client-detail-tab-summary-card"><span class="client-detail-tab-summary-label">빌링 진행률</span><strong>'+progressPct+'%</strong></div>'
    +'</div>';
}

async function openClientDetail(id, tab='projects', focusSection=''){
  if(tab==='finance'){
    focusSection=focusSection||'financeTabWrap';
    tab='updates';
  }
  const c=clients.find(x=>x.id===id);
  if(!c)return;
  currentDetailClientId=id;
  const renderSeq=++clientDetailRenderSequence;
  setPage('detail');
  const detailEl=document.getElementById('detailContent');
  if(detailEl){
    detailEl.innerHTML='<div class="card"><div style="padding:20px;color:var(--text3);font-size:13px">거래처 상세를 불러오는 중...</div></div>';
  }

  await ensureClientPendingDocRequestsLoaded();
  const cp=projects.filter(project=>project.client_id===id);
  const cc=contracts.filter(contract=>contract.client_id===id);
  const mems=[...new Set(cp.flatMap(project=>Array.isArray(project.members)?project.members:[]).filter(Boolean))];
  const portalAssignees=getAssignedMemberNames(id);
  const isAssigned=roleIsAdmin()||(currentMember&&clientAssignments.some(assign=>assign.client_id===id&&assign.member_id===currentMember.id));
  const clientIssues=await fetchClientDetailIssues(cp);
  const [clientDocuments, assignmentLogs, portalAccessLogs]=await Promise.all([
    fetchClientDocuments(id),
    fetchClientAssignmentLogs(id),
    fetchClientPortalAccessLogs(id)
  ]);
  if(renderSeq!==clientDetailRenderSequence||currentDetailClientId!==id)return;
  const pendingDocs=getClientPendingDocsForClient(id);
  const metrics=getClientDetailDashboardMetrics(c,cp,cc,clientIssues,pendingDocs);
  const timelineItems=buildClientDetailTimeline(c,cp,cc,clientIssues,pendingDocs);
  const portalStatusMeta=getClientPortalStatusMeta(c);
  const portalAccessMeta=(portalAccessLogs&&portalAccessLogs.length)
    ?getClientAccessLogMeta(portalAccessLogs)
    :getClientAccessLogMeta(c?.portal_last_login_at?[{accessed_at:c.portal_last_login_at,accessor_email:c.portal_last_login_email}]:[]);
  const projectSummaryHtml=buildClientDetailProjectSummaryHtml(id,cp,metrics);
  const contractSummaryHtml=buildClientDetailContractSummaryHtml(id,cc,metrics);

  const projectItems=cp.map(project=>{
    const overdue=isClientProjectOverdue(project);
    const unbilled=isClientProjectCompleted(project)&&project.is_billable&&String(project?.billing_status||'').trim()==='미청구';
    const issueCount=metrics.openIssues.filter(issue=>issue.project_id===project.id).length||openIssuesByProject[project.id]||0;
    const statusClass=project.status==='진행중'?'badge-blue':project.status==='완료'?'badge-gray':'badge-orange';
    const billingClass=!project.is_billable?'badge-gray':project.billing_status==='입금완료'?'badge-green':project.billing_status==='청구완료'?'badge-blue':'badge-red';
    return '<div class="proj-item" onclick="'+(issueCount?'openProjModal(this.dataset.id,null,null,\'issue\')':'openProjModal(this.dataset.id)')+'" data-id="'+project.id+'" style="'+(issueCount?'border-left:3px solid var(--red)':'')+'">'
      +'<div class="proj-dot" style="background:'+(TYPES[project.type]||'#94A3B8')+'"></div>'
      +'<div class="proj-info">'
      +'<div class="proj-name">'+esc(project.name||'프로젝트')+(issueCount?'<span style="margin-left:6px;background:var(--red);color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px">이슈 '+issueCount+'</span>':'')+'</div>'
      +'<div class="proj-sub">'+(project.start||project.start_date||'')+' ~ '+(project.end||project.end_date||'')+(project.members?.length?' · '+project.members.join(', '):'')+'</div>'
      +(overdue?'<div class="proj-warn">기간이 지났지만 아직 완료 처리되지 않았습니다.</div>':'')
      +(unbilled?'<div class="proj-warn">완료 후 빌링이 아직 처리되지 않았습니다.</div>':'')
      +(isClientProjectCompleted(project)&&project.follow_up_needed?'<div class="proj-warn">후속 조치 필요'+(project.follow_up_note?' · '+esc(truncateText(project.follow_up_note,26)):'')+'</div>':'')
      +'</div>'
      +'<div class="proj-badges">'
      +'<span class="badge '+statusClass+'">'+esc(project.status||'상태 미지정')+'</span>'
      +(project.is_billable?'<span class="badge '+billingClass+'">'+esc(project.billing_status||'미청구')+'</span>':'<span class="badge badge-gray">비청구</span>')
      +(project.billing_amount?'<span style="font-size:11px;color:var(--text2);font-weight:700">'+formatClientDetailCurrency(project.billing_amount)+'</span>':'')
      +'</div></div>';
  }).join('');

  const contractItems=cc.map(contract=>{
    const linkedProjects=projects.filter(project=>project.contract_id===contract.id);
    const billedAmount=linkedProjects.reduce((sum,project)=>{
      if(!project?.billing_amount)return sum;
      return String(project?.billing_status||'').trim()==='미청구'?sum:sum+Number(project.billing_amount||0);
    },0);
    const totalAmount=Number(contract?.contract_amount||0);
    const progressPct=totalAmount>0?Math.min(100,Math.round((billedAmount/totalAmount)*100)):0;
    const contractStatus=contract.contract_status||'검토중';
    const contractStatusClass='cst-'+contractStatus;
    const amountText=totalAmount?formatClientDetailCurrency(totalAmount)+(contract.vat_included?' (VAT포함)':' (VAT별도)'):'금액 미입력';
    const unbilledProjects=linkedProjects.filter(project=>isClientProjectCompleted(project)&&project.is_billable&&String(project?.billing_status||'').trim()==='미청구');
    return '<div class="contract-item" onclick="openContractDetail(this.dataset.id)" data-id="'+contract.id+'">'
      +'<div class="contract-icon">CT</div>'
      +'<div class="contract-info">'
      +'<div class="contract-name">'+esc(contract.contract_name||'계약명 없음')+'</div>'
      +'<div class="contract-sub">'+(contract.contract_code?esc(contract.contract_code)+' · ':'')+(contract.contract_type?esc(contract.contract_type)+' · ':'')+amountText+'</div>'
      +(contract.contract_start_date?'<div class="contract-sub">'+contract.contract_start_date+' ~ '+(contract.contract_end_date||'')+'</div>':'')
      +(totalAmount&&linkedProjects.length?'<div style="margin-top:6px"><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3);margin-bottom:3px"><span>빌링 진행률</span><span>'+formatClientDetailCurrency(billedAmount)+' / '+formatClientDetailCurrency(totalAmount)+' ('+progressPct+'%)</span></div><div style="background:var(--bg);border-radius:20px;height:5px;overflow:hidden"><div style="width:'+progressPct+'%;height:100%;border-radius:20px;background:'+(progressPct>=100?'var(--green)':progressPct>50?'var(--blue)':'var(--orange)')+'"></div></div></div>':'')
      +(unbilledProjects.length?'<div style="font-size:11px;color:var(--red);margin-top:4px;font-weight:600">미청구 프로젝트 '+unbilledProjects.length+'건</div>':'')
      +'</div>'
      +'<div class="contract-badges"><span class="badge '+contractStatusClass+'">'+esc(contractStatus)+'</span><span style="font-size:11px;color:var(--text3)">프로젝트 '+linkedProjects.length+'건</span></div>'
      +'</div>';
  }).join('');

  const dashboardCards=[
    {
      title:'진행중 프로젝트',
      value:metrics.activeProjects.length+'건',
      sub:'지연 '+metrics.overdueProjects.length+'건',
      tone:metrics.overdueProjects.length?'is-warning':'is-good',
      action:'openClientDetail(\''+id+'\',\'projects\',\'client-project-summary-'+id+'\')'
    },
    {
      title:'열린 이슈',
      value:metrics.openIssues.length+'건',
      sub:'긴급 '+metrics.urgentIssues.length+'건',
      tone:metrics.urgentIssues.length?'is-danger':(metrics.openIssues.length?'is-warning':'is-good'),
      action:'openClientDetail(\''+id+'\',\'projects\',\'client-project-list-'+id+'\')'
    },
    {
      title:'미청구 금액',
      value:formatClientDetailCurrency(metrics.unbilledAmount),
      sub:'미청구 프로젝트 '+metrics.unbilledProjects.length+'건',
      tone:metrics.unbilledAmount>0?'is-warning':'is-good',
      action:'openClientDetail(\''+id+'\',\'contracts\',\'client-contract-summary-'+id+'\')'
    },
    {
      title:'자료 대기',
      value:metrics.pendingDocs.length+'건',
      sub:metrics.pendingDocs.length?('가장 이른 회수일 '+(metrics.pendingDocs.map(doc=>doc.due_date).filter(Boolean).sort()[0]||'미정')):'대기 없음',
      tone:metrics.pendingDocs.length?'is-warning':'is-good',
      action:'openClientDetail(\''+id+'\',\'projects\',\'client-project-list-'+id+'\')'
    }
  ];

  const dashboardHtml='<div class="client-detail-dashboard">'
    +'<div class="client-detail-health-grid">'
    +dashboardCards.map(card=>
      '<button type="button" class="client-detail-health-card '+card.tone+'" onclick="'+card.action+'">'
        +'<span class="client-detail-health-label">'+esc(card.title)+'</span>'
        +'<strong class="client-detail-health-value">'+esc(card.value)+'</strong>'
        +'<span class="client-detail-health-sub">'+esc(card.sub)+'</span>'
      +'</button>'
    ).join('')
    +'</div>'
    +'<div class="card client-detail-timeline" id="client-timeline-'+id+'">'
      +'<div class="client-detail-timeline-head"><div><div class="section-label" style="margin-bottom:4px">거래처 대시보드</div><div class="client-detail-timeline-title">최근 타임라인</div></div><div class="client-detail-timeline-sub">최근 활동 5건</div></div>'
      +(timelineItems.length
        ?'<div class="client-detail-timeline-list">'+timelineItems.map(item=>
          '<button type="button" class="client-detail-timeline-item" onclick="'+item.action+'">'
            +'<span class="client-detail-timeline-kind">'+esc(item.kind)+'</span>'
            +'<div class="client-detail-timeline-body"><strong>'+esc(item.title)+'</strong><span>'+esc(item.sub)+'</span></div>'
            +'<span class="client-detail-timeline-time">'+esc(formatClientDetailRelativeText(item.time))+'</span>'
          +'</button>'
        ).join('')+'</div>'
        :'<div class="client-detail-empty">최근 활동이 없습니다.</div>')
    +'</div>'
    +'</div>';

  const tabContent=tab==='projects'
    ?'<div class="card">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px"><div class="section-label" style="margin:0">관리 프로젝트 ('+cp.length+'건)</div><button class="btn primary sm" onclick="openProjModal(null,\''+id+'\')">+ 추가</button></div>'
      +projectSummaryHtml
      +'<div id="client-project-list-'+id+'">'
      +(projectItems||'<div style="color:var(--text3);font-size:13px;padding:12px 0">프로젝트가 없습니다.</div>')
      +'</div>'
      +'</div>'
    :tab==='contracts'
    ?'<div class="card">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px"><div class="section-label" style="margin:0">계약 ('+cc.length+'건)</div><button class="btn primary sm" onclick="openContractModal(null,\''+id+'\')">+ 추가</button></div>'
      +contractSummaryHtml
      +(contractItems||'<div style="color:var(--text3);font-size:13px;padding:12px 0">등록된 계약이 없습니다.</div>')
      +'</div>'
    :tab==='updates'
    ?'<div>'
      +'<div class="card" style="margin-bottom:14px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;gap:10px;flex-wrap:wrap">'
      +'<div class="section-label" style="margin:0">업무 업데이트</div>'
      +(isAssigned?'<button class="btn primary sm" onclick="openUpdateModal(null,\''+id+'\')">+ 작성</button>':'')
      +'</div>'
      +'<div id="updateFeed"><div style="color:var(--text3);font-size:13px;padding:12px 0">불러오는 중...</div></div>'
      +'</div>'
      +'<div id="financeTabWrap"><div style="color:var(--text3);font-size:13px;padding:20px;text-align:center">재무제표를 불러오는 중...</div></div>'
      +'</div>'
    :'<div class="card"><div class="section-label">고객사 정보</div>'
      +'<div class="info-row"><span class="info-label">담당자</span><span class="info-value">'+(c.contact_name||'-')+'</span></div>'
      +'<div class="info-row"><span class="info-label">이메일</span><span class="info-value">'+(c.contact_email||'-')+'</span></div>'
      +'<div class="info-row"><span class="info-label">연락처</span><span class="info-value">'+(c.contact_phone||'-')+'</span></div>'
      +'<div class="info-row"><span class="info-label">내부 담당</span><span class="info-value">'+(mems.join(', ')||'-')+'</span></div>'
      +'<div class="info-row"><span class="info-label">업종</span><span class="info-value">'+(c.industry||'-')+'</span></div>'
      +'</div>'
      +'<div class="card" style="margin-top:14px"><div class="section-label">고객 포털</div>'
      +'<div class="info-row"><span class="info-label">상태</span><span class="info-value"><span class="badge '+(portalStatusMeta.tone==='active'?'badge-blue':portalStatusMeta.tone==='linked'?'badge-orange':'badge-gray')+'">'+esc(portalStatusMeta.label)+'</span></span></div>'
      +'<div class="info-row"><span class="info-label">외부 담당</span><span class="info-value">'+(c.contact_name||'-')+(c.contact_email?'<br><span style="font-size:11px;color:var(--text3)">'+esc(c.contact_email)+'</span>':'')+'</span></div>'
      +'<div class="info-row"><span class="info-label">내부 배정</span><span class="info-value">'+(portalAssignees.join(', ')||'미배정')+'</span></div>'
      +'<div class="info-row"><span class="info-label">문서함</span><span class="info-value">'+(c.onedrive_url?'<a href="'+esc(c.onedrive_url)+'" target="_blank" style="color:var(--blue)">OneDrive 열기 ↗</a>':'미설정')+'</span></div>'
      +(c.portal_email
        ?'<div style="margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap"><button class="btn primary sm" onclick="previewPortal(\''+c.id+'\')">포털 접속</button>'+(canManagePortalSettings()?'<button class="btn sm" onclick="openPortalAccountEdit(\''+c.id+'\')">계정 수정</button>':'')+'</div>'
        :'<div style="color:var(--text3);font-size:12px;padding:8px 0">포털이 아직 설정되지 않았습니다.</div>'+(canManagePortalSettings()?'<button class="btn sm" style="margin-top:8px" onclick="openPortalAccountEdit(\''+c.id+'\')">포털 설정</button>':''))
      +'</div>'
      +'<div class="card" style="margin-top:14px"><div class="section-label">메모</div><div class="memo-area">'+(c.memo||'메모 없음')+'</div></div>';

  detailEl.innerHTML=
    '<div class="detail-hero">'
    +'<div class="detail-avatar">'+esc((c.name||'거래처').charAt(0))+'</div>'
    +'<div class="detail-hero-text" style="flex:1">'
    +'<h2>'+esc(c.name||'거래처')+'</h2>'
    +'<p>'+(c.industry||'업종 미입력')+'</p>'
    +'</div>'
    +(isAdmin||c.created_by===currentUser?.id?'<button class="btn sm" style="background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);color:#fff" onclick="openClientModal(\''+c.id+'\')">수정</button>':'')
    +'</div>'
    +dashboardHtml
    +'<div class="detail-tabs">'
    +'<button class="detail-tab'+(tab==='projects'?' active':'')+'" onclick="openClientDetail(\''+id+'\',\'projects\')">프로젝트 ('+cp.length+')</button>'
    +'<button class="detail-tab'+(tab==='contracts'?' active':'')+'" onclick="openClientDetail(\''+id+'\',\'contracts\')">계약 ('+cc.length+')</button>'
    +'<button class="detail-tab'+(tab==='updates'?' active':'')+'" onclick="openClientDetail(\''+id+'\',\'updates\')">고객 레포트</button>'
    +'<button class="detail-tab'+(tab==='info'?' active':'')+'" onclick="openClientDetail(\''+id+'\',\'info\')">정보 / 메모</button>'
    +'</div>'
    +tabContent;
  if(tab==='updates'){
    loadClientUpdates(id);
    loadFinanceTab(id);
  }
  if(focusSection)focusTargetElement(focusSection);
}
openClientDetail=async function(id, tab='projects', focusSection=''){
  if(tab==='finance'){
    focusSection=focusSection||'financeTabWrap';
    tab='updates';
  }
  const c=clients.find(x=>x.id===id);
  if(!c)return;
  currentDetailClientId=id;
  const renderSeq=++clientDetailRenderSequence;
  setPage('detail');
  const detailEl=document.getElementById('detailContent');
  if(detailEl){
    detailEl.innerHTML='<div class="card"><div style="padding:20px;color:var(--text3);font-size:13px">거래처 상세를 불러오는 중...</div></div>';
  }

  await ensureClientPendingDocRequestsLoaded();
  const cp=projects.filter(project=>project.client_id===id);
  const cc=contracts.filter(contract=>contract.client_id===id);
  const mems=[...new Set(cp.flatMap(project=>Array.isArray(project.members)?project.members:[]).filter(Boolean))];
  const portalAssignees=getAssignedMemberNames(id);
  const isAssigned=roleIsAdmin()||(currentMember&&clientAssignments.some(assign=>assign.client_id===id&&assign.member_id===currentMember.id));
  const clientIssues=await fetchClientDetailIssues(cp);
  const [clientDocuments, assignmentLogs, portalAccessLogs]=await Promise.all([
    fetchClientDocuments(id),
    fetchClientAssignmentLogs(id),
    fetchClientPortalAccessLogs(id)
  ]);
  if(renderSeq!==clientDetailRenderSequence||currentDetailClientId!==id)return;

  const pendingDocs=getClientPendingDocsForClient(id);
  const metrics=getClientDetailDashboardMetrics(c,cp,cc,clientIssues,pendingDocs);
  const timelineItems=buildClientDetailTimeline(c,cp,cc,clientIssues,pendingDocs);
  const portalStatusMeta=getClientPortalStatusMeta(c);
  const portalAccessMeta=(portalAccessLogs&&portalAccessLogs.length)
    ?getClientAccessLogMeta(portalAccessLogs)
    :getClientAccessLogMeta(c?.portal_last_login_at?[{accessed_at:c.portal_last_login_at,accessor_email:c.portal_last_login_email}]:[]);
  const projectSummaryHtml=buildClientDetailProjectSummaryHtml(id,cp,metrics);
  const contractSummaryHtml=buildClientDetailContractSummaryHtml(id,cc,metrics);

  const projectItems=cp.map(project=>{
    const overdue=isClientProjectOverdue(project);
    const unbilled=isClientProjectCompleted(project)&&project.is_billable&&String(project?.billing_status||'').trim()==='미청구';
    const issueCount=metrics.openIssues.filter(issue=>issue.project_id===project.id).length||openIssuesByProject[project.id]||0;
    const statusClass=project.status==='진행중'?'badge-blue':project.status==='완료'?'badge-gray':'badge-orange';
    const billingClass=!project.is_billable?'badge-gray':project.billing_status==='입금완료'?'badge-green':project.billing_status==='청구완료'?'badge-blue':'badge-red';
    return '<div class="proj-item" onclick="'+(issueCount?'openProjModal(this.dataset.id,null,null,\'issue\')':'openProjModal(this.dataset.id)')+'" data-id="'+project.id+'" style="'+(issueCount?'border-left:3px solid var(--red)':'')+'">'
      +'<div class="proj-dot" style="background:'+(TYPES[project.type]||'#94A3B8')+'"></div>'
      +'<div class="proj-info">'
      +'<div class="proj-name">'+esc(project.name||'프로젝트')+(issueCount?'<span style="margin-left:6px;background:var(--red);color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px">이슈 '+issueCount+'</span>':'')+'</div>'
      +'<div class="proj-sub">'+(project.start||project.start_date||'')+' ~ '+(project.end||project.end_date||'')+(project.members?.length?' · '+project.members.join(', '):'')+'</div>'
      +(overdue?'<div class="proj-warn">기한이 지났지만 아직 완료 처리되지 않았습니다.</div>':'')
      +(unbilled?'<div class="proj-warn">완료 후 빌링이 아직 처리되지 않았습니다.</div>':'')
      +(isClientProjectCompleted(project)&&project.follow_up_needed?'<div class="proj-warn">후속 조치 필요'+(project.follow_up_note?' · '+esc(truncateText(project.follow_up_note,26)):'')+'</div>':'')
      +'</div>'
      +'<div class="proj-badges">'
      +'<span class="badge '+statusClass+'">'+esc(project.status||'상태 미지정')+'</span>'
      +(project.is_billable?'<span class="badge '+billingClass+'">'+esc(project.billing_status||'미청구')+'</span>':'<span class="badge badge-gray">비청구</span>')
      +(project.billing_amount?'<span style="font-size:11px;color:var(--text2);font-weight:700">'+formatClientDetailCurrency(project.billing_amount)+'</span>':'')
      +'</div></div>';
  }).join('');

  const contractItems=cc.map(contract=>{
    const linkedProjects=projects.filter(project=>project.contract_id===contract.id);
    const billedAmount=linkedProjects.reduce((sum,project)=>{
      if(!project?.billing_amount)return sum;
      return String(project?.billing_status||'').trim()==='미청구'?sum:sum+Number(project.billing_amount||0);
    },0);
    const totalAmount=Number(contract?.contract_amount||0);
    const progressPct=totalAmount>0?Math.min(100,Math.round((billedAmount/totalAmount)*100)):0;
    const contractStatus=contract.contract_status||'검토중';
    const contractStatusClass='cst-'+contractStatus;
    const amountText=totalAmount?formatClientDetailCurrency(totalAmount)+(contract.vat_included?' (VAT포함)':' (VAT별도)'):'금액 미입력';
    const unbilledProjects=linkedProjects.filter(project=>isClientProjectCompleted(project)&&project.is_billable&&String(project?.billing_status||'').trim()==='미청구');
    return '<div class="contract-item" onclick="openContractDetail(this.dataset.id)" data-id="'+contract.id+'">'
      +'<div class="contract-icon">CT</div>'
      +'<div class="contract-info">'
      +'<div class="contract-name">'+esc(contract.contract_name||'계약명 없음')+'</div>'
      +'<div class="contract-sub">'+(contract.contract_code?esc(contract.contract_code)+' · ':'')+(contract.contract_type?esc(contract.contract_type)+' · ':'')+amountText+'</div>'
      +(contract.contract_start_date?'<div class="contract-sub">'+contract.contract_start_date+' ~ '+(contract.contract_end_date||'')+'</div>':'')
      +(totalAmount&&linkedProjects.length?'<div style="margin-top:6px"><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3);margin-bottom:3px"><span>빌링 진행률</span><span>'+formatClientDetailCurrency(billedAmount)+' / '+formatClientDetailCurrency(totalAmount)+' ('+progressPct+'%)</span></div><div style="background:var(--bg);border-radius:20px;height:5px;overflow:hidden"><div style="width:'+progressPct+'%;height:100%;border-radius:20px;background:'+(progressPct>=100?'var(--green)':progressPct>50?'var(--blue)':'var(--orange)')+'"></div></div></div>':'')
      +(unbilledProjects.length?'<div style="font-size:11px;color:var(--red);margin-top:4px;font-weight:600">미청구 프로젝트 '+unbilledProjects.length+'건</div>':'')
      +'</div>'
      +'<div class="contract-badges"><span class="badge '+contractStatusClass+'">'+esc(contractStatus)+'</span><span style="font-size:11px;color:var(--text3)">프로젝트 '+linkedProjects.length+'건</span></div>'
      +'</div>';
  }).join('');

  const dashboardCards=[
    {title:'진행중 프로젝트',value:metrics.activeProjects.length+'건',sub:'지연 '+metrics.overdueProjects.length+'건',tone:metrics.overdueProjects.length?'is-warning':'is-good',action:'openClientDetail(\''+id+'\',\'projects\',\'client-project-summary-'+id+'\')'},
    {title:'열린 이슈',value:metrics.openIssues.length+'건',sub:'긴급 '+metrics.urgentIssues.length+'건',tone:metrics.urgentIssues.length?'is-danger':(metrics.openIssues.length?'is-warning':'is-good'),action:'openClientDetail(\''+id+'\',\'projects\',\'client-project-list-'+id+'\')'},
    {title:'미청구 금액',value:formatClientDetailCurrency(metrics.unbilledAmount),sub:'미청구 프로젝트 '+metrics.unbilledProjects.length+'건',tone:metrics.unbilledAmount>0?'is-warning':'is-good',action:'openClientDetail(\''+id+'\',\'contracts\',\'client-contract-summary-'+id+'\')'},
    {title:'자료 대기',value:metrics.pendingDocs.length+'건',sub:metrics.pendingDocs.length?('가장 이른 회수일 '+(metrics.pendingDocs.map(doc=>doc.due_date).filter(Boolean).sort()[0]||'미지정')):'대기 없음',tone:metrics.pendingDocs.length?'is-warning':'is-good',action:'openClientDetail(\''+id+'\',\'projects\',\'client-project-list-'+id+'\')'}
  ];

  const dashboardHtml='<div class="client-detail-dashboard">'
    +'<div class="client-detail-health-grid">'
    +dashboardCards.map(card=>'<button type="button" class="client-detail-health-card '+card.tone+'" onclick="'+card.action+'"><span class="client-detail-health-label">'+esc(card.title)+'</span><strong class="client-detail-health-value">'+esc(card.value)+'</strong><span class="client-detail-health-sub">'+esc(card.sub)+'</span></button>').join('')
    +'</div>'
    +'<div class="card client-detail-timeline" id="client-timeline-'+id+'">'
      +'<div class="client-detail-timeline-head"><div><div class="section-label" style="margin-bottom:4px">거래처 대시보드</div><div class="client-detail-timeline-title">최근 타임라인</div></div><div class="client-detail-timeline-sub">최근 활동 5건</div></div>'
      +(timelineItems.length?'<div class="client-detail-timeline-list">'+timelineItems.map(item=>'<button type="button" class="client-detail-timeline-item" onclick="'+item.action+'"><span class="client-detail-timeline-kind">'+esc(item.kind)+'</span><div class="client-detail-timeline-body"><strong>'+esc(item.title)+'</strong><span>'+esc(item.sub)+'</span></div><span class="client-detail-timeline-time">'+esc(formatClientDetailRelativeText(item.time))+'</span></button>').join('')+'</div>':'<div class="client-detail-empty">최근 활동이 없습니다.</div>')
    +'</div>'
    +'</div>';

  const infoTabHtml='<div class="card"><div class="section-label">고객사 정보</div>'
    +'<div class="info-row"><span class="info-label">담당자</span><span class="info-value">'+(c.contact_name||'-')+'</span></div>'
    +'<div class="info-row"><span class="info-label">이메일</span><span class="info-value">'+(c.contact_email||'-')+'</span></div>'
    +'<div class="info-row"><span class="info-label">연락처</span><span class="info-value">'+(c.contact_phone||'-')+'</span></div>'
    +'<div class="info-row"><span class="info-label">내부 담당</span><span class="info-value">'+(mems.join(', ')||'-')+'</span></div>'
    +'<div class="info-row"><span class="info-label">업종</span><span class="info-value">'+(c.industry||'-')+'</span></div>'
    +'<div class="info-row"><span class="info-label">태그</span><span class="info-value">'+(formatClientTags(c.tags)||'-')+'</span></div>'
    +'<div class="info-row"><span class="info-label">사업자등록번호</span><span class="info-value">'+(c.business_number||'-')+'</span></div>'
    +'<div class="info-row"><span class="info-label">대표자명</span><span class="info-value">'+(c.representative_name||'-')+'</span></div>'
    +'<div class="info-row"><span class="info-label">주소</span><span class="info-value">'+(c.address||'-')+'</span></div>'
    +'<div class="info-row"><span class="info-label">결산월</span><span class="info-value">'+(c.fiscal_year_end_month?(c.fiscal_year_end_month+'월'):'-')+'</span></div>'
    +'</div>'
    +'<div class="card" style="margin-top:14px"><div class="section-label">고객 포털</div>'
    +'<div class="info-row"><span class="info-label">상태</span><span class="info-value"><span class="badge '+(portalStatusMeta.tone==='active'?'badge-blue':portalStatusMeta.tone==='linked'?'badge-orange':'badge-gray')+'">'+esc(portalStatusMeta.label)+'</span></span></div>'
    +'<div class="info-row"><span class="info-label">포털 담당</span><span class="info-value">'+(c.contact_name||'-')+(c.contact_email?'<br><span style="font-size:11px;color:var(--text3)">'+esc(c.contact_email)+'</span>':'')+'</span></div>'
    +'<div class="info-row"><span class="info-label">내부 배정</span><span class="info-value">'+(portalAssignees.join(', ')||'미배정')+'</span></div>'
    +'<div class="info-row"><span class="info-label">최근 접속</span><span class="info-value'+(portalAccessMeta.isStale?' client-table-recent is-stale':'')+'">'+esc(portalAccessMeta.text)+'</span></div>'
    +'<div class="info-row"><span class="info-label">문서함</span><span class="info-value">'+(c.onedrive_url?'<a href="'+esc(c.onedrive_url)+'" target="_blank" style="color:var(--blue)">OneDrive 열기 ↗</a>':'미설정')+'</span></div>'
    +(c.portal_email?'<div style="margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap"><button class="btn primary sm" onclick="previewPortal(\''+c.id+'\')">포털 접속</button>'+(canManagePortalSettings()?'<button class="btn sm" onclick="openPortalAccountEdit(\''+c.id+'\')">계정 수정</button>':'')+'</div>':'<div style="color:var(--text3);font-size:12px;padding:8px 0">포털은 아직 설정되지 않았습니다.</div>'+(canManagePortalSettings()?'<button class="btn sm" style="margin-top:8px" onclick="openPortalAccountEdit(\''+c.id+'\')">포털 설정</button>':''))
    +'</div>'
    +'<div class="card" style="margin-top:14px"><div class="section-label">담당 히스토리</div>'+buildClientAssignmentHistoryHtml(assignmentLogs)+'</div>'
    +'<div class="card" style="margin-top:14px"><div class="section-label">관련 문서 링크</div>'+buildClientDocumentsHtml(clientDocuments)+'</div>'
    +'<div class="card" style="margin-top:14px"><div class="section-label">메모</div><div class="memo-area">'+(c.memo||'메모 없음')+'</div></div>';

  const tabContent=tab==='projects'
    ?'<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px"><div class="section-label" style="margin:0">관리 프로젝트 ('+cp.length+'건)</div><button class="btn primary sm" onclick="openProjModal(null,\''+id+'\')">+ 추가</button></div>'+projectSummaryHtml+'<div id="client-project-list-'+id+'">'+(projectItems||'<div style="color:var(--text3);font-size:13px;padding:12px 0">프로젝트가 없습니다.</div>')+'</div></div>'
    :tab==='contracts'
    ?'<div class="card"><div style="display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px"><div class="section-label" style="margin:0">계약 ('+cc.length+'건)</div><button class="btn primary sm" onclick="openContractModal(null,\''+id+'\')">+ 추가</button></div>'+contractSummaryHtml+(contractItems||'<div style="color:var(--text3);font-size:13px;padding:12px 0">등록된 계약이 없습니다.</div>')+'</div>'
    :tab==='updates'
    ?'<div><div class="card" style="margin-bottom:14px"><div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px;gap:10px;flex-wrap:wrap"><div class="section-label" style="margin:0">업무 업데이트</div>'+(isAssigned?'<button class="btn primary sm" onclick="openUpdateModal(null,\''+id+'\')">+ 작성</button>':'')+'</div><div id="updateFeed"><div style="color:var(--text3);font-size:13px;padding:12px 0">불러오는 중...</div></div></div><div id="financeTabWrap"><div style="color:var(--text3);font-size:13px;padding:20px;text-align:center">재무제표를 불러오는 중...</div></div></div>'
    :infoTabHtml;

  detailEl.innerHTML='<div class="detail-hero"><div class="detail-avatar">'+esc((c.name||'거래처').charAt(0))+'</div><div class="detail-hero-text" style="flex:1"><h2>'+esc(c.name||'거래처')+'</h2><p>'+(c.industry||'업종 미입력')+'</p></div>'+(isAdmin||c.created_by===currentUser?.id?'<button class="btn sm" style="background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);color:#fff" onclick="openClientModal(\''+c.id+'\')">수정</button>':'')+'</div>'+dashboardHtml+'<div class="detail-tabs"><button class="detail-tab'+(tab==='projects'?' active':'')+'" onclick="openClientDetail(\''+id+'\',\'projects\')">프로젝트 ('+cp.length+')</button><button class="detail-tab'+(tab==='contracts'?' active':'')+'" onclick="openClientDetail(\''+id+'\',\'contracts\')">계약 ('+cc.length+')</button><button class="detail-tab'+(tab==='updates'?' active':'')+'" onclick="openClientDetail(\''+id+'\',\'updates\')">고객 레포트</button><button class="detail-tab'+(tab==='info'?' active':'')+'" onclick="openClientDetail(\''+id+'\',\'info\')">정보 / 메모</button></div>'+tabContent;
  if(tab==='updates'){
    loadClientUpdates(id);
    loadFinanceTab(id);
  }
  if(focusSection)focusTargetElement(focusSection);
};

let homeClientsRefreshTimer=null;
let homeClientsRefreshTimerSlow=null;

const renderClientsHomeBase=renderClients;

renderAlerts = function(){
  const el=document.getElementById('alertWrap');
  if(!el) return;
  const {overdue=[],unbilled=[],followups=[]}=getAlerts()||{};
  const dueToday=getHomeTodayDueProjects();
  const todayItems=getHomeTodayItems(99);
  const myIssueTotal=(currentMember?.name
    ?(projects||[])
      .filter(p=>Array.isArray(p.members)&&p.members.includes(currentMember.name))
      .reduce((sum,p)=>sum+(openIssuesByProject[p.id]||0),0)
    :0);
  const cards=[
    {label:'오늘 마감',value:dueToday.length,sub:dueToday.length?truncateText(dueToday.map(p=>p.name).join(', '),28):'오늘 종료 예정 없음',className:'today',action:"setPage('gantt')"},
    {label:'기간 초과',value:overdue.length,sub:overdue.length?truncateText(overdue.map(p=>p.name).join(', '),28):'지연 프로젝트 없음',className:'warn',action:"setPage('admin')"},
    {label:'빌링 필요',value:unbilled.length,sub:unbilled.length?truncateText(unbilled.map(p=>p.name).join(', '),28):'미청구 프로젝트 없음',className:'info',action:"setPage('admin')"},
    {label:'후속 조치',value:followups.length,sub:followups.length?truncateText(followups.map(p=>p.name).join(', '),28):'후속 조치 없음',className:'info',action:"setPage('admin')"},
    {label:'오늘 일정',value:todayItems.length,sub:todayItems.length?truncateText(todayItems.map(item=>item.title).join(', '),28):'오늘 등록된 일정 없음',className:'info',action:"setPage('home')"},
    {label:'내 담당 이슈',value:myIssueTotal,sub:myIssueTotal?'내 프로젝트에서 확인이 필요합니다':'열린 이슈 없음',className:'info',action:"setPage('home')"}
  ];
  el.innerHTML='<div class="main-focus-grid">'+cards.map(card=>
    '<div class="main-focus-card clickable '+(card.className||'')+'" onclick="'+card.action+'">'
      +'<div class="main-focus-label">'+esc(card.label)+'</div>'
      +'<div class="main-focus-value">'+card.value+'</div>'
      +'<div class="main-focus-sub">'+esc(card.sub)+'</div>'
    +'</div>'
  ).join('')+'</div>';
};

renderPinned = function(){
  const el=document.getElementById('pinnedWrap');
  if(!el) return;
  const noticeRows=getHomeNoticeHeadlines(5).map(n=>({
    title:n.title,
    meta:formatDate(n.created_at),
    badges:[
      ...(n.is_pinned?['<span class="badge badge-blue">고정</span>']:[]),
      ...(n.require_confirm?['<span class="badge badge-red">필독</span>']:[])
    ],
    action:'openNoticeDetail(\''+n.id+'\')'
  }));
  const todayRows=getHomeTodayItems(4);
  const issueRows=getHomeIssueItems(4);
  el.innerHTML=
    '<div class="main-home-grid">'
      +'<div class="main-home-card">'
        +'<div class="main-home-head">'
          +'<div><div class="main-home-title">공지사항</div><div class="main-home-sub">길게 읽는 본문 대신, 지금 확인할 제목만 먼저 보여줍니다.</div></div>'
          +'<button class="btn ghost sm" onclick="setPage(\'team\')">팀 탭 보기</button>'
        +'</div>'
        +renderHomeInfoList(noticeRows,'등록된 공지가 없습니다.')
      +'</div>'
      +'<div class="main-home-stack">'
        +'<div class="main-home-card">'
          +'<div class="main-home-head">'
            +'<div><div class="main-home-title">오늘 일정</div><div class="main-home-sub">'+(currentMember?.name?esc(currentMember.name)+'님의 오늘 일정과 진행 중 프로젝트입니다.':'오늘 일정 요약')+'</div></div>'
            +'<button class="btn ghost sm" onclick="setPage(\'team\')">팀 일정 보기</button>'
          +'</div>'
          +renderHomeInfoList(todayRows,currentMember?.name?'오늘 바로 처리할 일정이 없습니다.':'로그인 정보가 없어 개인 일정을 표시할 수 없습니다.')
        +'</div>'
        +'<div class="main-home-card">'
          +'<div class="main-home-head">'
            +'<div><div class="main-home-title">내 담당 이슈</div><div class="main-home-sub">지금 확인이 필요한 열린 이슈를 프로젝트 기준으로 묶어 보여줍니다.</div></div>'
            +'<button class="btn ghost sm" onclick="setPage(\'team\')">이슈 보기</button>'
          +'</div>'
          +renderHomeInfoList(issueRows,'현재 열려 있는 담당 이슈가 없습니다.')
        +'</div>'
      +'</div>'
    +'</div>';
};

renderClients = function(){
  renderClientsHomeBase();
  renderAlerts();
  renderPinned();
  const title=document.getElementById('boardTitle');
  if(title) title.textContent='거래처';
  if(homeClientsRefreshTimer) clearTimeout(homeClientsRefreshTimer);
  if(homeClientsRefreshTimerSlow) clearTimeout(homeClientsRefreshTimerSlow);
  homeClientsRefreshTimer=setTimeout(()=>{
    if(curPage==='clients'){
      renderAlerts();
      renderPinned();
    }
  },320);
  homeClientsRefreshTimerSlow=setTimeout(()=>{
    if(curPage==='clients'){
      renderAlerts();
      renderPinned();
    }
  },1300);
};

renderAlerts = function(){
  const {unbilled=[]}=getAlerts()||{};
  const el=document.getElementById('alertWrap');
  if(!el) return;
  let html='';
  if(unbilled.length){
    html+=`<div class="alert-card orange" style="margin-bottom:8px"><div class="alert-icon">💰</div><div class="alert-body"><div class="alert-title orange" style="font-size:13px;font-weight:800">완료됐으나 빌링 미처리 ${unbilled.length}건</div><div class="alert-items" style="margin-top:5px">${unbilled.map(x=>`<button class="alert-tag orange" onclick="openProjModal('${x.id}',null,null,'completion')">${esc(x.name)}</button>`).join('')}</div></div></div>`;
  }
  el.innerHTML=html?'<div style="margin-bottom:16px">'+html+'</div>':'';
};

renderPinned = function(){
  const el=document.getElementById('homePinnedWrap');
  if(!el) return;
  el.innerHTML='';
};

renderClients = function(){
  renderClientsHomeBase();
  renderAlerts();
  const title=document.getElementById('boardTitle');
  if(title) title.textContent='거래처';
};

let clientViewMode='card';
let clientTableSortKey='name';
let clientTableSortDir='asc';
let clientPendingDocRequests=[];
let clientPendingDocRequestsLoaded=false;
let clientPendingDocRequestsLoading=false;
const clientToolbarState={industry:'',manager:'',health:'all',search:'',sort:'name'};
const clientTableSelectedIds=new Set();
let clientTableLastRows=[];
let clientPortalAccessLogCache={};

function normalizeClientTags(value){
  if(Array.isArray(value))return value.map(tag=>String(tag||'').trim()).filter(Boolean);
  if(!value)return [];
  return String(value).split(',').map(tag=>tag.trim()).filter(Boolean);
}

function mergeClientTags(baseTags,newTags){
  return [...new Set([...(normalizeClientTags(baseTags)),...(normalizeClientTags(newTags))])];
}

function formatClientTags(tags){
  return normalizeClientTags(tags).join(', ');
}

function getClientAccessLogMeta(logs){
  const latest=(logs||[])[0];
  if(!latest)return {text:'접속 로그 없음',isStale:true};
  const time=getClientDateValue(latest.accessed_at||latest.created_at);
  const diffDays=Math.max(0,Math.floor((Date.now()-time)/(1000*60*60*24)));
  return {
    text:'마지막 접속 '+formatClientDetailRelativeText(time)+(latest.accessor_email?' · '+latest.accessor_email:''),
    isStale:diffDays>=14
  };
}

function canManageClientBulkActions(){
  return !!(canManageCore()||roleIsAdmin());
}

function syncClientPrimaryToggle(){
  document.getElementById('myFilterBtn')?.classList.toggle('active',myFilterActive);
  document.getElementById('allFilterBtn')?.classList.toggle('active',!myFilterActive);
}

toggleMyFilter=function(){
  myFilterActive=!myFilterActive;
  syncClientPrimaryToggle();
  renderClients();
};

function setClientSearch(value){
  clientToolbarState.search=String(value||'').trim();
  renderClients();
}

function setClientSort(value){
  clientToolbarState.sort=value||'name';
  const el=document.getElementById('clientSortFilter');
  if(el&&el.value!==clientToolbarState.sort)el.value=clientToolbarState.sort;
  if(['name','revenue','issues','recent'].includes(clientToolbarState.sort)){
    clientTableSortKey=clientToolbarState.sort;
    clientTableSortDir=clientToolbarState.sort==='name'?'asc':'desc';
  }
  renderClients();
}

function setClientViewMode(mode){
  clientViewMode=mode||'card';
  document.getElementById('clientViewCardBtn')?.classList.toggle('active',clientViewMode==='card');
  document.getElementById('clientViewTableBtn')?.classList.toggle('active',clientViewMode==='table');
  document.getElementById('clientViewHealthBtn')?.classList.toggle('active',clientViewMode==='health');
  renderClients();
}

function clearClientFilterTag(key){
  if(key==='myOnly')myFilterActive=false;
  if(key==='status'){
    const el=document.getElementById('projStatusFilter');
    if(el)el.value='';
  }
  if(key==='industry'){
    clientToolbarState.industry='';
    const el=document.getElementById('clientIndustryFilter');
    if(el)el.value='';
  }
  if(key==='manager'){
    clientToolbarState.manager='';
    const el=document.getElementById('clientManagerFilter');
    if(el)el.value='';
  }
  if(key==='health'){
    clientToolbarState.health='all';
    const el=document.getElementById('clientHealthFilter');
    if(el)el.value='all';
  }
  if(key==='search'){
    clientToolbarState.search='';
    const el=document.getElementById('clientSearchInput');
    if(el)el.value='';
  }
  syncClientPrimaryToggle();
  renderClients();
}

function sortClientTableBy(key){
  if(clientTableSortKey===key)clientTableSortDir=clientTableSortDir==='asc'?'desc':'asc';
  else{
    clientTableSortKey=key;
    clientTableSortDir=key==='name'||key==='industry'||key==='manager'||key==='portal'?'asc':'desc';
  }
  renderClients();
}

async function ensureClientPendingDocRequestsLoaded(force=false){
  if(clientPendingDocRequestsLoading)return;
  if(clientPendingDocRequestsLoaded&&!force)return;
  clientPendingDocRequestsLoading=true;
  try{
    clientPendingDocRequests=await api('GET','document_requests?status=eq.pending&select=id,project_id,title,due_date,created_at').catch(()=>[])||[];
    clientPendingDocRequestsLoaded=true;
  }catch(e){
    clientPendingDocRequests=[];
  }finally{
    clientPendingDocRequestsLoading=false;
  }
  if(curPage==='clients')renderClients();
}

function getClientBillingAmount(project){
  const projectAmount=Number(project?.billing_amount||0);
  if(projectAmount>0)return projectAmount;
  const linkedContract=contracts.find(ct=>ct.id===project?.contract_id);
  return Number(linkedContract?.contract_amount||0);
}

function getClientDateValue(value){
  if(!value)return 0;
  const time=new Date(value).getTime();
  return Number.isFinite(time)?time:0;
}

function getClientMonthRange(offset){
  const now=new Date();
  return{
    start:new Date(now.getFullYear(),now.getMonth()+offset,1),
    end:new Date(now.getFullYear(),now.getMonth()+offset+1,0,23,59,59,999)
  };
}

function isClientProjectCompleted(project){
  return String(project?.status||'').trim()==='완료';
}

function isClientProjectActive(project){
  const status=String(project?.status||'').trim();
  return status==='진행중'||status==='예정';
}

function isClientProjectOverdue(project){
  const end=toDate(project?.end||project?.end_date);
  const today=new Date();
  today.setHours(0,0,0,0);
  return !!end&&end<today&&!isClientProjectCompleted(project);
}

function getClientCompletionTimestamp(project){
  return getClientDateValue(project?.actual_end_date||project?.updated_at||project?.end||project?.end_date);
}

function getClientManagerNamesForClient(clientId){
  const assigned=getAssignedMemberNames(clientId);
  if(assigned.length)return [...new Set(assigned)];
  return [...new Set(
    (projects||[])
      .filter(project=>project?.client_id===clientId)
      .flatMap(project=>Array.isArray(project?.members)?project.members:[])
      .filter(Boolean)
  )];
}

function getClientPendingDocsForClient(clientId){
  const projectIds=new Set((projects||[]).filter(project=>project?.client_id===clientId).map(project=>project.id));
  return (clientPendingDocRequests||[]).filter(request=>projectIds.has(request.project_id));
}

function getClientHealthCode(row){
  if(row.openIssueCount>0)return 'issue';
  if(row.overdueProjectCount>0||row.unbilledProjectCount>0)return 'warning';
  return 'normal';
}

function getClientHealthLabel(code){
  if(code==='issue')return '이슈 있음';
  if(code==='warning')return '주의 필요';
  return '정상';
}

function getClientPortalStatusMeta(client){
  if(client?.portal_email)return {label:'활성',tone:'active',clickable:true};
  if(client?.onedrive_url)return {label:'문서함',tone:'linked',clickable:false};
  return {label:'미설정',tone:'empty',clickable:false};
}

function formatClientCompactCurrency(amount){
  const value=Number(amount||0);
  if(value>=10000)return Math.round(value/10000).toLocaleString()+'만원';
  return value.toLocaleString()+'원';
}

function getClientHighPriorityIssueCount(row){
  if(!Array.isArray(window.issuesPageCache)||!issuesPageCache.length)return 0;
  const projectIds=new Set((row?.projects||[]).map(project=>project.id));
  return issuesPageCache.filter(issue=>
    projectIds.has(issue?.project_id)&&
    isIssueActiveStatus(issue?.status)&&
    String(issue?.priority||'medium').trim()==='high'
  ).length;
}

function getClientCardHealthMeta(row){
  const highIssueCount=getClientHighPriorityIssueCount(row);
  const reasons=[];
  let tone='normal';
  let label='정상';
  if(row.overdueProjectCount>0||highIssueCount>0){
    tone='risk';
    label='위험';
    if(row.overdueProjectCount>0)reasons.push('지연 프로젝트 '+row.overdueProjectCount+'건');
    if(highIssueCount>0)reasons.push('긴급 이슈 '+highIssueCount+'건');
  }else if(row.unbilledProjectCount>0||row.pendingDocCount>0){
    tone='warning';
    label='주의';
    if(row.unbilledProjectCount>0)reasons.push('미청구 프로젝트 '+row.unbilledProjectCount+'건');
    if(row.pendingDocCount>0)reasons.push('자료 대기 '+row.pendingDocCount+'건');
  }else{
    reasons.push('지연, 미청구, 열린 이슈 없음');
  }
  return {tone,label,reasonText:reasons.join(' · '),highIssueCount};
}

function getClientRecentActivityMeta(timestamp){
  if(!timestamp)return {text:'최근 활동 기록 없음',isStale:true};
  const now=new Date();
  const diffMs=now.getTime()-timestamp;
  const days=Math.max(0,Math.floor(diffMs/(1000*60*60*24)));
  if(days===0)return {text:'최근 활동 오늘',isStale:false};
  if(days===1)return {text:'최근 활동 1일 전',isStale:false};
  return {text:'최근 활동 '+days+'일 전',isStale:days>=14};
}

function buildClientRow(client){
  const clientProjects=(projects||[]).filter(project=>project?.client_id===client.id);
  const clientContracts=(contracts||[]).filter(contract=>contract?.client_id===client.id);
  const managerNames=getClientManagerNamesForClient(client.id);
  const activeProjects=clientProjects.filter(isClientProjectActive);
  const overdueProjects=clientProjects.filter(isClientProjectOverdue);
  const completedProjects=clientProjects.filter(isClientProjectCompleted);
  const unbilledProjects=completedProjects.filter(project=>project?.is_billable&&String(project?.billing_status||'').trim()==='미청구');
  const pendingDocs=getClientPendingDocsForClient(client.id);
  const openIssueCount=clientProjects.reduce((sum,project)=>sum+(openIssuesByProject[project.id]||0),0);
  const currentRange=getClientMonthRange(0);
  const previousRange=getClientMonthRange(-1);
  const revenueThisMonth=completedProjects
    .filter(project=>{
      const timestamp=getClientCompletionTimestamp(project);
      return timestamp>=currentRange.start.getTime()&&timestamp<=currentRange.end.getTime();
    })
    .reduce((sum,project)=>sum+getClientBillingAmount(project),0);
  const revenuePreviousMonth=completedProjects
    .filter(project=>{
      const timestamp=getClientCompletionTimestamp(project);
      return timestamp>=previousRange.start.getTime()&&timestamp<=previousRange.end.getTime();
    })
    .reduce((sum,project)=>sum+getClientBillingAmount(project),0);
  const totalRevenue=completedProjects.reduce((sum,project)=>sum+getClientBillingAmount(project),0);
  const recentActivityAt=Math.max(
    getClientDateValue(client?.updated_at||client?.created_at),
    ...clientProjects.map(project=>Math.max(
      getClientDateValue(project?.updated_at||project?.created_at),
      getClientDateValue(project?.actual_end_date),
      getClientDateValue(project?.end||project?.end_date)
    )),
    ...clientContracts.map(contract=>Math.max(
      getClientDateValue(contract?.updated_at||contract?.created_at),
      getClientDateValue(contract?.contract_end_date),
      getClientDateValue(contract?.contract_start_date)
    )),
    ...pendingDocs.map(request=>Math.max(
      getClientDateValue(request?.created_at),
      getClientDateValue(request?.due_date)
    )),
    0
  );
  const row={
    client,
    projects:clientProjects,
    contracts:clientContracts,
    managerNames,
    contractCount:clientContracts.length,
    activeProjectCount:activeProjects.length,
    overdueProjectCount:overdueProjects.length,
    openIssueCount,
    unbilledProjectCount:unbilledProjects.length,
    unbilledAmount:unbilledProjects.reduce((sum,project)=>sum+getClientBillingAmount(project),0),
    pendingDocs,
    pendingDocCount:pendingDocs.length,
    revenueThisMonth,
    revenuePreviousMonth,
    totalRevenue,
    activeProjectTypes:[...new Set(clientProjects.map(project=>project?.type).filter(Boolean))],
    activeContractCount:clientContracts.filter(contract=>String(contract?.contract_status||'').trim()==='진행중').length,
    recentActivityAt
  };
  row.healthCode=getClientHealthCode(row);
  row.cardHealthMeta=getClientCardHealthMeta(row);
  row.recentActivityMeta=getClientRecentActivityMeta(recentActivityAt);
  row.portalStatusMeta=getClientPortalStatusMeta(client);
  return row;
}

function getClientBaseRows(){
  const statusFilter=document.getElementById('projStatusFilter')?.value||'';
  return (clients||[])
    .filter(client=>{
      const clientProjects=(projects||[]).filter(project=>project?.client_id===client.id);
      if(myFilterActive&&currentMember&&!clientProjects.some(project=>Array.isArray(project?.members)&&project.members.includes(currentMember.name)))return false;
      if(statusFilter==='active'&&!clientProjects.some(isClientProjectActive))return false;
      return true;
    })
    .map(buildClientRow);
}

function clientMatchesDetailFilters(row){
  const search=clientToolbarState.search.trim().toLowerCase();
  if(clientToolbarState.industry&&String(row.client?.industry||'')!==clientToolbarState.industry)return false;
  if(clientToolbarState.manager&&!row.managerNames.includes(clientToolbarState.manager))return false;
  if(clientToolbarState.health!=='all'&&row.healthCode!==clientToolbarState.health)return false;
  if(search){
    const haystack=[row.client?.name||'',...row.managerNames].join(' ').toLowerCase();
    if(!haystack.includes(search))return false;
  }
  return true;
}

function sortClientRows(rows){
  const sorted=[...rows];
  const compareName=(a,b)=>String(a.client?.name||'').localeCompare(String(b.client?.name||''),'ko');
  sorted.sort((a,b)=>{
    if(clientToolbarState.sort==='revenue')return (b.totalRevenue-a.totalRevenue)||compareName(a,b);
    if(clientToolbarState.sort==='issues')return (b.openIssueCount-a.openIssueCount)||(b.overdueProjectCount-a.overdueProjectCount)||compareName(a,b);
    if(clientToolbarState.sort==='recent')return (b.recentActivityAt-a.recentActivityAt)||compareName(a,b);
    return compareName(a,b);
  });
  return sorted;
}

function sortClientTableRows(rows){
  const sorted=[...rows];
  const dir=clientTableSortDir==='asc'?1:-1;
  const compareText=(a,b)=>String(a||'').localeCompare(String(b||''),'ko')*dir;
  const compareNumber=(a,b)=>(Number(a||0)-Number(b||0))*dir;
  sorted.sort((a,b)=>{
    if(clientTableSortKey==='health'){
      const rank={risk:3,warning:2,normal:1};
      return compareNumber(rank[a.cardHealthMeta?.tone]||0,rank[b.cardHealthMeta?.tone]||0)||compareNameFallback(a,b);
    }
    if(clientTableSortKey==='name')return compareText(a.client?.name,b.client?.name);
    if(clientTableSortKey==='industry')return compareText(a.client?.industry,b.client?.industry)||compareNameFallback(a,b);
    if(clientTableSortKey==='active')return compareNumber(a.activeProjectCount,b.activeProjectCount)||compareNameFallback(a,b);
    if(clientTableSortKey==='issues')return compareNumber(a.openIssueCount,b.openIssueCount)||compareNameFallback(a,b);
    if(clientTableSortKey==='revenue')return compareNumber(a.totalRevenue,b.totalRevenue)||compareNameFallback(a,b);
    if(clientTableSortKey==='unbilled')return compareNumber(a.unbilledAmount,b.unbilledAmount)||compareNameFallback(a,b);
    if(clientTableSortKey==='contracts')return compareNumber(a.contractCount,b.contractCount)||compareNameFallback(a,b);
    if(clientTableSortKey==='manager')return compareText(a.managerNames.join(', '),b.managerNames.join(', '))||compareNameFallback(a,b);
    if(clientTableSortKey==='portal'){
      const rank={active:3,linked:2,empty:1};
      return compareNumber(rank[a.portalStatusMeta?.tone]||0,rank[b.portalStatusMeta?.tone]||0)||compareNameFallback(a,b);
    }
    if(clientTableSortKey==='recent')return compareNumber(a.recentActivityAt,b.recentActivityAt)||compareNameFallback(a,b);
    return compareNameFallback(a,b);
  });
  return sorted;
}

function compareNameFallback(a,b){
  return String(a.client?.name||'').localeCompare(String(b.client?.name||''),'ko');
}

function getClientTableSortIndicator(key){
  if(clientTableSortKey!==key)return '';
  return clientTableSortDir==='asc'?' ↑':' ↓';
}

function openClientQuickProject(clientId){
  openClientDetail(clientId,'projects');
}

function openClientQuickIssues(clientId){
  const clientProjects=(projects||[]).filter(project=>project?.client_id===clientId);
  const issueProject=clientProjects.find(project=>(openIssuesByProject[project.id]||0)>0)||clientProjects[0];
  if(issueProject)openProjModal(issueProject.id,null,null,'issue');
  else openClientDetail(clientId,'projects');
}

function openClientQuickPortal(clientId){
  const client=clients.find(item=>item.id===clientId);
  if(!client)return;
  if(client.portal_email&&typeof previewPortal==='function'){previewPortal(clientId);return;}
  if(canManagePortalSettings()&&typeof openPortalAccountEdit==='function'){openPortalAccountEdit(clientId);return;}
  openClientDetail(clientId,'info');
}

function getClientBoardReasonTags(row){
  const tags=[];
  const highIssueCount=row.cardHealthMeta?.highIssueCount||0;
  if(row.overdueProjectCount>0)tags.push('지연 '+row.overdueProjectCount+'건');
  if(row.unbilledAmount>0)tags.push('미청구 '+formatClientCompactCurrency(row.unbilledAmount));
  if(highIssueCount>0)tags.push('긴급 이슈 '+highIssueCount+'건');
  else if(row.openIssueCount>0)tags.push('열린 이슈 '+row.openIssueCount+'건');
  if(row.pendingDocCount>0)tags.push('자료 대기 '+row.pendingDocCount+'건');
  if(!tags.length)tags.push('특이사항 없음');
  return tags;
}

function renderClientFilterOptions(baseRows){
  const industrySelect=document.getElementById('clientIndustryFilter');
  const managerSelect=document.getElementById('clientManagerFilter');
  if(industrySelect){
    const industries=[...new Set(baseRows.map(row=>String(row.client?.industry||'').trim()).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
    industrySelect.innerHTML='<option value="">업종 전체</option>'+industries.map(industry=>'<option value="'+esc(industry)+'">'+esc(industry)+'</option>').join('');
    industrySelect.value=clientToolbarState.industry;
    if(industrySelect.value!==clientToolbarState.industry)clientToolbarState.industry=industrySelect.value;
  }
  if(managerSelect){
    const managers=[...new Set(baseRows.flatMap(row=>row.managerNames).filter(Boolean))].sort((a,b)=>a.localeCompare(b,'ko'));
    managerSelect.innerHTML='<option value="">담당자 전체</option>'+managers.map(name=>'<option value="'+esc(name)+'">'+esc(name)+'</option>').join('');
    managerSelect.value=clientToolbarState.manager;
    if(managerSelect.value!==clientToolbarState.manager)clientToolbarState.manager=managerSelect.value;
  }
}

function formatClientCurrency(amount){
  return Number(amount||0).toLocaleString()+'원';
}

function formatClientRevenueDelta(currentValue,previousValue){
  const diff=currentValue-previousValue;
  if(!diff)return '전월 대비 변동 없음';
  return '전월 대비 '+(diff>0?'+':'')+Number(diff).toLocaleString()+'원';
}

function renderClientKpis(rows){
  const el=document.getElementById('clientsTopSummary');
  if(!el)return;
  const activeClientCount=rows.filter(row=>row.activeProjectCount>0).length;
  const attentionCount=rows.filter(row=>row.overdueProjectCount>0||row.openIssueCount>0).length;
  const unbilledAmount=rows.reduce((sum,row)=>sum+row.unbilledAmount,0);
  const pendingDocCount=rows.reduce((sum,row)=>sum+row.pendingDocCount,0);
  const monthRevenue=rows.reduce((sum,row)=>sum+row.revenueThisMonth,0);
  const prevMonthRevenue=rows.reduce((sum,row)=>sum+row.revenuePreviousMonth,0);
  const cards=[
    {label:'전체 거래처',value:rows.length+'곳',sub:'활성 프로젝트 보유 '+activeClientCount+'곳'},
    {label:'주의 필요',value:attentionCount===0?'없음 ✓':attentionCount+'곳',sub:attentionCount===0?'지연/열린 이슈 거래처 없음':'지연 프로젝트 또는 열린 이슈 기준',className:attentionCount===0?'is-good':'is-bad'},
    {label:'미청구 금액',value:formatClientCurrency(unbilledAmount),sub:'미청구 프로젝트 '+rows.reduce((sum,row)=>sum+row.unbilledProjectCount,0)+'건'},
    {label:'자료 대기',value:pendingDocCount+'건',sub:clientPendingDocRequestsLoaded?'pending document request 기준':'문서 요청 불러오는 중'},
    {label:'이번 달 매출',value:formatClientCurrency(monthRevenue),sub:formatClientRevenueDelta(monthRevenue,prevMonthRevenue)}
  ];
  el.innerHTML=cards.map(card=>
    '<div class="client-kpi-card '+(card.className||'')+'">'
      +'<div class="client-kpi-label">'+esc(card.label)+'</div>'
      +'<div class="client-kpi-value">'+esc(card.value)+'</div>'
      +'<div class="client-kpi-sub">'+esc(card.sub)+'</div>'
    +'</div>'
  ).join('');
}

function renderClientFilterTags(){
  const el=document.getElementById('clientFilterTags');
  if(!el)return;
  const tags=[];
  const statusFilter=document.getElementById('projStatusFilter')?.value||'';
  if(myFilterActive)tags.push({key:'myOnly',label:'내 고객사'});
  if(statusFilter==='active')tags.push({key:'status',label:'진행중 프로젝트만'});
  if(clientToolbarState.industry)tags.push({key:'industry',label:'업종 · '+clientToolbarState.industry});
  if(clientToolbarState.manager)tags.push({key:'manager',label:'담당자 · '+clientToolbarState.manager});
  if(clientToolbarState.health!=='all')tags.push({key:'health',label:'건강상태 · '+getClientHealthLabel(clientToolbarState.health)});
  if(clientToolbarState.search)tags.push({key:'search',label:'검색 · '+clientToolbarState.search});
  el.innerHTML=tags.map(tag=>'<span class="client-filter-tag">'+esc(tag.label)+'<button type="button" onclick="clearClientFilterTag(\''+tag.key+'\')">×</button></span>').join('');
}

function renderClientCard(detail){
  const chips=detail.activeProjectTypes.slice(0,3).map(type=>'<span class="chip" style="background:'+(TYPES[type]||'#94A3B8')+'">'+esc(type)+'</span>').join('');
  const cardHealth=detail.cardHealthMeta||getClientCardHealthMeta(detail);
  const recentActivity=detail.recentActivityMeta||getClientRecentActivityMeta(detail.recentActivityAt);
  return '<div class="client-card" onclick="openClientDetail(this.dataset.id)" data-id="'+detail.client.id+'">'
    +'<div class="client-card-head"><div class="client-avatar">'+esc((detail.client.name||'?').charAt(0))+'</div><div class="client-card-head-status"><span class="client-health-dot is-'+cardHealth.tone+'" title="'+esc(cardHealth.label+' · '+cardHealth.reasonText)+'"></span></div></div>'
    +'<div class="client-name">'+esc(detail.client.name||'거래처')+'</div>'
    +'<div class="client-industry">'+esc(detail.client.industry||'업종 미입력')+'</div>'
    +'<div class="chip-row">'+chips+(detail.activeProjectTypes.length>3?'<span style="font-size:11px;color:var(--text3);padding:3px 0">+'+(detail.activeProjectTypes.length-3)+'건</span>':'')+'</div>'
    +'<div class="client-key-stats">진행 '+detail.activeProjectCount+' · 이슈 '+detail.openIssueCount+' · 계약 '+detail.contractCount+'</div>'
    +'<div class="client-recent'+(recentActivity.isStale?' is-stale':'')+'">'+esc(recentActivity.text)+'</div>'
    +'<div class="client-footer"><span class="client-members">'+esc(detail.managerNames.slice(0,3).join(' · ')||'담당자 미배정')+'</span><span class="client-active">'+detail.activeProjectCount+'건 진행중'+(detail.activeContractCount?' · 계약 '+detail.activeContractCount:'')+'</span></div>'
    +'</div>';
}

function renderClientTable(rows){
  const tableRows=sortClientTableRows(rows);
  return '<div class="client-table-shell">'
    +'<div class="client-table-head"><div class="client-table-title">거래처 테이블</div><div class="muted">검색과 정렬은 상단 필터를 따릅니다.</div></div>'
    +'<div class="client-table-wrap"><table class="client-table"><thead><tr>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'health\')">건강'+getClientTableSortIndicator('health')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'name\')">거래처명'+getClientTableSortIndicator('name')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'industry\')">업종'+getClientTableSortIndicator('industry')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'active\')">진행중 프로젝트'+getClientTableSortIndicator('active')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'issues\')">열린 이슈'+getClientTableSortIndicator('issues')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'unbilled\')">미청구 금액'+getClientTableSortIndicator('unbilled')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'contracts\')">계약 수'+getClientTableSortIndicator('contracts')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'manager\')">담당자'+getClientTableSortIndicator('manager')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'portal\')">포털 상태'+getClientTableSortIndicator('portal')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'recent\')">최근 활동'+getClientTableSortIndicator('recent')+'</button></th>'
    +'</tr></thead><tbody>'
    +tableRows.map(row=>{
      const recentLabel=row.recentActivityMeta?.text||'최근 활동 기록 없음';
      return '<tr onclick="openClientDetail(\''+row.client.id+'\')">'
        +'<td><span class="client-health-dot is-'+(row.cardHealthMeta?.tone||'normal')+'" title="'+esc((row.cardHealthMeta?.label||'정상')+' · '+(row.cardHealthMeta?.reasonText||''))+'"></span></td>'
        +'<td><div class="client-table-name">'+esc(row.client.name||'거래처')+'</div><div class="client-table-sub">활성 프로젝트 '+row.activeProjectCount+'건</div><div class="client-table-actions"><button type="button" class="btn sm" onclick="event.stopPropagation();openClientQuickProject(\''+row.client.id+'\')">프로젝트 보기</button><button type="button" class="btn sm" onclick="event.stopPropagation();openClientQuickIssues(\''+row.client.id+'\')">이슈 보기</button>'+(row.portalStatusMeta?.clickable?'<button type="button" class="btn sm" onclick="event.stopPropagation();openClientQuickPortal(\''+row.client.id+'\')">포털 접속</button>':'')+'</div></td>'
        +'<td>'+esc(row.client.industry||'-')+'</td>'
        +'<td>'+row.activeProjectCount+'건</td>'
        +'<td>'+row.openIssueCount+'건</td>'
        +'<td>'+formatClientCurrency(row.unbilledAmount)+'</td>'
        +'<td>'+row.contractCount+'건</td>'
        +'<td>'+esc(row.managerNames.join(', ')||'-')+'</td>'
        +'<td><span class="badge '+(row.portalStatusMeta?.tone==='active'?'badge-blue':'badge-gray')+'">'+esc(row.portalStatusMeta?.label||'미설정')+'</span></td>'
        +'<td><span class="'+(row.recentActivityMeta?.isStale?'client-table-recent is-stale':'client-table-recent')+'">'+esc(recentLabel)+'</span></td>'
      +'</tr>';
    }).join('')
    +'</tbody></table></div></div>';
}

function renderClientHealthBoard(rows){
  const groups=[
    {key:'normal',label:'정상',className:''},
    {key:'warning',label:'주의 필요',className:'is-warning'},
    {key:'risk',label:'위험',className:'is-issue'}
  ];
  return '<div class="client-health-board">'+groups.map(group=>{
    const items=rows.filter(row=>(row.cardHealthMeta?.tone||'normal')===group.key);
    return '<div class="client-health-column '+group.className+'"><div class="client-health-head"><div class="client-health-title">'+group.label+'</div><div class="client-health-count">'+items.length+'곳</div></div><div class="client-health-list">'
      +(items.length?items.map(row=>'<div class="client-health-item" onclick="openClientDetail(\''+row.client.id+'\')"><div class="client-health-item-name">'+esc(row.client.name||'거래처')+'</div><div class="client-health-item-tags">'+getClientBoardReasonTags(row).map(tag=>'<span class="client-health-tag">'+esc(tag)+'</span>').join('')+'</div></div>').join(''):'<div class="empty-state" style="padding:24px 14px">해당 거래처가 없습니다.</div>')
      +'</div></div>';
  }).join('')+'</div>';
}

function toggleClientTableSelection(clientId,checked){
  if(checked)clientTableSelectedIds.add(clientId);
  else clientTableSelectedIds.delete(clientId);
  renderClients();
}

function toggleAllClientTableSelections(clientIds,checked){
  if(checked)clientIds.forEach(id=>clientTableSelectedIds.add(id));
  else clientIds.forEach(id=>clientTableSelectedIds.delete(id));
  renderClients();
}

function clearClientTableSelection(){
  clientTableSelectedIds.clear();
  renderClients();
}

function getSelectedClientRows(rows){
  const source=Array.isArray(rows)?rows:clientTableLastRows;
  return source.filter(row=>clientTableSelectedIds.has(row.client.id));
}

async function applyClientBulkManager(memberId,clientIds){
  if(!canManageClientBulkActions()||!clientIds.length)return;
  const member=members.find(item=>item.id===memberId);
  try{
    for(const clientId of clientIds){
      const existing=(clientAssignments||[]).filter(assign=>assign.client_id===clientId);
      for(const assign of existing){
        await api('DELETE','client_assignments?id=eq.'+assign.id);
      }
      if(memberId){
        await api('POST','client_assignments',{client_id:clientId,member_id:memberId,assigned_by:currentUser?.id||null});
        try{
          await api('POST','client_assignment_logs',{
            client_id:clientId,
            member_id:memberId,
            member_name:member?.name||'',
            action:'assigned',
            actor_user_id:currentUser?.id||null,
            note:'일괄 관리에서 담당자를 변경했습니다.'
          });
        }catch(err){}
      }
    }
    clientAssignments=await api('GET','client_assignments?select=*')||[];
    closeModal();
    clearClientTableSelection();
  }catch(e){alert('일괄 담당자 변경 오류: '+e.message);}
}

function openClientBulkManagerModal(){
  if(!canManageClientBulkActions())return;
  const selected=getSelectedClientRows();
  if(!selected.length){alert('거래처를 먼저 선택해주세요.');return;}
  window.__clientBulkTargetIds=selected.map(row=>row.client.id);
  document.getElementById('modalArea').innerHTML=
    getInputModalOverlayHtml()
    +'<div class="modal" style="width:420px"><div class="modal-title">일괄 담당자 변경</div>'
    +'<div style="font-size:12px;color:var(--text3);margin-bottom:12px">'+selected.length+'개 거래처에 같은 담당자를 적용합니다.</div>'
    +'<div class="form-row"><label class="form-label">담당자</label><select id="clientBulkManager"><option value="">미배정</option>'+members.map(member=>'<option value="'+member.id+'">'+esc(member.name||'멤버')+'</option>').join('')+'</select></div>'
    +'<div class="modal-footer"><div></div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">취소</button><button class="btn primary" onclick="applyClientBulkManager(document.getElementById(\'clientBulkManager\').value,window.__clientBulkTargetIds||[])">적용</button></div></div>'
    +'</div></div>';
}

async function applyClientBulkTags(tags,clientIds){
  if(!canManageClientBulkActions()||!clientIds.length)return;
  try{
    for(const clientId of clientIds){
      const client=clients.find(row=>row.id===clientId);
      await api('PATCH','clients?id=eq.'+clientId,{tags:mergeClientTags(client?.tags||[],tags)});
    }
    closeModal();
    clientTableSelectedIds.clear();
    await loadAll();
    renderClients();
  }catch(e){alert('일괄 태그 추가 오류: '+e.message);}
}

function openClientBulkTagModal(){
  if(!canManageClientBulkActions())return;
  const selected=getSelectedClientRows();
  if(!selected.length){alert('거래처를 먼저 선택해주세요.');return;}
  window.__clientBulkTargetIds=selected.map(row=>row.client.id);
  document.getElementById('modalArea').innerHTML=
    getInputModalOverlayHtml()
    +'<div class="modal" style="width:420px"><div class="modal-title">일괄 태그 추가</div>'
    +'<div style="font-size:12px;color:var(--text3);margin-bottom:12px">쉼표로 구분한 태그를 기존 태그에 추가합니다.</div>'
    +'<div class="form-row"><label class="form-label">추가할 태그</label><input id="clientBulkTags" placeholder="예) 중요, 상장사, 월결산"/></div>'
    +'<div class="modal-footer"><div></div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">취소</button><button class="btn primary" onclick="applyClientBulkTags(document.getElementById(\'clientBulkTags\').value,window.__clientBulkTargetIds||[])">적용</button></div></div>'
    +'</div></div>';
}

async function applyClientBulkPortalSettings(clientIds){
  if(!canManageClientBulkActions()||!clientIds.length)return;
  const mode=document.getElementById('clientBulkPortalMode')?.value||'keep';
  const password=document.getElementById('clientBulkPortalPassword')?.value||'';
  const onedrive=document.getElementById('clientBulkPortalDrive')?.value?.trim()||'';
  try{
    for(const clientId of clientIds){
      const client=clients.find(row=>row.id===clientId);
      const body={};
      if(mode==='disable'){
        body.portal_email=null;
        body.portal_password=null;
      }else if(mode==='enable'&&password){
        body.portal_email=client?.portal_email||client?.contact_email||null;
        body.portal_password=password;
      }
      if(onedrive)body.onedrive_url=onedrive;
      if(Object.keys(body).length)await api('PATCH','clients?id=eq.'+clientId,body);
    }
    closeModal();
    clientTableSelectedIds.clear();
    await loadAll();
    renderClients();
  }catch(e){alert('일괄 포털 설정 오류: '+e.message);}
}

function openClientBulkPortalModal(){
  if(!canManageClientBulkActions())return;
  const selected=getSelectedClientRows();
  if(!selected.length){alert('거래처를 먼저 선택해주세요.');return;}
  window.__clientBulkTargetIds=selected.map(row=>row.client.id);
  document.getElementById('modalArea').innerHTML=
    getInputModalOverlayHtml()
    +'<div class="modal" style="width:440px"><div class="modal-title">일괄 포털 설정</div>'
    +'<div style="font-size:12px;color:var(--text3);margin-bottom:12px">'+selected.length+'개 거래처에 공통 포털 설정을 적용합니다.</div>'
    +'<div class="form-row"><label class="form-label">포털 처리 방식</label><select id="clientBulkPortalMode"><option value="keep">변경 안 함</option><option value="enable">비밀번호 재설정 / 활성 유지</option><option value="disable">포털 비활성화</option></select></div>'
    +'<div class="form-row"><label class="form-label">공통 비밀번호</label><input id="clientBulkPortalPassword" placeholder="활성 유지 시 공통 비밀번호"/></div>'
    +'<div class="form-row"><label class="form-label">공통 문서함 URL</label><input id="clientBulkPortalDrive" placeholder="선택한 거래처에 같은 문서함 URL 적용"/></div>'
    +'<div class="modal-footer"><div></div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">취소</button><button class="btn primary" onclick="applyClientBulkPortalSettings(window.__clientBulkTargetIds||[])">적용</button></div></div>'
    +'</div></div>';
}

renderClientTable=function(rows){
  const tableRows=sortClientTableRows(rows);
  const manageable=canManageClientBulkActions();
  clientTableLastRows=tableRows;
  window.__clientTableVisibleIds=tableRows.map(row=>row.client.id);
  const selectedRows=getSelectedClientRows(tableRows);
  const allSelected=!!(window.__clientTableVisibleIds.length&&window.__clientTableVisibleIds.every(id=>clientTableSelectedIds.has(id)));
  return '<div class="client-table-shell">'
    +'<div class="client-table-head"><div><div class="client-table-title">거래처 테이블</div><div class="muted">검색과 정렬은 상단 필터를 따릅니다.</div></div>'
    +(manageable&&selectedRows.length
      ?'<div class="client-bulk-actions"><span class="client-bulk-count">'+selectedRows.length+'개 선택</span><button type="button" class="btn sm" onclick="openClientBulkManagerModal()">일괄 담당자 변경</button><button type="button" class="btn sm" onclick="openClientBulkTagModal()">일괄 태그 추가</button><button type="button" class="btn sm" onclick="openClientBulkPortalModal()">일괄 포털 설정</button><button type="button" class="btn ghost sm" onclick="clearClientTableSelection()">선택 해제</button></div>'
      :'<div class="muted">행 위에서 빠른 링크를 바로 열 수 있습니다.</div>')
    +'</div>'
    +'<div class="client-table-wrap"><table class="client-table"><thead><tr>'
      +(manageable?'<th><input type="checkbox" '+(allSelected?'checked ':'')+'onclick="event.stopPropagation();toggleAllClientTableSelections(window.__clientTableVisibleIds||[],this.checked)"/></th>':'')
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'health\')">건강'+getClientTableSortIndicator('health')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'name\')">거래처명'+getClientTableSortIndicator('name')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'industry\')">업종'+getClientTableSortIndicator('industry')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'active\')">진행중 프로젝트'+getClientTableSortIndicator('active')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'issues\')">열린 이슈'+getClientTableSortIndicator('issues')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'unbilled\')">미청구 금액'+getClientTableSortIndicator('unbilled')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'contracts\')">계약 수'+getClientTableSortIndicator('contracts')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'manager\')">담당자'+getClientTableSortIndicator('manager')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'portal\')">포털 상태'+getClientTableSortIndicator('portal')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'recent\')">최근 활동'+getClientTableSortIndicator('recent')+'</button></th>'
    +'</tr></thead><tbody>'
    +tableRows.map(row=>{
      const recentLabel=row.recentActivityMeta?.text||'최근 활동 기록 없음';
      return '<tr onclick="openClientDetail(\''+row.client.id+'\')">'
        +(manageable?'<td><input type="checkbox" '+(clientTableSelectedIds.has(row.client.id)?'checked ':'')+'onclick="event.stopPropagation();toggleClientTableSelection(\''+row.client.id+'\',this.checked)"/></td>':'')
        +'<td><span class="client-health-dot is-'+(row.cardHealthMeta?.tone||'normal')+'" title="'+esc((row.cardHealthMeta?.label||'정상')+' · '+(row.cardHealthMeta?.reasonText||''))+'"></span></td>'
        +'<td><div class="client-table-name">'+esc(row.client.name||'거래처')+'</div><div class="client-table-sub">활성 프로젝트 '+row.activeProjectCount+'건</div><div class="client-table-actions"><button type="button" class="btn sm" onclick="event.stopPropagation();openClientQuickProject(\''+row.client.id+'\')">프로젝트 보기</button><button type="button" class="btn sm" onclick="event.stopPropagation();openClientQuickIssues(\''+row.client.id+'\')">이슈 보기</button>'+(row.portalStatusMeta?.clickable?'<button type="button" class="btn sm" onclick="event.stopPropagation();openClientQuickPortal(\''+row.client.id+'\')">포털 접속</button>':'')+'</div></td>'
        +'<td>'+esc(row.client.industry||'-')+'</td>'
        +'<td>'+row.activeProjectCount+'건</td>'
        +'<td>'+row.openIssueCount+'건</td>'
        +'<td>'+formatClientCurrency(row.unbilledAmount)+'</td>'
        +'<td>'+row.contractCount+'건</td>'
        +'<td>'+esc(row.managerNames.join(', ')||'-')+'</td>'
        +'<td><span class="badge '+(row.portalStatusMeta?.tone==='active'?'badge-blue':'badge-gray')+'">'+esc(row.portalStatusMeta?.label||'미설정')+'</span></td>'
        +'<td><span class="'+(row.recentActivityMeta?.isStale?'client-table-recent is-stale':'client-table-recent')+'">'+esc(recentLabel)+'</span></td>'
      +'</tr>';
    }).join('')
    +'</tbody></table></div></div>';
};

renderAlerts=function(){};
renderPinned=function(){};

renderClients=function(){
  const grid=document.getElementById('clientGrid');
  if(!grid)return;
  syncClientPrimaryToggle();
  if(!clientPendingDocRequestsLoaded&&!clientPendingDocRequestsLoading)ensureClientPendingDocRequestsLoaded();
  clientToolbarState.industry=document.getElementById('clientIndustryFilter')?.value||'';
  clientToolbarState.manager=document.getElementById('clientManagerFilter')?.value||'';
  clientToolbarState.health=document.getElementById('clientHealthFilter')?.value||'all';
  clientToolbarState.search=document.getElementById('clientSearchInput')?.value?.trim()||'';
  clientToolbarState.sort=document.getElementById('clientSortFilter')?.value||clientToolbarState.sort||'name';

  const title=document.getElementById('boardTitle');
  if(title)title.textContent='거래처';

  const baseRows=getClientBaseRows();
  renderClientFilterOptions(baseRows);
  let rows=baseRows.filter(clientMatchesDetailFilters);
  rows=sortClientRows(rows);
  renderClientKpis(rows);
  renderClientFilterTags();
  document.getElementById('clientViewCardBtn')?.classList.toggle('active',clientViewMode==='card');
  document.getElementById('clientViewTableBtn')?.classList.toggle('active',clientViewMode==='table');
  document.getElementById('clientViewHealthBtn')?.classList.toggle('active',clientViewMode==='health');

  if(!rows.length){
    grid.className='board-grid';
    grid.innerHTML='<div class="empty-state"><span class="empty-icon">🏢</span>조건에 맞는 거래처가 없습니다<br><br><button class="btn primary sm" onclick="openClientModal()">+ 고객사 추가</button></div>';
    return;
  }

  if(clientViewMode==='table'){
    grid.className='';
    grid.innerHTML=renderClientTable(rows);
    return;
  }
  if(clientViewMode==='health'){
    grid.className='';
    grid.innerHTML=renderClientHealthBoard(rows);
    return;
  }
  grid.className='board-grid';
  grid.innerHTML=rows.map(renderClientCard).join('');
};
