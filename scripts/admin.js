function accessStatusBadge(status){
  if(status==='approved')return '<span class="badge badge-green">승인</span>';
  if(status==='rejected')return '<span class="badge badge-red">반려</span>';
  return '<span class="badge badge-orange">대기</span>';
}

function accessRoleSelectOptions(selected){
  return ['observer','member','admin'].map(role=>'<option value="'+role+'" '+(selected===role?'selected':'')+'>'+getRoleLabel(role)+'</option>').join('');
}

async function openAccessRequestManager(targetRequestId=''){
  if(!roleIsAdmin())return;
  try{
    accessRequests=await api('GET','access_requests?select=*&order=status.asc,created_at.desc')||[];
  }catch(e){accessRequests=[];}
  const pending=accessRequests.filter(r=>r.status==='pending');
  const history=accessRequests.filter(r=>r.status!=='pending');
  document.getElementById('modalArea').innerHTML=''
    +'<div class="overlay" onclick="if(event.target===this)closeModal()">'
    +'<div class="modal" style="width:760px"><div class="modal-title">접근 권한 요청</div>'
    +'<div style="font-size:12px;color:var(--text3);margin-bottom:16px">회원가입 후 들어온 권한 요청을 승인하거나 반려할 수 있습니다.</div>'
    +'<div style="max-height:68vh;overflow-y:auto">'
    +'<div class="divider" style="margin-top:0">대기 중 요청 ('+pending.length+'건)</div>'
    +(pending.length?pending.map(req=>'<div id="access-request-'+req.id+'" class="card-sm" style="margin-bottom:10px">'
      +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px;margin-bottom:10px">'
      +'<div><div style="font-size:14px;font-weight:800;color:var(--navy)">'+esc(req.name||inferNameFromEmail(req.email)||'이름 미입력')+'</div>'
      +'<div style="font-size:12px;color:var(--text3);margin-top:2px">'+esc(req.email||'')+'</div>'
      +'<div style="font-size:11px;color:var(--text3);margin-top:5px">희망 권한: '+getRequestedRoleLabel(req.requested_role||'observer')+' · '+esc(formatPendingDate(req.created_at))+'</div></div>'
      +accessStatusBadge(req.status)
      +'</div>'
      +(req.note?'<div style="font-size:12px;color:var(--text2);line-height:1.6;background:var(--bg);border-radius:8px;padding:10px 12px;margin-bottom:10px">'+esc(req.note)+'</div>':'')
      +'<div style="display:grid;grid-template-columns:1fr 160px;gap:10px;margin-bottom:10px"><input id="access-name-'+req.id+'" value="'+esc(req.name||inferNameFromEmail(req.email)||'')+'" placeholder="이름" style="padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:inherit"/><select id="access-role-'+req.id+'" style="padding:10px 12px;border:1px solid var(--border);border-radius:var(--radius-sm);font-family:inherit">'+accessRoleSelectOptions(req.requested_role||'observer')+'</select></div>'
      +'<div style="display:flex;justify-content:flex-end;gap:8px"><button class="btn danger sm" onclick="rejectAccessRequest(\''+req.id+'\')">반려</button><button class="btn primary sm" onclick="approveAccessRequest(\''+req.id+'\')">승인</button></div>'
      +'</div>').join(''):'<div style="font-size:12px;color:var(--text3);padding:12px 0">대기 중 요청이 없습니다.</div>')
    +'<div class="divider">처리 내역 ('+history.length+'건)</div>'
    +(history.length?history.map(req=>'<div class="card-sm" style="margin-bottom:10px">'
      +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:10px">'
      +'<div><div style="font-size:13px;font-weight:700;color:var(--navy)">'+esc(req.name||inferNameFromEmail(req.email)||req.email||'')+'</div><div style="font-size:11px;color:var(--text3);margin-top:3px">'+esc(req.email||'')+'</div><div style="font-size:11px;color:var(--text3);margin-top:5px">처리 권한: '+getRoleLabel(req.reviewed_role||req.requested_role||'observer')+' · '+esc(formatPendingDate(req.reviewed_at||req.created_at))+'</div></div>'
      +accessStatusBadge(req.status)
      +'</div>'
      +(req.note?'<div style="font-size:12px;color:var(--text2);line-height:1.6;margin-top:8px">'+esc(req.note)+'</div>':'')
      +'</div>').join(''):'<div style="font-size:12px;color:var(--text3);padding:12px 0">아직 처리된 요청이 없습니다.</div>')
    +'</div>'
    +'<div class="modal-footer"><div></div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">닫기</button></div></div>'
    +'</div></div>';
  if(targetRequestId)focusTargetElement('access-request-'+targetRequestId);
}

async function approveAccessRequest(requestId){
  const req=accessRequests.find(r=>r.id===requestId);if(!req)return;
  const role=document.getElementById('access-role-'+requestId)?.value||'observer';
  const name=(document.getElementById('access-name-'+requestId)?.value||'').trim()||req.name||inferNameFromEmail(req.email);
  const reviewedAt=new Date().toISOString();
  try{
    const existingMembers=await api('GET','members?email=eq.'+encodeURIComponent(req.email)+'&select=id,email,name,auth_user_id').catch(()=>[]);
    if(existingMembers?.length){
      await api('PATCH','members?id=eq.'+existingMembers[0].id,{name,email:req.email,auth_user_id:req.user_id});
    }else{
      await api('POST','members',{name,email:req.email,auth_user_id:req.user_id});
    }
    const existingRoles=await api('GET','user_roles?id=eq.'+req.user_id+'&select=id').catch(()=>[]);
    const roleBody={id:req.user_id,role,is_admin:role==='admin',approved_by:currentUser.id,approved_at:reviewedAt};
    if(existingRoles?.length) await api('PATCH','user_roles?id=eq.'+req.user_id,roleBody);
    else await apiEx('POST','user_roles',roleBody,'return=representation');
    await api('PATCH','access_requests?id=eq.'+requestId,{name,status:'approved',reviewed_role:role,reviewed_by:currentUser.id,reviewed_at:reviewedAt,updated_at:reviewedAt});
    await createNotification(req.user_id,'access_approved','접근 요청이 승인되었습니다. ('+getRoleLabel(role)+')','access_request',requestId);
    await openAccessRequestManager(requestId);
  }catch(e){alert('승인 처리 오류: '+e.message);}
}

async function rejectAccessRequest(requestId){
  const req=accessRequests.find(r=>r.id===requestId);if(!req)return;
  if(!confirm('이 요청을 반려할까요?'))return;
  try{
    const reviewedAt=new Date().toISOString();
    await api('PATCH','access_requests?id=eq.'+requestId,{status:'rejected',reviewed_role:null,reviewed_by:currentUser.id,reviewed_at:reviewedAt,updated_at:reviewedAt});
    await createNotification(req.user_id,'access_rejected','접근 요청이 반려되었습니다. 다시 요청 내용을 작성해 주세요.','access_request',requestId);
    await openAccessRequestManager(requestId);
  }catch(e){alert('반려 처리 오류: '+e.message);}
}

function openMemberManager(){
  if(!isAdmin)return;
  const rows=members.map(m=>'<div style="display:flex;align-items:center;justify-content:space-between;padding:12px 0;border-bottom:1px solid var(--border)">'
    +'<div><div style="font-size:14px;font-weight:700;color:var(--navy)">'+m.name+'</div><div style="font-size:12px;color:var(--text3);margin-top:2px">'+(m.email||'이메일 미설정')+'</div></div>'
    +'<button class="btn danger sm" data-id="'+m.id+'" data-name="'+m.name+'" onclick="deleteMember(this.dataset.id,this.dataset.name)">삭제</button>'
    +'</div>').join('');
  document.getElementById('modalArea').innerHTML=
    '<div class="overlay" onclick="if(event.target===this)closeModal()">'
    +'<div class="modal"><div class="modal-title">인력 관리</div>'
    +'<div style="max-height:280px;overflow-y:auto;margin-bottom:20px">'+(rows||'<div style="color:var(--text3);padding:20px 0;text-align:center">등록된 인력이 없습니다</div>')+'</div>'
    +'<div class="divider">새 인력 추가</div>'
    +'<div class="form-half"><div class="form-row"><label class="form-label">이름</label><input id="nMN" placeholder="이름"/></div>'
    +'<div class="form-row"><label class="form-label">이메일</label><input id="nME" placeholder="hong@bexleyintl.com"/></div></div>'
    +'<div id="mms" style="font-size:12px;min-height:18px;margin-top:4px"></div>'
    +'<div class="modal-footer" style="justify-content:space-between">'
    +'<div></div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">닫기</button><button class="btn primary" onclick="addNewMember()">추가</button></div></div>'
    +'</div></div>';
  document.getElementById('nMN').focus();
}

async function addNewMember(){
  const name=document.getElementById('nMN')?.value.trim(),email=document.getElementById('nME')?.value.trim()||null;
  if(!name)return;
  if(members.find(m=>m.name===name)){const s=document.getElementById('mms');s.textContent='이미 등록된 이름입니다.';s.style.color='var(--red)';return;}
  try{await api('POST','members',{name,email});await loadAll();openMemberManager();}
  catch(e){const s=document.getElementById('mms');s.textContent='오류: '+e.message;s.style.color='var(--red)';}
}

async function deleteMember(id,name){
  if(projects.some(p=>p.members.includes(name))){alert('"'+name+'"은 프로젝트에 배정되어 있어 삭제할 수 없습니다.');return;}
  if(!confirm('"'+name+'"을 삭제할까요?'))return;
  try{await api('DELETE','members?id=eq.'+id);await loadAll();openMemberManager();}catch(e){alert('오류: '+e.message);}
}

async function openPortalManager(){
  if(!canManagePortalSettings())return;
  const el=document.getElementById('modalArea');
  el.innerHTML='<div class="overlay" onclick="if(event.target===this)closeModal()">'
    +'<div class="modal" style="width:680px"><div class="modal-title">🔐 고객사 페이지 관리</div>'
    +'<div id="portalManagerBody"><div style="color:var(--text3);text-align:center;padding:20px">불러오는 중...</div></div>'
    +'<div class="modal-footer"><div></div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">닫기</button></div></div>'
    +'</div></div>';
  try{clientAssignments=await api('GET','client_assignments?select=*')||[];}catch{}
  renderPortalManagerBody();
}

function renderPortalManagerBody(){
  const el=document.getElementById('portalManagerBody');if(!el)return;
  const sorted=[...clients].sort((a,b)=>a.name.localeCompare(b.name));
  const withPortal=sorted.filter(c=>c.portal_email);
  const withoutPortal=sorted.filter(c=>!c.portal_email);

  const assignedNames=(clientId)=>{
    const assigned=clientAssignments.filter(a=>a.client_id===clientId);
    return assigned.map(a=>members.find(m=>m.id===a.member_id)?.name||'?').filter(Boolean);
  };

  let html='<div style="font-size:12px;color:var(--text3);margin-bottom:12px">'
    +'고객사 페이지 활성: <strong style="color:var(--green)">'+withPortal.length+'개사</strong> · 미설정: <strong>'+withoutPortal.length+'개사</strong>'
    +'</div>';

  if(withPortal.length){
    html+='<div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.3px;text-transform:uppercase;margin-bottom:8px">✓ 활성 계정</div>';
    html+=withPortal.map(c=>{
      const names=assignedNames(c.id);
      return '<div style="padding:12px;background:var(--bg);border-radius:var(--radius-sm);margin-bottom:8px;border:1px solid var(--border)">'
        +'<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">'
        +'<div style="width:32px;height:32px;border-radius:8px;background:linear-gradient(135deg,var(--blue),var(--blue-dark));color:#fff;font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+esc(c.name.charAt(0))+'</div>'
        +'<div style="flex:1;min-width:0">'
        +'<div style="font-size:13px;font-weight:700;color:var(--navy)">'+esc(c.name)+'</div>'
        +'<div style="font-size:11px;color:var(--text3);margin-top:1px">'+esc(c.portal_email)+'</div>'
        +'</div>'
        +'<div style="display:flex;gap:6px;flex-shrink:0">'
        +'<button class="btn primary sm" style="font-size:11px" onclick="openPortalAsClient(\''+c.id+'\')">👀 접속</button>'
        +'<button class="btn sm" style="font-size:11px" onclick="openPortalAccountEdit(\''+c.id+'\')">수정</button>'
        +'<button class="btn ghost sm" style="font-size:11px" onclick="resetPortalAccount(\''+c.id+'\',\''+esc(c.name)+'\')">초기화</button>'
        +'</div></div>'
        +'<div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">'
        +'<span style="font-size:11px;color:var(--text3);font-weight:600">담당자:</span>'
        +(names.length?names.map(n=>'<span style="font-size:11px;background:var(--blue-light);color:var(--blue);padding:2px 8px;border-radius:10px;font-weight:600">'+esc(n)
          +'<button onclick="removeAssignment(\''+c.id+'\',\''+n+'\')" style="margin-left:4px;background:none;border:none;color:var(--blue);cursor:pointer;font-size:11px;padding:0">×</button></span>').join('')
          :'<span style="font-size:11px;color:var(--text3)">미배정</span>')
        +'<select id="assignSel-'+c.id+'" style="font-size:11px;padding:3px 6px;border:1px solid var(--border);border-radius:6px;font-family:inherit">'
        +'<option value="">+ 담당자 추가</option>'
        +members.filter(m=>!clientAssignments.find(a=>a.client_id===c.id&&a.member_id===m.id))
          .map(m=>'<option value="'+m.id+'">'+esc(m.name)+'</option>').join('')
        +'</select>'
        +'<button class="btn sm" style="font-size:11px" onclick="addAssignment(\''+c.id+'\')">추가</button>'
        +'</div>'
        +'</div>';
    }).join('');
  }

  if(withoutPortal.length){
    html+='<div style="font-size:11px;font-weight:700;color:var(--text3);letter-spacing:.3px;text-transform:uppercase;margin:16px 0 8px">미설정 거래처</div>';
    html+=withoutPortal.map(c=>{
      const names=assignedNames(c.id);
      return '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:var(--bg);border-radius:var(--radius-sm);margin-bottom:4px">'
        +'<div style="width:32px;height:32px;border-radius:8px;background:var(--bg2);color:var(--text3);font-size:13px;font-weight:800;display:flex;align-items:center;justify-content:center;flex-shrink:0">'+esc(c.name.charAt(0))+'</div>'
        +'<div style="flex:1;min-width:0">'
        +'<div style="font-size:13px;color:var(--text2)">'+esc(c.name)+'</div>'
        +(names.length?'<div style="font-size:11px;color:var(--text3)">담당: '+names.join(', ')+'</div>':'')
        +'</div>'
        +'<button class="btn primary sm" style="flex-shrink:0;font-size:11px" onclick="openPortalAccountEdit(\''+c.id+'\')">페이지 설정</button>'
        +'</div>';
    }).join('');
  }
  el.innerHTML='<div style="max-height:65vh;overflow-y:auto;padding-right:4px">'+html+'</div>';
}

function openPortalAsClient(clientId){
  const c=clients.find(x=>x.id===clientId);if(!c||!c.portal_email)return;
  previewPortal(clientId);
  closeModal();
}

async function renderAdminPage(){
  const el=document.getElementById('pageAdmin');if(!el)return;
  if(!roleIsAdmin()){
    el.innerHTML='<div class="card"><div class="ui-admin-gate-title">관리자 전용</div><div class="ui-page-desc">이 페이지는 관리자만 볼 수 있습니다.</div></div>';
    return;
  }
  el.innerHTML='<div class="section-header ui-section-stack"><h2 class="section-title">관리자 페이지</h2><span class="ui-page-desc">권한, 인력, 고객사 포털을 한곳에서 관리합니다.</span></div><div class="card"><div class="ui-loading-card">불러오는 중...</div></div>';
  try{
    const [reqs,assigns]=await Promise.all([
      api('GET','access_requests?select=*&order=status.asc,created_at.desc').catch(()=>accessRequests||[]),
      api('GET','client_assignments?select=*').catch(()=>clientAssignments||[])
    ]);
    accessRequests=reqs||[];
    clientAssignments=assigns||[];
  }catch(e){}
  const pending=(accessRequests||[]).filter(r=>r.status==='pending');
  const portalActive=clients.filter(c=>c.portal_email).length;
  const assignedClients=clients.filter(c=>getAssignedMemberNames(c.id).length).length;
  const recentPending=pending.slice(0,5).map(req=>'<div class="info-row"><span class="info-label">'+esc(req.name||inferNameFromEmail(req.email)||req.email||'요청자')+'</span><span class="info-value">'+getRequestedRoleLabel(req.requested_role||'observer')+'</span></div>').join('')||'<div class="ui-empty-copy">대기 중인 요청이 없습니다.</div>';
  const memberPreview=(members||[]).slice(0,8).map(m=>'<div class="info-row"><span class="info-label">'+esc(m.name)+'</span><span class="info-value">'+esc(m.email||'이메일 미설정')+'</span></div>').join('')||'<div class="ui-empty-copy">등록된 인력이 없습니다.</div>';
  const portalPreview=[...clients].filter(c=>c.portal_email).sort((a,b)=>a.name.localeCompare(b.name)).slice(0,8).map(c=>{
    const assigned=getAssignedMemberNames(c.id);
    return '<div class="ui-admin-preview-card">'
      +'<div class="ui-admin-preview-head">'
      +'<div><div class="ui-admin-preview-title">'+esc(c.name)+'</div><div class="ui-admin-preview-meta">내부 담당: '+esc(assigned.join(', ')||'미배정')+'</div></div>'
      +'<div class="ui-admin-preview-actions">'
      +'<button class="btn primary sm" onclick="previewPortal(\''+c.id+'\')">포털 접속</button>'
      +'<button class="btn sm" onclick="openPortalAccountEdit(\''+c.id+'\')">설정</button>'
      +'</div></div></div>';
  }).join('')||'<div class="ui-empty-copy">활성화된 고객사 페이지가 없습니다.</div>';
  el.innerHTML=
    '<div class="section-header ui-section-stack"><h2 class="section-title">관리자 페이지</h2><span class="ui-page-desc">권한, 인력, 고객사 포털을 한곳에서 관리합니다.</span></div>'
    +'<div class="stat-grid">'
    +'<div class="stat-card"><div class="stat-label">권한 요청</div><div class="stat-num" style="color:'+(pending.length?'var(--orange)':'var(--navy)')+'">'+pending.length+'</div><div class="stat-sub">확인 대기</div></div>'
    +'<div class="stat-card"><div class="stat-label">인력</div><div class="stat-num">'+members.length+'</div><div class="stat-sub">등록 인원</div></div>'
    +'<div class="stat-card"><div class="stat-label">고객사 포털</div><div class="stat-num" style="color:var(--blue)">'+portalActive+'</div><div class="stat-sub">활성 계정</div></div>'
    +'<div class="stat-card"><div class="stat-label">담당 지정</div><div class="stat-num">'+assignedClients+'</div><div class="stat-sub">담당 배정 고객사</div></div>'
    +'</div>'
    +'<div class="detail-grid ui-detail-grid-stack">'
    +'<div class="card"><div class="section-label">권한 요청</div>'+recentPending+'<div class="ui-card-actions"><button class="btn primary sm" onclick="openAccessRequestManager()">권한 요청 관리</button></div></div>'
    +'<div class="card"><div class="section-label">인력 관리</div>'+memberPreview+'<div class="ui-card-actions-row"><button class="btn primary sm" onclick="openMemberManager()">인력 관리 열기</button><button class="btn sm" onclick="openActivityLog()">활동 로그</button></div></div>'
    +'</div>'
    +'<div class="card"><div class="section-label">고객사 페이지 관리</div><div class="ui-admin-note">설정과 수정은 관리자만 가능하고, 각 고객사의 접속 상태와 내부 담당 현황을 확인할 수 있습니다.</div>'+portalPreview+'<div class="ui-card-actions"><button class="btn primary sm" onclick="openPortalManager()">전체 관리 열기</button></div></div>';
  el.insertAdjacentHTML('afterbegin','<div id="adminDashMount" style="margin-bottom:14px"></div>');
  renderDash();
}

async function addAssignment(clientId){
  if(!canManagePortalSettings())return;
  const sel=document.getElementById('assignSel-'+clientId);
  const memberId=sel?.value;if(!memberId)return;
  try{
    await api('POST','client_assignments',{client_id:clientId,member_id:memberId,assigned_by:currentUser.id});
    clientAssignments=await api('GET','client_assignments?select=*')||[];
    renderPortalManagerBody();
  }catch(e){alert('오류: '+e.message);}
}

async function removeAssignment(clientId,memberName){
  if(!canManagePortalSettings())return;
  const member=members.find(m=>m.name===memberName);if(!member)return;
  const assign=clientAssignments.find(a=>a.client_id===clientId&&a.member_id===member.id);if(!assign)return;
  try{
    await api('DELETE','client_assignments?id=eq.'+assign.id);
    clientAssignments=await api('GET','client_assignments?select=*')||[];
    renderPortalManagerBody();
  }catch(e){alert('오류: '+e.message);}
}

function openPortalAccountEdit(clientId){
  if(!canManagePortalSettings())return;
  const c=clients.find(x=>x.id===clientId);if(!c)return;
  document.getElementById('modalArea').innerHTML=
    '<div class="overlay" onclick="if(event.target===this)closeModal()">'
    +'<div class="modal" style="width:440px">'
    +'<div class="modal-title">고객사 페이지 설정 — '+esc(c.name)+'</div>'
    +'<div class="form-row"><label class="form-label">로그인 이메일</label><input id="peEmail" type="email" value="'+esc(c.portal_email||'')+'" placeholder="고객사 담당자 이메일"/></div>'
    +'<div class="form-row"><label class="form-label">비밀번호</label><input id="pePw" type="text" value="'+esc(c.portal_password||'')+'" placeholder="임시 비밀번호"/></div>'
    +'<div class="form-row"><label class="form-label">OneDrive 문서함 URL</label><input id="peOnedrive" value="'+esc(c.onedrive_url||'')+'" placeholder="https://onedrive.live.com/..."/></div>'
    +'<div class="modal-footer"><div></div>'
    +'<div class="modal-footer-right"><button class="btn ghost" onclick="openPortalManager()">취소</button>'
    +'<button class="btn primary" data-id="'+c.id+'" onclick="savePortalAccount(this.dataset.id)">저장</button>'
    +'</div></div></div></div>';
  document.getElementById('peEmail').focus();
}

async function savePortalAccount(clientId){
  if(!canManagePortalSettings())return;
  const email=document.getElementById('peEmail').value.trim();
  const pw=document.getElementById('pePw').value;
  const onedrive=document.getElementById('peOnedrive').value.trim();
  if(!email||!pw){alert('이메일과 비밀번호를 입력해주세요.');return;}
  try{
    await api('PATCH','clients?id=eq.'+clientId,{
      portal_email:email,
      portal_password:pw,
      onedrive_url:onedrive||null
    });
    const c=clients.find(x=>x.id===clientId);
    if(c){c.portal_email=email;c.portal_password=pw;c.onedrive_url=onedrive||null;}
    openPortalManager();
  }catch(e){alert('저장 오류: '+e.message);}
}

async function resetPortalAccount(clientId,name){
  if(!canManagePortalSettings())return;
  if(!confirm(name+' 고객사 페이지 계정을 초기화할까요?\n로그인이 불가능해집니다.'))return;
  try{
    await api('PATCH','clients?id=eq.'+clientId,{portal_email:null,portal_password:null});
    const c=clients.find(x=>x.id===clientId);
    if(c){c.portal_email=null;c.portal_password=null;}
    renderPortalManagerBody();
  }catch(e){alert('오류: '+e.message);}
}

async function openActivityLog(){
  if(!isAdmin)return;
  const el=document.getElementById('modalArea');
  el.innerHTML='<div class="overlay" onclick="if(event.target===this)closeModal()"><div class="modal" style="width:600px"><div class="modal-title">활동 로그</div><div style="color:var(--text3);font-size:13px;padding:20px 0;text-align:center">불러오는 중...</div></div></div>';
  try{
    const logs=await api('GET','activity_logs?select=*&order=created_at.desc&limit=100');
    const rows=(logs||[]).map(l=>'<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-bottom:1px solid var(--border)">'
      +'<div style="flex-shrink:0;width:28px;height:28px;border-radius:50%;background:var(--blue-light);color:var(--blue);font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center">'+(l.user_name||'?').charAt(0)+'</div>'
      +'<div style="flex:1;min-width:0">'
      +'<div style="font-size:13px;color:var(--navy)"><span style="font-weight:700">'+esc(l.user_name||'unknown')+'</span> · '+esc(l.action)+'</div>'
      +(l.target_name?'<div style="font-size:12px;color:var(--text3);margin-top:2px">'+esc(l.target_type)+' · '+esc(l.target_name)+'</div>':'')
      +'</div>'
      +'<div style="font-size:11px;color:var(--text3);flex-shrink:0">'+formatCommentDate(l.created_at)+'</div>'
      +'</div>').join('');
    el.innerHTML='<div class="overlay" onclick="if(event.target===this)closeModal()">'
      +'<div class="modal" style="width:600px"><div class="modal-title">활동 로그</div>'
      +'<div style="max-height:60vh;overflow-y:auto">'+(rows||'<div style="color:var(--text3);text-align:center;padding:20px">로그가 없습니다.</div>')+'</div>'
      +'<div class="modal-footer"><div></div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">닫기</button></div></div>'
      +'</div></div>';
  }catch(e){
    el.innerHTML='<div class="overlay" onclick="if(event.target===this)closeModal()"><div class="modal" style="width:600px"><div class="modal-title">활동 로그</div><div style="color:var(--red);padding:20px">오류: '+esc(e.message)+'</div><div class="modal-footer"><div></div><div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">닫기</button></div></div></div></div>';
  }
}
