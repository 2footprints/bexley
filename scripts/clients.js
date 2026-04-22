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

function openClientDetail(id, tab='projects'){
  const c=clients.find(x=>x.id===id);if(!c)return;
  currentDetailClientId=id;
  const cp=projects.filter(p=>p.client_id===id);
  const cc=contracts.filter(ct=>ct.client_id===id);
  const mems=[...new Set(cp.flatMap(p=>p.members))];
  const portalAssignees=getAssignedMemberNames(id);
  const isAssigned=roleIsAdmin()||(currentMember&&clientAssignments.some(a=>a.client_id===id&&a.member_id===currentMember.id));
  const today=new Date();

  const projItems=cp.map(p=>{
    const od=toDate(p.end)<today&&p.status!=='완료';
    const ub=p.status==='완료'&&p.is_billable&&p.billing_status==='미청구';
    const ic=openIssuesByProject[p.id]||0;
    const stBadge=p.status==='진행중'?'badge-blue':p.status==='완료'?'badge-gray':'badge-orange';
    const blBadge=!p.is_billable?'badge-gray':p.billing_status==='수금완료'?'badge-green':p.billing_status==='청구완료'?'badge-blue':'badge-red';
    return '<div class="proj-item" onclick="'+(ic?'openProjModal(this.dataset.id,\'issue\')':'openProjModal(this.dataset.id)')+'" data-id="'+p.id+'" style="'+(ic?'border-left:3px solid var(--red)':'')+'">'
      +'<div class="proj-dot" style="background:'+TYPES[p.type]+'"></div>'
      +'<div class="proj-info">'
      +'<div class="proj-name">'+esc(p.name)+(ic?'<span style="margin-left:6px;background:var(--red);color:#fff;font-size:10px;font-weight:700;padding:1px 6px;border-radius:8px">이슈 '+ic+'</span>':'')+'</div>'
      +'<div class="proj-sub">'+p.start+' ~ '+p.end+(p.members.length?' · '+p.members.join(', '):'')+'</div>'
      +(od?'<div class="proj-warn">⏰ 기간 초과 — 완료 처리 필요</div>':'')
      +(ub?'<div class="proj-warn">💰 완료됐으나 빌링 미처리</div>':'')
      +(p.status==='완료'&&p.follow_up_needed?'<div class="proj-warn">후속 액션 필요'+(p.follow_up_note?' · '+esc(truncateText(p.follow_up_note,26)):'')+'</div>':'')
      +'</div>'
      +'<div class="proj-badges">'
      +'<span class="badge '+stBadge+'">'+p.status+'</span>'
      +(p.is_billable?'<span class="badge '+blBadge+'">'+p.billing_status+'</span>':'<span class="badge badge-gray">비청구</span>')
      +(p.billing_amount?'<span style="font-size:11px;color:var(--text2);font-weight:700">'+Number(p.billing_amount).toLocaleString()+'원</span>':'')
      +'</div></div>';
  }).join('');

  const contractItems=cc.map(ct=>{
    const ctProjs=projects.filter(p=>p.contract_id===ct.id);
    const billedAmt=ctProjs.reduce((s,p)=>s+(p.billing_amount&&p.billing_status!=='미청구'?Number(p.billing_amount):0),0);
    const totalAmt=ct.contract_amount?Number(ct.contract_amount):0;
    const pct=totalAmt>0?Math.min(100,Math.round(billedAmt/totalAmt*100)):0;
    const stCls='cst-'+(ct.contract_status||'검토중');
    const amt=totalAmt?totalAmt.toLocaleString()+'원'+(ct.vat_included?' (VAT포함)':' (VAT별도)'):'금액 미입력';
    const unbilledProjs=ctProjs.filter(p=>p.status==='완료'&&p.is_billable&&p.billing_status==='미청구');
    return '<div class="contract-item" onclick="openContractDetail(this.dataset.id)" data-id="'+ct.id+'">'
      +'<div class="contract-icon">📄</div>'
      +'<div class="contract-info">'
      +'<div class="contract-name">'+esc(ct.contract_name||'제목 없음')+'</div>'
      +'<div class="contract-sub">'+(ct.contract_code?ct.contract_code+' · ':'')+( ct.contract_type?ct.contract_type+' · ':'')+amt+'</div>'
      +(ct.contract_start_date?'<div class="contract-sub">'+ct.contract_start_date+' ~ '+(ct.contract_end_date||'')+'</div>':'')
      +(totalAmt&&ctProjs.length?'<div style="margin-top:6px"><div style="display:flex;justify-content:space-between;font-size:11px;color:var(--text3);margin-bottom:3px"><span>빌링 진행률</span><span>'+billedAmt.toLocaleString()+'원 / '+totalAmt.toLocaleString()+'원 ('+pct+'%)</span></div><div style="background:var(--bg);border-radius:20px;height:5px;overflow:hidden"><div style="width:'+pct+'%;height:100%;border-radius:20px;background:'+(pct>=100?'var(--green)':pct>50?'var(--blue)':'var(--orange)')+'"></div></div></div>':'')
      +(unbilledProjs.length?'<div style="font-size:11px;color:var(--red);margin-top:4px;font-weight:600">⚠ 미청구 프로젝트 '+unbilledProjs.length+'건</div>':'')
      +'</div>'
      +'<div class="contract-badges"><span class="badge '+stCls+'">'+(ct.contract_status||'검토중')+'</span><span style="font-size:11px;color:var(--text3)">프로젝트 '+ctProjs.length+'건</span></div></div>';
  }).join('');

  const tabContent=tab==='projects'
    ?'<div class="card"><div class="section-label">관련 프로젝트 ('+cp.length+'건) <button class="btn primary sm" onclick="openProjModal(null,\''+id+'\')">+ 추가</button></div>'
      +(projItems||'<div style="color:var(--text3);font-size:13px;padding:12px 0">프로젝트가 없습니다</div>')
      +'</div>'
    :tab==='contracts'
    ?'<div class="card"><div class="section-label">계약서 ('+cc.length+'건) <button class="btn primary sm" onclick="openContractModal(null,\''+id+'\')">+ 추가</button></div>'
      +(contractItems||'<div style="color:var(--text3);font-size:13px;padding:12px 0">등록된 계약이 없습니다</div>')
      +'</div>'
    :tab==='updates'
    ?'<div>'
      +'<div class="card" style="margin-bottom:14px">'
      +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">'
      +'<div class="section-label" style="margin:0">업무 업데이트</div>'
      +(isAssigned?'<button class="btn primary sm" onclick="openUpdateModal(null,\''+id+'\')">+ 작성</button>':'')
      +'</div>'
      +'<div id="updateFeed"><div style="color:var(--text3);font-size:13px;padding:12px 0">불러오는 중...</div></div>'
      +'</div>'
      +'<div id="financeTabWrap"><div style="color:var(--text3);font-size:13px;padding:20px;text-align:center">재무제표 불러오는 중...</div></div>'
      +'</div>'
    :'<div class="card"><div class="section-label">고객사 정보</div>'
      +'<div class="info-row"><span class="info-label">담당자</span><span class="info-value">'+(c.contact_name||'—')+'</span></div>'
      +'<div class="info-row"><span class="info-label">이메일</span><span class="info-value">'+(c.contact_email||'—')+'</span></div>'
      +'<div class="info-row"><span class="info-label">연락처</span><span class="info-value">'+(c.contact_phone||'—')+'</span></div>'
      +'<div class="info-row"><span class="info-label">담당 인력</span><span class="info-value">'+(mems.join(', ')||'—')+'</span></div>'
      +'<div class="info-row"><span class="info-label">업종</span><span class="info-value">'+(c.industry||'—')+'</span></div>'
      +'</div>'
      +'<div class="card" style="margin-top:14px"><div class="section-label">고객사 포털</div>'
      +'<div class="info-row"><span class="info-label">상태</span><span class="info-value">'+(c.portal_email?'<span class="badge badge-blue">활성</span>':'<span class="badge badge-gray">미설정</span>')+'</span></div>'
      +'<div class="info-row"><span class="info-label">외부 담당자</span><span class="info-value">'+(c.contact_name||'—')+(c.contact_email?'<br><span style="font-size:11px;color:var(--text3)">'+esc(c.contact_email)+'</span>':'')+'</span></div>'
      +'<div class="info-row"><span class="info-label">내부 담당</span><span class="info-value">'+(portalAssignees.join(', ')||'미배정')+'</span></div>'
      +'<div class="info-row"><span class="info-label">문서함</span><span class="info-value">'+(c.onedrive_url?'<a href="'+esc(c.onedrive_url)+'" target="_blank" style="color:var(--blue)">OneDrive 열기 →</a>':'미설정')+'</span></div>'
      +(c.portal_email?'<div style="margin-top:12px;display:flex;align-items:center;justify-content:space-between;gap:8px;flex-wrap:wrap"><button class="btn primary sm" onclick="previewPortal(\''+c.id+'\')">👀 접속</button>'+(canManagePortalSettings()?'<button class="btn sm" onclick="openPortalAccountEdit(\''+c.id+'\')">설정 수정</button>':'')+'</div>':'<div style="color:var(--text3);font-size:12px;padding:8px 0">포털 미설정</div>'+(canManagePortalSettings()?'<button class="btn sm" style="margin-top:8px" onclick="openPortalAccountEdit(\''+c.id+'\')">페이지 설정</button>':'')) 
      +'</div>'
      +'<div class="card" style="margin-top:14px"><div class="section-label">메모</div>'
      +'<div class="memo-area">'+(c.memo||'메모 없음')+'</div>'
      +'</div>';

  document.getElementById('detailContent').innerHTML=
    '<div class="detail-hero">'
    +'<div class="detail-avatar">'+esc(c.name.charAt(0))+'</div>'
    +'<div class="detail-hero-text" style="flex:1">'
    +'<h2>'+esc(c.name)+'</h2>'
    +'<p>'+(c.industry||'업종 미입력')+'</p>'

    +'</div>'
    +(isAdmin||c.created_by===currentUser?.id?'<button class="btn sm" style="background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);color:#fff" onclick="openClientModal(\''+c.id+'\')">수정</button>':'')
    +'</div>'
    +'<div class="detail-tabs">'
    +'<button class="detail-tab'+(tab==='projects'?' active':'')+'" onclick="openClientDetail(\''+id+'\',\'projects\')">프로젝트 ('+cp.length+')</button>'
    +'<button class="detail-tab'+(tab==='contracts'?' active':'')+'" onclick="openClientDetail(\''+id+'\',\'contracts\')">계약 ('+cc.length+')</button>'
    +'<button class="detail-tab'+(tab==='updates'?' active':'')+'" onclick="openClientDetail(\''+id+'\',\'updates\')">고객 레포트</button>'
    +'<button class="detail-tab'+(tab==='info'?' active':'')+'" onclick="openClientDetail(\''+id+'\',\'info\')">정보 / 메모</button>'
    +'</div>'
    +tabContent;
  setPage('detail');
  if(tab==='updates'){loadClientUpdates(id);loadFinanceTab(id);}
}

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
