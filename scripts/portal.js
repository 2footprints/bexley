const PORTAL_DOCUMENT_STATUS_META={
  pending:{label:'미제출',badgeClass:'badge-gray'},
  uploaded:{label:'제출완료',badgeClass:'badge-blue'},
  confirmed:{label:'확인완료 ✓',badgeClass:'badge-green'}
};

let portalDocumentRequestsCurrentProjectId='';
let portalDocumentSubmitFormId='';
let portalAdminAddFormOpen=false;

function getPortalEscaper(){
  return typeof esc==='function'
    ?esc
    :value=>String(value??'')
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;')
      .replace(/'/g,'&#39;');
}

function escapePortalJsValue(value){
  return String(value||'').replace(/\\/g,'\\\\').replace(/'/g,"\\'");
}

function getPortalDocumentStatusMeta(status){
  const key=String(status||'pending').trim();
  return PORTAL_DOCUMENT_STATUS_META[key]||PORTAL_DOCUMENT_STATUS_META.pending;
}

function isPortalAdminView(){
  return typeof portalPreviewMode!=='undefined'&&portalPreviewMode===true;
}

async function loadPortalDocumentRequests(projectId){
  const safeProjectId=String(projectId||'').trim();
  portalDocumentRequestsCurrentProjectId=safeProjectId;
  const el=document.getElementById('portal-document-requests');
  if(!el)return [];
  if(!safeProjectId){
    renderPortalDocumentRequests([]);
    return [];
  }
  try{
    const rows=await api('GET','document_requests?project_id=eq.'+safeProjectId+'&order=sort_order.asc');
    const items=Array.isArray(rows)?rows:[];
    renderPortalDocumentRequests(items);
    return items;
  }catch(error){
    console.error('[portal] document request load failed',error);
    renderPortalDocumentRequests([]);
    return [];
  }
}

function renderPortalDocumentRequests(items){
  const el=document.getElementById('portal-document-requests');
  if(!el)return;
  const safeEsc=getPortalEscaper();
  const rows=Array.isArray(items)?items:[];
  const totalCount=rows.length;
  const completedCount=rows.filter(item=>{
    const status=String(item?.status||'').trim();
    return status==='uploaded'||status==='confirmed';
  }).length;
  const projectId=portalDocumentRequestsCurrentProjectId;
  const projectIdJs=escapePortalJsValue(projectId);
  const adminView=isPortalAdminView();

  const listHtml=rows.length
    ?'<div class="portal-doc-list">'
      +rows.map(item=>{
        const requestId=String(item?.id||'');
        const requestIdJs=escapePortalJsValue(requestId);
        const title=String(item?.title||'자료명 없음');
        const titleJs=escapePortalJsValue(title);
        const status=String(item?.status||'pending').trim();
        const meta=getPortalDocumentStatusMeta(status);
        const isFormOpen=!adminView&&portalDocumentSubmitFormId===requestId&&status==='pending';
        let actionHtml;
        if(adminView){
          actionHtml='<button type="button" class="btn ghost sm portal-doc-delete-btn" onclick="deletePortalDocumentRequest(\''+requestIdJs+'\',\''+projectIdJs+'\')" title="삭제">🗑</button>';
        } else {
          actionHtml=status==='pending'
            ?'<button type="button" class="btn sm" onclick="openPortalSubmitForm(\''+requestIdJs+'\',\''+projectIdJs+'\')">제출 완료</button>'
            :status==='uploaded'
              ?'<span class="portal-doc-disabled">제출완료</span>'
              :'';
        }
        return '<div class="portal-doc-item">'
          +'<div class="portal-doc-row">'
            +'<div class="portal-doc-main">'
              +'<div class="portal-doc-title">'+safeEsc(title)+'</div>'
              +'<div class="portal-doc-date">회수 희망일 '+safeEsc(item?.due_date||'-')+'</div>'
            +'</div>'
            +'<div class="portal-doc-side">'
              +'<span class="badge '+meta.badgeClass+' portal-doc-status">'+safeEsc(meta.label)+'</span>'
              +actionHtml
            +'</div>'
          +'</div>'
          +(isFormOpen?renderPortalSubmitFormMarkup(requestIdJs,projectIdJs,titleJs):'')
        +'</div>';
      }).join('')
    +'</div>'
    :'<div class="portal-empty">요청된 자료가 없습니다.</div>';

  const adminToolbarHtml=adminView
    ?'<div class="portal-doc-admin-toolbar">'
      +(portalAdminAddFormOpen
        ?renderPortalAdminAddFormMarkup(projectIdJs)
        :'<button type="button" class="btn sm" onclick="openPortalAdminRequestModal(\''+projectIdJs+'\')">+ 자료 요청 추가</button>')
    +'</div>'
    :'';

  el.innerHTML=''
    +'<div class="portal-doc-summary">'
      +'<div class="portal-doc-summary-label">자료 제출 현황: '+completedCount+'건 완료 / 전체 '+totalCount+'건</div>'
      +'<progress class="portal-doc-progress" value="'+completedCount+'" max="'+Math.max(totalCount,1)+'"></progress>'
    +'</div>'
    +adminToolbarHtml
    +listHtml;
}

function renderPortalSubmitFormMarkup(requestIdJs,projectIdJs,titleJs){
  return '<div class="portal-doc-submit">'
    +'<div class="form-row"><label class="form-label">메모</label><textarea id="portalDocSubmitNote-'+requestIdJs+'" class="project-modal-memo" rows="3" placeholder="제출 자료에 대한 메모를 적어주세요."></textarea></div>'
    +'<div class="form-row"><label class="form-label">링크</label><input id="portalDocSubmitLink-'+requestIdJs+'" type="text" placeholder="공유 링크를 입력해 주세요."></div>'
    +'<div class="portal-doc-actions">'
      +'<button type="button" class="btn ghost sm" onclick="closePortalSubmitForm(\''+projectIdJs+'\')">취소</button>'
      +'<button type="button" class="btn primary sm" onclick="handlePortalDocumentSubmit(\''+requestIdJs+'\',\''+projectIdJs+'\',\''+titleJs+'\')">제출</button>'
    +'</div>'
  +'</div>';
}

function renderPortalAdminAddFormMarkup(projectIdJs){
  return '<div class="portal-doc-admin-form">'
    +'<div class="form-row"><label class="form-label">자료명 <span style="color:var(--red)">*</span></label><input id="portalAdminReqTitle" type="text" placeholder="요청할 자료명을 입력하세요"></div>'
    +'<div class="form-row"><label class="form-label">상세 설명</label><textarea id="portalAdminReqDesc" rows="2" placeholder="추가 설명 (선택)"></textarea></div>'
    +'<div class="form-row"><label class="form-label">회수 희망일</label><input id="portalAdminReqDue" type="date"></div>'
    +'<div class="portal-doc-actions">'
      +'<button type="button" class="btn ghost sm" onclick="cancelPortalAdminAddForm(\''+projectIdJs+'\')">취소</button>'
      +'<button type="button" class="btn primary sm" onclick="savePortalAdminRequest(\''+projectIdJs+'\')">저장</button>'
    +'</div>'
  +'</div>';
}

function openPortalAdminRequestModal(projectId){
  portalAdminAddFormOpen=true;
  loadPortalDocumentRequests(projectId||portalDocumentRequestsCurrentProjectId);
}

function cancelPortalAdminAddForm(projectId){
  portalAdminAddFormOpen=false;
  loadPortalDocumentRequests(projectId||portalDocumentRequestsCurrentProjectId);
}

async function savePortalAdminRequest(projectId){
  const safeProjectId=String(projectId||portalDocumentRequestsCurrentProjectId||'').trim();
  const title=String(document.getElementById('portalAdminReqTitle')?.value||'').trim();
  if(!title){alert('자료명을 입력해주세요.');return;}
  const description=String(document.getElementById('portalAdminReqDesc')?.value||'').trim()||null;
  const due_date=String(document.getElementById('portalAdminReqDue')?.value||'').trim()||null;
  try{
    await api('POST','document_requests',{
      project_id:safeProjectId,
      title,
      description,
      due_date,
      status:'pending',
      sort_order:0
    });
    portalAdminAddFormOpen=false;
    await loadPortalDocumentRequests(safeProjectId);
  }catch(error){
    console.error('[portal] add request failed',error);
    alert('자료 요청 등록에 실패했습니다.');
  }
}

async function deletePortalDocumentRequest(requestId,projectId){
  const safeProjectId=String(projectId||portalDocumentRequestsCurrentProjectId||'').trim();
  if(!confirm('이 자료 요청을 삭제할까요?'))return;
  try{
    await api('DELETE','document_requests?id=eq.'+String(requestId||''));
    await loadPortalDocumentRequests(safeProjectId);
  }catch(error){
    console.error('[portal] delete request failed',error);
    alert('자료 요청 삭제에 실패했습니다.');
  }
}

function openPortalSubmitForm(requestId,projectId){
  portalDocumentSubmitFormId=String(requestId||'').trim();
  loadPortalDocumentRequests(projectId);
}

function closePortalSubmitForm(projectId){
  portalDocumentSubmitFormId='';
  loadPortalDocumentRequests(projectId||portalDocumentRequestsCurrentProjectId);
}

function handlePortalDocumentSubmit(requestId,projectId,title){
  const note=String(document.getElementById('portalDocSubmitNote-'+requestId)?.value||'').trim();
  const link=String(document.getElementById('portalDocSubmitLink-'+requestId)?.value||'').trim();
  submitDocumentRequest(requestId,projectId,note,link,title);
}

async function submitDocumentRequest(requestId,projectId,note,link,title){
  const safeRequestId=String(requestId||'').trim();
  const safeProjectId=String(projectId||portalDocumentRequestsCurrentProjectId||'').trim();
  if(!safeRequestId||!safeProjectId)return;
  try{
    let requestTitle=String(title||'').trim();
    if(!requestTitle){
      const rows=await api('GET','document_requests?id=eq.'+safeRequestId+'&select=title').catch(()=>[]);
      requestTitle=String(rows?.[0]?.title||'자료').trim();
    }
    await api('PATCH','document_requests?id=eq.'+safeRequestId,{
      status:'uploaded',
      upload_note:String(note||'').trim()||null,
      upload_link:String(link||'').trim()||null
    });
    await notifyDocumentSubmitted(safeRequestId,safeProjectId,requestTitle);
    portalDocumentSubmitFormId='';
    await loadPortalDocumentRequests(safeProjectId);
  }catch(error){
    console.error('[portal] document submit failed',error);
    alert('자료 제출 처리에 실패했습니다.');
  }
}

async function notifyDocumentSubmitted(requestId,projectId,title){
  try{
    await api('POST','notifications',{
      type:'doc_submitted',
      title:'자료 제출 완료',
      message:String(title||'자료')+' 제출 완료',
      link_type:'project',
      link_id:projectId,
      is_read:false
    });
  }catch(error){
    // 알림은 부가기능이므로 실패해도 포털 제출 흐름은 유지합니다.
  }
}

window.loadPortalDocumentRequests=loadPortalDocumentRequests;
window.renderPortalDocumentRequests=renderPortalDocumentRequests;
window.openPortalAdminRequestModal=openPortalAdminRequestModal;
window.cancelPortalAdminAddForm=cancelPortalAdminAddForm;
window.savePortalAdminRequest=savePortalAdminRequest;
window.deletePortalDocumentRequest=deletePortalDocumentRequest;
window.openPortalSubmitForm=openPortalSubmitForm;
window.closePortalSubmitForm=closePortalSubmitForm;
window.handlePortalDocumentSubmit=handlePortalDocumentSubmit;
window.submitDocumentRequest=submitDocumentRequest;
window.notifyDocumentSubmitted=notifyDocumentSubmitted;
