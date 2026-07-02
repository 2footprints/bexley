function buildContractReminderText(record, contract, client){
  const contactName=client?.contact_name||contract?.counterparty_contact_name||'담당자';
  const amount=Number(record?.amount||0).toLocaleString()+'원';
  const billingDate=record?.billing_date||'청구일 미지정';
  const expectedDate=record?.expected_collection_date?'예상 수금일은 '+record.expected_collection_date+'로 확인하고 있습니다. ':'';
  return ''
    +'[리마인드 메일 초안]\n\n'
    +'안녕하세요 '+contactName+'님,\n'
    +(client?.name?client.name+' ':'')
    +(contract?.contract_name||'계약')+' 관련 청구 건('+amount+', 청구일 '+billingDate+') 확인 부탁드립니다.\n'
    +expectedDate
    +'수금 일정이나 확인 상태를 회신 주시면 감사하겠습니다.';
}

function getContractDocumentCategoryOptions(selected=''){
  return ['','계약서','세금계산서','정산자료','가이드','기타']
    .map(option=>'<option value="'+option+'"'+(selected===option?' selected':'')+'>'+(option||'카테고리 선택')+'</option>')
    .join('');
}

function openRenewalContractFromDetail(contractId){
  const ct=contracts.find(x=>x.id===contractId);
  if(!ct)return;
  openContractModal(null,ct.client_id,contractId);
}

function openContractBillingReminderModal(recordId, contractId){
  const record=contractDetailBillingRecords.find(item=>item.id===recordId);
  if(!record)return;
  const contract=contracts.find(item=>item.id===record.contract_id)||contracts.find(item=>item.id===contractId)||null;
  const client=clients.find(item=>item.id===contract?.client_id)||null;
  const text=buildContractReminderText(record,contract,client);
  document.getElementById('modalArea').innerHTML=
    getInputModalOverlayHtml()
    +'<div class="modal" style="width:560px"><div class="modal-title">리마인드 메일 생성</div>'
    +'<div class="form-row"><label class="form-label">거래처</label><input value="'+esc(client?.name||'거래처 미지정')+'" readonly style="background:var(--bg)"/></div>'
    +'<div class="form-row"><label class="form-label">계약</label><input value="'+esc(contract?.contract_name||'계약명 없음')+'" readonly style="background:var(--bg)"/></div>'
    +'<div class="form-half"><div class="form-row"><label class="form-label">청구 금액</label><input value="'+esc(Number(record.amount||0).toLocaleString()+'원')+'" readonly style="background:var(--bg)"/></div>'
    +'<div class="form-row"><label class="form-label">예상 수금일</label><input value="'+esc(record.expected_collection_date||'-')+'" readonly style="background:var(--bg)"/></div></div>'
    +'<div class="form-row"><label class="form-label">문안</label><textarea id="contractReminderText" rows="9" class="copy-area">'+esc(text)+'</textarea></div>'
    +'<div class="modal-footer"><div class="muted">문안을 복사하면 마지막 리마인드 시각이 함께 기록됩니다.</div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">닫기</button><button class="btn primary" onclick="copyContractBillingReminder(\''+recordId+'\',\''+(contractId||record.contract_id||'')+'\')">문안 복사</button></div></div>'
    +'</div></div>';
  lockBodyScroll();
  bindModalEscapeHandler();
}

async function copyContractBillingReminder(recordId, contractId){
  const record=contractDetailBillingRecords.find(item=>item.id===recordId);
  if(!record)return;
  const text=document.getElementById('contractReminderText')?.value||buildContractReminderText(record,contracts.find(item=>item.id===record.contract_id),clients.find(item=>item.id===contracts.find(contract=>contract.id===record.contract_id)?.client_id));
  await copyText(text);
  const remindedAt=new Date().toISOString();
  try{
    await api('PATCH','billing_records?id=eq.'+recordId,{last_reminder_at:remindedAt});
    const target=contractDetailBillingRecords.find(item=>item.id===recordId);
    if(target)target.last_reminder_at=remindedAt;
    if(typeof invalidateContractBillingRecordsCache==='function')invalidateContractBillingRecordsCache();
  }catch(e){}
  closeModal();
  await openContractDetail(contractId||record.contract_id);
}

function openContractDocumentModal(contractId, docId){
  const doc=docId?contractDetailDocuments.find(item=>item.id===docId):null;
  document.getElementById('modalArea').innerHTML=
    getInputModalOverlayHtml()
    +'<div class="modal" style="width:500px"><div class="modal-title">'+(doc?'계약 문서 수정':'계약 문서 추가')+'</div>'
    +'<div class="form-row"><label class="form-label">제목</label><input id="contractDocTitle" value="'+esc(doc?.title||'')+'" placeholder="예) 계약서 원본"/></div>'
    +'<div class="form-row"><label class="form-label">링크</label><input id="contractDocUrl" value="'+esc(doc?.url||'')+'" placeholder="https://..."/></div>'
    +'<div class="form-row"><label class="form-label">카테고리</label><select id="contractDocCategory">'+getContractDocumentCategoryOptions(doc?.category||'')+'</select></div>'
    +'<div class="modal-footer">'
    +(doc?'<button class="btn danger" onclick="deleteContractDocument(\''+contractId+'\',\''+doc.id+'\')">삭제</button>':'<div></div>')
    +'<div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">취소</button><button class="btn primary" onclick="saveContractDocument(\''+contractId+'\',\''+(docId||'')+'\')">저장</button></div></div>'
    +'</div></div>';
  lockBodyScroll();
  bindModalEscapeHandler();
}

async function saveContractDocument(contractId, docId){
  const title=document.getElementById('contractDocTitle')?.value.trim()||'';
  const url=document.getElementById('contractDocUrl')?.value.trim()||'';
  if(!title||!url){alert('문서 제목과 링크를 입력해주세요.');return;}
  const body={
    contract_id:contractId,
    title,
    url,
    category:document.getElementById('contractDocCategory')?.value||null
  };
  try{
    if(docId)await api('PATCH','contract_documents?id=eq.'+docId,body);
    else await api('POST','contract_documents',{...body,created_by:currentUser?.id||null});
    closeModal();
    await openContractDetail(contractId);
  }catch(e){alert('문서 저장 오류: '+e.message);}
}

async function deleteContractDocument(contractId, docId){
  if(!confirm('문서 링크를 삭제할까요?'))return;
  try{
    await api('DELETE','contract_documents?id=eq.'+docId);
    closeModal();
    await openContractDetail(contractId);
  }catch(e){alert('문서 삭제 오류: '+e.message);}
}

function openBillingRecordModal(contractId, editId){
  const rec=editId?contractDetailBillingRecords.find(item=>item.id===editId):null;
  const today=new Date().toISOString().slice(0,10);
  document.getElementById('modalArea').innerHTML=
    getInputModalOverlayHtml()
    +'<div class="modal" style="width:420px"><div class="modal-title">'+(editId?'청구 내역 수정':'청구 추가')+'</div>'
    +'<div class="form-half">'
    +'<div class="form-row"><label class="form-label">청구 금액 (원)</label><input id="brAmt" type="number" value="'+(rec&&rec.amount?rec.amount:'')+'" placeholder="예) 5000000" autofocus/></div>'
    +'<div class="form-row"><label class="form-label">청구일</label><input id="brDate" type="date" value="'+(rec?rec.billing_date||today:today)+'"/></div>'
    +'</div>'
    +'<div class="form-row"><label class="form-label">상태</label>'
    +'<select id="brStatus">'+BILLING_RECORD_STATUS_OPTIONS.map(s=>'<option value="'+s+'" '+(rec&&rec.status===s?'selected':'')+'>'+s+'</option>').join('')+'</select></div>'
    +'<div class="form-row"><label class="form-label">예상 수금일</label><input id="brExpectedDate" type="date" value="'+(rec?rec.expected_collection_date||'':'')+'"/></div>'
    +'<div class="form-row"><label class="form-label">메모</label><input id="brMemo" value="'+esc(rec?rec.memo||'':'')+'" placeholder="세금계산서 번호, 비고 등"/></div>'
    +'<div class="modal-footer"><div></div>'
    +'<div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">취소</button>'
    +'<button class="btn primary" data-cid="'+(contractId||'')+'" data-id="'+(editId||'')+'" onclick="saveBillingRecord(this.dataset.cid,this.dataset.id)">저장</button>'
    +'</div></div></div></div>';
  lockBodyScroll();
  bindModalEscapeHandler();
}

async function saveBillingRecord(contractId, editId){
  const amt=document.getElementById('brAmt').value;
  if(!amt||isNaN(amt)){alert('금액을 입력해주세요.');return;}
  const body={
    contract_id:contractId,
    amount:parseInt(amt),
    billing_date:document.getElementById('brDate').value||null,
    status:document.getElementById('brStatus').value,
    expected_collection_date:document.getElementById('brExpectedDate').value||null,
    memo:document.getElementById('brMemo').value.trim()||null
  };
  try{
    if(editId)await api('PATCH','billing_records?id=eq.'+editId,body);
    else await api('POST','billing_records',body);
    if(typeof invalidateContractBillingRecordsCache==='function')invalidateContractBillingRecordsCache();
    if(body.status==='수금완료'&&typeof notifyContractCollectionCompleted==='function')await notifyContractCollectionCompleted(contractId,body.amount);
    closeModal();
    await openContractDetail(contractId);
  }catch(e){alert('저장 오류: '+e.message);}
}

async function toggleBillingStatus(recId, contractId, currentStatus){
  const newStatus=currentStatus==='수금완료'?'미수금':'수금완료';
  try{
    await api('PATCH','billing_records?id=eq.'+recId,{status:newStatus});
    if(typeof invalidateContractBillingRecordsCache==='function')invalidateContractBillingRecordsCache();
    if(newStatus==='수금완료'){
      const record=contractDetailBillingRecords.find(item=>item.id===recId);
      if(typeof notifyContractCollectionCompleted==='function')await notifyContractCollectionCompleted(contractId,record?.amount||0);
    }
    await openContractDetail(contractId);
  }catch(e){alert('오류: '+e.message);}
}

async function deleteBillingRecord(recId, contractId){
  if(!confirm('청구 내역을 삭제할까요?'))return;
  try{
    await api('DELETE','billing_records?id=eq.'+recId);
    if(typeof invalidateContractBillingRecordsCache==='function')invalidateContractBillingRecordsCache();
    await openContractDetail(contractId);
  }catch(e){alert('오류: '+e.message);}
}
