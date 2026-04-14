(function(){
  if(window.__STABILIZE_BOOT_LOADED__) return;
  window.__STABILIZE_BOOT_LOADED__ = true;

  function renderMissingProfilePage(){
    showPage('pending');
    const el = document.getElementById('pendingContent');
    if(!el) return;
    el.innerHTML =
      '<div class="card" style="max-width:560px;margin:0 auto;padding:28px">'
      + '<div class="section-label" style="margin:0 0 10px">팀 프로필 연결 필요</div>'
      + '<div style="font-size:14px;line-height:1.7;color:var(--text2)">'
      + '로그인은 완료되었지만 이 계정과 연결된 팀 프로필을 찾지 못했습니다.<br>'
      + '관리자가 <code>members</code>와 <code>user_roles</code>를 연결해야 정상적으로 프로젝트와 팀 화면이 계산됩니다.'
      + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">'
      + '<button class="btn primary" onclick="refreshApprovalState()">다시 확인</button>'
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
        + '<div class="section-label" style="margin:0 0 10px">접근 승인 대기</div>'
        + '<div style="font-size:14px;line-height:1.7;color:var(--text2)">'
        + '이 계정은 아직 내부 사용 권한이 연결되지 않았습니다.<br>'
        + '관리자가 역할을 승인하면 팀 화면으로 진입할 수 있습니다.'
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
      : status === 'rejected' ? '반려됨'
      : status === 'draft' ? '임시 저장'
      : '승인 대기';

    el.innerHTML =
      '<div class="card" style="max-width:560px;margin:0 auto;padding:28px">'
      + '<div class="section-label" style="margin:0 0 10px">접근 상태 안내</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">'
      + '<span class="badge badge-blue">' + esc(statusLabel) + '</span>'
      + (roleLabel ? ('<span class="badge badge-gray">' + esc(roleLabel) + '</span>') : '')
      + '</div>'
      + '<div style="font-size:14px;line-height:1.7;color:var(--text2)">'
      + (status === 'rejected'
          ? '이전 접근 요청이 반려되었습니다. 요청 정보를 수정해 다시 신청할 수 있습니다.'
          : '현재 계정의 접근 권한을 확인 중입니다. 승인 전에는 메인 서비스에 진입할 수 없습니다.')
      + '</div>'
      + '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:16px">'
      + '<button class="btn primary" onclick="refreshApprovalState()">다시 확인</button>'
      + (status === 'rejected' || status === 'draft' ? '<button class="btn" onclick="editMyAccessRequest()">요청 수정</button>' : '')
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
