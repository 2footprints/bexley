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

  if(typeof window.openMemberManager === 'function'){
    const baseOpenMemberManager = window.openMemberManager;
    window.openMemberManager = function(){
      baseOpenMemberManager();
      injectMemberManagerHints();
    };
  }
})();
