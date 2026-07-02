function getContractDetailAgingMeta(record){
  const baseValue=record?.billing_date||record?.created_at||'';
  if(!baseValue)return {days:null,label:'기준일 없음',tone:'normal'};
  const baseDate=record?.billing_date&&/^\d{4}-\d{2}-\d{2}$/.test(record.billing_date)?toDate(record.billing_date):new Date(baseValue);
  if(Number.isNaN(baseDate.getTime()))return {days:null,label:'기준일 없음',tone:'normal'};
  baseDate.setHours(0,0,0,0);
  const today=new Date();
  today.setHours(0,0,0,0);
  const days=Math.max(0,Math.floor((today.getTime()-baseDate.getTime())/(1000*60*60*24)));
  return {
    days,
    label:'경과 '+days+'일',
    tone:days>=60?'danger':days>=30?'warn':'normal'
  };
}

function getContractDetailRemainingMeta(contract){
  if(!contract?.contract_end_date)return {text:'만료일 미설정',tone:'normal'};
  const end=toDate(contract.contract_end_date);
  end.setHours(0,0,0,0);
  const today=new Date();
  today.setHours(0,0,0,0);
  const diff=Math.floor((end.getTime()-today.getTime())/(1000*60*60*24));
  if(diff<0)return {text:'만료 D+'+Math.abs(diff),tone:'danger'};
  if(diff===0)return {text:'오늘 만료',tone:'warn'};
  if(diff<=60)return {text:'D-'+diff,tone:'warn'};
  return {text:'D-'+diff,tone:'normal'};
}

function getContractDetailProjectMeta(project){
  const isCompleted=project?.status==='완료';
  const hasEnd=!!project?.end;
  const overdue=hasEnd&&!isCompleted&&toDate(project.end)<new Date();
  const isBillable=project?.is_billable!==false;
  const billingStatus=isBillable?(String(project?.billing_status||'미청구').trim()||'미청구'):'비청구대상';
  const periodText=(project?.start||'시작 미정')+' ~ '+(project?.end||'종료 미정');
  let tone='active';
  if(overdue)tone='danger';
  else if(isCompleted)tone='done';
  let helper='진행 상황과 청구 일정을 함께 확인하세요.';
  if(overdue)helper='기한을 넘긴 프로젝트입니다. 일정 재확인 또는 완료 처리가 필요합니다.';
  else if(isCompleted&&billingStatus==='수금완료')helper='완료 및 수금까지 마감된 프로젝트입니다.';
  else if(isCompleted&&billingStatus!=='수금완료')helper='완료된 프로젝트입니다. 남은 청구 또는 수금 상태를 확인하세요.';
  else if(!isCompleted&&billingStatus==='미청구')helper='진행 중 프로젝트입니다. 완료 시 청구 영향이 있을 수 있습니다.';
  const billingTone=billingStatus==='수금완료'?'normal':billingStatus==='청구완료'?'warn':isBillable?'danger':'normal';
  return {tone,overdue,billingStatus,billingTone,periodText,helper};
}

async function openContractDetail(id){
  const ct=contracts.find(x=>x.id===id);if(!ct)return;
  const client=clients.find(c=>c.id===ct.client_id);
  const ctProjs=projects.filter(p=>p.contract_id===id);
  const totalAmt=ct.contract_amount?Number(ct.contract_amount):0;
  const contractStatusText=ct.contract_status||'검토중';
  const stCls='cst-'+contractStatusText;
  const previousContract=ct.previous_contract_id?contracts.find(item=>item.id===ct.previous_contract_id):null;
  const remainingMeta=getContractDetailRemainingMeta(ct);

  const backBtn=document.getElementById('contractBack');
  if(backBtn){
    backBtn.textContent='← '+(client?client.name+' 로':'고객사로');
    backBtn.onclick=()=>openClientDetail(ct.client_id,'contracts');
  }

  let billingRecs=[];
  try{billingRecs=await api('GET','billing_records?contract_id=eq.'+id+'&select=*&order=billing_date.desc')||[];}catch(e){}
  let contractDocs=[];
  try{contractDocs=await api('GET','contract_documents?contract_id=eq.'+id+'&select=*&order=created_at.desc')||[];}catch(e){}
  contractDetailBillingRecords=billingRecs;
  contractDetailDocuments=contractDocs;

  const billedAmt=billingRecs.reduce((s,r)=>s+Number(r.amount||0),0);
  const collectedAmt=billingRecs.filter(r=>r.status==='수금완료').reduce((s,r)=>s+Number(r.amount||0),0);
  const receivableAmt=Math.max(0,billedAmt-collectedAmt);
  const unbilledAmt=Math.max(0,totalAmt-billedAmt);
  const pct=totalAmt>0?Math.min(100,Math.round(billedAmt/totalAmt*100)):0;
  const collectionRate=billedAmt>0?Math.round((collectedAmt/billedAmt)*100):0;
  const waterfallBase=Math.max(totalAmt,billedAmt,collectedAmt,1);
  const collectedPct=Math.round((collectedAmt/waterfallBase)*100);
  const receivablePct=Math.round((receivableAmt/waterfallBase)*100);
  const unbilledPct=Math.round((unbilledAmt/waterfallBase)*100);
  const activeProjectCount=ctProjs.filter(p=>p.status!=='완료').length;
  const completedProjectCount=ctProjs.filter(p=>p.status==='완료').length;
  const billingAffectedCount=ctProjs.filter(p=>{
    const billingStatus=p?.is_billable===false?'비청구대상':(String(p?.billing_status||'미청구').trim()||'미청구');
    return p.status!=='완료'||(p?.is_billable!==false&&billingStatus!=='수금완료');
  }).length;
  const receivableCount=billingRecs.filter(r=>r.status!=='수금완료').length;
  const renewalStateText=remainingMeta.tone==='danger'?'만료됨':remainingMeta.tone==='warn'?'갱신 점검':'정상';
  const renewalHelper=remainingMeta.tone==='danger'
    ?'만료된 계약입니다. 갱신 또는 종료 처리 여부를 확인하세요.'
    :remainingMeta.tone==='warn'
      ?'만료가 가까운 계약입니다. 연장 여부와 후속 커뮤니케이션을 점검하세요.'
      :'현재 계약 기간은 안정 구간입니다.';

  const projRows=ctProjs.length
    ?'<div class="contract-detail-project-list">'+ctProjs.map(p=>{
      const projectMeta=getContractDetailProjectMeta(p);
      const stBadge=p.status==='진행중'?'badge-blue':p.status==='완료'?'badge-gray':'badge-orange';
      const billingBadgeClass=projectMeta.billingTone==='danger'?'badge-red':projectMeta.billingTone==='warn'?'badge-orange':'badge-gray';
      const memberText=(Array.isArray(p.members)&&p.members.length)?p.members.join(', '):'담당자 미지정';
      return '<div class="contract-detail-project-item is-'+projectMeta.tone+'" onclick="openProjModal(this.dataset.id)" data-id="'+p.id+'">'
        +'<div class="contract-detail-project-main">'
          +'<div class="contract-detail-project-top">'
            +'<div>'
              +'<div class="contract-detail-project-name">'+esc(p.name||'프로젝트')+'</div>'
              +'<div class="contract-detail-project-meta">'+esc(projectMeta.periodText)+' · '+esc(memberText)+'</div>'
            +'</div>'
            +'<div class="contract-detail-project-chips"><span class="badge '+stBadge+'">'+esc(p.status||'예정')+'</span><span class="badge '+billingBadgeClass+'">'+esc(projectMeta.billingStatus)+'</span></div>'
          +'</div>'
          +'<div class="contract-detail-project-note">'+esc(projectMeta.helper)+'</div>'
        +'</div>'
      +'</div>';
    }).join('')+'</div>'
    :'<div class="contract-detail-empty">연결된 프로젝트가 없습니다. 계약과 연결된 프로젝트를 등록하면 진행과 청구 영향을 함께 확인할 수 있습니다.</div>';

  const billingRows=billingRecs.length
    ?billingRecs.map(r=>{
      const isCollected=r.status==='수금완료';
      const agingMeta=getContractDetailAgingMeta(r);
      const billingDateText=r.billing_date||'청구일 미지정';
      const expectedText=r.expected_collection_date||'미정';
      const reminderText=r.last_reminder_at?formatCommentDate(r.last_reminder_at):'없음';
      const billingHelper=isCollected
        ?'수금 완료된 건입니다. 근거 문서와 메모만 확인하면 됩니다.'
        :agingMeta.days>=60
          ?'장기 미수금입니다. 회수 일정과 고객 커뮤니케이션을 우선 확인하세요.'
          :agingMeta.days>=30
            ?'리마인드 여부와 예상 수금일을 다시 확인하세요.'
            :(r.expected_collection_date?'예상 수금일 기준으로 후속 확인이 필요합니다.':'예상 수금일을 지정하면 추적이 쉬워집니다.');
      return '<div class="contract-detail-billing-item is-'+agingMeta.tone+'">'
        +'<div class="contract-detail-billing-head">'
          +'<div><div class="contract-detail-billing-amount">'+Number(r.amount||0).toLocaleString()+'원</div><div class="contract-detail-billing-date">'+billingDateText+(r.memo?' · '+esc(r.memo):'')+'</div></div>'
          +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><span class="badge '+(isCollected?'badge-green':'badge-orange')+'">'+(isCollected?'수금완료':'미수금')+'</span><span class="contract-detail-aging is-'+agingMeta.tone+'">'+agingMeta.label+'</span></div>'
        +'</div>'
        +'<div class="contract-detail-billing-meta-grid">'
          +'<div class="contract-detail-billing-meta-item"><span>청구일</span><strong>'+esc(billingDateText)+'</strong></div>'
          +'<div class="contract-detail-billing-meta-item"><span>상태</span><strong>'+(isCollected?'수금 완료':'회수 추적 중')+'</strong></div>'
          +'<div class="contract-detail-billing-meta-item"><span>예상 수금일</span><strong>'+esc(expectedText)+'</strong></div>'
          +'<div class="contract-detail-billing-meta-item"><span>마지막 리마인드</span><strong>'+esc(reminderText)+'</strong></div>'
        +'</div>'
        +'<div class="contract-detail-billing-note">다음 확인: '+esc(billingHelper)+'</div>'
        +'<div class="contract-detail-billing-actions">'
          +(!isCollected?'<button class="btn sm" onclick="openContractBillingReminderModal(\''+r.id+'\',\''+id+'\')">리마인드 메일</button>':'')
          +'<button class="btn '+(isCollected?'ghost':'primary')+' sm" onclick="toggleBillingStatus(\''+r.id+'\',\''+id+'\',\''+r.status+'\')">'+(isCollected?'미수금으로':'수금 완료')+'</button>'
          +'<button class="btn ghost sm" onclick="openBillingRecordModal(\''+id+'\',\''+r.id+'\')">수정</button>'
          +(isAdmin?'<button class="btn ghost sm" onclick="deleteBillingRecord(\''+r.id+'\',\''+id+'\')">삭제</button>':'')
        +'</div>'
      +'</div>';
    }).join('')
    :'<div class="contract-detail-empty">등록된 청구 내역이 없습니다. 첫 청구를 추가해 계약 금액 대비 진행과 수금 상태를 추적하세요.</div>';

  const documentRows=contractDocs.length
    ?'<div class="contract-detail-doc-list">'+contractDocs.map(doc=>'<div class="contract-detail-doc-item"><div class="contract-detail-doc-main"><div class="contract-detail-doc-title">'+esc(doc.title||'문서')+'</div><div class="contract-detail-doc-meta">'+esc(doc.category||'카테고리 없음')+'</div></div><div class="contract-detail-doc-actions"><a class="btn sm" href="'+esc(doc.url||'#')+'" target="_blank" rel="noopener noreferrer">문서 열기</a>'+(canManageCore()?'<button class="btn ghost sm" onclick="openContractDocumentModal(\''+id+'\',\''+doc.id+'\')">수정</button>':'')+'</div></div>').join('')+'</div>'
    :'<div class="contract-detail-empty">등록된 계약 문서가 없습니다. 계약서 원본, 정산 자료, 참고 링크를 여기에 정리할 수 있습니다.</div>';

  const billingStatusMeta=getContractBillingStatusMeta({
    contractAmount:totalAmt,
    billedTotal:billedAmt,
    receivableAmount:receivableAmt,
    unbilledBalance:unbilledAmt
  });
  const followUpProjects=ctProjs.filter(project=>!!project.follow_up_needed);
  const followUpCount=followUpProjects.length;
  const scopeBlocks=[
    ct.description?'<div class="contract-detail-note-block"><div class="contract-detail-note-label">계약 범위</div><div class="contract-detail-note-value">'+esc(ct.description)+'</div></div>':'',
    ct.deliverables?'<div class="contract-detail-note-block"><div class="contract-detail-note-label">주요 산출물</div><div class="contract-detail-note-value">'+esc(ct.deliverables)+'</div></div>':'',
    ct.memo?'<div class="contract-detail-note-block"><div class="contract-detail-note-label">운영 메모</div><div class="contract-detail-note-value">'+esc(ct.memo)+'</div></div>':''
  ].filter(Boolean).join('');
  const additionalWorkBlocks=followUpCount
    ?'<div class="contract-detail-project-summary"><span class="contract-detail-summary-chip is-warn">추가업무/후속관리 '+followUpCount+'건</span><span class="contract-detail-summary-chip">청구 영향 '+billingAffectedCount+'건</span></div>'
      +followUpProjects.slice(0,4).map(project=>
        '<div class="contract-detail-note-block"><div class="contract-detail-note-label">'+esc(project.name||'프로젝트')+'</div><div class="contract-detail-note-value">'+esc(project.follow_up_note||'완료 후 추가 확인이 필요한 프로젝트입니다.')+'</div></div>'
      ).join('')
      +(followUpCount>4?'<div class="contract-detail-empty">추가업무/후속관리 프로젝트가 더 있습니다. 관련 프로젝트 영역에서 전체를 확인하세요.</div>':'')
    :'<div class="contract-detail-empty">현재 추가업무 또는 후속관리로 표시된 프로젝트가 없습니다.</div>';

  const contentParts=[
    '<div class="detail-hero">'
    +'<div class="detail-avatar" style="background:var(--blue-dark)">📄</div>'
    +'<div class="detail-hero-text" style="flex:1"><h2>'+esc(ct.contract_name||'계약 상세')+'</h2><p>'+(client?esc(client.name)+' · ':'')+esc(ct.contract_type||'')+(ct.contract_code?' · '+esc(ct.contract_code):'')+'</p></div>'
    +'<div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;justify-content:flex-end"><span class="badge '+stCls+'">'+esc(contractStatusText)+'</span><span class="contract-detail-aging is-'+remainingMeta.tone+'">'+renewalStateText+' · '+remainingMeta.text+'</span>'+(isAdmin||ct.created_by===currentUser?.id?'<button class="btn sm" style="background:rgba(255,255,255,.1);border-color:rgba(255,255,255,.2);color:#fff" onclick="openContractModal(\''+id+'\')">수정</button>':'')+'</div>'
    +'</div>',

    '<div class="card contract-detail-section" style="margin-bottom:14px"><div class="contract-detail-card-head"><div><div class="section-label" style="margin:0">계약 핵심 상태</div><div class="contract-detail-card-sub">이 계약이 건강한지, 돈이 빠지고 있는지, 갱신 검토가 필요한지를 먼저 봅니다.</div></div></div>'
    +'<div class="contract-detail-summary-grid">'
      +'<div class="contract-detail-summary-card"><div class="contract-detail-summary-label">계약 상태</div><div class="contract-detail-summary-value">'+esc(contractStatusText)+'</div><div class="contract-detail-summary-meta">'+esc(ct.contract_type||'유형 미지정')+' · 담당 '+esc((ctProjs.flatMap(p=>Array.isArray(p.members)?p.members:[]).filter(Boolean).slice(0,2).join(', '))||'미지정')+'</div></div>'
      +'<div class="contract-detail-summary-card"><div class="contract-detail-summary-label">청구 상태</div><div class="contract-detail-summary-value '+(billingStatusMeta.tone==='danger'?'is-red':billingStatusMeta.tone==='warn'?'is-orange':billingStatusMeta.tone==='ok'?'is-green':'')+'">'+esc(billingStatusMeta.label)+'</div><div class="contract-detail-summary-meta">'+esc(billingStatusMeta.detail)+'</div></div>'
      +'<div class="contract-detail-summary-card"><div class="contract-detail-summary-label">갱신 상태</div><div class="contract-detail-summary-value '+(remainingMeta.tone==='danger'?'is-red':remainingMeta.tone==='warn'?'is-orange':'')+'">'+renewalStateText+'</div><div class="contract-detail-summary-meta">'+esc(remainingMeta.text)+' · '+esc(ct.contract_end_date||'종료일 미정')+'</div></div>'
      +'<div class="contract-detail-summary-card"><div class="contract-detail-summary-label">추가업무 점검</div><div class="contract-detail-summary-value '+(followUpCount?'is-orange':'')+'">'+followUpCount+'건</div><div class="contract-detail-summary-meta">'+(followUpCount?'후속관리 등록 프로젝트가 있습니다.':'추가업무/후속관리 등록 없음')+'</div></div>'
    +'</div></div>',

    '<div class="card contract-detail-section" style="margin-bottom:14px"><div class="contract-detail-card-head"><div><div class="section-label" style="margin:0">금액 / 청구 현황</div><div class="contract-detail-card-sub">계약 금액, 청구 진행, 수금 상태를 한 번에 확인합니다.</div></div><div class="contract-detail-summary-inline">'+(billedAmt?('청구율 '+pct+'% · 수금률 '+collectionRate+'%'):'아직 청구 내역 없음')+'</div></div>'
    +'<div class="contract-detail-summary-grid">'
      +'<div class="contract-detail-summary-card"><div class="contract-detail-summary-label">계약 총액</div><div class="contract-detail-summary-value">'+(totalAmt?totalAmt.toLocaleString()+'원':'미입력')+'</div><div class="contract-detail-summary-meta">'+esc(contractStatusText)+' 계약 · '+esc(ct.contract_type||'유형 미지정')+'</div></div>'
      +'<div class="contract-detail-summary-card"><div class="contract-detail-summary-label">청구 합계</div><div class="contract-detail-summary-value is-blue">'+billedAmt.toLocaleString()+'원</div><div class="contract-detail-summary-meta">현재까지 청구된 금액</div></div>'
      +'<div class="contract-detail-summary-card"><div class="contract-detail-summary-label">수금 완료</div><div class="contract-detail-summary-value is-green">'+collectedAmt.toLocaleString()+'원</div><div class="contract-detail-summary-meta">'+(billedAmt?('청구액 기준 '+collectionRate+'% 회수'):'아직 청구 내역 없음')+'</div></div>'
      +'<div class="contract-detail-summary-card"><div class="contract-detail-summary-label">미수금</div><div class="contract-detail-summary-value '+(receivableAmt>0?'is-orange':'')+'">'+receivableAmt.toLocaleString()+'원</div><div class="contract-detail-summary-meta">'+(receivableCount?('회수 추적 '+receivableCount+'건'):'현재 미수금 없음')+'</div></div>'
      +'<div class="contract-detail-summary-card"><div class="contract-detail-summary-label">미청구 잔액</div><div class="contract-detail-summary-value '+(unbilledAmt>0?'is-red':'')+'">'+unbilledAmt.toLocaleString()+'원</div><div class="contract-detail-summary-meta">'+(totalAmt?'계약 총액 대비 남은 청구':'계약 금액 입력 후 계산 가능')+'</div></div>'
    +'</div>'
    +(totalAmt?'<div class="contract-detail-progress-block"><div class="contract-detail-progress-head"><span>청구 진행</span><strong>'+pct+'%</strong></div><div class="contract-detail-progress-track"><div class="contract-detail-progress-fill" style="width:'+pct+'%"></div></div></div>':'')
    +'<div class="contract-detail-waterfall"><div class="contract-detail-waterfall-segment is-collected" style="width:'+collectedPct+'%"></div><div class="contract-detail-waterfall-segment is-receivable" style="width:'+receivablePct+'%"></div><div class="contract-detail-waterfall-segment is-unbilled" style="width:'+unbilledPct+'%"></div></div>'
    +'<div class="contract-detail-waterfall-legend"><span><i class="contract-detail-dot is-collected"></i>수금 완료 '+collectedAmt.toLocaleString()+'원</span><span><i class="contract-detail-dot is-receivable"></i>미수금 '+receivableAmt.toLocaleString()+'원</span><span><i class="contract-detail-dot is-unbilled"></i>미청구 '+unbilledAmt.toLocaleString()+'원</span></div>'
    +'</div>',

    '<div class="detail-grid" style="margin-bottom:14px">'
    +'<div class="card contract-detail-section"><div class="contract-detail-card-head"><div><div class="section-label" style="margin:0">청구 / 수금 현황</div><div class="contract-detail-card-sub">청구일, 수금 상태, 리마인드 이력을 함께 봅니다.</div></div><button class="btn primary sm" onclick="openBillingRecordModal(\''+id+'\')">+ 청구 추가</button></div>'+billingRows+'</div>'
    +'<div class="card contract-detail-section"><div class="contract-detail-card-head"><div><div class="section-label" style="margin:0">계약 범위</div><div class="contract-detail-card-sub">계약 범위와 납품물, 운영 메모를 먼저 확인합니다.</div></div></div>'+(scopeBlocks||'<div class="contract-detail-empty">등록된 계약 범위 메모가 없습니다. 계약 설명이나 산출물을 입력하면 범위 관리가 더 쉬워집니다.</div>')+'</div>'
    +'</div>',

    '<div class="detail-grid" style="margin-bottom:14px">'
    +'<div class="card contract-detail-section"><div class="contract-detail-card-head"><div><div class="section-label" style="margin:0">추가업무 / 후속관리</div><div class="contract-detail-card-sub">범위 밖으로 번진 업무나 완료 후 후속 확인이 필요한 프로젝트를 점검합니다.</div></div></div>'+additionalWorkBlocks+'</div>'
    +'<div class="card contract-detail-section"><div class="contract-detail-card-head"><div><div class="section-label" style="margin:0">갱신 정보</div><div class="contract-detail-card-sub">'+renewalHelper+'</div></div><span class="contract-detail-aging is-'+remainingMeta.tone+'">'+remainingMeta.text+'</span></div><div class="contract-detail-renewal-box"><div class="contract-detail-renewal-row"><span class="contract-detail-renewal-label">계약 기간</span><span class="contract-detail-renewal-value">'+esc(ct.contract_start_date||'시작 미정')+' ~ '+esc(ct.contract_end_date||'종료 미정')+'</span></div><div class="contract-detail-renewal-row"><span class="contract-detail-renewal-label">갱신 상태</span><span class="contract-detail-renewal-value">'+renewalStateText+'</span></div><div class="contract-detail-renewal-row"><span class="contract-detail-renewal-label">추가 점검</span><span class="contract-detail-renewal-value">청구 영향 '+billingAffectedCount+'건 · 후속관리 '+followUpCount+'건</span></div>'+(previousContract?'<div class="contract-detail-renewal-row"><span class="contract-detail-renewal-label">이전 계약</span><button class="btn ghost sm" onclick="openContractDetail(\''+previousContract.id+'\')">'+esc(previousContract.contract_name||'계약')+'</button></div>':'<div class="contract-detail-renewal-row"><span class="contract-detail-renewal-label">이전 계약</span><span class="muted">연결된 이전 계약 없음</span></div>')+'<div class="contract-detail-renewal-row"><span class="contract-detail-renewal-label">갱신 작업</span><button class="btn primary sm" onclick="openRenewalContractFromDetail(\''+id+'\')">갱신 계약 생성</button></div></div></div>'
    +'</div>',

    '<div class="card contract-detail-section" style="margin-bottom:14px"><div class="contract-detail-card-head"><div><div class="section-label" style="margin:0">관련 프로젝트</div><div class="contract-detail-card-sub">이 계약의 범위, 청구, 종료 일정에 영향을 주는 프로젝트를 함께 봅니다.</div></div><button class="btn primary sm" onclick="openProjModalWithContract(\''+id+'\',\''+ct.client_id+'\')">+ 프로젝트 추가</button></div><div class="contract-detail-project-summary"><span class="contract-detail-summary-chip">진행중 '+activeProjectCount+'건</span><span class="contract-detail-summary-chip">완료 '+completedProjectCount+'건</span><span class="contract-detail-summary-chip '+(billingAffectedCount?'is-warn':'')+'">청구 영향 '+billingAffectedCount+'건</span></div>'+projRows+'</div>',

    '<div class="detail-grid" style="margin-bottom:14px">'
    +'<div class="card contract-detail-section"><div class="contract-detail-card-head"><div><div class="section-label" style="margin:0">계약 문서</div><div class="contract-detail-card-sub">계약서, 참고 링크, 정산 자료를 보조 정보로 정리합니다.</div></div>'+(canManageCore()?'<button class="btn sm" onclick="openContractDocumentModal(\''+id+'\')">문서 추가</button>':'')+'</div>'+documentRows+'</div>'
    +'<div class="card contract-detail-section"><div class="contract-detail-card-head"><div><div class="section-label" style="margin:0">기본 정보</div><div class="contract-detail-card-sub">계약 코드와 연락처, 과세 정보처럼 정적 기준값을 확인합니다.</div></div></div>'
      +(ct.contract_code?'<div class="info-row"><span class="info-label">계약 코드</span><span class="info-value">'+esc(ct.contract_code)+'</span></div>':'')
      +(ct.contract_type?'<div class="info-row"><span class="info-label">유형</span><span class="info-value">'+esc(ct.contract_type)+'</span></div>':'')
      +'<div class="info-row"><span class="info-label">계약 기간</span><span class="info-value">'+esc(ct.contract_start_date||'시작 미정')+' ~ '+esc(ct.contract_end_date||'종료 미정')+'</span></div>'
      +'<div class="info-row"><span class="info-label">계약 금액</span><span class="info-value">'+(totalAmt?totalAmt.toLocaleString()+'원 ':'미입력 ')+(ct.vat_included?'(VAT포함)':'(VAT별도)')+'</span></div>'
      +(ct.billing_contact_name?'<div class="info-row"><span class="info-label">빌링 담당</span><span class="info-value">'+esc(ct.billing_contact_name)+(ct.billing_contact_email?'<br><span style="font-size:11px;color:var(--text3)">'+esc(ct.billing_contact_email)+'</span>':'')+'</span></div>':'<div class="info-row"><span class="info-label">빌링 담당</span><span class="info-value muted">미지정</span></div>')
      +(ct.counterparty_contact_name?'<div class="info-row"><span class="info-label">거래처 담당</span><span class="info-value">'+esc(ct.counterparty_contact_name)+(ct.counterparty_contact_email?'<br><span style="font-size:11px;color:var(--text3)">'+esc(ct.counterparty_contact_email)+'</span>':'')+'</span></div>':'<div class="info-row"><span class="info-label">거래처 담당</span><span class="info-value muted">미지정</span></div>')
    +'</div>'
    +'</div>'
  ];

  document.getElementById('contractContent').innerHTML=contentParts.join('');
  setPage('contract');
}

// ── 청구 내역 관리 ──
