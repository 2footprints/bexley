let managedFilterActive=true;
let contractViewMode='grouped';
let contractBillingRecords=[];
let contractBillingRecordsLoaded=false;
let contractBillingRecordsLoading=false;
let contractBillingRecordsPromise=null;
let contractPendingDocRequests=[];
let contractPendingDocRequestsLoaded=false;
let contractPendingDocRequestsLoading=false;
let contractPendingDocRequestsPromise=null;
const contractListSelectedIds=new Set();
let contractListSortKey='client';
let contractListSortDir='asc';
const CONTRACT_TYPE_OPTIONS=['감사','세무자문','밸류에이션','기타'];
const contractToolbarState={
  status:'all',
  types:[],
  clientId:'',
  manager:'',
  billing:'all',
  renewal:'all',
  search:'',
  sort:'client'
};
const contractAlertRuntimeKeys=new Set();

function normalizeContractTags(value){
  if(Array.isArray(value))return [...new Set(value.map(tag=>String(tag||'').trim()).filter(Boolean))];
  return [...new Set(String(value||'').split(',').map(tag=>tag.trim()).filter(Boolean))];
}

function formatContractTags(value){
  return normalizeContractTags(value).join(', ');
}

function getContractNotificationUserIds(contract){
  const ids=new Set();
  if(contract?.created_by)ids.add(contract.created_by);
  (clientAssignments||[])
    .filter(assignment=>String(assignment?.client_id||'')===String(contract?.client_id||''))
    .forEach(assignment=>{
      const member=members.find(item=>String(item?.id||'')===String(assignment?.member_id||''));
      if(member?.auth_user_id)ids.add(member.auth_user_id);
    });
  if(currentUser?.id)ids.add(currentUser.id);
  return [...ids];
}

async function notifyContractUsers(contract,type,message){
  if(typeof createNotification!=='function'||!contract?.id)return;
  const userIds=getContractNotificationUserIds(contract);
  for(const userId of userIds){
    await createNotification(userId,type,message,'contract',contract.id);
  }
}

function getContractAlertStorageKey(kind,entityId){
  const today=new Date().toISOString().slice(0,10);
  return ['contract-alert',kind,entityId,today].join(':');
}

function wasContractAlertSentToday(kind,entityId){
  const key=getContractAlertStorageKey(kind,entityId);
  return contractAlertRuntimeKeys.has(key)||localStorage.getItem(key)==='1';
}

function markContractAlertSentToday(kind,entityId){
  const key=getContractAlertStorageKey(kind,entityId);
  contractAlertRuntimeKeys.add(key);
  try{localStorage.setItem(key,'1');}catch(e){}
}

function formatContractCurrency(amount){
  return Number(amount||0).toLocaleString()+'원';
}

function formatContractDelta(amount){
  const value=Number(amount||0);
  if(!value)return '전월 대비 변동 없음';
  return '전월 대비 '+(value>0?'+':'')+formatContractCurrency(value);
}

function getContractTodayStart(){
  const today=new Date();
  today.setHours(0,0,0,0);
  return today;
}

function getContractMonthRange(offset=0){
  const today=new Date();
  return {
    start:new Date(today.getFullYear(),today.getMonth()+offset,1),
    end:new Date(today.getFullYear(),today.getMonth()+offset+1,0,23,59,59,999)
  };
}

function getContractYearRange(){
  const today=new Date();
  return {
    start:new Date(today.getFullYear(),0,1),
    end:new Date(today.getFullYear(),11,31,23,59,59,999)
  };
}

function getContractDateValue(value){
  if(!value)return 0;
  const time=new Date(value).getTime();
  return Number.isFinite(time)?time:0;
}

function getContractDateDiffDays(value){
  const time=getContractDateValue(value);
  if(!time)return null;
  const today=getContractTodayStart().getTime();
  return Math.floor((time-today)/(1000*60*60*24));
}

function getContractReceivableAgeDays(record){
  const time=getContractDateValue(record?.billing_date||record?.created_at);
  if(!time)return 0;
  return Math.max(0,Math.floor((Date.now()-time)/(1000*60*60*24)));
}

async function notifyContractCollectionCompleted(contractId, amount){
  const contract=contracts.find(item=>String(item?.id||'')===String(contractId||''));
  if(!contract)return;
  const message='수금 완료: '+(contract.contract_name||'계약')+' · '+formatContractCurrency(amount||0);
  await notifyContractUsers(contract,'contract_collection',message);
}

function normalizeContractType(value){
  const type=String(value||'').trim();
  if(!type)return '기타';
  if(type.includes('감사'))return '감사';
  if(type.includes('세무'))return '세무자문';
  if(type.includes('밸류')||/valuation/i.test(type))return '밸류에이션';
  return '기타';
}

function isContractActiveStatus(status){
  const value=String(status||'').trim();
  return value==='진행중'||value==='검토중';
}

function isContractEndedStatus(status){
  const value=String(status||'').trim();
  return value==='완료'||value==='해지';
}

function getContractStatusBadgeClass(status){
  if(String(status||'').trim()==='진행중')return 'badge-blue';
  if(isContractEndedStatus(status))return 'badge-gray';
  return 'badge-orange';
}

function getContractManagerNames(contract, relatedProjects){
  const assigned=getAssignedMemberNames(contract?.client_id);
  if(assigned.length)return [...new Set(assigned)];
  return [...new Set(
    (relatedProjects||[])
      .flatMap(project=>Array.isArray(project?.members)?project.members:[])
      .filter(Boolean)
  )];
}

function getContractBillingRecords(contractId){
  return (contractBillingRecords||[]).filter(record=>String(record?.contract_id||'')===String(contractId||''));
}

function getContractPendingDocRequests(projectIds){
  const projectIdSet=new Set((projectIds||[]).map(id=>String(id||'')).filter(Boolean));
  if(!projectIdSet.size)return [];
  return (contractPendingDocRequests||[]).filter(request=>projectIdSet.has(String(request?.project_id||'')));
}

function getContractBillingState(row){
  if(row.receivableAmount>0)return 'receivable';
  if(row.unbilledBalance>0)return 'unbilled';
  return 'paid';
}

function getContractBillingStateLabel(state){
  if(state==='receivable')return '미수금 있음';
  if(state==='unbilled')return '미청구 있음';
  return '완납';
}

function getContractCollectionRate(row){
  const billed=Number(row?.billedTotal||0);
  const collected=Number(row?.collectedTotal||0);
  if(billed<=0)return 0;
  return Math.max(0,Math.min(100,Math.round((collected/billed)*100)));
}

function getContractBillingProgressPercent(row){
  const total=Number(row?.contractAmount||0);
  const billed=Number(row?.billedTotal||0);
  if(total<=0)return billed>0?100:0;
  return Math.max(0,Math.min(100,Math.round((billed/total)*100)));
}

function getContractRemainingDaysMeta(row){
  if(!row?.contract?.contract_end_date||!row?.isActive)return null;
  const diff=row.renewalDiffDays;
  if(diff===null||diff===undefined)return null;
  if(diff<0){
    return {
      text:'만료 D+'+Math.abs(diff),
      tone:'danger'
    };
  }
  if(diff===0){
    return {
      text:'오늘 만료',
      tone:'warn'
    };
  }
  if(diff<=60){
    return {
      text:'D-'+diff,
      tone:'warn'
    };
  }
  return {
    text:'D-'+diff,
    tone:'normal'
  };
}

function getContractAttentionMeta(row){
  const remainingMeta=getContractRemainingDaysMeta(row);
  if(Number(row?.receivableAmount||0)>0){
    return {
      label:'위험',
      tone:'danger',
      detail:row.agedReceivableCount>0
        ?'수금 미확인 · 30일+ '+row.agedReceivableCount+'건'
        :'수금 미확인'
    };
  }
  if(row?.isActive&&row?.renewalDiffDays!==null&&row.renewalDiffDays<0){
    return {
      label:'위험',
      tone:'danger',
      detail:'만료 후 정리 필요'
    };
  }
  if(Number(row?.unbilledBalance||0)>0){
    return {
      label:'주의',
      tone:'warn',
      detail:'미청구 잔액 있음'
    };
  }
  if(Number(row?.pendingDocCount||0)>0){
    return {
      label:'주의',
      tone:'warn',
      detail:'자료 대기 '+row.pendingDocCount+'건'
    };
  }
  if(Number(row?.openIssueCount||0)>0){
    return {
      label:'주의',
      tone:'warn',
      detail:'이슈 미해결 '+row.openIssueCount+'건'
    };
  }
  if(remainingMeta?.tone==='warn'){
    return {
      label:'주의',
      tone:'warn',
      detail:(row.renewalDiffDays!==null&&row.renewalDiffDays<=30)
        ?'30일 내 만료'
        :'만료 임박'
    };
  }
  return {
    label:'정상',
    tone:'ok',
    detail:'운영 리스크 신호 없음'
  };
}

function getContractNextActionLabel(row){
  if(Number(row?.receivableAmount||0)>0){
    return '수금 확인';
  }
  if(Number(row?.unbilledBalance||0)>0)return '청구 발행';
  if(Number(row?.pendingDocCount||0)>0)return '자료 회수';
  if(Number(row?.openIssueCount||0)>0)return '이슈 점검';
  if(row?.isActive&&row?.renewalDiffDays!==null&&row.renewalDiffDays<=30)return '갱신 확인';
  if(row?.isActive&&row?.renewalDiffDays!==null&&row.renewalDiffDays<=60)return '계약 일정 점검';
  if(row?.isActive)return '청구 리듬 점검';
  return '종료 기록 확인';
}

function getContractNextActionText(row){
  if(Number(row?.receivableAmount||0)>0)return '리마인드 발송 · 수금 일정 확인';
  if(Number(row?.unbilledBalance||0)>0)return '인보이스 발행 여부 확인';
  if(Number(row?.pendingDocCount||0)>0)return '필수 자료 회수 팔로업';
  if(Number(row?.openIssueCount||0)>0)return '미해결 이슈 상태 확인';
  if(row?.isActive&&row?.renewalDiffDays!==null&&row.renewalDiffDays<0)return '종료 처리 또는 갱신 여부 결정';
  if(row?.isActive&&row?.renewalDiffDays!==null&&row.renewalDiffDays<=30)return '갱신 조건 · 일정 확인';
  if(row?.isActive&&row?.renewalDiffDays!==null&&row.renewalDiffDays<=60)return '만료 전 커뮤니케이션 점검';
  if(row?.isActive)return '다음 청구 일정만 확인';
  return '상세 기록과 종료 상태 확인';
}

function getContractRiskTags(row){
  const tags=[];
  if(Number(row?.unbilledBalance||0)>0)tags.push('<span class="contract-inline-chip is-warn">미청구 '+formatContractCurrency(row.unbilledBalance)+'</span>');
  else tags.push('<span class="contract-inline-chip">청구 '+formatContractCurrency(row.billedTotal)+'</span>');
  if(Number(row?.receivableAmount||0)>0)tags.push('<span class="contract-inline-chip is-danger">미수금 '+formatContractCurrency(row.receivableAmount)+'</span>');
  if(Number(row?.pendingDocCount||0)>0)tags.push('<span class="contract-inline-chip is-warn">자료 '+row.pendingDocCount+'건</span>');
  if(Number(row?.openIssueCount||0)>0)tags.push('<span class="contract-inline-chip is-danger">이슈 '+row.openIssueCount+'건</span>');
  return tags;
}

async function ensureContractPendingDocRequestsLoaded(force=false){
  if(force){
    contractPendingDocRequestsLoaded=false;
    contractPendingDocRequestsPromise=null;
  }
  if(contractPendingDocRequestsLoaded)return;
  if(contractPendingDocRequestsPromise)return contractPendingDocRequestsPromise;
  contractPendingDocRequestsLoading=true;
  contractPendingDocRequestsPromise=(async()=>{
    try{
      contractPendingDocRequests=await api('GET','document_requests?status=eq.pending&select=id,project_id,title,due_date,created_at').catch(()=>[])||[];
      contractPendingDocRequestsLoaded=true;
    }catch(e){
      contractPendingDocRequests=[];
      contractPendingDocRequestsLoaded=true;
    }finally{
      contractPendingDocRequestsLoading=false;
      contractPendingDocRequestsPromise=null;
    }
  })();
  return contractPendingDocRequestsPromise;
}

function getContractPortfolioSummary(rows){
  const safeRows=Array.isArray(rows)?rows:[];
  const activeCount=safeRows.filter(row=>row.isActive).length;
  const unbilledCount=safeRows.filter(row=>Number(row.unbilledBalance||0)>0).length;
  const receivableCount=safeRows.filter(row=>Number(row.receivableAmount||0)>0).length;
  const expiringCount=safeRows.filter(row=>row.isActive&&row.renewalDiffDays!==null&&row.renewalDiffDays>=0&&row.renewalDiffDays<=60).length;
  return {activeCount,unbilledCount,receivableCount,expiringCount};
}

function getContractPeriodText(contract){
  const start=contract?.contract_start_date||'-';
  const end=contract?.contract_end_date||'-';
  return start+' ~ '+end;
}

function canManageContractBulkActions(){
  return !!roleIsAdmin();
}

function buildContractRow(contract){
  const client=clients.find(item=>item.id===contract.client_id)||null;
  const relatedProjects=(projects||[]).filter(project=>project.contract_id===contract.id);
  const relatedProjectIds=relatedProjects.map(project=>project.id);
  const managerNames=getContractManagerNames(contract,relatedProjects);
  const records=getContractBillingRecords(contract.id);
  const pendingDocs=getContractPendingDocRequests(relatedProjectIds);
  const openIssueCount=relatedProjects.reduce((sum,project)=>sum+Number(openIssuesByProject?.[project.id]||0),0);
  const yearRange=getContractYearRange();
  const monthRange=getContractMonthRange(0);
  const prevMonthRange=getContractMonthRange(-1);
  const contractAmount=Number(contract?.contract_amount||0);
  const billedTotal=records.reduce((sum,record)=>sum+Number(record?.amount||0),0);
  const collectedTotal=records
    .filter(record=>String(record?.status||'').trim()==='수금완료')
    .reduce((sum,record)=>sum+Number(record?.amount||0),0);
  const receivableRecords=records.filter(record=>String(record?.status||'').trim()!=='수금완료');
  const receivableAmount=receivableRecords.reduce((sum,record)=>sum+Number(record?.amount||0),0);
  const agedReceivableCount=receivableRecords.filter(record=>{
    const time=getContractDateValue(record?.billing_date||record?.created_at);
    if(!time)return false;
    return (Date.now()-time)/(1000*60*60*24)>=30;
  }).length;
  const billedThisYear=records
    .filter(record=>{
      const time=getContractDateValue(record?.billing_date||record?.created_at);
      return time>=yearRange.start.getTime()&&time<=yearRange.end.getTime();
    })
    .reduce((sum,record)=>sum+Number(record?.amount||0),0);
  const collectedThisYear=records
    .filter(record=>{
      const time=getContractDateValue(record?.billing_date||record?.created_at);
      return time>=yearRange.start.getTime()&&time<=yearRange.end.getTime()&&String(record?.status||'').trim()==='수금완료';
    })
    .reduce((sum,record)=>sum+Number(record?.amount||0),0);
  const billedThisMonth=records
    .filter(record=>{
      const time=getContractDateValue(record?.billing_date||record?.created_at);
      return time>=monthRange.start.getTime()&&time<=monthRange.end.getTime();
    })
    .reduce((sum,record)=>sum+Number(record?.amount||0),0);
  const billedPrevMonth=records
    .filter(record=>{
      const time=getContractDateValue(record?.billing_date||record?.created_at);
      return time>=prevMonthRange.start.getTime()&&time<=prevMonthRange.end.getTime();
    })
    .reduce((sum,record)=>sum+Number(record?.amount||0),0);
  const active=isContractActiveStatus(contract?.contract_status);
  const endDateValue=getContractDateValue(contract?.contract_end_date);
  return {
    contract,
    client,
    relatedProjects,
    managerNames,
    typeGroup:normalizeContractType(contract?.contract_type),
    openIssueCount,
    pendingDocCount:pendingDocs.length,
    contractAmount,
    billedTotal,
    collectedTotal,
    receivableAmount,
    unbilledBalance:active?Math.max(contractAmount-billedTotal,0):0,
    agedReceivableCount,
    billedThisYear,
    collectedThisYear,
    billedThisMonth,
    billedPrevMonth,
    billingRecords:records,
    billingState:getContractBillingState({
      receivableAmount,
      unbilledBalance:active?Math.max(contractAmount-billedTotal,0):0
    }),
    isActive:active,
    endDateValue,
    renewalDiffDays:active?getContractDateDiffDays(contract?.contract_end_date):null
  };
}

function syncManagedContractToggle(){
  document.getElementById('managedFilterBtn')?.classList.toggle('active',managedFilterActive);
  document.getElementById('allContractBtn')?.classList.toggle('active',!managedFilterActive);
}

function syncContractTypeButtons(){
  CONTRACT_TYPE_OPTIONS.forEach(type=>{
    document.getElementById('contractTypeBtn-'+type)?.classList.toggle('active',contractToolbarState.types.includes(type));
  });
}

function syncContractViewButtons(){
  document.getElementById('contractViewGroupedBtn')?.classList.toggle('active',contractViewMode==='grouped');
  document.getElementById('contractViewListBtn')?.classList.toggle('active',contractViewMode==='list');
  document.getElementById('contractViewBillingBtn')?.classList.toggle('active',contractViewMode==='billing');
}

function invalidateContractBillingRecordsCache(){
  contractBillingRecords=[];
  contractBillingRecordsLoaded=false;
  contractBillingRecordsPromise=null;
}

async function ensureContractBillingRecordsLoaded(force=false){
  if(force){
    contractBillingRecordsLoaded=false;
    contractBillingRecordsPromise=null;
  }
  if(contractBillingRecordsLoaded)return;
  if(contractBillingRecordsPromise)return contractBillingRecordsPromise;
  contractBillingRecordsLoading=true;
  contractBillingRecordsPromise=(async()=>{
    try{
      contractBillingRecords=await api('GET','billing_records?select=*&order=billing_date.desc').catch(()=>[])||[];
      contractBillingRecordsLoaded=true;
    }catch(e){
      contractBillingRecords=[];
      contractBillingRecordsLoaded=true;
    }finally{
      contractBillingRecordsLoading=false;
      contractBillingRecordsPromise=null;
    }
  })();
  return contractBillingRecordsPromise;
}

function toggleManagedFilter(){
  managedFilterActive=!managedFilterActive;
  syncManagedContractToggle();
  renderContractsPage();
}

function setContractSearch(value){
  contractToolbarState.search=String(value||'').trim();
  const input=document.getElementById('contractSearch');
  if(input&&input.value!==contractToolbarState.search)input.value=contractToolbarState.search;
  renderContractsPage();
}

function setContractStatusFilter(value){
  contractToolbarState.status=value||'all';
  renderContractsPage();
}

function toggleContractTypeFilter(type){
  if(contractToolbarState.types.includes(type))contractToolbarState.types=contractToolbarState.types.filter(item=>item!==type);
  else contractToolbarState.types=[...contractToolbarState.types,type];
  syncContractTypeButtons();
  renderContractsPage();
}

function setContractClientFilter(value){
  contractToolbarState.clientId=value||'';
  renderContractsPage();
}

function setContractManagerFilter(value){
  contractToolbarState.manager=value||'';
  renderContractsPage();
}

function setContractBillingFilter(value){
  contractToolbarState.billing=value||'all';
  renderContractsPage();
}

function setContractRenewalFilter(value){
  contractToolbarState.renewal=value||'all';
  renderContractsPage();
}

function setContractViewMode(mode){
  contractViewMode=mode||'grouped';
  syncContractViewButtons();
  renderContractsPage();
}

function setContractSort(value){
  contractToolbarState.sort=value||'client';
  const select=document.getElementById('contractSortFilter');
  if(select&&select.value!==contractToolbarState.sort)select.value=contractToolbarState.sort;
  renderContractsPage();
}

function clearContractFilterTag(key){
  if(key==='managed')managedFilterActive=false;
  if(key==='status')contractToolbarState.status='all';
  if(key.startsWith('type:'))contractToolbarState.types=contractToolbarState.types.filter(type=>type!==key.split(':')[1]);
  if(key==='client')contractToolbarState.clientId='';
  if(key==='manager')contractToolbarState.manager='';
  if(key==='billing')contractToolbarState.billing='all';
  if(key==='renewal')contractToolbarState.renewal='all';
  if(key==='search')contractToolbarState.search='';
  document.getElementById('contractStatusFilter')&&(document.getElementById('contractStatusFilter').value=contractToolbarState.status);
  document.getElementById('contractClientFilter')&&(document.getElementById('contractClientFilter').value=contractToolbarState.clientId);
  document.getElementById('contractManagerFilter')&&(document.getElementById('contractManagerFilter').value=contractToolbarState.manager);
  document.getElementById('contractBillingFilter')&&(document.getElementById('contractBillingFilter').value=contractToolbarState.billing);
  document.getElementById('contractRenewalFilter')&&(document.getElementById('contractRenewalFilter').value=contractToolbarState.renewal);
  document.getElementById('contractSearch')&&(document.getElementById('contractSearch').value=contractToolbarState.search);
  syncManagedContractToggle();
  syncContractTypeButtons();
  renderContractsPage();
}

function renderContractFilterOptions(rows){
  const clientEl=document.getElementById('contractClientFilter');
  const managerEl=document.getElementById('contractManagerFilter');
  const clientOptions=[...new Map(rows.filter(row=>row.client).map(row=>[row.client.id,row.client])).values()]
    .sort((a,b)=>String(a?.name||'').localeCompare(String(b?.name||'')));
  const managerOptions=[...new Set(rows.flatMap(row=>row.managerNames).filter(Boolean))].sort((a,b)=>a.localeCompare(b));
  if(clientEl){
    clientEl.innerHTML='<option value="">거래처 전체</option>'+clientOptions.map(client=>
      '<option value="'+client.id+'"'+(contractToolbarState.clientId===client.id?' selected':'')+'>'+esc(client.name||'거래처')+'</option>'
    ).join('');
  }
  if(managerEl){
    managerEl.innerHTML='<option value="">담당자 전체</option>'+managerOptions.map(name=>
      '<option value="'+esc(name)+'"'+(contractToolbarState.manager===name?' selected':'')+'>'+esc(name)+'</option>'
    ).join('');
  }
}

function contractMatchesFilters(row){
  if(managedFilterActive&&row.contract?.is_managed!==true)return false;
  if(contractToolbarState.status!=='all'&&String(row.contract?.contract_status||'').trim()!==contractToolbarState.status)return false;
  if(contractToolbarState.types.length&&!contractToolbarState.types.includes(row.typeGroup))return false;
  if(contractToolbarState.clientId&&String(row.contract?.client_id||'')!==contractToolbarState.clientId)return false;
  if(contractToolbarState.manager&&!(row.managerNames||[]).includes(contractToolbarState.manager))return false;
  if(contractToolbarState.billing==='unbilled'&&row.unbilledBalance<=0)return false;
  if(contractToolbarState.billing==='receivable'&&row.receivableAmount<=0)return false;
  if(contractToolbarState.billing==='paid'&&!(row.contractAmount>0&&row.unbilledBalance<=0&&row.receivableAmount<=0))return false;
  if(contractToolbarState.renewal==='due60'&&!(row.isActive&&row.renewalDiffDays!==null&&row.renewalDiffDays>=0&&row.renewalDiffDays<=60))return false;
  if(contractToolbarState.renewal==='expired'&&!(row.isActive&&row.renewalDiffDays!==null&&row.renewalDiffDays<0))return false;
  if(contractToolbarState.search){
    const keyword=contractToolbarState.search.toLowerCase();
    const haystack=[
      row.client?.name||'',
      row.contract?.contract_name||'',
      (row.managerNames||[]).join(' ')
    ].join(' ').toLowerCase();
    if(!haystack.includes(keyword))return false;
  }
  return true;
}

function sortContractRows(rows){
  const direction=contractToolbarState.sort==='client'?1:-1;
  return [...rows].sort((a,b)=>{
    if(contractToolbarState.sort==='amount'){
      const diff=(b.contractAmount||0)-(a.contractAmount||0);
      if(diff)return diff;
    }else if(contractToolbarState.sort==='end'){
      const aValue=a.endDateValue||Number.MAX_SAFE_INTEGER;
      const bValue=b.endDateValue||Number.MAX_SAFE_INTEGER;
      if(aValue!==bValue)return aValue-bValue;
    }else if(contractToolbarState.sort==='receivable'){
      const diff=(b.receivableAmount||0)-(a.receivableAmount||0);
      if(diff)return diff;
    }
    const clientCompare=String(a.client?.name||'미지정 거래처').localeCompare(String(b.client?.name||'미지정 거래처'));
    if(clientCompare)return clientCompare*direction;
    return String(a.contract?.contract_name||'').localeCompare(String(b.contract?.contract_name||''));
  });
}

function getContractListSortIndicator(key){
  if(contractListSortKey!==key)return '';
  return contractListSortDir==='asc'?' ↑':' ↓';
}

function sortContractListBy(key){
  if(contractListSortKey===key)contractListSortDir=contractListSortDir==='asc'?'desc':'asc';
  else{
    contractListSortKey=key;
    contractListSortDir=(key==='client'||key==='name'||key==='type'||key==='status'||key==='period')?'asc':'desc';
  }
  renderContractsPage();
}

function compareContractListRows(a,b,key){
  if(key==='client')return String(a.client?.name||'미지정 거래처').localeCompare(String(b.client?.name||'미지정 거래처'),'ko');
  if(key==='name')return String(a.contract?.contract_name||'').localeCompare(String(b.contract?.contract_name||''),'ko');
  if(key==='type')return String(a.contract?.contract_type||'').localeCompare(String(b.contract?.contract_type||''),'ko');
  if(key==='status'){
    const order={'진행중':4,'검토중':3,'완료':2,'해지':1};
    return (order[String(a.contract?.contract_status||'').trim()]||0)-(order[String(b.contract?.contract_status||'').trim()]||0);
  }
  if(key==='amount')return Number(a.contractAmount||0)-Number(b.contractAmount||0);
  if(key==='billed')return Number(a.billedTotal||0)-Number(b.billedTotal||0);
  if(key==='receivable')return Number(a.receivableAmount||0)-Number(b.receivableAmount||0);
  if(key==='rate')return getContractCollectionRate(a)-getContractCollectionRate(b);
  if(key==='period'){
    const startDiff=getContractDateValue(a.contract?.contract_start_date)-getContractDateValue(b.contract?.contract_start_date);
    if(startDiff)return startDiff;
    return getContractDateValue(a.contract?.contract_end_date)-getContractDateValue(b.contract?.contract_end_date);
  }
  if(key==='remaining'){
    const aValue=a.renewalDiffDays===null?Number.MAX_SAFE_INTEGER:a.renewalDiffDays;
    const bValue=b.renewalDiffDays===null?Number.MAX_SAFE_INTEGER:b.renewalDiffDays;
    return aValue-bValue;
  }
  if(key==='projects')return Number(a.relatedProjects.length||0)-Number(b.relatedProjects.length||0);
  return 0;
}

function sortContractListRows(rows){
  return [...rows].sort((a,b)=>{
    const diff=compareContractListRows(a,b,contractListSortKey);
    if(diff)return contractListSortDir==='asc'?diff:-diff;
    return String(a.contract?.contract_name||'').localeCompare(String(b.contract?.contract_name||''),'ko');
  });
}

function toggleContractListSelection(contractId,checked){
  if(checked)contractListSelectedIds.add(String(contractId));
  else contractListSelectedIds.delete(String(contractId));
  renderContractsPage();
}

function toggleAllContractListSelections(contractIds,checked){
  (contractIds||[]).forEach(contractId=>{
    const id=String(contractId||'');
    if(!id)return;
    if(checked)contractListSelectedIds.add(id);
    else contractListSelectedIds.delete(id);
  });
  renderContractsPage();
}

function clearContractListSelection(){
  contractListSelectedIds.clear();
  renderContractsPage();
}

function getSelectedContractRows(rows){
  return (rows||[]).filter(row=>contractListSelectedIds.has(String(row.contract?.id||'')));
}

async function applyContractBulkStatus(nextStatus){
  const rows=window.__contractListRows||[];
  const selectedRows=getSelectedContractRows(rows);
  if(!selectedRows.length){alert('계약을 먼저 선택해주세요.');return;}
  if(!nextStatus){alert('변경할 상태를 선택해주세요.');return;}
  if(!roleIsAdmin()){alert('관리자만 일괄 상태 변경이 가능합니다.');return;}
  if(!confirm(selectedRows.length+'개 계약의 상태를 "'+nextStatus+'"로 변경할까요?'))return;
  try{
    for(const row of selectedRows){
      await api('PATCH','contracts?id=eq.'+row.contract.id,{contract_status:nextStatus});
      const target=contracts.find(contract=>contract.id===row.contract.id);
      if(target)target.contract_status=nextStatus;
    }
    contractListSelectedIds.clear();
    renderContractsPage();
  }catch(e){
    alert('일괄 상태 변경 오류: '+e.message);
  }
}

async function applyContractBulkManaged(nextValue){
  const rows=window.__contractListRows||[];
  const selectedRows=getSelectedContractRows(rows);
  if(!selectedRows.length){alert('계약을 먼저 선택해주세요.');return;}
  if(!roleIsAdmin()){alert('관리자만 우리 팀 관리 설정을 변경할 수 있습니다.');return;}
  try{
    for(const row of selectedRows){
      await api('PATCH','contracts?id=eq.'+row.contract.id,{is_managed:!!nextValue});
      const target=contracts.find(contract=>contract.id===row.contract.id);
      if(target)target.is_managed=!!nextValue;
    }
    contractListSelectedIds.clear();
    renderContractsPage();
  }catch(e){
    alert('일괄 관리 설정 오류: '+e.message);
  }
}

function getContractBoardSource(rows){
  const contractIds=new Set((rows||[]).map(row=>String(row.contract?.id||'')).filter(Boolean));
  const clientIds=new Set((rows||[]).map(row=>String(row.client?.id||row.contract?.client_id||'')).filter(Boolean));
  const unbilledProjects=(projects||[]).filter(project=>{
    const completed=String(project?.status||'').trim()==='완료';
    const pending=String(project?.billing_status||'').trim()==='미청구';
    if(!(completed&&project?.is_billable&&pending))return false;
    const projectContractId=String(project?.contract_id||'');
    const projectClientId=String(project?.client_id||'');
    return (projectContractId&&contractIds.has(projectContractId))||(!projectContractId&&projectClientId&&clientIds.has(projectClientId));
  });
  const receivableRecords=(contractBillingRecords||[]).filter(record=>{
    const contractId=String(record?.contract_id||'');
    return contractIds.has(contractId)&&String(record?.status||'').trim()!=='수금완료';
  });
  const recentCollectedRecords=(contractBillingRecords||[]).filter(record=>{
    const contractId=String(record?.contract_id||'');
    const collected=String(record?.status||'').trim()==='수금완료';
    const time=getContractDateValue(record?.billing_date||record?.created_at);
    const days=time?Math.floor((Date.now()-time)/(1000*60*60*24)):null;
    return contractIds.has(contractId)&&collected&&days!==null&&days<=30;
  });
  return {
    unbilledProjects:unbilledProjects.sort((a,b)=>getContractDateValue(b?.actual_end_date||b?.updated_at||b?.end||b?.end_date)-getContractDateValue(a?.actual_end_date||a?.updated_at||a?.end||a?.end_date)),
    receivableRecords:receivableRecords.sort((a,b)=>getContractDateValue(a?.billing_date||a?.created_at)-getContractDateValue(b?.billing_date||b?.created_at)),
    recentCollectedRecords:recentCollectedRecords.sort((a,b)=>getContractDateValue(b?.billing_date||b?.created_at)-getContractDateValue(a?.billing_date||a?.created_at))
  };
}

function renderContractKpis(rows){
  const el=document.getElementById('contractKpiGrid');
  if(!el)return;
  const activeRows=rows.filter(row=>row.isActive);
  const activeAmountTotal=activeRows.reduce((sum,row)=>sum+row.contractAmount,0);
  const billedYear=rows.reduce((sum,row)=>sum+row.billedThisYear,0);
  const billedThisMonth=rows.reduce((sum,row)=>sum+row.billedThisMonth,0);
  const billedPrevMonth=rows.reduce((sum,row)=>sum+row.billedPrevMonth,0);
  const receivableAmount=rows.reduce((sum,row)=>sum+row.receivableAmount,0);
  const agedReceivableCount=rows.reduce((sum,row)=>sum+row.agedReceivableCount,0);
  const collectedYear=rows.reduce((sum,row)=>sum+row.collectedThisYear,0);
  const unbilledBalance=Math.max(0,activeAmountTotal-activeRows.reduce((sum,row)=>sum+row.billedTotal,0));
  const renewalRows=activeRows
    .filter(row=>row.renewalDiffDays!==null&&row.renewalDiffDays>=0&&row.renewalDiffDays<=60)
    .sort((a,b)=>(a.endDateValue||Number.MAX_SAFE_INTEGER)-(b.endDateValue||Number.MAX_SAFE_INTEGER));
  const collectionRate=billedYear>0?Math.round((collectedYear/billedYear)*100):0;
  const earliestRenewal=renewalRows[0];
  const cards=[
    {
      label:'계약 총액',
      value:formatContractCurrency(activeAmountTotal),
      sub:'활성 계약 '+activeRows.length+'건'
    },
    {
      label:'청구 완료',
      value:formatContractCurrency(billedYear),
      sub:formatContractDelta(billedThisMonth-billedPrevMonth)
    },
    {
      label:'미청구 잔액',
      value:formatContractCurrency(unbilledBalance),
      sub:'활성 계약 기준'
    },
    {
      label:'미수금',
      value:formatContractCurrency(receivableAmount),
      sub:'30일 이상 '+agedReceivableCount+'건',
      tone:receivableAmount>0?'danger':'ok'
    },
    {
      label:'수금률',
      value:collectionRate+'%',
      sub:'올해 청구 '+formatContractCurrency(billedYear)
    },
    {
      label:'갱신 임박',
      value:renewalRows.length+'건',
      sub:earliestRenewal?esc(earliestRenewal.contract?.contract_name||'계약'):'60일 내 없음',
      tone:renewalRows.length?'warn':'ok'
    }
  ];
  el.innerHTML=cards.map(card=>
    '<div class="contract-kpi-card'+(card.tone?' is-'+card.tone:'')+'">'
      +'<div class="contract-kpi-label">'+card.label+'</div>'
      +'<div class="contract-kpi-value">'+card.value+'</div>'
      +'<div class="contract-kpi-sub">'+card.sub+'</div>'
    +'</div>'
  ).join('');
}

function renderContractFilterTags(){
  const el=document.getElementById('contractFilterTags');
  if(!el)return;
  const tags=[];
  if(managedFilterActive)tags.push({key:'managed',label:'우리 팀 계약'});
  if(contractToolbarState.status!=='all')tags.push({key:'status',label:'상태 '+contractToolbarState.status});
  contractToolbarState.types.forEach(type=>tags.push({key:'type:'+type,label:'유형 '+type}));
  if(contractToolbarState.clientId){
    const client=clients.find(item=>item.id===contractToolbarState.clientId);
    if(client)tags.push({key:'client',label:'거래처 '+client.name});
  }
  if(contractToolbarState.manager)tags.push({key:'manager',label:'담당 '+contractToolbarState.manager});
  if(contractToolbarState.billing==='unbilled')tags.push({key:'billing',label:'미청구 있음'});
  if(contractToolbarState.billing==='receivable')tags.push({key:'billing',label:'미수금 있음'});
  if(contractToolbarState.billing==='paid')tags.push({key:'billing',label:'완납'});
  if(contractToolbarState.renewal==='due60')tags.push({key:'renewal',label:'60일 내 만료'});
  if(contractToolbarState.renewal==='expired')tags.push({key:'renewal',label:'만료됨'});
  if(contractToolbarState.search)tags.push({key:'search',label:'검색 '+contractToolbarState.search});
  el.innerHTML=tags.map(tag=>
    '<span class="contract-filter-tag">'+esc(tag.label)+'<button type="button" onclick="clearContractFilterTag(\''+tag.key+'\')">×</button></span>'
  ).join('');
}

function renderContractMonthlyReport(rows){
  const el=document.getElementById('contractMonthlyReport');
  if(!el)return;
  const contractIds=new Set((rows||[]).map(row=>String(row.contract?.id||'')).filter(Boolean));
  const monthRange=getContractMonthRange(0);
  const prevMonthRange=getContractMonthRange(-1);
  const monthRecords=(contractBillingRecords||[]).filter(record=>{
    const contractId=String(record?.contract_id||'');
    if(!contractIds.has(contractId))return false;
    const time=getContractDateValue(record?.billing_date||record?.created_at);
    return time>=monthRange.start.getTime()&&time<=monthRange.end.getTime();
  });
  const prevMonthRecords=(contractBillingRecords||[]).filter(record=>{
    const contractId=String(record?.contract_id||'');
    if(!contractIds.has(contractId))return false;
    const time=getContractDateValue(record?.billing_date||record?.created_at);
    return time>=prevMonthRange.start.getTime()&&time<=prevMonthRange.end.getTime();
  });
  const collectedMonthRecords=(contractBillingRecords||[]).filter(record=>{
    const contractId=String(record?.contract_id||'');
    if(!contractIds.has(contractId))return false;
    if(String(record?.status||'').trim()!=='수금완료')return false;
    const time=getContractDateValue(record?.updated_at||record?.billing_date||record?.created_at);
    return time>=monthRange.start.getTime()&&time<=monthRange.end.getTime();
  });
  const collectedPrevMonthRecords=(contractBillingRecords||[]).filter(record=>{
    const contractId=String(record?.contract_id||'');
    if(!contractIds.has(contractId))return false;
    if(String(record?.status||'').trim()!=='수금완료')return false;
    const time=getContractDateValue(record?.updated_at||record?.billing_date||record?.created_at);
    return time>=prevMonthRange.start.getTime()&&time<=prevMonthRange.end.getTime();
  });
  const billedAmount=monthRecords.reduce((sum,record)=>sum+Number(record?.amount||0),0);
  const billedPrevAmount=prevMonthRecords.reduce((sum,record)=>sum+Number(record?.amount||0),0);
  const collectedAmount=collectedMonthRecords.reduce((sum,record)=>sum+Number(record?.amount||0),0);
  const collectedPrevAmount=collectedPrevMonthRecords.reduce((sum,record)=>sum+Number(record?.amount||0),0);
  const agingBuckets={current:{count:0,amount:0},warn:{count:0,amount:0},danger:{count:0,amount:0}};
  const rankingMap=new Map();
  (contractBillingRecords||[]).forEach(record=>{
    const contractId=String(record?.contract_id||'');
    if(!contractIds.has(contractId))return;
    const contract=contracts.find(item=>String(item?.id||'')===contractId);
    if(!contract)return;
    const client=clients.find(item=>String(item?.id||'')===String(contract.client_id||''));
    const billedTime=getContractDateValue(record?.billing_date||record?.created_at);
    if(billedTime>=monthRange.start.getTime()&&billedTime<=monthRange.end.getTime()){
      const key=String(client?.id||contract.client_id||'orphans');
      const current=rankingMap.get(key)||{name:client?.name||'거래처 미지정',amount:0,count:0};
      current.amount+=Number(record?.amount||0);
      current.count+=1;
      rankingMap.set(key,current);
    }
    if(String(record?.status||'').trim()==='수금완료')return;
    const ageDays=getContractReceivableAgeDays(record);
    const bucket=ageDays>=60?'danger':ageDays>=30?'warn':'current';
    agingBuckets[bucket].count+=1;
    agingBuckets[bucket].amount+=Number(record?.amount||0);
  });
  const rankingRows=[...rankingMap.values()].sort((a,b)=>b.amount-a.amount).slice(0,5);
  el.innerHTML=
    '<div class="card contract-report-shell">'
      +'<div class="contract-report-head"><div><div class="section-label" style="margin-bottom:4px">월별 빌링 리포트</div><div class="contract-report-title">이번 달 청구 / 수금 / 에이징 현황</div></div><div class="contract-report-period">'+(monthRange.start.getMonth()+1)+'월 기준</div></div>'
      +'<div class="contract-report-grid">'
        +'<div class="contract-report-card"><div class="contract-report-label">이번 달 청구</div><div class="contract-report-value">'+monthRecords.length+'건</div><div class="contract-report-sub">'+formatContractCurrency(billedAmount)+' · 전월 대비 '+formatContractDelta(billedAmount-billedPrevAmount)+'</div></div>'
        +'<div class="contract-report-card"><div class="contract-report-label">이번 달 수금</div><div class="contract-report-value">'+collectedMonthRecords.length+'건</div><div class="contract-report-sub">'+formatContractCurrency(collectedAmount)+' · 전월 대비 '+formatContractDelta(collectedAmount-collectedPrevAmount)+'</div></div>'
        +'<div class="contract-report-card"><div class="contract-report-label">미수금 에이징</div><div class="contract-report-value">'+(agingBuckets.warn.count+agingBuckets.danger.count)+'건</div><div class="contract-report-sub">30일 이상 '+agingBuckets.warn.count+'건 · 60일 이상 '+agingBuckets.danger.count+'건</div></div>'
        +'<div class="contract-report-card"><div class="contract-report-label">거래처 빌링 랭킹</div><div class="contract-report-ranking">'+(rankingRows.length?rankingRows.map((row,index)=>'<div class="contract-report-ranking-row"><span>'+(index+1)+'. '+esc(row.name)+'</span><strong>'+formatContractCurrency(row.amount)+'</strong></div>').join(''):'<div class="contract-report-empty">이번 달 청구 데이터가 없습니다.</div>')+'</div></div>'
      +'</div>'
      +'<div class="contract-report-aging-row">'
        +'<span class="contract-report-aging-chip">0~29일 '+agingBuckets.current.count+'건 · '+formatContractCurrency(agingBuckets.current.amount)+'</span>'
        +'<span class="contract-report-aging-chip is-warn">30~59일 '+agingBuckets.warn.count+'건 · '+formatContractCurrency(agingBuckets.warn.amount)+'</span>'
        +'<span class="contract-report-aging-chip is-danger">60일 이상 '+agingBuckets.danger.count+'건 · '+formatContractCurrency(agingBuckets.danger.amount)+'</span>'
      +'</div>'
    +'</div>';
}

async function syncContractAlertNotifications(rows){
  if(typeof createNotification!=='function')return;
  for(const row of rows||[]){
    if(row.isActive&&row.renewalDiffDays!==null){
      const alertDays=Number(row.contract?.renewal_alert_days||60);
      if(row.renewalDiffDays>=0&&row.renewalDiffDays<=alertDays&&!wasContractAlertSentToday('expiry',row.contract.id)){
        const message='계약 만료 알림: '+(row.contract?.contract_name||'계약')+' · '+(row.renewalDiffDays===0?'오늘 만료':'D-'+row.renewalDiffDays);
        await notifyContractUsers(row.contract,'contract_expiry',message);
        markContractAlertSentToday('expiry',row.contract.id);
      }
    }
  }
  for(const record of contractBillingRecords||[]){
    const row=(rows||[]).find(item=>String(item.contract?.id||'')===String(record?.contract_id||''));
    if(!row)continue;
    if(String(record?.status||'').trim()==='수금완료')continue;
    const ageDays=getContractReceivableAgeDays(record);
    if(ageDays<30||wasContractAlertSentToday('receivable',record.id))continue;
    const message='미수금 30일 경과: '+(row.contract?.contract_name||'계약')+' · '+formatContractCurrency(record.amount||0)+' · 경과 '+ageDays+'일';
    await notifyContractUsers(row.contract,'contract_receivable',message);
    markContractAlertSentToday('receivable',record.id);
  }
}

function renderContractRowItem(row){
  const contract=row.contract;
  const isEnded=isContractEndedStatus(contract?.contract_status);
  const statusClass=getContractStatusBadgeClass(contract?.contract_status);
  const billingPercent=getContractBillingProgressPercent(row);
  const remainingMeta=getContractRemainingDaysMeta(row);
  const billingHint=row.receivableAmount>0
    ?'미수금 '+formatContractCurrency(row.receivableAmount)
    :(row.unbilledBalance>0?'미청구 '+formatContractCurrency(row.unbilledBalance):'완납');
  return '<div class="contract-inline-row is-'+attentionMeta.tone+(isEnded?' is-ended':'')+'" onclick="openContractDetail(\''+contract.id+'\')">'
    +'<div class="contract-inline-main">'
      +'<div class="contract-inline-name" title="'+esc(contract?.contract_name||'')+'">'+esc(contract?.contract_name||'계약명 없음')+'</div>'
      +'<div class="contract-inline-sub">'
        +esc(contract?.contract_type||'기타')
        +(contract?.contract_amount?' · '+formatContractCurrency(contract.contract_amount):'')
        +(row.managerNames.length?' · '+esc(row.managerNames.join(', ')):'')
      +'</div>'
      +'<div class="contract-inline-sub">'
        +billingHint
        +(row.relatedProjects.length?' · 연결 프로젝트 '+row.relatedProjects.length+'건':'')
        +(contract?.contract_end_date?' · 만료 '+contract.contract_end_date:'')
      +'</div>'
      +'<div class="contract-inline-progress-row">'
        +'<div class="contract-inline-progress-track"><div class="contract-inline-progress-fill" style="width:'+billingPercent+'%"></div></div>'
        +'<span class="contract-inline-progress-label">빌링 '+billingPercent+'%</span>'
        +(remainingMeta?'<span class="contract-inline-dday is-'+remainingMeta.tone+'">'+remainingMeta.text+'</span>':'')
      +'</div>'
    +'</div>'
    +'<div class="contract-inline-actions">'
      +'<button type="button" class="contract-mini-btn" onclick="event.stopPropagation();toggleContractManaged(\''+contract.id+'\','+(!contract.is_managed)+')" title="우리 팀 관리 여부">'+(contract.is_managed?'🏢':'🏬')+'</button>'
      +'<button type="button" class="contract-mini-btn" onclick="event.stopPropagation();toggleContractEnded(\''+contract.id+'\',\''+esc(String(contract.contract_status||'검토중')).replace(/'/g,'&#39;')+'\')" title="종료 여부">'+(isEnded?'🔴':'⚪')+'</button>'
      +'<span class="badge '+statusClass+'">'+esc(contract?.contract_status||'검토중')+'</span>'
    +'</div>'
  +'</div>';
}

function renderContractGroupedView(rows){
  const groups=[];
  const groupMap=new Map();
  rows.forEach(row=>{
    const key=row.client?.id||'orphans';
    if(!groupMap.has(key)){
      const group={key,client:row.client,rows:[]};
      groupMap.set(key,group);
      groups.push(group);
    }
    groupMap.get(key).rows.push(row);
  });
  groups.sort((a,b)=>{
    const aName=String(a.client?.name||'미지정 거래처');
    const bName=String(b.client?.name||'미지정 거래처');
    if(contractToolbarState.sort==='amount'){
      const diff=b.rows.reduce((sum,row)=>sum+row.contractAmount,0)-a.rows.reduce((sum,row)=>sum+row.contractAmount,0);
      if(diff)return diff;
    }else if(contractToolbarState.sort==='receivable'){
      const diff=b.rows.reduce((sum,row)=>sum+row.receivableAmount,0)-a.rows.reduce((sum,row)=>sum+row.receivableAmount,0);
      if(diff)return diff;
    }else if(contractToolbarState.sort==='end'){
      const aValue=Math.min(...a.rows.map(row=>row.endDateValue||Number.MAX_SAFE_INTEGER));
      const bValue=Math.min(...b.rows.map(row=>row.endDateValue||Number.MAX_SAFE_INTEGER));
      if(aValue!==bValue)return aValue-bValue;
    }
    return aName.localeCompare(bName);
  });
  return groups.map(group=>{
    const totalAmount=group.rows.reduce((sum,row)=>sum+row.contractAmount,0);
    const activeCount=group.rows.filter(row=>row.isActive).length;
    const billedTotal=group.rows.reduce((sum,row)=>sum+row.billedTotal,0);
    const collectedTotal=group.rows.reduce((sum,row)=>sum+row.collectedTotal,0);
    const unbilledBalance=group.rows.reduce((sum,row)=>sum+row.unbilledBalance,0);
    const receivableAmount=group.rows.reduce((sum,row)=>sum+row.receivableAmount,0);
    const collectionRate=billedTotal>0?Math.max(0,Math.min(100,Math.round((collectedTotal/billedTotal)*100))):0;
    return '<div class="card contract-group-card">'
      +'<div class="contract-group-head"'+(group.client?' onclick="openClientDetail(\''+group.client.id+'\',\'contracts\')"':'')+'>'
        +'<div class="contract-group-avatar">'+esc((group.client?.name||'미')[0]||'미')+'</div>'
        +'<div class="contract-group-meta">'
          +'<div class="contract-group-title">'+esc(group.client?.name||'미지정 거래처')+'</div>'
          +'<div class="contract-group-sub">'+group.rows.length+'건'+(totalAmount?' · '+formatContractCurrency(totalAmount):'')+(activeCount?' · 진행 '+activeCount+'건':'')+'</div>'
          +'<div class="contract-group-finance">'
            +'<div class="contract-group-rate">'
              +'<div class="contract-group-rate-head"><span>수금률</span><strong>'+collectionRate+'%</strong></div>'
              +'<div class="contract-group-rate-track"><div class="contract-group-rate-fill" style="width:'+collectionRate+'%"></div></div>'
            +'</div>'
            +'<div class="contract-group-finance-meta">'
              +'<span>미청구 잔액 '+formatContractCurrency(unbilledBalance)+'</span>'
              +(receivableAmount>0?'<span class="contract-group-danger-badge">미수금 '+formatContractCurrency(receivableAmount)+'</span>':'')
            +'</div>'
          +'</div>'
        +'</div>'
        +(group.client?'<span class="contract-group-link">→</span>':'')
      +'</div>'
      +'<div class="contract-group-list">'+group.rows.map(renderContractRowItem).join('')+'</div>'
    +'</div>';
  }).join('');
}

function renderContractListView(rows){
  const manageable=canManageContractBulkActions();
  const tableRows=sortContractListRows(rows);
  const visibleIds=tableRows.map(row=>String(row.contract?.id||'')).filter(Boolean);
  window.__contractListRows=tableRows;
  window.__contractListVisibleIds=visibleIds;
  const allSelected=!!(visibleIds.length&&visibleIds.every(id=>contractListSelectedIds.has(id)));
  const selectedRows=getSelectedContractRows(tableRows);
  return '<div class="contract-list-shell">'
    +'<div class="contract-list-head"><div><div class="contract-list-title">계약 리스트</div><div class="muted">비교와 일괄 관리가 필요한 계약을 테이블로 확인합니다.</div></div>'
    +(manageable&&selectedRows.length
      ?'<div class="contract-bulk-actions"><span class="contract-bulk-count">'+selectedRows.length+'개 선택</span><select id="contractBulkStatusSelect"><option value="">상태 변경</option><option value="진행중">진행중</option><option value="검토중">검토중</option><option value="완료">완료</option><option value="해지">해지</option></select><button type="button" class="btn sm" onclick="applyContractBulkStatus(document.getElementById(\'contractBulkStatusSelect\').value)">일괄 상태 변경</button><button type="button" class="btn sm" onclick="applyContractBulkManaged(true)">우리 팀 관리 ON</button><button type="button" class="btn sm" onclick="applyContractBulkManaged(false)">우리 팀 관리 OFF</button><button type="button" class="btn ghost sm" onclick="clearContractListSelection()">선택 해제</button></div>'
      :'')
    +'</div>'
    +'<div class="contract-list-wrap"><table class="contract-list-table"><thead><tr>'
      +(manageable?'<th><input type="checkbox" '+(allSelected?'checked ':'')+'onclick="event.stopPropagation();toggleAllContractListSelections(window.__contractListVisibleIds||[],this.checked)"/></th>':'')
      +'<th><button type="button" class="contract-list-sort-btn" onclick="sortContractListBy(\'client\')">거래처명'+getContractListSortIndicator('client')+'</button></th>'
      +'<th><button type="button" class="contract-list-sort-btn" onclick="sortContractListBy(\'name\')">계약명'+getContractListSortIndicator('name')+'</button></th>'
      +'<th><button type="button" class="contract-list-sort-btn" onclick="sortContractListBy(\'type\')">유형'+getContractListSortIndicator('type')+'</button></th>'
      +'<th><button type="button" class="contract-list-sort-btn" onclick="sortContractListBy(\'status\')">상태'+getContractListSortIndicator('status')+'</button></th>'
      +'<th><button type="button" class="contract-list-sort-btn" onclick="sortContractListBy(\'amount\')">계약 금액'+getContractListSortIndicator('amount')+'</button></th>'
      +'<th><button type="button" class="contract-list-sort-btn" onclick="sortContractListBy(\'billed\')">청구 합계'+getContractListSortIndicator('billed')+'</button></th>'
      +'<th><button type="button" class="contract-list-sort-btn" onclick="sortContractListBy(\'receivable\')">미수금'+getContractListSortIndicator('receivable')+'</button></th>'
      +'<th><button type="button" class="contract-list-sort-btn" onclick="sortContractListBy(\'rate\')">수금률'+getContractListSortIndicator('rate')+'</button></th>'
      +'<th><button type="button" class="contract-list-sort-btn" onclick="sortContractListBy(\'period\')">계약 기간'+getContractListSortIndicator('period')+'</button></th>'
      +'<th><button type="button" class="contract-list-sort-btn" onclick="sortContractListBy(\'remaining\')">만료까지'+getContractListSortIndicator('remaining')+'</button></th>'
      +'<th><button type="button" class="contract-list-sort-btn" onclick="sortContractListBy(\'projects\')">프로젝트 수'+getContractListSortIndicator('projects')+'</button></th>'
    +'</tr></thead><tbody>'
    +tableRows.map(row=>{
      const remainingMeta=getContractRemainingDaysMeta(row);
      const collectionRate=getContractCollectionRate(row);
      return '<tr onclick="openContractDetail(\''+row.contract.id+'\')">'
        +(manageable?'<td><input type="checkbox" '+(contractListSelectedIds.has(String(row.contract?.id||''))?'checked ':'')+'onclick="event.stopPropagation();toggleContractListSelection(\''+row.contract.id+'\',this.checked)"/></td>':'')
        +'<td>'+esc(row.client?.name||'미지정 거래처')+'</td>'
        +'<td><div class="contract-list-name">'+esc(row.contract?.contract_name||'계약명 없음')+'</div><div class="contract-list-sub">'+esc(row.managerNames.join(', ')||'담당자 미지정')+'</div></td>'
        +'<td>'+esc(row.contract?.contract_type||'기타')+'</td>'
        +'<td><span class="badge '+getContractStatusBadgeClass(row.contract?.contract_status)+'">'+esc(row.contract?.contract_status||'검토중')+'</span></td>'
        +'<td>'+formatContractCurrency(row.contractAmount)+'</td>'
        +'<td>'+formatContractCurrency(row.billedTotal)+'</td>'
        +'<td>'+formatContractCurrency(row.receivableAmount)+'</td>'
        +'<td>'+collectionRate+'%</td>'
        +'<td>'+esc(getContractPeriodText(row.contract))+'</td>'
        +'<td>'+(remainingMeta?'<span class="contract-inline-dday is-'+remainingMeta.tone+'">'+remainingMeta.text+'</span>':'-')+'</td>'
        +'<td>'+row.relatedProjects.length+'건</td>'
      +'</tr>';
    }).join('')
    +'</tbody></table></div></div>';
}

function getContractBoardReasonTags(row){
  const tags=[];
  if(row.unbilledBalance>0)tags.push('미청구 '+formatContractCurrency(row.unbilledBalance));
  if(row.receivableAmount>0)tags.push('미수금 '+formatContractCurrency(row.receivableAmount));
  if(row.contract?.contract_end_date&&row.renewalDiffDays!==null&&row.renewalDiffDays>=0&&row.renewalDiffDays<=60)tags.push('만료 '+row.contract.contract_end_date);
  if(!tags.length)tags.push('완납');
  return tags;
}

async function markProjectBillingComplete(projectId){
  const project=projects.find(item=>item.id===projectId);
  if(!project)return;
  try{
    const changedAt=new Date().toISOString();
    await api('PATCH','projects?id=eq.'+projectId,{billing_status:'청구완료',billing_status_changed_at:changedAt});
    project.billing_status='청구완료';
    project.billing_status_changed_at=changedAt;
    renderContractsPage();
  }catch(e){
    alert('청구 완료 처리 오류: '+e.message);
  }
}

async function markBillingRecordCollected(recordId){
  try{
    await api('PATCH','billing_records?id=eq.'+recordId,{status:'수금완료'});
    const target=contractBillingRecords.find(record=>record.id===recordId);
    if(target){
      target.status='수금완료';
      await notifyContractCollectionCompleted(target.contract_id,target.amount||0);
    }
    renderContractsPage();
  }catch(e){
    alert('수금 완료 처리 오류: '+e.message);
  }
}

function buildContractReceivableReminderText(recordId){
  const record=contractBillingRecords.find(item=>item.id===recordId);
  if(!record)return '';
  const contract=contracts.find(item=>item.id===record.contract_id);
  const client=clients.find(item=>item.id===contract?.client_id);
  const amount=formatContractCurrency(record.amount||0);
  const billingDate=record.billing_date||'청구일 미지정';
  const contactName=client?.contact_name||contract?.counterparty_contact_name||'담당자';
  return client?.name
    ?'[리마인드 메일 초안]\n\n안녕하세요 '+contactName+'님,\n'+client.name+' '+(contract?.contract_name||'계약')+' 관련 청구 건('+amount+', 청구일 '+billingDate+')의 수금 일정을 확인 부탁드립니다.\n확인 후 회신 주시면 감사하겠습니다.'
    :'[리마인드 메일 초안]\n\n안녕하세요,\n'+(contract?.contract_name||'계약')+' 관련 청구 건('+amount+', 청구일 '+billingDate+')의 수금 일정을 확인 부탁드립니다.';
}

async function copyContractReceivableReminder(recordId){
  const text=document.getElementById('contractReminderText')?.value||buildContractReceivableReminderText(recordId);
  await copyText(text);
  const remindedAt=new Date().toISOString();
  try{
    await api('PATCH','billing_records?id=eq.'+recordId,{last_reminder_at:remindedAt});
    const target=contractBillingRecords.find(record=>record.id===recordId);
    if(target)target.last_reminder_at=remindedAt;
  }catch(e){}
  closeModal();
  renderContractsPage();
}

function openContractReceivableReminderModal(recordId){
  const record=contractBillingRecords.find(item=>item.id===recordId);
  if(!record)return;
  const contract=contracts.find(item=>item.id===record.contract_id);
  const client=clients.find(item=>item.id===contract?.client_id);
  const text=buildContractReceivableReminderText(recordId);
  document.getElementById('modalArea').innerHTML=
    getInputModalOverlayHtml()
    +'<div class="modal" style="width:560px"><div class="modal-title">미수금 리마인드 메일</div>'
    +'<div class="form-row"><label class="form-label">거래처</label><input value="'+esc(client?.name||'미지정 거래처')+'" readonly style="background:var(--bg)"/></div>'
    +'<div class="form-row"><label class="form-label">계약</label><input value="'+esc(contract?.contract_name||'계약명 없음')+'" readonly style="background:var(--bg)"/></div>'
    +'<div class="form-half"><div class="form-row"><label class="form-label">예상 수금일</label><input value="'+esc(record?.expected_collection_date||'-')+'" readonly style="background:var(--bg)"/></div>'
    +'<div class="form-row"><label class="form-label">마지막 리마인드</label><input value="'+esc(record?.last_reminder_at?formatCommentDate(record.last_reminder_at):'-')+'" readonly style="background:var(--bg)"/></div></div>'
    +'<div class="form-row"><label class="form-label">문안</label><textarea id="contractReminderText" rows="10" class="copy-area">'+esc(text)+'</textarea></div>'
    +'<div class="modal-footer"><div class="muted">청구 금액과 청구일을 기준으로 초안을 만들었습니다.</div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">닫기</button><button class="btn primary" onclick="copyContractReceivableReminder(\''+recordId+'\')">문안 복사</button></div></div>'
    +'</div></div>';
  lockBodyScroll();
  bindModalEscapeHandler();
}

function renderContractBillingBoard(rows){
  const source=getContractBoardSource(rows);
  const columns=[
    {
      key:'unbilled',
      label:'미청구',
      count:source.unbilledProjects.length,
      html:source.unbilledProjects.length
        ?source.unbilledProjects.map(project=>{
          const client=clients.find(item=>item.id===project.client_id);
          const completedAt=project.actual_end_date||project.updated_at||project.end||project.end_date||'-';
          const amount=Number(project.billing_amount||0)||Number(contracts.find(item=>item.id===project.contract_id)?.contract_amount||0);
          return '<div class="contract-billing-card is-project">'
            +'<div class="contract-billing-card-title">'+esc(project.name||'프로젝트')+'</div>'
            +'<div class="contract-billing-card-sub">'+esc(client?.name||'미지정 거래처')+'</div>'
            +'<div class="contract-billing-card-meta">빌링 금액 '+formatContractCurrency(amount)+' · 완료일 '+esc(completedAt)+'</div>'
            +'<div class="contract-billing-card-actions"><button type="button" class="btn sm" onclick="event.stopPropagation();openBillingMailModal(\''+project.id+'\')">빌링 메일 작성</button><button type="button" class="btn primary sm" onclick="event.stopPropagation();markProjectBillingComplete(\''+project.id+'\')">청구 완료 처리</button></div>'
          +'</div>';
        }).join('')
        :'<div class="contract-billing-empty">미청구 프로젝트가 없습니다.</div>'
    },
    {
      key:'receivable',
      label:'미수금',
      count:source.receivableRecords.length,
      html:source.receivableRecords.length
        ?source.receivableRecords.map(record=>{
          const contract=contracts.find(item=>item.id===record.contract_id);
          const client=clients.find(item=>item.id===contract?.client_id);
          const ageBase=getContractDateValue(record.billing_date||record.created_at);
          const ageDays=ageBase?Math.max(0,Math.floor((Date.now()-ageBase)/(1000*60*60*24))):0;
          return '<div class="contract-billing-card'+(ageDays>=30?' is-overdue':'')+'">'
            +'<div class="contract-billing-card-title">'+esc(contract?.contract_name||'계약명 없음')+'</div>'
            +'<div class="contract-billing-card-sub">'+esc(client?.name||'미지정 거래처')+'</div>'
            +'<div class="contract-billing-card-meta">청구 금액 '+formatContractCurrency(record.amount||0)+' · 청구일 '+esc(record.billing_date||'-')+' · '+(ageBase?'경과 '+ageDays+'일':'경과일 미기록')+'</div>'
            +'<div class="contract-billing-card-actions"><button type="button" class="btn sm" onclick="event.stopPropagation();openContractReceivableReminderModal(\''+record.id+'\')">리마인드 메일</button><button type="button" class="btn primary sm" onclick="event.stopPropagation();markBillingRecordCollected(\''+record.id+'\')">수금 완료</button></div>'
          +'</div>';
        }).join('')
        :'<div class="contract-billing-empty">미수금 건이 없습니다.</div>'
    },
    {
      key:'paid',
      label:'수금 완료',
      count:source.recentCollectedRecords.length,
      html:source.recentCollectedRecords.length
        ?source.recentCollectedRecords.map(record=>{
          const contract=contracts.find(item=>item.id===record.contract_id);
          const client=clients.find(item=>item.id===contract?.client_id);
          return '<div class="contract-billing-card is-paid">'
            +'<div class="contract-billing-card-title">'+esc(client?.name||'미지정 거래처')+'</div>'
            +'<div class="contract-billing-card-sub">'+esc(contract?.contract_name||'계약명 없음')+'</div>'
            +'<div class="contract-billing-card-meta">수금 금액 '+formatContractCurrency(record.amount||0)+' · 수금일 '+esc(record.billing_date||'-')+'</div>'
          +'</div>';
        }).join('')
        :'<div class="contract-billing-empty">최근 30일 수금 완료 건이 없습니다.</div>'
    }
  ];
  return '<div class="contract-billing-board">'
    +columns.map(column=>
      '<div class="contract-billing-column">'
        +'<div class="contract-billing-column-head">'+column.label+'<span>'+column.count+'건</span></div>'
        +column.html
      +'</div>'
    ).join('')
  +'</div>';
}

async function toggleContractManaged(id,nextValue){
  try{
    await api('PATCH','contracts?id=eq.'+id,{is_managed:!!nextValue});
    const target=contracts.find(contract=>contract.id===id);
    if(target)target.is_managed=!!nextValue;
    renderContractsPage();
  }catch(e){
    alert('오류: '+e.message);
  }
}

async function toggleContractEnded(id,currentStatus){
  const nextStatus=isContractEndedStatus(currentStatus)?'진행중':'완료';
  try{
    await api('PATCH','contracts?id=eq.'+id,{contract_status:nextStatus});
    const target=contracts.find(contract=>contract.id===id);
    if(target)target.contract_status=nextStatus;
    renderContractsPage();
  }catch(e){
    alert('오류: '+e.message);
  }
}

async function renderContractsPage(){
  const el=document.getElementById('contractsPageContent');
  if(!el)return;
  syncManagedContractToggle();
  syncContractTypeButtons();
  syncContractViewButtons();
  document.getElementById('contractSearch')&&(document.getElementById('contractSearch').value=contractToolbarState.search);
  document.getElementById('contractStatusFilter')&&(document.getElementById('contractStatusFilter').value=contractToolbarState.status);
  document.getElementById('contractBillingFilter')&&(document.getElementById('contractBillingFilter').value=contractToolbarState.billing);
  document.getElementById('contractRenewalFilter')&&(document.getElementById('contractRenewalFilter').value=contractToolbarState.renewal);
  document.getElementById('contractSortFilter')&&(document.getElementById('contractSortFilter').value=contractToolbarState.sort);

  if(!contractBillingRecordsLoaded)await ensureContractBillingRecordsLoaded();

  const baseRows=(contracts||[]).map(buildContractRow);
  renderContractFilterOptions(baseRows);
  let rows=baseRows.filter(contractMatchesFilters);
  rows=sortContractRows(rows);

  renderContractKpis(rows);
  renderContractFilterTags();
  renderContractMonthlyReport(rows);
  syncContractAlertNotifications(baseRows).catch(()=>{});

  if(!rows.length){
    el.innerHTML=managedFilterActive
      ?'<div class="contract-empty-state"><div class="contract-empty-icon">📄</div><div class="contract-empty-title">우리 팀 관리 계약이 없습니다</div><div class="contract-empty-sub">계약 추가 시 "우리 팀 관리 계약" 체크를 켜주세요.</div></div>'
      :'<div class="contract-empty-state"><div class="contract-empty-icon">📄</div><div class="contract-empty-title">조건에 맞는 계약이 없습니다</div><div class="contract-empty-sub">필터를 조정하거나 새 계약을 추가해 보세요.</div></div>';
    return;
  }

  if(contractViewMode==='list'){
    el.innerHTML=renderContractListView(rows);
    return;
  }
  if(contractViewMode==='billing'){
    el.innerHTML=renderContractBillingBoard(rows);
    return;
  }
  el.innerHTML=renderContractGroupedView(rows);
}

function renderContractKpis(rows){
  const el=document.getElementById('contractKpiGrid');
  if(!el)return;
  const activeRows=rows.filter(row=>row.isActive);
  const attentionRows=rows.filter(row=>getContractAttentionMeta(row).tone!=='ok');
  const pendingDocCount=rows.reduce((sum,row)=>sum+Number(row.pendingDocCount||0),0);
  const pendingDocContracts=rows.filter(row=>Number(row.pendingDocCount||0)>0).length;
  const activeAmountTotal=activeRows.reduce((sum,row)=>sum+row.contractAmount,0);
  const billedYear=rows.reduce((sum,row)=>sum+row.billedThisYear,0);
  const receivableAmount=rows.reduce((sum,row)=>sum+row.receivableAmount,0);
  const agedReceivableCount=rows.reduce((sum,row)=>sum+row.agedReceivableCount,0);
  const unbilledBalance=Math.max(0,activeAmountTotal-activeRows.reduce((sum,row)=>sum+row.billedTotal,0));
  const renewalRows=activeRows
    .filter(row=>row.renewalDiffDays!==null&&row.renewalDiffDays>=0&&row.renewalDiffDays<=60)
    .sort((a,b)=>(a.endDateValue||Number.MAX_SAFE_INTEGER)-(b.endDateValue||Number.MAX_SAFE_INTEGER));
  const activeAverage=activeRows.length?Math.round(activeAmountTotal/activeRows.length):0;
  const earliestRenewal=renewalRows[0];
  const cards=[
    {
      label:'미청구 잔액',
      value:formatContractCurrency(unbilledBalance),
      sub:'청구 후속 계약 '+rows.filter(row=>Number(row.unbilledBalance||0)>0).length+'건',
      helper:unbilledBalance?'지금 청구 일정 확인이 필요한 잔액입니다.':'청구 후속이 필요한 계약이 없습니다.',
      tone:unbilledBalance>0?'warn':'quiet'
    },
    {
      label:'자료 대기',
      value:pendingDocCount+'건',
      sub:'자료 확인 계약 '+pendingDocContracts+'건',
      helper:pendingDocCount?'자료 회수 또는 고객 요청 대응이 남아 있습니다.':'현재 대기 중인 자료 요청이 없습니다.',
      tone:pendingDocCount>0?'warn':'quiet'
    },
    {
      label:'주의 필요',
      value:attentionRows.length+'건',
      sub:'미수·미청구·자료·만료 신호 포함',
      helper:attentionRows.length
        ?attentionRows.slice(0,2).map(row=>(row.contract?.contract_name||'계약')+' · '+getContractAttentionMeta(row).detail).join(' / ')
        :'지금 바로 후속이 필요한 계약이 없습니다.',
      tone:attentionRows.length?'danger':'quiet'
    },
    {
      label:'미수금',
      value:formatContractCurrency(receivableAmount),
      sub:'장기 미수 '+agedReceivableCount+'건',
      helper:receivableAmount?'수금 확인과 리마인드가 필요한 금액입니다.':'회수 추적 중인 금액이 없습니다.',
      tone:receivableAmount>0?'danger':'quiet'
    },
    {
      label:'활성 계약',
      value:activeRows.length+'건',
      sub:renewalRows.length?('만료 임박 '+renewalRows.length+'건'):'긴급 만료 없음',
      helper:earliestRenewal
        ?(earliestRenewal.contract?.contract_name||'계약')+' · '+(earliestRenewal.contract?.contract_end_date||'만료일 미정')
        :(activeAverage?'평균 계약 '+formatContractCurrency(activeAverage):'현재 진행 중 계약 기준입니다.'),
      tone:renewalRows.length?'warn':'ok'
    },
    {
      label:'계약 총액',
      value:formatContractCurrency(activeAmountTotal),
      sub:'활성 계약 기준',
      helper:activeAverage?'평균 계약 '+formatContractCurrency(activeAverage):'현재 필터 기준 계약 총액입니다.',
      tone:'quiet'
    }
  ];
  el.innerHTML=cards.map(card=>
    '<div class="contract-kpi-card'+(card.tone?' is-'+card.tone:'')+'">'
      +'<div class="contract-kpi-label">'+esc(card.label)+'</div>'
      +'<div class="contract-kpi-value">'+esc(card.value)+'</div>'
      +'<div class="contract-kpi-sub">'+esc(card.sub)+'</div>'
      +(card.helper?'<div class="contract-kpi-helper">'+esc(card.helper)+'</div>':'')
    +'</div>'
  ).join('');
}

function renderContractOverviewIntro(rows){
  const summary=getContractPortfolioSummary(rows);
  const title=contractViewMode==='grouped'
    ?'계약 포트폴리오'
    :contractViewMode==='list'
      ?'계약 리스트'
      :'빌링 보드';
  const copy=contractViewMode==='grouped'
    ?'운영 중심 보기입니다. 어떤 계약이 막혔는지와 다음 조치를 거래처 단위로 빠르게 확인합니다.'
    :contractViewMode==='list'
      ?'비교 중심 보기입니다. 계약별 위험 이유와 다음 액션을 한 줄 기준으로 정렬합니다.'
      :'청구 전후 상태와 수금 흐름을 보드 형태로 확인하는 보기입니다.';
  const chips=[
    '<span class="contract-overview-chip '+((summary.unbilledCount||summary.receivableCount)?'is-danger':'is-muted')+'">주의 '+rows.filter(row=>getContractAttentionMeta(row).tone!=='ok').length+'건</span>'
  ];
  if(summary.unbilledCount>0)chips.push('<span class="contract-overview-chip is-warn">미청구 '+summary.unbilledCount+'건</span>');
  if(summary.receivableCount>0)chips.push('<span class="contract-overview-chip is-danger">미수 '+summary.receivableCount+'건</span>');
  if(summary.expiringCount>0)chips.push('<span class="contract-overview-chip is-warn">만료 임박 '+summary.expiringCount+'건</span>');
  chips.push('<span class="contract-overview-chip is-muted">활성 '+summary.activeCount+'건</span>');
  return ''
    +'<div class="contract-overview-head">'
      +'<div><div class="contract-overview-title">'+title+'</div><div class="contract-overview-sub">'+copy+'</div></div>'
      +'<div class="contract-overview-chips">'+chips.join('')+'</div>'
    +'</div>';
}

function renderContractRowItem(row){
  const contract=row.contract;
  const isEnded=isContractEndedStatus(contract?.contract_status);
  const statusClass=getContractStatusBadgeClass(contract?.contract_status);
  const billingPercent=getContractBillingProgressPercent(row);
  const remainingMeta=getContractRemainingDaysMeta(row);
  const attentionMeta=getContractAttentionMeta(row);
  const chips=[
    '<span class="contract-inline-chip">계약 '+formatContractCurrency(row.contractAmount)+'</span>',
    ...getContractRiskTags(row),
    (remainingMeta?'<span class="contract-inline-chip '+(remainingMeta.tone==='danger'?'is-danger':remainingMeta.tone==='warn'?'is-warn':'')+'">'+remainingMeta.text+'</span>':'')
  ].filter(Boolean);
  const progressText='청구 '+billingPercent+'%';
  return '<div class="contract-inline-row is-'+attentionMeta.tone+(isEnded?' is-ended':'')+'" onclick="openContractDetail(\''+contract.id+'\')">'
    +'<div class="contract-inline-main">'
      +'<div class="contract-inline-name-row"><div class="contract-inline-name" title="'+esc(contract?.contract_name||'')+'">'+esc(contract?.contract_name||'계약명 없음')+'</div><span class="contract-inline-attention is-'+attentionMeta.tone+'">'+attentionMeta.label+'</span></div>'
      +'<div class="contract-inline-sub">'+esc(contract?.contract_type||'기타')+(row.managerNames.length?' · 담당 '+esc(row.managerNames.join(', ')):' · 담당 미정')+'</div>'
      +'<div class="contract-inline-finance-row">'+chips.join('')+'</div>'
      +'<div class="contract-inline-progress-row">'
        +'<div class="contract-inline-progress-track"><div class="contract-inline-progress-fill" style="width:'+billingPercent+'%"></div></div>'
        +'<span class="contract-inline-progress-label">'+progressText+'</span>'
      +'</div>'
      +'<div class="contract-inline-reason">이유 · '+esc(attentionMeta.detail)+'</div>'
      +'<div class="contract-inline-next is-'+attentionMeta.tone+'"><span class="contract-inline-next-label">'+esc(getContractNextActionLabel(row))+'</span>'+esc(getContractNextActionText(row))+'</div>'
    +'</div>'
    +'<div class="contract-inline-actions">'
      +'<button type="button" class="contract-mini-btn" onclick="event.stopPropagation();toggleContractManaged(\''+contract.id+'\','+(!contract.is_managed)+')" title="우리 팀 관리 여부">'+(contract.is_managed?'팀':'외부')+'</button>'
      +'<button type="button" class="contract-mini-btn" onclick="event.stopPropagation();toggleContractEnded(\''+contract.id+'\',\''+esc(String(contract.contract_status||'검토중')).replace(/'/g,'&#39;')+'\')" title="종료 여부">'+(isEnded?'복':'종')+'</button>'
      +'<span class="badge '+statusClass+'">'+esc(contract?.contract_status||'검토중')+'</span>'
    +'</div>'
  +'</div>';
}

function renderContractGroupedView(rows){
  const groups=[];
  const groupMap=new Map();
  rows.forEach(row=>{
    const key=row.client?.id||'orphans';
    if(!groupMap.has(key)){
      const group={key,client:row.client,rows:[]};
      groupMap.set(key,group);
      groups.push(group);
    }
    groupMap.get(key).rows.push(row);
  });
  groups.sort((a,b)=>{
    const aName=String(a.client?.name||'미지정 거래처');
    const bName=String(b.client?.name||'미지정 거래처');
    if(contractToolbarState.sort==='amount'){
      const diff=b.rows.reduce((sum,row)=>sum+row.contractAmount,0)-a.rows.reduce((sum,row)=>sum+row.contractAmount,0);
      if(diff)return diff;
    }else if(contractToolbarState.sort==='receivable'){
      const diff=b.rows.reduce((sum,row)=>sum+row.receivableAmount,0)-a.rows.reduce((sum,row)=>sum+row.receivableAmount,0);
      if(diff)return diff;
    }else if(contractToolbarState.sort==='end'){
      const aValue=Math.min(...a.rows.map(row=>row.endDateValue||Number.MAX_SAFE_INTEGER));
      const bValue=Math.min(...b.rows.map(row=>row.endDateValue||Number.MAX_SAFE_INTEGER));
      if(aValue!==bValue)return aValue-bValue;
    }
    return aName.localeCompare(bName,'ko');
  });
  return groups.map(group=>{
    const totalAmount=group.rows.reduce((sum,row)=>sum+row.contractAmount,0);
    const activeCount=group.rows.filter(row=>row.isActive).length;
    const billedTotal=group.rows.reduce((sum,row)=>sum+row.billedTotal,0);
    const collectedTotal=group.rows.reduce((sum,row)=>sum+row.collectedTotal,0);
    const unbilledBalance=group.rows.reduce((sum,row)=>sum+row.unbilledBalance,0);
    const receivableAmount=group.rows.reduce((sum,row)=>sum+row.receivableAmount,0);
    const pendingDocCount=group.rows.reduce((sum,row)=>sum+Number(row.pendingDocCount||0),0);
    const expiringCount=group.rows.filter(row=>row.isActive&&row.renewalDiffDays!==null&&row.renewalDiffDays>=0&&row.renewalDiffDays<=60).length;
    const collectionRate=billedTotal>0?Math.max(0,Math.min(100,Math.round((collectedTotal/billedTotal)*100))):0;
    const summaryChips=[
      '<span class="contract-group-chip">활성 '+activeCount+'건</span>'
    ];
    if(unbilledBalance>0)summaryChips.push('<span class="contract-group-chip is-warn">미청구 '+formatContractCurrency(unbilledBalance)+'</span>');
    if(receivableAmount>0)summaryChips.push('<span class="contract-group-chip is-danger">미수금 '+formatContractCurrency(receivableAmount)+'</span>');
    if(pendingDocCount>0)summaryChips.push('<span class="contract-group-chip is-warn">자료 '+pendingDocCount+'건</span>');
    if(expiringCount>0)summaryChips.push('<span class="contract-group-chip is-warn">만료 임박 '+expiringCount+'건</span>');
    return '<div class="card contract-group-card">'
      +'<div class="contract-group-head"'+(group.client?' onclick="openClientDetail(\''+group.client.id+'\',\'contracts\')"':'')+'>'
        +'<div class="contract-group-avatar">'+esc((group.client?.name||'미')[0]||'미')+'</div>'
        +'<div class="contract-group-meta">'
          +'<div class="contract-group-title">'+esc(group.client?.name||'미지정 거래처')+'</div>'
          +'<div class="contract-group-sub">'+group.rows.length+'건 · 계약 총액 '+formatContractCurrency(totalAmount)+'</div>'
          +'<div class="contract-group-finance">'
            +'<div class="contract-group-rate">'
              +'<div class="contract-group-rate-head"><span>수금률</span><strong>'+collectionRate+'%</strong></div>'
              +'<div class="contract-group-rate-track"><div class="contract-group-rate-fill" style="width:'+collectionRate+'%"></div></div>'
            +'</div>'
            +'<div class="contract-group-finance-meta">'+summaryChips.join('')+'</div>'
          +'</div>'
        +'</div>'
        +(group.client?'<span class="contract-group-link">상세</span>':'')
      +'</div>'
      +'<div class="contract-group-list">'+group.rows.map(renderContractRowItem).join('')+'</div>'
    +'</div>';
  }).join('');
}

function renderContractListView(rows){
  const manageable=canManageContractBulkActions();
  const tableRows=sortContractListRows(rows);
  const visibleIds=tableRows.map(row=>String(row.contract?.id||'')).filter(Boolean);
  window.__contractListRows=tableRows;
  window.__contractListVisibleIds=visibleIds;
  const allSelected=!!(visibleIds.length&&visibleIds.every(id=>contractListSelectedIds.has(id)));
  const selectedRows=getSelectedContractRows(tableRows);
  return '<div class="contract-list-shell">'
    +'<div class="contract-list-head"><div><div class="contract-list-title">계약 비교 보기</div><div class="muted">위험 이유와 다음 액션을 같은 축으로 비교하는 정렬용 보기입니다.</div></div>'
    +(manageable&&selectedRows.length
      ?'<div class="contract-bulk-actions"><span class="contract-bulk-count">'+selectedRows.length+'개 선택</span><select id="contractBulkStatusSelect"><option value="">상태 변경</option><option value="진행중">진행중</option><option value="검토중">검토중</option><option value="완료">완료</option><option value="해지">해지</option></select><button type="button" class="btn sm" onclick="applyContractBulkStatus(document.getElementById(\'contractBulkStatusSelect\').value)">일괄 상태 변경</button><button type="button" class="btn sm" onclick="applyContractBulkManaged(true)">우리 팀 관리 ON</button><button type="button" class="btn sm" onclick="applyContractBulkManaged(false)">우리 팀 관리 OFF</button><button type="button" class="btn ghost sm" onclick="clearContractListSelection()">선택 해제</button></div>'
      :'')
    +'</div>'
    +'<div class="contract-list-wrap"><table class="contract-list-table"><thead><tr>'
      +(manageable?'<th><input type="checkbox" '+(allSelected?'checked ':'')+'onclick="event.stopPropagation();toggleAllContractListSelections(window.__contractListVisibleIds||[],this.checked)"/></th>':'')
      +'<th><button type="button" class="contract-list-sort-btn" onclick="sortContractListBy(\'client\')">거래처'+getContractListSortIndicator('client')+'</button></th>'
      +'<th><button type="button" class="contract-list-sort-btn" onclick="sortContractListBy(\'name\')">계약'+getContractListSortIndicator('name')+'</button></th>'
      +'<th><button type="button" class="contract-list-sort-btn" onclick="sortContractListBy(\'status\')">상태'+getContractListSortIndicator('status')+'</button></th>'
      +'<th><button type="button" class="contract-list-sort-btn" onclick="sortContractListBy(\'amount\')">핵심 금액'+getContractListSortIndicator('amount')+'</button></th>'
      +'<th><button type="button" class="contract-list-sort-btn" onclick="sortContractListBy(\'receivable\')">리스크 이유'+getContractListSortIndicator('receivable')+'</button></th>'
      +'<th>다음 액션</th>'
      +'<th><button type="button" class="contract-list-sort-btn" onclick="sortContractListBy(\'remaining\')">만료'+getContractListSortIndicator('remaining')+'</button></th>'
    +'</tr></thead><tbody>'
    +tableRows.map(row=>{
      const remainingMeta=getContractRemainingDaysMeta(row);
      const billingPercent=getContractBillingProgressPercent(row);
      const attentionMeta=getContractAttentionMeta(row);
      const metricChips=[
        '<span class="contract-list-chip">계약 '+formatContractCurrency(row.contractAmount)+'</span>',
        (row.unbilledBalance>0?'<span class="contract-list-chip is-warn">미청구 '+formatContractCurrency(row.unbilledBalance)+'</span>':''),
        (row.pendingDocCount>0?'<span class="contract-list-chip is-warn">자료 '+row.pendingDocCount+'건</span>':''),
        (row.openIssueCount>0?'<span class="contract-list-chip is-danger">이슈 '+row.openIssueCount+'건</span>':'')
      ].filter(Boolean).join('');
      return '<tr onclick="openContractDetail(\''+row.contract.id+'\')">'
        +(manageable?'<td><input type="checkbox" '+(contractListSelectedIds.has(String(row.contract?.id||''))?'checked ':'')+'onclick="event.stopPropagation();toggleContractListSelection(\''+row.contract.id+'\',this.checked)"/></td>':'')
        +'<td><div class="contract-list-name">'+esc(row.client?.name||'미지정 거래처')+'</div><div class="contract-list-sub">'+(row.isActive?'활성 계약':'종료/해지 포함')+'</div></td>'
        +'<td><div class="contract-list-name-row"><div class="contract-list-name">'+esc(row.contract?.contract_name||'계약명 없음')+'</div><span class="contract-list-attention is-'+attentionMeta.tone+'">'+attentionMeta.label+'</span></div><div class="contract-list-sub">'+esc(row.contract?.contract_type||'기타')+' · '+esc(row.managerNames.join(', ')||'담당자 미정')+'</div></td>'
        +'<td><span class="badge '+getContractStatusBadgeClass(row.contract?.contract_status)+'">'+esc(row.contract?.contract_status||'검토중')+'</span></td>'
        +'<td><div class="contract-list-money">'+formatContractCurrency(row.billedTotal)+'</div><div class="contract-list-progress-mini"><span>청구 '+billingPercent+'%</span><div class="contract-list-progress-mini-track"><div class="contract-list-progress-mini-fill" style="width:'+billingPercent+'%"></div></div></div><div class="contract-list-chip-row">'+metricChips+'</div></td>'
        +'<td><div class="contract-list-period">'+esc(attentionMeta.detail)+'</div><div class="contract-list-sub">'+(row.receivableAmount>0?('미수금 '+formatContractCurrency(row.receivableAmount)):(row.unbilledBalance>0?'청구 후속 필요':'운영 리스크 낮음'))+'</div></td>'
        +'<td><div class="contract-list-next-label">'+esc(getContractNextActionLabel(row))+'</div><div class="contract-list-sub contract-list-action">'+esc(getContractNextActionText(row))+'</div></td>'
        +'<td>'+(remainingMeta?'<span class="contract-inline-dday is-'+remainingMeta.tone+'">'+remainingMeta.text+'</span>':'<span class="contract-list-sub">만료 정보 없음</span>')+'<div class="contract-list-sub">'+esc(getContractPeriodText(row.contract))+'</div></td>'
      +'</tr>';
    }).join('')
    +'</tbody></table></div></div>';
}

async function renderContractsPage(){
  const el=document.getElementById('contractsPageContent');
  const monthlyReportEl=document.getElementById('contractMonthlyReport');
  if(!el)return;
  syncManagedContractToggle();
  syncContractTypeButtons();
  syncContractViewButtons();
  document.getElementById('contractSearch')&&(document.getElementById('contractSearch').value=contractToolbarState.search);
  document.getElementById('contractStatusFilter')&&(document.getElementById('contractStatusFilter').value=contractToolbarState.status);
  document.getElementById('contractBillingFilter')&&(document.getElementById('contractBillingFilter').value=contractToolbarState.billing);
  document.getElementById('contractRenewalFilter')&&(document.getElementById('contractRenewalFilter').value=contractToolbarState.renewal);
  document.getElementById('contractSortFilter')&&(document.getElementById('contractSortFilter').value=contractToolbarState.sort);

  if(!contractBillingRecordsLoaded)await ensureContractBillingRecordsLoaded();
  if(!contractPendingDocRequestsLoaded)await ensureContractPendingDocRequestsLoaded();

  const baseRows=(contracts||[]).map(buildContractRow);
  renderContractFilterOptions(baseRows);
  let rows=baseRows.filter(contractMatchesFilters);
  rows=sortContractRows(rows);

  renderContractKpis(rows);
  renderContractFilterTags();
  if(monthlyReportEl){
    monthlyReportEl.hidden=contractViewMode!=='billing';
    monthlyReportEl.innerHTML='';
    if(contractViewMode==='billing')renderContractMonthlyReport(rows);
  }
  syncContractAlertNotifications(baseRows).catch(()=>{});

  if(!rows.length){
    el.innerHTML=managedFilterActive
      ?'<div class="contract-empty-state"><div class="contract-empty-icon">📄</div><div class="contract-empty-title">우리 팀 관리 계약이 없습니다</div><div class="contract-empty-sub">계약 추가 시 "우리 팀 관리 계약" 체크를 켜거나 상단 토글을 전체로 바꿔 보세요.</div></div>'
      :'<div class="contract-empty-state"><div class="contract-empty-icon">📄</div><div class="contract-empty-title">조건에 맞는 계약이 없습니다</div><div class="contract-empty-sub">필터를 조정하거나 새 계약을 추가해 보세요.</div></div>';
    return;
  }

  if(contractViewMode==='list'){
    el.innerHTML=renderContractOverviewIntro(rows)+renderContractListView(rows);
    return;
  }
  if(contractViewMode==='billing'){
    el.innerHTML=renderContractOverviewIntro(rows)+renderContractBillingBoard(rows);
    return;
  }
  el.innerHTML=renderContractOverviewIntro(rows)+renderContractGroupedView(rows);
}

function getContractBillingBoardMetaItem(label,value){
  return '<div class="contract-billing-meta-item"><span>'+esc(label)+'</span><strong>'+esc(value||'-')+'</strong></div>';
}

function renderContractBillingBoard(rows){
  const source=getContractBoardSource(rows);
  const unbilledAmount=source.unbilledProjects.reduce((sum,project)=>{
    const contract=contracts.find(item=>item.id===project.contract_id);
    const amount=Number(project.billing_amount||0)||Number(contract?.contract_amount||0);
    return sum+amount;
  },0);
  const receivableAmount=source.receivableRecords.reduce((sum,record)=>sum+Number(record.amount||0),0);
  const collectedAmount=source.recentCollectedRecords.reduce((sum,record)=>sum+Number(record.amount||0),0);
  const columns=[
    {
      key:'unbilled',
      label:'미청구',
      summary:formatContractCurrency(unbilledAmount),
      helper:source.unbilledProjects.length?'완료 후 아직 청구하지 않은 프로젝트':'청구 대기 프로젝트 없음',
      html:source.unbilledProjects.length
        ?source.unbilledProjects.map(project=>{
          const client=clients.find(item=>item.id===project.client_id);
          const contract=contracts.find(item=>item.id===project.contract_id);
          const completedAt=project.actual_end_date||project.updated_at||project.end||project.end_date||'-';
          const amount=Number(project.billing_amount||0)||Number(contract?.contract_amount||0);
          const clickAction=contract?.id
            ?"openContractDetail('"+contract.id+"')"
            :"openProjModal('"+project.id+"',null,null,'completion')";
          return '<div class="contract-billing-card is-unbilled" onclick="'+clickAction+'">'
            +'<div class="contract-billing-card-head"><div class="contract-billing-card-eyebrow">'+esc(client?.name||'고객사 미지정')+'</div><span class="contract-billing-status is-warn">청구 필요</span></div>'
            +'<div class="contract-billing-card-title">'+esc(project.name||'프로젝트명 없음')+'</div>'
            +'<div class="contract-billing-card-sub">'+(contract?('계약 · '+esc(contract.contract_name||'계약명 없음')):'계약 연결 없음')+'</div>'
            +'<div class="contract-billing-card-grid">'
              +getContractBillingBoardMetaItem('청구 예정 금액',formatContractCurrency(amount))
              +getContractBillingBoardMetaItem('완료일',completedAt)
            +'</div>'
            +'<div class="contract-billing-card-note">다음 액션: 빌링 메일을 확인한 뒤 청구 완료로 넘기세요.</div>'
            +'<div class="contract-billing-card-actions"><button type="button" class="btn sm" onclick="event.stopPropagation();openBillingMailModal(\''+project.id+'\')">빌링 메일 작성</button><button type="button" class="btn primary sm" onclick="event.stopPropagation();markProjectBillingComplete(\''+project.id+'\')">청구 완료 처리</button></div>'
          +'</div>';
        }).join('')
        :'<div class="contract-billing-empty">청구할 프로젝트가 없습니다. 완료 후 미청구 상태인 프로젝트가 생기면 여기에 표시됩니다.</div>'
    },
    {
      key:'receivable',
      label:'미수금',
      summary:formatContractCurrency(receivableAmount),
      helper:source.receivableRecords.length?'청구 후 아직 수금되지 않은 건':'추적 중인 미수금 없음',
      html:source.receivableRecords.length
        ?source.receivableRecords.map(record=>{
          const contract=contracts.find(item=>item.id===record.contract_id);
          const client=clients.find(item=>item.id===contract?.client_id);
          const ageBase=getContractDateValue(record.billing_date||record.created_at);
          const ageDays=ageBase?Math.max(0,Math.floor((Date.now()-ageBase)/(1000*60*60*24))):0;
          const tone=ageDays>=60?'danger':ageDays>=30?'warn':'normal';
          return '<div class="contract-billing-card is-receivable'+(tone!=='normal'?' is-'+tone:'')+'" onclick="openContractDetail(\''+record.contract_id+'\')">'
            +'<div class="contract-billing-card-head"><div class="contract-billing-card-eyebrow">'+esc(client?.name||'고객사 미지정')+'</div><span class="contract-billing-status is-'+tone+'">'+(ageDays>=60?'장기 미수':ageDays>=30?'회수 지연':'회수 추적')+'</span></div>'
            +'<div class="contract-billing-card-title">'+esc(contract?.contract_name||'계약명 없음')+'</div>'
            +'<div class="contract-billing-card-sub">청구 후 수금 대기 중</div>'
            +'<div class="contract-billing-card-grid">'
              +getContractBillingBoardMetaItem('청구 금액',formatContractCurrency(record.amount||0))
              +getContractBillingBoardMetaItem('청구일',record.billing_date||'-')
              +getContractBillingBoardMetaItem('경과일',ageBase?('경과 '+ageDays+'일'):'기준일 미기록')
              +getContractBillingBoardMetaItem('예상 수금일',record.expected_collection_date||'미정')
            +'</div>'
            +'<div class="contract-billing-card-note">다음 액션: '+(record.expected_collection_date?'예상 수금일과 리마인드 이력을 확인하세요.':'예상 수금일을 정하고 리마인드 여부를 점검하세요.')+'</div>'
            +'<div class="contract-billing-card-actions"><button type="button" class="btn sm" onclick="event.stopPropagation();openContractReceivableReminderModal(\''+record.id+'\')">리마인드 메일</button><button type="button" class="btn primary sm" onclick="event.stopPropagation();markBillingRecordCollected(\''+record.id+'\')">수금 완료 처리</button></div>'
          +'</div>';
        }).join('')
        :'<div class="contract-billing-empty">미수금 건이 없습니다. 청구 후 미수 상태인 건이 생기면 여기에서 추적합니다.</div>'
    },
    {
      key:'paid',
      label:'수금 완료',
      summary:formatContractCurrency(collectedAmount),
      helper:source.recentCollectedRecords.length?'최근 30일 내 수금 완료 건':'최근 수금 완료 건 없음',
      html:source.recentCollectedRecords.length
        ?source.recentCollectedRecords.map(record=>{
          const contract=contracts.find(item=>item.id===record.contract_id);
          const client=clients.find(item=>item.id===contract?.client_id);
          const collectedAt=record.updated_at?formatCommentDate(record.updated_at):(record.billing_date||'-');
          return '<div class="contract-billing-card is-paid" onclick="openContractDetail(\''+record.contract_id+'\')">'
            +'<div class="contract-billing-card-head"><div class="contract-billing-card-eyebrow">'+esc(client?.name||'고객사 미지정')+'</div><span class="contract-billing-status is-success">수금 완료</span></div>'
            +'<div class="contract-billing-card-title">'+esc(contract?.contract_name||'계약명 없음')+'</div>'
            +'<div class="contract-billing-card-sub">최근 회수 완료 내역</div>'
            +'<div class="contract-billing-card-grid">'
              +getContractBillingBoardMetaItem('수금 금액',formatContractCurrency(record.amount||0))
              +getContractBillingBoardMetaItem('처리일',collectedAt)
            +'</div>'
            +'<div class="contract-billing-card-note">현재 상태: 수금이 완료된 건입니다. 상세에서 전체 이력을 이어서 확인할 수 있습니다.</div>'
          +'</div>';
        }).join('')
        :'<div class="contract-billing-empty">최근 30일 내 수금 완료 건이 없습니다.</div>'
    }
  ];
  return '<div class="contract-billing-board-shell">'
    +'<div class="contract-billing-board-summary">'
      +columns.map(column=>'<div class="contract-billing-summary-card"><div class="contract-billing-summary-label">'+column.label+'</div><div class="contract-billing-summary-value">'+column.summary+'</div><div class="contract-billing-summary-sub">'+column.helper+'</div></div>').join('')
    +'</div>'
    +'<div class="contract-billing-board">'
      +columns.map(column=>
        '<div class="contract-billing-column is-'+column.key+'">'
          +'<div class="contract-billing-column-head"><div><div class="contract-billing-column-title">'+column.label+'</div><div class="contract-billing-column-sub">'+column.helper+'</div></div><span>'+column.summary+'</span></div>'
          +column.html
        +'</div>'
      ).join('')
    +'</div>'
  +'</div>';
}
