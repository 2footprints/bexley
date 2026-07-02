async function loadClientUpdates(clientId){
  currentDetailClientId=clientId;
  const el=document.getElementById('updateFeed');if(!el)return;
  try{
    const updates=await api('GET','client_updates?client_id=eq.'+clientId+'&select=*&order=created_at.desc');
    renderUpdateFeed(updates||[],clientId);
  }catch(e){if(el)el.innerHTML='<div style="color:var(--red);font-size:12px">불러오기 실패: '+esc(e.message)+'</div>';}
}

function renderUpdateFeed(updates,clientId){
  const el=document.getElementById('updateFeed');if(!el)return;
  const cp=projects.filter(p=>p.client_id===clientId);
  const projectMap=new Map(cp.map(project=>[project.id,project]));
  const isAssigned=isAdmin||(currentMember&&clientAssignments.some(a=>a.client_id===clientId&&a.member_id===currentMember.id));
  if(!updates.length){
    el.innerHTML='<div style="color:var(--text3);font-size:13px;padding:20px 0;text-align:center">아직 작성된 업데이트가 없습니다.'+(isAssigned?'<br><br><button class="btn primary sm" onclick="openUpdateModal(null,\''+clientId+'\')">첫 업데이트 작성</button>':'')+'</div>';
    return;
  }
  el.innerHTML=updates.map(u=>{
    const canEdit=isAdmin||u.created_by===currentUser?.id;
    const updateType=(u.type||'report')==='notice'?'notice':'report';
    const relatedProject=u.project_id?projectMap.get(u.project_id):null;
    return '<div style="padding:16px 0;border-bottom:1px solid var(--border)">'
      +'<div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:8px">'
      +'<div>'
      +'<div style="display:flex;align-items:center;gap:6px;flex-wrap:wrap;margin-bottom:4px">'
      +'<span class="badge '+(updateType==='notice'?'badge-blue':'badge-gray')+'">'+(updateType==='notice'?'공지':'레포트')+'</span>'
      +(u.is_portal_visible?'<span class="badge badge-green">포털 공개</span>':'')
      +(relatedProject?'<span class="badge badge-orange">'+esc(relatedProject.name||'연결 프로젝트')+'</span>':'')
      +'</div>'
      +'<div style="font-size:14px;font-weight:800;color:var(--navy);letter-spacing:-.2px">'+esc(u.title)+'</div>'
      +'<div style="font-size:11px;color:var(--text3);margin-top:3px">'+esc(u.author_name||'작성자')+' · '+formatCommentDate(u.created_at)+'</div>'
      +'</div>'
      +(canEdit?'<div style="display:flex;gap:6px;flex-shrink:0">'
        +'<button class="btn ghost sm" data-id="'+u.id+'" onclick="openUpdateModal(this.dataset.id,\''+clientId+'\')">수정</button>'
        +'<button class="btn danger sm" data-id="'+u.id+'" onclick="deleteUpdate(this.dataset.id,\''+clientId+'\')">삭제</button>'
        +'</div>':'')
      +'</div>'
      +(u.content?'<div style="font-size:13px;color:var(--text2);line-height:1.7;white-space:pre-wrap;margin-bottom:8px">'+esc(u.content)+'</div>':'')
      +(u.file_url?'<a href="'+esc(u.file_url)+'" target="_blank" style="display:inline-flex;align-items:center;gap:6px;background:var(--blue-light);color:var(--blue);font-size:12px;font-weight:600;padding:6px 12px;border-radius:var(--radius-sm);text-decoration:none">📎 '+esc(u.file_label||'첨부 파일 열기')+'</a>':'')
      +'</div>';
  }).join('');
}

function openUpdateModal(editId,clientId){
  const clientProjects=projects.filter(p=>p.client_id===(clientId||currentDetailClientId));
  document.getElementById('modalArea').innerHTML=
    getInputModalOverlayHtml()
    +'<div class="modal" style="width:520px"><div class="modal-title">'+(editId?'레포트 수정':'레포트 작성')+'</div>'
    +'<div class="form-half"><div class="form-row"><label class="form-label">유형</label><select id="uType"><option value="report">레포트</option><option value="notice">포털 공지</option></select></div>'
    +'<div class="form-row"><label class="form-label">관련 프로젝트</label><select id="uProjectId"><option value="">미연결</option>'+clientProjects.map(project=>'<option value="'+project.id+'">'+esc(project.name||'프로젝트')+'</option>').join('')+'</select></div></div>'
    +'<div class="form-row"><label class="form-label"><input id="uPortalVisible" type="checkbox" style="width:auto;margin-right:8px">포털 공개</label></div>'
    +'<div class="form-row"><label class="form-label">제목</label><input id="uTitle" placeholder="예) 1분기 감사 중간 보고" autofocus/></div>'
    +'<div class="form-row"><label class="form-label">내용</label><textarea id="uContent" rows="5" style="resize:vertical" placeholder="진행 상황, 주요 내용, 전달 사항 등을 작성하세요"></textarea></div>'
    +'<div class="divider">첨부 파일 링크 (OneDrive)</div>'
    +'<div class="form-half"><div class="form-row"><label class="form-label">파일 URL</label><input id="uFileUrl" placeholder="https://onedrive.live.com/..."/></div>'
    +'<div class="form-row"><label class="form-label">표시 이름</label><input id="uFileLabel" placeholder="예) 중간보고서.pdf"/></div></div>'
    +'<div class="modal-footer"><div></div>'
    +'<div class="modal-footer-right"><button class="btn ghost" onclick="closeModal()">취소</button>'
    +'<button class="btn primary" data-id="'+(editId||'')+'" data-client="'+(clientId||currentDetailClientId||'')+'" onclick="saveUpdate(this.dataset.id,this.dataset.client)">저장</button>'
    +'</div></div></div></div>';
  // 수정 모드면 기존 데이터 로드
  if(editId) loadUpdateForEdit(editId);
}

async function loadUpdateForEdit(id){
  try{
    const result=await api('GET','client_updates?id=eq.'+id+'&select=*');
    if(!result||!result.length)return;
    const u=result[0];
    document.getElementById('uType').value=u.type||'report';
    document.getElementById('uProjectId').value=u.project_id||'';
    document.getElementById('uPortalVisible').checked=!!u.is_portal_visible;
    document.getElementById('uTitle').value=u.title||'';
    document.getElementById('uContent').value=u.content||'';
    document.getElementById('uFileUrl').value=u.file_url||'';
    document.getElementById('uFileLabel').value=u.file_label||'';
  }catch(e){}
}

async function saveUpdate(editId,clientId){
  const title=document.getElementById('uTitle').value.trim();
  if(!title){alert('제목을 입력해주세요.');return;}
  const body={
    type:document.getElementById('uType').value||'report',
    project_id:document.getElementById('uProjectId').value||null,
    is_portal_visible:!!document.getElementById('uPortalVisible').checked,
    title,
    content:document.getElementById('uContent').value.trim()||null,
    file_url:document.getElementById('uFileUrl').value.trim()||null,
    file_label:document.getElementById('uFileLabel').value.trim()||null,
  };
  try{
    if(editId){
      await api('PATCH','client_updates?id=eq.'+editId,{...body,updated_at:new Date().toISOString()});
    }else{
      body.client_id=clientId;
      body.author_name=currentMember?.name||currentUser?.email;
      body.created_by=currentUser?.id;
      await api('POST','client_updates',body);
    }
    closeModal();
    await loadClientUpdates(clientId);
  }catch(e){alert('저장 오류: '+e.message);}
}

async function deleteUpdate(id,clientId){
  if(!confirm('레포트를 삭제할까요?'))return;
  try{
    await api('DELETE','client_updates?id=eq.'+id);
    await loadClientUpdates(clientId);
  }catch(e){alert('오류: '+e.message);}
}
