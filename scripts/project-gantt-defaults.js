const BEXLEY_GANTT_LAYOUT_KEY='bexley.project.defaultLayout';
const BEXLEY_GANTT_LAYOUTS=new Set(['timeline','list','task','calendar']);

function readBexleyGanttLayout(){
  try{
    const stored=localStorage.getItem(BEXLEY_GANTT_LAYOUT_KEY);
    return BEXLEY_GANTT_LAYOUTS.has(stored)?stored:'timeline';
  }catch(e){
    return 'timeline';
  }
}

function persistBexleyGanttLayout(mode){
  try{
    if(BEXLEY_GANTT_LAYOUTS.has(mode))localStorage.setItem(BEXLEY_GANTT_LAYOUT_KEY,mode);
  }catch(e){}
}

if(typeof curGanttLayout!=='undefined'){
  curGanttLayout=readBexleyGanttLayout();
  if(curGanttLayout==='timeline'&&typeof curGanttTimelineScale!=='undefined'&&!curGanttTimelineScale){
    curGanttTimelineScale='month';
  }
}

ensureGanttLayoutToggle=function(){
  const toolbar=document.querySelector('#pageGantt .gantt-toolbar');
  if(!toolbar||document.getElementById('ganttLayoutToggle'))return;
  const viewZone=document.getElementById('ganttToolbarView')||toolbar;
  const controls=document.createElement('div');
  controls.className='gantt-view-controls';
  const wrap=document.createElement('div');
  wrap.id='ganttLayoutToggle';
  wrap.className='toggle-wrap gantt-layout-toggle pg-view-tabs';
  wrap.innerHTML='<button class="toggle-btn active" id="glt" type="button">간트</button><button class="toggle-btn" id="gll" type="button">리스트</button><button class="toggle-btn" id="gltask" type="button">태스크</button><button class="toggle-btn" id="glc" type="button">달력</button>';
  controls.appendChild(wrap);
  const scaleWrap=document.createElement('div');
  scaleWrap.id='ganttTimelineScaleToggle';
  scaleWrap.className='toggle-wrap gantt-time-scale-toggle pg-view-tabs';
  scaleWrap.innerHTML='<button class="toggle-btn active" id="gtsDay" type="button">일간</button><button class="toggle-btn" id="gtsWeek" type="button">주간</button><button class="toggle-btn" id="gtsMonth" type="button">월간</button>';
  controls.appendChild(scaleWrap);
  viewZone.appendChild(controls);
  document.getElementById('glt').onclick=()=>setGanttLayout('timeline');
  document.getElementById('gll').onclick=()=>setGanttLayout('list');
  document.getElementById('gltask').onclick=()=>setGanttLayout('task');
  document.getElementById('glc').onclick=()=>setGanttLayout('calendar');
  document.getElementById('gtsDay').onclick=()=>setGanttTimeScale('month');
  document.getElementById('gtsWeek').onclick=()=>setGanttTimeScale('week');
  document.getElementById('gtsMonth').onclick=()=>setGanttTimeScale('annual');
  updateGanttLayoutButtons();
};

setGanttLayout=function(mode){
  if(mode==='annual'){
    curGanttLayout='timeline';
    curGanttTimelineScale='annual';
  }else if(BEXLEY_GANTT_LAYOUTS.has(mode)){
    curGanttLayout=mode;
    if(mode==='timeline'&&!curGanttTimelineScale)curGanttTimelineScale='month';
  }else{
    curGanttLayout='timeline';
  }
  persistBexleyGanttLayout(curGanttLayout);
  updateGanttLayoutButtons();
  renderGantt();
};

setGanttTimeScale=function(scale){
  curGanttLayout='timeline';
  curGanttTimelineScale=scale==='week'?'week':(scale==='annual'?'annual':'month');
  persistBexleyGanttLayout('timeline');
  updateGanttLayoutButtons();
  renderGantt();
};

setGanttDetailTab=function(tab){
  ganttDetailTab=tab==='checklist'?'overview':(tab||'overview');
  const {projs,schs}=getGanttFilteredData();
  renderGanttDetailPanel(projs,schs);
};

function getProjectDetailMemoPreview(project){
  const direct=String(project?.memo||project?.follow_up_note||project?.issue_note||project?.work_summary||project?.result_summary||'').trim();
  if(direct)return direct;
  const comments=Array.isArray(projectComments)?projectComments.filter(comment=>String(comment?.project_id||'')===String(project?.id||'')):[];
  const latest=comments.filter(comment=>!comment.parent_id).slice(-2).map(comment=>String(comment?.content||'').trim()).filter(Boolean);
  return latest.join('\n');
}

renderGanttDetailTabBar=function(){
  const tabs=[
    {key:'overview',label:'Overview'},
    {key:'work',label:'Work'},
    {key:'issues',label:'Issues'},
    {key:'billing',label:'Billing'},
    {key:'documents',label:'Deliverables'},
    {key:'memo',label:'Notes'}
  ];
  return '<div class="pd-tabs" role="tablist" aria-label="프로젝트 상세 탭">'
    +tabs.map(tab=>'<button type="button" class="'+(ganttDetailTab===tab.key?'active':'')+'" role="tab" aria-selected="'+(ganttDetailTab===tab.key?'true':'false')+'" onclick="setGanttDetailTab(\''+tab.key+'\')">'+tab.label+'</button>').join('')
  +'</div>';
};

function renderProjectDetailBillingSummary(project,linkedContract,billingStatus,billingAmount){
  const billable=project?.is_billable!==false;
  const status=billable?String(billingStatus||project?.billing_status||'미청구').trim():'비청구';
  const amount=Number(billingAmount||project?.billing_amount||linkedContract?.contract_amount||0);
  return '<div class="gantt-overview-context-card">'
    +'<div class="gantt-detail-label">청구 요약</div>'
    +'<div class="gantt-detail-value">청구: '+esc(status)+(amount?' · '+formatGanttCurrency(amount):'')+'</div>'
    +'<div class="gantt-detail-meta">'+esc(linkedContract?.contract_name?'연결 계약: '+linkedContract.contract_name:'연결 계약 없음')+'</div>'
    +'<button type="button" class="pd-link-action" onclick="setGanttDetailTab(\'billing\')">Billing 탭에서 관리</button>'
  +'</div>';
}

function renderProjectDetailNotesPreview(project){
  const memo=getProjectDetailMemoPreview(project);
  return '<div class="pd-ov-section">'
    +'<div class="pd-ov-section-head pd-ov-section-head-row">'
      +'<div><h3>최근 메모</h3><p>Overview에서는 미리보기만 보여주고, 작성과 관리는 Notes 탭에서 합니다.</p></div>'
      +'<div class="pd-link-actions"><button type="button" class="pd-link-action" onclick="setGanttDetailTab(\'memo\')">Notes 탭에서 기록</button></div>'
    +'</div>'
    +(memo
      ?'<div class="pd-memo-box"><div class="pd-memo-text">'+esc(truncateText(memo,180))+'</div><div class="pd-memo-footer"><span>Notes preview</span></div></div>'
      :'<div class="pd-memo-box pd-memo-box--empty"><div class="pd-memo-text">아직 표시할 메모가 없습니다.</div><div class="pd-memo-footer"><span>Notes 탭에서 첫 메모를 남길 수 있습니다.</span></div></div>')
  +'</div>';
}

renderGanttProjectOverviewSection=function(project,client,linkedContract,projectMembers,memberSchedules,billingStatus,billingAmount){
  const scheduleTone=(memberSchedules||[]).length?'is-warn':'';
  const scheduleSummary=(memberSchedules||[]).length?getGanttDetailConflictSummary(memberSchedules):'조정 필요 없음';
  const executionSignals=getGanttOverviewExecutionSignals(project);
  return ''
    +'<div class="gantt-detail-pane gantt-overview-pane">'
      +'<div class="gantt-detail-section gantt-detail-section--flush gantt-overview-section">'
        +'<div class="gantt-detail-section-head"><div><div class="gantt-panel-title">프로젝트 요약</div><div class="gantt-detail-meta">각 상세 탭의 핵심 상태만 빠르게 확인합니다.</div></div></div>'
        +'<div class="gantt-detail-grid gantt-detail-grid--overview">'
          +'<div class="gantt-detail-summary-card"><div class="gantt-detail-label">거래처</div><div class="gantt-detail-value">'+esc(client?.name||'거래처 미지정')+'</div></div>'
          +'<div class="gantt-detail-summary-card"><div class="gantt-detail-label">연결 계약</div><div class="gantt-detail-value">'+esc(linkedContract?.contract_name||'계약 없음')+'</div>'+(linkedContract?.contract_amount?'<div class="gantt-detail-meta">'+formatGanttCurrency(linkedContract.contract_amount)+'</div>':'')+'</div>'
          +'<div class="gantt-detail-summary-card"><div class="gantt-detail-label">기간</div><div class="gantt-detail-value">'+esc((project.start||'')+' ~ '+(project.end||''))+'</div></div>'
          +'<div class="gantt-detail-summary-card"><div class="gantt-detail-label">담당자</div><div class="gantt-detail-value">'+esc(projectMembers.join(', ')||'담당자 미지정')+'</div></div>'
        +'</div>'
      +'</div>'
      +'<div class="gantt-overview-context-grid">'
        +renderProjectDetailBillingSummary(project,linkedContract,billingStatus,billingAmount)
        +'<div class="gantt-overview-context-card '+scheduleTone+'"><div class="gantt-detail-label">일정 / 조정</div><div class="gantt-detail-value">'+esc(scheduleSummary)+'</div><div class="gantt-detail-meta">'+((memberSchedules||[]).length?'개인 일정 '+memberSchedules.length+'건 확인':'현재 조정 필요한 개인 일정 없음')+'</div></div>'
      +'</div>'
      +'<div class="gantt-detail-section gantt-overview-section">'
        +'<div class="gantt-detail-section-head"><div><div class="gantt-panel-title">실행 요약</div><div class="gantt-detail-meta">업무, 지연, 이슈, 다음 마감만 요약합니다. 상세 관리는 Work / Issues 탭에서 이어집니다.</div></div></div>'
        +'<div class="gantt-overview-signal-grid">'
          +executionSignals.map(item=>'<div class="gantt-overview-signal-card is-'+item.tone+'"><div class="gantt-detail-label">'+esc(item.label)+'</div><div class="gantt-detail-value">'+esc(item.value)+'</div><div class="gantt-detail-meta">'+esc(item.meta)+'</div></div>').join('')
        +'</div>'
      +'</div>'
      +renderProjectDetailNotesPreview(project)
    +'</div>';
};

renderGanttProjectBillingSection=function(project,linkedContract,billingStatus,billingAmount){
  const billable=project?.is_billable!==false;
  const effectiveStatus=billable?String(billingStatus||project?.billing_status||'미청구').trim():'비청구';
  const amount=Number(billingAmount||project?.billing_amount||0);
  const contractAmount=Number(linkedContract?.contract_amount||0);
  const note=String(project?.billing_note||'').trim();
  return ''
    +'<div class="gantt-detail-pane gantt-billing-pane">'
      +'<div class="pd-tab-panel">'
        +'<div class="pd-ov-section">'
          +'<div class="pd-ov-section-head pd-ov-section-head-row"><div><h3>청구 정보</h3><p>청구 여부, 상태, 금액, 계약 참조와 청구 메모를 이 탭에서 관리합니다.</p></div><button type="button" class="btn primary sm" onclick="openBillingQuickEditModal(\''+project.id+'\')">청구 정보 수정</button></div>'
          +'<div class="pd-billing-grid">'
            +'<div class="pd-billing-card '+(billable?'is-pending':'')+'"><div class="pd-billing-label">청구 여부</div><div class="pd-billing-value">'+(billable?'청구 대상':'비청구')+'</div><div class="pd-billing-sub">'+(billable?'프로젝트 청구 관리 대상입니다.':'청구 관리 대상에서 제외되어 있습니다.')+'</div></div>'
            +'<div class="pd-billing-card '+(effectiveStatus==='미청구'?'is-pending':'is-done')+'"><div class="pd-billing-label">청구 상태</div><div class="pd-billing-value"><span class="pd-billing-pill '+(effectiveStatus==='미청구'?'is-pending':'is-done')+'">'+esc(effectiveStatus)+'</span></div><div class="pd-billing-sub">현재 프로젝트 청구 상태</div></div>'
            +'<div class="pd-billing-card"><div class="pd-billing-label">프로젝트 금액</div><div class="pd-billing-value">'+(amount?formatGanttCurrency(amount):'미입력')+'</div><div class="pd-billing-sub">프로젝트 기준 청구 금액</div></div>'
            +'<div class="pd-billing-card"><div class="pd-billing-label">연결 계약</div><div class="pd-billing-value">'+esc(linkedContract?.contract_name||'계약 없음')+'</div><div class="pd-billing-sub">'+(contractAmount?'계약금액 '+formatGanttCurrency(contractAmount):'참조할 계약금액 없음')+'</div></div>'
            +'<div class="pd-billing-card is-full"><div class="pd-billing-label">청구 메모</div><div class="pd-billing-value">'+esc(note||'등록된 청구 메모가 없습니다.')+'</div><div class="pd-billing-sub">인보이스 기준, 비청구 사유, 특이사항</div></div>'
          +'</div>'
        +'</div>'
      +'</div>'
    +'</div>';
};

renderGanttProjectMemoSection=function(project){
  return ''
    +'<div class="gantt-detail-pane gantt-notes-pane">'
      +'<div class="pd-tab-panel">'
        +'<div class="pd-ov-section">'
          +'<div class="pd-ov-section-head pd-ov-section-head-row"><div><h3>Notes / 메모</h3><p>프로젝트 진행 상황, 요청사항, 인수인계 메모를 이 탭에서만 기록합니다.</p></div></div>'
          +'<div id="projectCommentSection"><div class="comment-system">메모를 불러오는 중입니다.</div></div>'
        +'</div>'
      +'</div>'
    +'</div>';
};

renderGanttDetailPanel=function(projs,schs){
  const el=document.getElementById('ganttDetail');
  if(!el)return;
  if(ganttDetailTab==='checklist')ganttDetailTab='overview';
  const project=(projs||[]).find(item=>String(item?.id||'')===String(ganttFocusProjectId||''))||null;
  if(!project){
    const placeholderKey='placeholder:'+String(ganttFocusProjectId||'');
    if(el.dataset.renderSignature===placeholderKey)return;
    destroyGanttChecklistAssigneeComboboxes();
    el.classList.remove('is-open');
    el.dataset.projectId='';
    el.dataset.activeTab='';
    el.innerHTML=renderGanttDetailPlaceholder();
    el.dataset.renderSignature=placeholderKey;
    return;
  }
  const renderSignature=getGanttDetailRenderSignature(projs);
  if(el.dataset.renderSignature===renderSignature)return;
  destroyGanttChecklistAssigneeComboboxes();
  el.classList.add('is-open');
  el.dataset.projectId=String(project.id||'');
  el.dataset.activeTab=String(ganttDetailTab||'overview');
  ensureGanttProjectLifecycleSupport(project.id);
  const client=clients.find(c=>c.id===project.client_id)||null;
  const projectMembers=project.members||[];
  const memberSchedules=getGanttProjectConflictSchedules(project);
  const billingStatus=project.is_billable!==false?(project.billing_status||'미청구'):'비청구';
  const billingAmount=getGanttProjectBillingAmount(project);
  const linkedContract=getGanttDetailLinkedContract(project);
  const lifecycleMeta=getGanttProjectCurrentLifecycleMeta(project);
  if(ganttDetailTab==='overview'){
    if(ganttListTaskSummaryByProjectId[String(project.id||'')]===undefined)loadGanttListTaskSummaries([project.id]);
    if(ganttListTaskIssueSummaryByProjectId[String(project.id||'')]===undefined)loadGanttListTaskIssueSummaries([project.id]);
  }
  let sectionHtml=renderGanttProjectOverviewSection(project,client,linkedContract,projectMembers,memberSchedules,billingStatus,billingAmount);
  if(ganttDetailTab==='work')sectionHtml=renderGanttProjectWorkSection(project,memberSchedules);
  else if(ganttDetailTab==='issues')sectionHtml=renderGanttProjectIssuesSection(project);
  else if(ganttDetailTab==='billing')sectionHtml=renderGanttProjectBillingSection(project,linkedContract,billingStatus,billingAmount);
  else if(ganttDetailTab==='documents')sectionHtml=renderGanttProjectDocumentsSection(project);
  else if(ganttDetailTab==='memo')sectionHtml=renderGanttProjectMemoSection(project);
  el.innerHTML=''
    +'<div class="pd-proj-card">'
      +'<div class="pd-proj-top">'
        +'<div class="pd-proj-main">'
          +'<div class="pd-proj-label">현재 선택한 프로젝트 상세</div>'
          +'<div class="pd-proj-title">'+esc(project.name||'프로젝트')+'</div>'
          +'<div class="pd-proj-client">'+esc(client?.name||'고객사 미지정')+'</div>'
        +'</div>'
        +'<div class="pd-proj-actions">'
          +'<button type="button" class="btn sm" onclick="openProjModal(\''+project.id+'\',null,null,\'basic\')">프로젝트 설정</button>'
          +'<button type="button" class="btn ghost sm" onclick="handleProjectOutlookEvent(\''+project.id+'\')">Outlook 추가</button>'
          +'<button type="button" class="btn ghost sm" onclick="closeGanttProjectDetail()">목록으로 돌아가기</button>'
        +'</div>'
      +'</div>'
      +'<div class="pd-proj-meta-row">'
        +'<span class="pd-status-pill '+getGanttListStatusBadgeClass(lifecycleMeta?.label||'진행중')+'">'+esc(lifecycleMeta?.label||'진행중')+'</span>'
        +'<span class="pd-meta-text">담당 · <b>'+esc(projectMembers.join(', ')||'미배정')+'</b></span>'
        +'<span class="pd-meta-text">기간 · <b>'+esc((project.start||'')+' ~ '+(project.end||''))+'</b></span>'
      +'</div>'
    +'</div>'
    +renderGanttProjectLifecycleActionPanel(project)
    +renderGanttDetailTabBar()
    +sectionHtml;
  loadGanttDetailAsync(project);
  if(ganttDetailTab==='work')loadGanttProjectTasks(project.id);
  if(ganttDetailTab==='documents')loadGanttProjectQc(project.id);
  if(ganttDetailTab==='memo')loadProjectComments(project.id);
  el.dataset.renderSignature=renderSignature;
};
