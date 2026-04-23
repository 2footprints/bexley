let managedFilterActive=true;
let contractViewMode='grouped';
let contractBillingRecords=[];
let contractBillingRecordsLoaded=false;
let contractBillingRecordsLoading=false;
let contractBillingRecordsPromise=null;
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
  const managerNames=getContractManagerNames(contract,relatedProjects);
  const records=getContractBillingRecords(contract.id);
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

function renderContractRowItem(row){
  const contract=row.contract;
  const isEnded=isContractEndedStatus(contract?.contract_status);
  const statusClass=getContractStatusBadgeClass(contract?.contract_status);
  const billingPercent=getContractBillingProgressPercent(row);
  const remainingMeta=getContractRemainingDaysMeta(row);
  const billingHint=row.receivableAmount>0
    ?'미수금 '+formatContractCurrency(row.receivableAmount)
    :(row.unbilledBalance>0?'미청구 '+formatContractCurrency(row.unbilledBalance):'완납');
  return '<div class="contract-inline-row'+(isEnded?' is-ended':'')+'" onclick="openContractDetail(\''+contract.id+'\')">'
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
    if(target)target.status='수금완료';
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
    +'<div class="form-row"><label class="form-label">문안</label><textarea id="contractReminderText" rows="10" class="copy-area">'+esc(text)+'</textarea></div>'
    +'<div class="modal-footer"><div class="muted">청구 금액과 청구일을 기준으로 초안을 만들었습니다.</div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">닫기</button><button class="btn primary" onclick="copyText(document.getElementById(\'contractReminderText\').value)">문안 복사</button></div></div>'
    +'</div></div>';
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
