// ── Client Modal ──
function openClientModal(eid){
  if(!canManageCore()){alert('멤버 이상 권한이 필요합니다.');return;}
  editingClientId=eid||null;const c=eid?clients.find(x=>x.id===eid):null;
  const canPortal=canManagePortalSettings();
  const portalMeta=typeof getClientPortalStatusMeta==='function'?getClientPortalStatusMeta(c||{}):{label:(c&&c.portal_email?'활성':'미설정'),tone:(c&&c.portal_email?'active':'empty')};
  const assignedTeamValue=typeof getClientAssignedTeamValue==='function'?getClientAssignedTeamValue(c):String(c?.team_id||'').trim();
  const assignedTeamOptions=typeof buildClientAssignedTeamOptions==='function'
    ?buildClientAssignedTeamOptions(assignedTeamValue)
    :'<option value="">미지정</option>';
  const portalSection=canPortal
    ?'<div class="divider">고객사 포털 설정</div>'
      +'<div class="form-half"><div class="form-row"><label class="form-label">포털 로그인 이메일</label><input id="cPortalEmail" type="email" value="'+(c?c.portal_email||'':'')+'" placeholder="고객사 담당자 이메일"/></div>'
      +'<div class="form-row"><label class="form-label">포털 비밀번호</label><input id="cPortalPw" type="text" value="'+(c?c.portal_password||'':'')+'" placeholder="임시 비밀번호 설정"/></div></div>'
      +'<div class="form-row"><label class="form-label">📁 OneDrive 문서함 URL</label><input id="cOnedrive" value="'+(c?c.onedrive_url||'':'')+'" placeholder="https://onedrive.live.com/..."/></div>'
      +(c&&c.portal_email?'<div style="background:var(--green-bg);border-radius:var(--radius-sm);padding:8px 12px;font-size:11px;color:var(--green);margin-top:4px">✓ 포털 계정 설정됨 — '+esc(c.portal_email)+'</div>':'')
    :'<div class="divider">고객사 포털 현황</div>'
      +'<div style="background:var(--bg);border-radius:var(--radius-sm);padding:10px 12px;font-size:12px;color:var(--text2)">'
      +(c&&c.portal_email?'현재 포털이 활성화되어 있습니다. 설정 수정은 관리자만 가능합니다.':'포털은 아직 설정되지 않았습니다. 설정/수정은 관리자만 가능합니다.')
      +'</div>';
  document.getElementById('modalArea').innerHTML=
    getInputModalOverlayHtml()
    +'<div class="modal"><div class="modal-title">'+(c?'고객사 수정':'고객사 추가')+'</div>'
    +'<div class="form-half"><div class="form-row"><label class="form-label">고객사명</label><input id="cName" value="'+(c?c.name:'')+'"/></div>'
    +'<div class="form-row"><label class="form-label">업종</label><input id="cInd" value="'+(c?c.industry||'':'')+'" placeholder="예) 제조업"/></div></div>'
    +'<div class="form-half"><div class="form-row"><label class="form-label">담당자</label><input id="cCN" value="'+(c?c.contact_name||'':'')+'"/></div>'
    +'<div class="form-row"><label class="form-label">연락처</label><input id="cCP" value="'+(c?c.contact_phone||'':'')+'"/></div></div>'
    +'<div class="form-row"><label class="form-label">담당 팀</label><select id="cAssignedTeam">'+assignedTeamOptions+'</select></div>'
    +'<div class="form-row"><label class="form-label">이메일</label><input id="cCE" value="'+(c?c.contact_email||'':'')+'"/></div>'
    +'<div class="form-half"><div class="form-row"><label class="form-label">태그</label><input id="cTags" value="'+esc(formatClientTags(c?c.tags||[]:[]))+'" placeholder="쉼표로 구분"/></div>'
    +'<div class="form-row"><label class="form-label">사업자등록번호</label><input id="cBizNo" value="'+esc(c?c.business_number||'':'')+'" placeholder="예) 123-45-67890"/></div></div>'
    +'<div class="form-half"><div class="form-row"><label class="form-label">대표자명</label><input id="cRepName" value="'+esc(c?c.representative_name||'':'')+'" placeholder="예) 홍길동"/></div>'
    +'<div class="form-row"><label class="form-label">회계 기준 결산월</label><select id="cFiscalMonth"><option value="">미설정</option>'+Array.from({length:12},(_,i)=>'<option value="'+(i+1)+'" '+(Number(c?c.fiscal_year_end_month||0:0)===(i+1)?'selected':'')+'>'+(i+1)+'월</option>').join('')+'</select></div></div>'
    +'<div class="form-row"><label class="form-label">주소</label><input id="cAddress" value="'+esc(c?c.address||'':'')+'" placeholder="사업장 주소"/></div>'
    +'<div class="form-row"><label class="form-label">포털 상태</label><div style="min-height:42px;display:flex;align-items:center;padding:0 12px;border:1px solid var(--border);border-radius:var(--radius-sm);background:var(--bg)"><span class="badge '+(portalMeta.tone==='active'?'badge-blue':portalMeta.tone==='linked'?'badge-orange':'badge-gray')+'">'+esc(portalMeta.label)+'</span></div></div>'
    +'<div class="form-row"><label class="form-label">메모</label><textarea id="cMemo" rows="2" style="resize:vertical">'+(c?c.memo||'':'')+'</textarea></div>'
    +portalSection
    +'<div class="modal-footer">'
    +(c&&(roleIsAdmin()||c.created_by===currentUser?.id)?'<button class="btn danger" data-id="'+c.id+'" onclick="deleteClient(this.dataset.id)">삭제</button>':'<div></div>')
    +'<div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">취소</button><button class="btn primary" onclick="saveClient()">저장</button></div>'
    +'</div></div></div>';
  document.getElementById('cName').focus();
}
async function saveClient(){
  if(!canManageCore()){alert('멤버 이상 권한이 필요합니다.');return;}
  const name=document.getElementById('cName').value.trim();if(!name){alert('고객사명을 입력해주세요.');return;}
  const body={
    name,
    industry:document.getElementById('cInd').value.trim(),
    contact_name:document.getElementById('cCN').value.trim(),
    contact_phone:document.getElementById('cCP').value.trim(),
    contact_email:document.getElementById('cCE').value.trim(),
    team_id:document.getElementById('cAssignedTeam')?.value||null,
    tags:typeof normalizeClientTags==='function'?normalizeClientTags(document.getElementById('cTags').value):document.getElementById('cTags').value.trim(),
    business_number:document.getElementById('cBizNo').value.trim()||null,
    representative_name:document.getElementById('cRepName').value.trim()||null,
    address:document.getElementById('cAddress').value.trim()||null,
    fiscal_year_end_month:Number(document.getElementById('cFiscalMonth').value||0)||null,
    memo:document.getElementById('cMemo').value.trim()
  };
  if(canManagePortalSettings()){
    body.portal_email=document.getElementById('cPortalEmail').value.trim()||null;
    body.portal_password=document.getElementById('cPortalPw').value||null;
    body.onedrive_url=document.getElementById('cOnedrive').value.trim()||null;
  }
  try{
    if(editingClientId){await api('PATCH','clients?id=eq.'+editingClientId,body);await logActivity('고객사 수정','client',editingClientId,name);}
    else{body.created_by=currentUser.id;const res=await api('POST','clients',body);await logActivity('고객사 추가','client',res?.[0]?.id,name);}
    closeModal();await loadAll();
    if(curPage==='detail'&&editingClientId)openClientDetail(editingClientId);else renderClients();
  }catch(e){alert('오류: '+e.message);}
}
async function deleteClient(id){
  const c=clients.find(x=>x.id===id);
  if(!confirm('고객사를 삭제할까요?'))return;
  try{await api('DELETE','clients?id=eq.'+id);await logActivity('고객사 삭제','client',id,c?.name||'');closeModal();await loadAll();setPage('clients');}catch(e){alert('오류: '+e.message);}
}

// ── Gantt ──
