(function(){
  if(window.__STABILIZE_PROVISIONING_LOADED__) return;
  window.__STABILIZE_PROVISIONING_LOADED__ = true;

  function injectAccessManagerHints(){
    const modal = document.querySelector('#modalArea .modal');
    if(!modal) return;

    const title = modal.querySelector('.modal-title');
    if(title && !document.getElementById('accessProvisionHint')){
      const hint = document.createElement('div');
      hint.id = 'accessProvisionHint';
      hint.style.cssText = 'font-size:12px;color:var(--text2);line-height:1.7;margin:-4px 0 16px;padding:12px 14px;border:1px solid var(--border);border-radius:14px;background:var(--bg)';
      hint.innerHTML =
        '<strong style="color:var(--navy)">가입 신청 승인 처리</strong><br>'
        + '가입 신청을 승인하면 같은 이메일 기준으로 인력 프로필을 자동 생성하거나 기존 인력 정보와 연결합니다. 승인 후 사용자는 바로 접속할 수 있습니다.';
      title.insertAdjacentElement('afterend', hint);
    }

    (accessRequests || []).filter(function(request){
      return request.status === 'pending';
    }).forEach(function(request){
      const card = document.getElementById('access-request-' + request.id);
      if(!card || card.querySelector('.access-link-hint')) return;
      const matchedMember = (members || []).find(function(member){
        return String(member.email || '').toLowerCase() === String(request.email || '').toLowerCase();
      });
      const line = document.createElement('div');
      line.className = 'access-link-hint';
      line.style.cssText = 'font-size:11px;color:var(--text3);line-height:1.6;background:var(--bg);border-radius:10px;padding:8px 10px;margin:8px 0 10px';
      line.textContent = matchedMember
        ? ('승인 시 기존 인력 "' + matchedMember.name + '" 정보와 자동 연결됩니다.')
        : '승인 시 이 이메일 기준으로 새 인력 정보가 자동 생성됩니다.';
      const actionRow = card.querySelector('div[style*="justify-content:flex-end"]');
      if(actionRow){
        actionRow.insertAdjacentElement('beforebegin', line);
      }else{
        card.appendChild(line);
      }
    });
  }

  function injectMemberManagerHints(){
    const modal = document.querySelector('#modalArea .modal');
    if(!modal) return;
    const title = modal.querySelector('.modal-title');
    if(title && !document.getElementById('memberProvisionHint')){
      const hint = document.createElement('div');
      hint.id = 'memberProvisionHint';
      hint.style.cssText = 'font-size:12px;color:var(--text2);line-height:1.7;margin:-4px 0 16px;padding:12px 14px;border:1px solid var(--border);border-radius:14px;background:var(--bg)';
      hint.innerHTML =
        '<strong style="color:var(--navy)">이메일 자동 연결</strong><br>'
        + '가입 신청과 같은 이메일의 인력 정보를 등록하면 승인 시 자동 연결되어 바로 접속할 수 있습니다.';
      title.insertAdjacentElement('afterend', hint);
    }
  }

  if(typeof window.openAccessRequestManager === 'function'){
    const baseOpenAccessRequestManager = window.openAccessRequestManager;
    window.openAccessRequestManager = async function(targetRequestId){
      await baseOpenAccessRequestManager(targetRequestId);
      injectAccessManagerHints();
    };
  }

  window.approveAccessRequest = async function(requestId){
      const req = (accessRequests || []).find(function(item){ return item.id === requestId; });
      if(!req) return;

      const role = document.getElementById('access-role-' + requestId)?.value || 'member';
      const name = (document.getElementById('access-name-' + requestId)?.value || '').trim()
        || req.name
        || (typeof inferNameFromEmail === 'function' ? inferNameFromEmail(req.email) : '');

      if(!name){
        alert('이름을 입력한 뒤 승인해주세요.');
        return;
      }

      const reviewedAt = new Date().toISOString();
      try{
        const existingMembers = await api('GET', 'members?email=eq.' + encodeURIComponent(req.email) + '&select=id,email,name,auth_user_id').catch(function(){ return []; });
        if(existingMembers?.length){
          await api('PATCH', 'members?id=eq.' + existingMembers[0].id, {
            name: name,
            email: req.email,
            auth_user_id: req.user_id
          });
        }else{
          await api('POST', 'members', {
            name: name,
            email: req.email,
            auth_user_id: req.user_id
          });
        }

        const existingRoles = await api('GET', 'user_roles?id=eq.' + req.user_id + '&select=id').catch(function(){ return []; });
        const roleBody = {
          id: req.user_id,
          role: role,
          is_admin: role === 'admin',
          approved_by: currentUser.id,
          approved_at: reviewedAt
        };

        if(existingRoles?.length){
          await api('PATCH', 'user_roles?id=eq.' + req.user_id, roleBody);
        }else{
          await apiEx('POST', 'user_roles', roleBody, 'return=representation');
        }

        await api('PATCH', 'access_requests?id=eq.' + requestId, {
          name: name,
          status: 'approved',
          reviewed_role: role,
          reviewed_by: currentUser.id,
          reviewed_at: reviewedAt,
          updated_at: reviewedAt
        });

        await createNotification(
          req.user_id,
          'access_approved',
          '가입 신청이 승인되었습니다. 다시 로그인하면 바로 사용할 수 있습니다. (' + (typeof getRoleLabel === 'function' ? getRoleLabel(role) : role) + ')',
          'access_request',
          requestId
        );

        try{
          if(typeof loadAll === 'function') await loadAll();
        }catch(error){}

        await window.openAccessRequestManager(requestId);
      }catch(error){
        alert('승인 처리 오류: ' + error.message);
      }
  };

  if(typeof window.openMemberManager === 'function'){
    const baseOpenMemberManager = window.openMemberManager;
    window.openMemberManager = function(){
      baseOpenMemberManager();
      injectMemberManagerHints();
    };
  }
})();
