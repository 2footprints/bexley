const DOCUMENT_REQUEST_STATUS_META={
  pending:{label:'요청중',badgeClass:'badge-gray'},
  uploaded:{label:'제출완료',badgeClass:'badge-blue'},
  confirmed:{label:'확인완료 ✓',badgeClass:'badge-green'}
};

let documentRequestsCurrentProjectId='';
let documentRequestsItems=[];

function getDocumentRequestEscaper(){
  return typeof esc==='function'
    ?esc
    :value=>String(value??'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
}

function getDocumentRequestStatusMeta(status){
  const key=String(status||'pending').trim();
  return DOCUMENT_REQUEST_STATUS_META[key]||DOCUMENT_REQUEST_STATUS_META.pending;
}

function getDocumentRequestMount(){
  return document.getElementById('projDocumentRequestList')
    ||document.getElementById('tab-document-requests')
    ||document.getElementById('documentRequestsWrap')
    ||document.getElementById('projectDocumentRequestsWrap')
    ||document.getElementById('projectDocumentsTab')
    ||document.getElementById('documentsTabWrap')
    ||document.getElementById('ganttDetailDocumentList');
}

function escapeDocumentRequestJsValue(value){
  return String(value||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}

function isDocumentRequestSchemaError(error){
  const message=String(error?.message||error||'');
  return /schema cache|Could not find the .* column/i.test(message);
}

async function apiDocumentRequestWithSchemaRetry(method,path,body,optionalColumns=[]){
  try{
    return await api(method,path,body);
  }catch(error){
    if(!body||!optionalColumns.length||!isDocumentRequestSchemaError(error))throw error;
    const safeBody={...body};
    optionalColumns.forEach(column=>delete safeBody[column]);
    return await api(method,path,safeBody);
  }
}

async function loadDocumentRequests(projectId){
  const safeProjectId=String(projectId||'').trim();
  documentRequestsCurrentProjectId=safeProjectId;
  if(!safeProjectId){
    renderDocumentRequests([]);
    return [];
  }
  try{
    const rows=await api('GET','document_requests?project_id=eq.'+safeProjectId+'&order=sort_order.asc');
    documentRequestsItems=Array.isArray(rows)?rows:[];
    renderDocumentRequests(documentRequestsItems);
    return documentRequestsItems;
  }catch(error){
    console.error('[document-requests] load failed',error);
    documentRequestsItems=[];
    renderDocumentRequests([]);
    alert('자료 요청을 불러오지 못했습니다.');
    return [];
  }
}

function renderDocumentRequests(items){
  const el=getDocumentRequestMount();
  if(!el)return;
  const safeEsc=getDocumentRequestEscaper();
  const rows=Array.isArray(items)?items:[];
  const totalCount=rows.length;
  const confirmedCount=rows.filter(item=>String(item?.status||'').trim()==='confirmed').length;
  const projectId=documentRequestsCurrentProjectId;
  const tableHtml=totalCount
    ?'<div class="table-wrap document-request-table-wrap">'
      +'<table class="document-request-table">'
        +'<thead><tr><th>자료명</th><th>회수 희망일</th><th>상태</th><th>액션</th></tr></thead>'
        +'<tbody>'
          +rows.map(item=>{
            const statusMeta=getDocumentRequestStatusMeta(item?.status);
            const requestIdJs=escapeDocumentRequestJsValue(item?.id);
            const projectIdJs=escapeDocumentRequestJsValue(item?.project_id||projectId);
            const canConfirm=String(item?.status||'').trim()==='uploaded';
            return '<tr>'
              +'<td>'
                +'<div class="document-request-title">'+safeEsc(item?.title||'자료명 없음')+'</div>'
                +(item?.description?'<div class="document-request-description">'+safeEsc(item.description)+'</div>':'')
                +(item?.upload_note?'<div class="document-request-description">'+safeEsc(item.upload_note)+'</div>':'')
                +(item?.upload_link?'<a class="document-request-link" href="'+safeEsc(item.upload_link)+'" target="_blank" rel="noopener noreferrer">제출 링크 열기</a>':'')
              +'</td>'
              +'<td>'+safeEsc(item?.due_date||'-')+'</td>'
              +'<td><span class="badge '+statusMeta.badgeClass+'">'+safeEsc(statusMeta.label)+'</span></td>'
              +'<td>'
                +'<div class="document-request-actions">'
                  +(canConfirm?'<button type="button" class="btn sm" onclick="confirmDocumentRequest(\''+requestIdJs+'\',\''+projectIdJs+'\')">확인완료</button>':'')
                  +'<button type="button" class="btn ghost sm" onclick="deleteDocumentRequest(\''+requestIdJs+'\',\''+projectIdJs+'\')">삭제</button>'
                +'</div>'
              +'</td>'
            +'</tr>';
          }).join('')
        +'</tbody>'
      +'</table>'
    +'</div>'
    :'<div class="empty-state">등록된 자료 요청이 없습니다.</div>';
  const projectIdJs=escapeDocumentRequestJsValue(projectId);
  el.innerHTML=''
    +'<div class="document-request-summary">'
      +'<div class="document-request-progress-label">확인완료 '+confirmedCount+'건 / 전체 '+totalCount+'건</div>'
      +'<progress class="document-request-progress" value="'+confirmedCount+'" max="'+Math.max(totalCount,1)+'"></progress>'
    +'</div>'
    +tableHtml
    +'<div class="document-request-footer">'
      +'<button type="button" class="btn primary sm" onclick="openDocumentRequestModal(\''+projectIdJs+'\')">+ 자료 요청 추가</button>'
    +'</div>';
}

function openDocumentRequestModal(projectId){
  const safeProjectId=String(projectId||documentRequestsCurrentProjectId||'').trim();
  if(!safeProjectId){
    alert('프로젝트를 먼저 선택해 주세요.');
    return;
  }
  const safeEsc=getDocumentRequestEscaper();
  const overlayHtml=typeof getInputModalOverlayHtml==='function'
    ?getInputModalOverlayHtml()
    :'<div class="overlay" data-modal-kind="input" data-backdrop-close="off">';
  const modalArea=document.getElementById('modalArea');
  if(!modalArea)return;
  const projectIdJs=escapeDocumentRequestJsValue(safeProjectId);
  modalArea.innerHTML=''
    +overlayHtml
      +'<div class="modal ui-modal-540">'
        +'<div class="modal-header">'
          +'<div><div class="modal-title">자료 요청 추가</div><div class="modal-sub">프로젝트 진행에 필요한 고객 제출 자료를 등록합니다.</div></div>'
          +'<button type="button" class="icon-btn" onclick="openProjModal(\''+projectIdJs+'\',null,null,\'document-requests\')">×</button>'
        +'</div>'
        +'<div class="form-row"><label class="form-label">자료명 *</label><input id="documentRequestTitle" value="" placeholder="'+safeEsc('예: 2025년 12월 매출원장')+'"></div>'
        +'<div class="form-row"><label class="form-label">상세 설명</label><textarea id="documentRequestDescription" class="project-modal-memo" rows="3" placeholder="'+safeEsc('요청 배경이나 필요 범위를 적어주세요.')+'"></textarea></div>'
        +'<div class="form-row"><label class="form-label">회수 희망일</label><input id="documentRequestDueDate" type="date" value=""></div>'
        +'<div class="modal-footer">'
          +'<div class="muted">저장하면 자료요청 목록에 요청중 상태로 표시됩니다.</div>'
          +'<div class="modal-footer-right">'
            +'<button type="button" class="btn ghost" onclick="openProjModal(\''+projectIdJs+'\',null,null,\'document-requests\')">취소</button>'
            +'<button type="button" class="btn primary" onclick="saveDocumentRequest(\''+projectIdJs+'\')">저장</button>'
          +'</div>'
        +'</div>'
      +'</div>'
    +'</div>';
  if(typeof lockBodyScroll==='function')lockBodyScroll();
  if(typeof bindModalEscapeHandler==='function')bindModalEscapeHandler();
}

async function saveDocumentRequest(projectId){
  const safeProjectId=String(projectId||documentRequestsCurrentProjectId||'').trim();
  const title=String(document.getElementById('documentRequestTitle')?.value||'').trim();
  const description=String(document.getElementById('documentRequestDescription')?.value||'').trim();
  const dueDate=String(document.getElementById('documentRequestDueDate')?.value||'').trim();
  if(!safeProjectId){
    alert('프로젝트를 먼저 선택해 주세요.');
    return;
  }
  if(!title){
    alert('자료명을 입력해 주세요.');
    return;
  }
  const body={
    project_id:safeProjectId,
    title,
    description:description||null,
    due_date:dueDate||null,
    status:'pending',
    sort_order:0
  };
  try{
    await apiDocumentRequestWithSchemaRetry('POST','document_requests',body,['description']);
    if(typeof openProjModal==='function'){
      openProjModal(safeProjectId,null,null,'document-requests');
      setTimeout(()=>loadDocumentRequests(safeProjectId),50);
    }else{
      if(typeof closeModal==='function')closeModal();
      await loadDocumentRequests(safeProjectId);
    }
  }catch(error){
    console.error('[document-requests] save failed',error);
    alert('자료 요청 저장에 실패했습니다.');
  }
}

async function confirmDocumentRequest(requestId,projectId){
  const safeRequestId=String(requestId||'').trim();
  const safeProjectId=String(projectId||documentRequestsCurrentProjectId||'').trim();
  if(!safeRequestId)return;
  try{
    await apiDocumentRequestWithSchemaRetry(
      'PATCH',
      'document_requests?id=eq.'+safeRequestId,
      {status:'confirmed',confirmed_at:new Date().toISOString()},
      ['confirmed_at']
    );
    await loadDocumentRequests(safeProjectId);
  }catch(error){
    console.error('[document-requests] confirm failed',error);
    alert('자료 요청 확인완료 처리에 실패했습니다.');
  }
}

async function deleteDocumentRequest(requestId,projectId){
  const safeRequestId=String(requestId||'').trim();
  const safeProjectId=String(projectId||documentRequestsCurrentProjectId||'').trim();
  if(!safeRequestId)return;
  if(!confirm('이 자료 요청을 삭제할까요?'))return;
  try{
    await api('DELETE','document_requests?id=eq.'+safeRequestId);
    await loadDocumentRequests(safeProjectId);
  }catch(error){
    console.error('[document-requests] delete failed',error);
    alert('자료 요청 삭제에 실패했습니다.');
  }
}

window.loadDocumentRequests=loadDocumentRequests;
window.renderDocumentRequests=renderDocumentRequests;
window.openDocumentRequestModal=openDocumentRequestModal;
window.saveDocumentRequest=saveDocumentRequest;
window.confirmDocumentRequest=confirmDocumentRequest;
window.deleteDocumentRequest=deleteDocumentRequest;
