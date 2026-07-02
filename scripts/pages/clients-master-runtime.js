let selectedClientMasterId='';

function getClientMasterStatusMeta(row){
  const tone=row?.cardHealthMeta?.tone||row?.healthCode||'normal';
  if(tone==='risk')return {label:'위험',tone:'risk'};
  if(tone==='warning')return {label:'주의',tone:'warning'};
  return {label:'정상',tone:'normal'};
}

function getClientMasterManagersText(names){
  const list=[...new Set((names||[]).filter(Boolean))];
  if(!list.length)return '담당 미정';
  if(list.length<=2)return list.join(', ');
  return list[0]+' 외 '+(list.length-1)+'명';
}

function getClientMasterExternalId(client){
  return client?.external_id||client?.external_client_id||client?.master_id||client?.erp_id||client?.code||client?.id||'-';
}

function getClientMasterSyncText(client,row){
  const raw=client?.last_synced_at||client?.synced_at||client?.updated_at||client?.created_at||row?.recentActivityAt;
  if(!raw)return '-';
  if(typeof formatCommentDate==='function')return formatCommentDate(raw);
  return String(raw).slice(0,16).replace('T',' ');
}

function setClientMasterSelection(clientId){
  selectedClientMasterId=String(clientId||'');
  renderClients();
}

function closeClientMasterPanel(){
  selectedClientMasterId='';
  renderClients();
}

function syncClientLookupToolbar(baseRows){
  clientScopeFilter='all';
  clientViewMode='table';
  const title=document.getElementById('boardTitle');
  if(title)title.textContent='거래처';
  renderClientFilterOptions(baseRows);
  const search=document.getElementById('clientSearchInput');
  if(search)search.placeholder='거래처명, 담당자명 검색';
  const status=document.getElementById('projStatusFilter');
  if(status){
    const current=status.value||'';
    status.innerHTML='<option value="">프로젝트 연결 전체</option><option value="linked">연결 있음</option><option value="unlinked">연결 없음</option>';
    status.value=['linked','unlinked'].includes(current)?current:'';
  }
  const health=document.getElementById('clientHealthFilter');
  if(health){
    const current=clientToolbarState.health==='issue'?'risk':clientToolbarState.health;
    health.innerHTML='<option value="all">상태 전체</option><option value="normal">정상</option><option value="warning">주의</option><option value="risk">위험</option>';
    health.value=['normal','warning','risk'].includes(current)?current:'all';
  }
  const sort=document.getElementById('clientSortFilter');
  if(sort){
    const current=sort.value||clientToolbarState.sort||'name';
    sort.innerHTML='<option value="name">이름순</option><option value="issues">이슈순</option><option value="recent">최근 활동순</option>';
    sort.value=['name','issues','recent'].includes(current)?current:'name';
  }
}

function filterClientLookupRows(row){
  const connection=document.getElementById('projStatusFilter')?.value||'';
  const search=String(clientToolbarState.search||'').trim().toLowerCase();
  if(connection==='linked'&&!row.projects.length)return false;
  if(connection==='unlinked'&&row.projects.length)return false;
  if(clientToolbarState.industry&&String(row.client?.industry||'')!==clientToolbarState.industry)return false;
  if(clientToolbarState.manager&&!row.managerNames.includes(clientToolbarState.manager))return false;
  if(clientToolbarState.health!=='all'&&row.healthCode!==clientToolbarState.health)return false;
  if(search){
    const haystack=[row.client?.name||'',row.client?.industry||'',...row.managerNames].join(' ').toLowerCase();
    if(!haystack.includes(search))return false;
  }
  return true;
}

function renderClientLookupSummary(rows){
  const el=document.getElementById('clientsTopSummary');
  if(!el)return;
  const attention=rows.filter(row=>['warning','risk'].includes(getClientMasterStatusMeta(row).tone)).length;
  const issueCount=rows.reduce((sum,row)=>sum+Number(row.openIssueCount||0),0);
  const projectCount=rows.reduce((sum,row)=>sum+Number(row.projects?.length||0),0);
  el.className='client-master-top';
  el.innerHTML='<div class="client-master-page-head"><div><h2>거래처</h2><p>외부 거래처 마스터에서 가져온 거래처를 조회하고, 내부 프로젝트와 연결된 정보를 확인합니다.</p></div></div>'
    +'<div class="client-master-summary-bar">'
      +'<span>전체 거래처 <strong>'+rows.length+'</strong></span>'
      +'<span class="'+(attention?'is-warn':'')+'">주의 <strong>'+attention+'</strong></span>'
      +'<span class="'+(issueCount?'is-risk':'')+'">열린 이슈 <strong>'+issueCount+'</strong></span>'
      +'<span>연결 프로젝트 <strong>'+projectCount+'</strong></span>'
    +'</div>';
}

function renderClientLookupFilterTags(){
  const el=document.getElementById('clientFilterTags');
  if(!el)return;
  const tags=[];
  const connection=document.getElementById('projStatusFilter')?.value||'';
  if(connection==='linked')tags.push({key:'connection',label:'프로젝트 연결 있음'});
  if(connection==='unlinked')tags.push({key:'connection',label:'프로젝트 연결 없음'});
  if(clientToolbarState.industry)tags.push({key:'industry',label:'업종 '+clientToolbarState.industry});
  if(clientToolbarState.manager)tags.push({key:'manager',label:'담당자 '+clientToolbarState.manager});
  if(clientToolbarState.health!=='all')tags.push({key:'health',label:'상태 '+getClientMasterStatusMeta({healthCode:clientToolbarState.health}).label});
  if(clientToolbarState.search)tags.push({key:'search',label:'검색 '+clientToolbarState.search});
  el.innerHTML=tags.map(tag=>'<span class="client-filter-tag">'+esc(tag.label)+'<button type="button" onclick="clearClientFilterTag(\''+tag.key+'\')">×</button></span>').join('');
}

function renderClientLookupTable(rows){
  const tableRows=sortClientTableRows(rows);
  if(selectedClientMasterId&&!tableRows.some(row=>String(row.client.id)===selectedClientMasterId)){
    selectedClientMasterId='';
  }
  return '<div class="client-master-table-shell">'
    +'<div class="client-master-table-wrap"><table class="client-master-table"><thead><tr>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'name\')">거래처명'+getClientTableSortIndicator('name')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'industry\')">업종'+getClientTableSortIndicator('industry')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'manager\')">담당자'+getClientTableSortIndicator('manager')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'active\')">연결 프로젝트'+getClientTableSortIndicator('active')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'issues\')">열린 이슈'+getClientTableSortIndicator('issues')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'recent\')">최근 활동'+getClientTableSortIndicator('recent')+'</button></th>'
      +'<th><button type="button" class="client-table-sort-btn" onclick="sortClientTableBy(\'health\')">상태'+getClientTableSortIndicator('health')+'</button></th>'
    +'</tr></thead><tbody>'
    +tableRows.map(row=>{
      const status=getClientMasterStatusMeta(row);
      const recent=row.recentActivityMeta?.text||'기록 없음';
      const managers=getClientMasterManagersText(row.managerNames);
      return '<tr class="'+(String(row.client.id)===selectedClientMasterId?'is-selected':'')+'" onclick="setClientMasterSelection(\''+row.client.id+'\')">'
        +'<td><div class="client-master-name">'+esc(row.client.name||'거래처')+'</div></td>'
        +'<td>'+esc(row.client.industry||'업종 미입력')+'</td>'
        +'<td><span title="'+esc((row.managerNames||[]).join(', ')||'담당 미정')+'">'+esc(managers)+'</span></td>'
        +'<td><span class="client-master-count">프로젝트 '+row.projects.length+'건</span></td>'
        +'<td><span class="client-master-count '+(row.openIssueCount?'is-risk':'')+'">이슈 '+row.openIssueCount+'건</span></td>'
        +'<td><span class="'+(row.recentActivityMeta?.isStale?'client-master-recent is-stale':'client-master-recent')+'">'+esc(recent)+'</span></td>'
        +'<td><span class="client-master-status is-'+status.tone+'"><i></i>'+esc(status.label)+'</span></td>'
      +'</tr>';
    }).join('')
    +'</tbody></table></div></div>';
}

function renderClientLookupDetailPanel(rows){
  const row=selectedClientMasterId?rows.find(item=>String(item.client.id)===String(selectedClientMasterId)):null;
  if(!row)return '<aside class="client-master-panel is-empty"><div class="client-master-panel-empty">거래처를 선택하면 상세 정보가 표시됩니다.</div></aside>';
  selectedClientMasterId=String(row.client.id||'');
  const client=row.client||{};
  const status=getClientMasterStatusMeta(row);
  const managers=row.managerNames&&row.managerNames.length?row.managerNames.join(', '):'담당 미정';
  const projectRows=row.projects.slice(0,6).map(project=>
    '<button type="button" class="client-master-panel-row" onclick="openProjModal(\''+project.id+'\')"><strong>'+esc(project.name||'프로젝트')+'</strong><span>'+esc(project.status||'상태 없음')+'</span></button>'
  ).join('')||'<div class="client-master-panel-muted">연결된 프로젝트가 없습니다.</div>';
  const issueRows=(row.projects||[]).filter(project=>(openIssuesByProject[project.id]||0)>0).slice(0,5).map(project=>
    '<button type="button" class="client-master-panel-row" onclick="openProjModal(\''+project.id+'\',null,null,\'issue\')"><strong>'+esc(project.name||'프로젝트')+'</strong><span>열린 이슈 '+(openIssuesByProject[project.id]||0)+'건</span></button>'
  ).join('')||'<div class="client-master-panel-muted">열린 이슈가 없습니다.</div>';
  return '<aside class="client-master-panel">'
    +'<div class="client-master-panel-head">'
      +'<div><div class="client-master-panel-title">'+esc(client.name||'거래처')+'</div><div class="client-master-panel-sub">'+esc(client.industry||'업종 미입력')+'</div></div>'
      +'<button type="button" class="client-master-panel-close" onclick="closeClientMasterPanel()">×</button>'
    +'</div>'
    +'<div class="client-master-panel-meta">'
      +'<div><span>상태</span><strong><span class="client-master-status is-'+status.tone+'"><i></i>'+esc(status.label)+'</span></strong></div>'
      +'<div><span>담당자</span><strong title="'+esc(managers)+'">'+esc(managers)+'</strong></div>'
      +'<div><span>외부 시스템 ID</span><strong>'+esc(getClientMasterExternalId(client))+'</strong></div>'
      +'<div><span>최근 동기화</span><strong>'+esc(getClientMasterSyncText(client,row))+'</strong></div>'
    +'</div>'
    +'<div class="client-master-panel-section"><div class="client-master-panel-section-title">연결 프로젝트 '+row.projects.length+'건</div>'+projectRows+'</div>'
    +'<div class="client-master-panel-section"><div class="client-master-panel-section-title">열린 이슈 '+row.openIssueCount+'건</div>'+issueRows+'</div>'
    +'<div class="client-master-panel-actions"><button type="button" class="btn sm" onclick="openClientDetail(\''+client.id+'\',\'projects\')">상세 보기</button><button type="button" class="btn ghost sm" onclick="openClientModal(\''+client.id+'\')">수정</button></div>'
  +'</aside>';
}

setClientScope=function(){
  clientScopeFilter='all';
  syncClientPrimaryToggle();
  renderClients();
};

setClientViewMode=function(){
  clientViewMode='table';
  renderClients();
};

const clearClientFilterTagClientLookupBase=clearClientFilterTag;
clearClientFilterTag=function(key){
  if(key==='connection'){
    const el=document.getElementById('projStatusFilter');
    if(el)el.value='';
    renderClients();
    return;
  }
  clearClientFilterTagClientLookupBase(key);
};

renderClients=function(){
  const grid=document.getElementById('clientGrid');
  if(!grid)return;
  clientScopeFilter='all';
  clientViewMode='table';
  if(!clientPendingDocRequestsLoaded&&!clientPendingDocRequestsLoading)ensureClientPendingDocRequestsLoaded();
  const baseRows=(clients||[]).map(buildClientRow);
  syncClientLookupToolbar(baseRows);
  clientToolbarState.industry=document.getElementById('clientIndustryFilter')?.value||'';
  clientToolbarState.manager=document.getElementById('clientManagerFilter')?.value||'';
  clientToolbarState.team='';
  clientToolbarState.health=document.getElementById('clientHealthFilter')?.value||'all';
  clientToolbarState.search=document.getElementById('clientSearchInput')?.value?.trim()||'';
  clientToolbarState.sort=document.getElementById('clientSortFilter')?.value||'name';
  if(['name','issues','recent'].includes(clientToolbarState.sort)){
    clientTableSortKey=clientToolbarState.sort;
    clientTableSortDir=clientToolbarState.sort==='name'?'asc':'desc';
  }
  let rows=sortClientRows(baseRows.filter(filterClientLookupRows));
  renderClientLookupSummary(rows);
  renderClientLookupFilterTags();
  grid.className='client-master-layout';
  if(!rows.length){
    selectedClientMasterId='';
    grid.innerHTML='<div class="client-master-main"><div class="empty-state client-empty-state">조건에 맞는 거래처가 없습니다.</div></div>'+renderClientLookupDetailPanel([]);
    renderClientBulkSelectionBar();
    return;
  }
  grid.innerHTML='<div class="client-master-main">'
    +renderClientLookupTable(rows)
  +'</div>'+renderClientLookupDetailPanel(rows);
  renderClientBulkSelectionBar();
};
