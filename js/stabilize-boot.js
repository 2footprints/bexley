(function(){
  if(window.__STABILIZE_BOOT_LOADED__) return;
  window.__STABILIZE_BOOT_LOADED__ = true;

  async function notifyAdmins(message, requestId){
    if(!currentUser?.id) return;
    const admins = await api('GET', 'user_roles?select=id,role,is_admin&or=(role.eq.admin,is_admin.eq.true)') || [];
    for(const admin of admins){
      if(admin.id === currentUser.id) continue;
      await createNotification(
        admin.id,
        'access_request',
        message,
        'access_request',
        requestId || null
      );
    }
  }

  async function ensurePendingAccessRequest(){
    if(!currentUser?.id || !currentUser?.email || currentRoleRow) return pendingRequest || null;

    const existingByUser = await api('GET', 'access_requests?user_id=eq.' + currentUser.id + '&select=*&limit=1').catch(() => []);
    if(existingByUser?.length){
      pendingRequest = existingByUser[0];
      return pendingRequest;
    }

    const existingByEmail = await api('GET', 'access_requests?email=eq.' + encodeURIComponent(currentUser.email) + '&select=*&limit=1').catch(() => []);
    if(existingByEmail?.length){
      const found = existingByEmail[0];
      pendingRequest = found;
      if(found.user_id !== currentUser.id){
        const patched = await api('PATCH', 'access_requests?id=eq.' + found.id, {
          user_id: currentUser.id,
          updated_at: new Date().toISOString()
        }).catch(() => []);
        pendingRequest = patched?.[0] || { ...found, user_id: currentUser.id };
      }
      return pendingRequest;
    }

    const requestedAt = new Date().toISOString();
    const name = currentMember?.name
      || (typeof inferNameFromEmail === 'function' ? inferNameFromEmail(currentUser.email) : String(currentUser.email).split('@')[0])
      || '신규 사용자';
    const body = {
      user_id: currentUser.id,
      email: currentUser.email,
      name,
      requested_role: 'member',
      note: '회원가입 후 자동 생성된 가입 신청',
      status: 'pending',
      reviewed_role: null,
      reviewed_by: null,
      reviewed_at: null,
      updated_at: requestedAt
    };

    const saved = await api('POST', 'access_requests', body);
    pendingRequest = saved?.[0] || null;

    try{
      await notifyAdmins(
        name + '님의 가입 신청이 접수되었습니다. 이름 확인 후 승인하면 바로 접속할 수 있습니다.',
        pendingRequest?.id || null
      );
    }catch(error){
      console.error('auto access request notify failed:', error);
    }

    return pendingRequest;
  }

  window.__ensureAccessRequestAfterLogin = ensurePendingAccessRequest;

  window.requestProfileLinkHelp = async function(){
    try{
      await notifyAdmins(
        (currentUser?.email || '계정') + ' 사용자의 승인 반영 또는 계정 연결 확인이 필요합니다.',
        pendingRequest?.id || null
      );
      alert('관리자에게 승인 반영 확인 요청을 보냈습니다. 잠시 후 다시 로그인해 주세요.');
    }catch(error){
      alert('요청 전송 오류: ' + error.message);
    }
  };

  function renderMissingProfilePage(){
    showPage('pending');
    const el = document.getElementById('pendingContent');
    if(!el) return;
    el.innerHTML =
      '<div class="card" style="max-width:560px;margin:0 auto;padding:28px">'
      + '<div class="section-label" style="margin:0 0 10px">가입 승인 반영 중</div>'
      + '<div style="font-size:14px;line-height:1.7;color:var(--text2)">'
      + '로그인은 완료되었지만 아직 관리자 승인 반영이 마무리되지 않았습니다.<br>'
      + '관리자가 승인하면 바로 접속할 수 있습니다.<br>'
      + '계속 이 화면이 보이면 관리자에게 확인을 요청해 주세요.'
      + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">'
      + '<button class="btn primary" onclick="refreshApprovalState()">다시 확인</button>'
      + '<button class="btn" onclick="requestProfileLinkHelp()">관리자에게 알림</button>'
      + '<button class="btn ghost" onclick="doLogout()">로그아웃</button>'
      + '</div>'
      + '</div>';
  }

  window.renderPendingPage = function(){
    showPage('pending');
    const el = document.getElementById('pendingContent');
    if(!el) return;

    const req = pendingRequest;
    const roleLabel = typeof getRequestedRoleLabel === 'function'
      ? getRequestedRoleLabel(req?.requested_role || currentRoleRow?.role || '')
      : (req?.requested_role || currentRoleRow?.role || '');

    if(!req && !currentRoleRow){
      el.innerHTML =
        '<div class="card" style="max-width:560px;margin:0 auto;padding:28px">'
        + '<div class="section-label" style="margin:0 0 10px">가입 신청 접수 중</div>'
        + '<div style="font-size:14px;line-height:1.7;color:var(--text2)">'
        + '가입 신청 정보를 준비하고 있습니다.<br>'
        + '잠시 후 다시 확인하면 관리자 승인 대기 상태가 표시됩니다.'
        + '</div>'
        + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">'
        + '<button class="btn primary" onclick="refreshApprovalState()">다시 확인</button>'
        + '<button class="btn ghost" onclick="doLogout()">로그아웃</button>'
        + '</div>'
        + '</div>';
      return;
    }

    const status = req?.status || (currentRoleRow ? 'approved' : 'pending');
    const statusLabel = status === 'approved' ? '승인 완료'
      : status === 'rejected' ? '반려'
      : status === 'draft' ? '임시 저장'
      : '승인 대기';

    el.innerHTML =
      '<div class="card" style="max-width:560px;margin:0 auto;padding:28px">'
      + '<div class="section-label" style="margin:0 0 10px">가입 신청 상태</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'
      + '<span class="badge badge-blue">' + esc(statusLabel) + '</span>'
      + (roleLabel ? ('<span class="badge badge-gray">' + esc(roleLabel) + '</span>') : '')
      + '</div>'
      + '<div style="font-size:14px;line-height:1.7;color:var(--text2)">'
      + (status === 'rejected'
          ? '가입 신청이 반려되었습니다. 관리자가 남긴 안내를 확인한 뒤 다시 요청해 주세요.'
          : '가입 신청이 접수되었습니다. 관리자가 승인하면 바로 접속할 수 있습니다.<br>승인 전에는 메인 서비스에 들어갈 수 없습니다.')
      + '</div>'
      + (req ? (
          '<div class="card-sm" style="margin:14px 0 0;background:var(--bg)">'
          + '<div class="info-row"><span class="info-label">이름</span><span class="info-value">' + esc(req.name || '') + '</span></div>'
          + '<div class="info-row"><span class="info-label">이메일</span><span class="info-value">' + esc(req.email || currentUser?.email || '') + '</span></div>'
          + '<div class="info-row"><span class="info-label">요청 권한</span><span class="info-value">' + esc(roleLabel || '멤버') + '</span></div>'
          + '<div class="info-row"><span class="info-label">신청 시각</span><span class="info-value">' + esc(typeof formatPendingDate === 'function' ? formatPendingDate(req.created_at) : (req.created_at || '')) + '</span></div>'
          + (req.note ? '<div style="font-size:12px;color:var(--text2);line-height:1.7;padding-top:10px">' + esc(req.note) + '</div>' : '')
          + '</div>'
        ) : '')
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">'
      + '<button class="btn primary" onclick="refreshApprovalState()">다시 확인</button>'
      + (status === 'rejected' || status === 'draft' ? '<button class="btn" onclick="editMyAccessRequest()">가입 신청 수정</button>' : '')
      + '<button class="btn ghost" onclick="doLogout()">로그아웃</button>'
      + '</div>'
      + '</div>';
  };

  window.initApp = async function(){
    if(window.__STABLE_BOOT_RUNNING__) return;
    window.__STABLE_BOOT_RUNNING__ = true;
    try{
      await refreshRoleContext();
      if(!currentRoleRow){
        try{
          await ensurePendingAccessRequest();
          await refreshRoleContext();
        }catch(error){
          console.error('auto access request failed:', error);
        }
        window.renderPendingPage();
        return;
      }
      if(!roleIsAdmin() && !currentMember && !window.__LOCAL_VERIFY_ACTIVE__){
        renderMissingProfilePage();
        return;
      }

      showPage('main');
      if(typeof applyRolePermissions === 'function') applyRolePermissions();

      const userDisplay = document.getElementById('userDisplay');
      if(userDisplay){
        userDisplay.textContent = currentMember?.name || currentUser?.email || '';
      }

      await loadAll();

      try{ checkPopup(); }catch(error){ console.error('popup init failed:', error); }
      try{ setPage('team'); }catch(error){
        console.error('initial landing failed:', error);
        try{ setPage('clients'); }catch(innerError){ console.error('fallback landing failed:', innerError); }
      }
      try{ loadInitialNotifBadge(); }catch(error){ console.error('notif badge init failed:', error); }
      try{ initRealtime(); }catch(error){ console.error('realtime init failed:', error); }
    } finally {
      window.__STABLE_BOOT_RUNNING__ = false;
    }
  };

  function rerunStableBootIfNeeded(){
    if(window.__LOCAL_VERIFY_ACTIVE__) return;
    if(currentUser && accessToken){
      setTimeout(function(){
        if(currentUser && accessToken){
          window.initApp().catch(function(error){
            console.error('stable boot failed:', error);
          });
        }
      }, 0);
    }
  }

  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', rerunStableBootIfNeeded);
  }else{
    rerunStableBootIfNeeded();
  }
  window.addEventListener('load', rerunStableBootIfNeeded);
})();
