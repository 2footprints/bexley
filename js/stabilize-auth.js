(function(){
  if(window.__STABILIZE_AUTH_LOADED__) return;
  window.__STABILIZE_AUTH_LOADED__ = true;

  const AUTH_REDIRECT_URL = window.location.origin + '/';
  let recoveryAccessToken = null;

  function authMessageEl(){
    return document.getElementById('authMsg');
  }

  function getAuthEmail(){
    return (document.getElementById('authEmail')?.value || '').trim();
  }

  function getAuthPassword(){
    return document.getElementById('authPw')?.value || '';
  }

  function getAuthButton(){
    return document.getElementById('authBtn');
  }

  function getAuthMode(){
    return window.__loginAuthMode || (typeof authMode !== 'undefined' ? authMode : 'login') || 'login';
  }

  function setAuthMode(mode){
    window.__loginAuthMode = mode;
    try{ authMode = mode; }catch(e){}
  }

  function setAuthMessage(text, type){
    const el = authMessageEl();
    if(typeof setMsg === 'function'){
      setMsg(el, text, type);
      return;
    }
    if(!el) return;
    el.textContent = text || '';
    el.className = 'login-msg' + (type ? ' ' + type : '');
  }

  function isValidWorkEmail(email){
    return !!email && /@bexleyintl\.com$/i.test(email);
  }

  function showResetBox(active, helpText){
    const box = document.getElementById('passwordResetBox');
    const help = document.getElementById('passwordResetHelp');
    if(!box) return;
    box.classList.toggle('active', !!active);
    if(help && typeof helpText === 'string'){
      help.textContent = helpText;
    }
    if(!active){
      const pw = document.getElementById('resetPw');
      const pw2 = document.getElementById('resetPwConfirm');
      if(pw) pw.value = '';
      if(pw2) pw2.value = '';
    }
  }

  function clearRecoveryUrlState(){
    try{
      const search = new URLSearchParams(window.location.search);
      search.delete('type');
      search.delete('access_token');
      search.delete('refresh_token');
      const next = window.location.pathname + (search.toString() ? ('?' + search.toString()) : '');
      history.replaceState(null, '', next);
    }catch(e){}
    if(window.location.hash){
      window.location.hash = '';
    }
  }

  function readRecoveryParams(){
    const hash = window.location.hash && window.location.hash.startsWith('#')
      ? new URLSearchParams(window.location.hash.slice(1))
      : new URLSearchParams();
    const search = new URLSearchParams(window.location.search);
    return {
      type: hash.get('type') || search.get('type') || '',
      accessToken: hash.get('access_token') || search.get('access_token') || '',
      refreshToken: hash.get('refresh_token') || search.get('refresh_token') || ''
    };
  }

  function mapAuthError(error){
    const message = String(error?.message || error || '');
    const map = {
      'Invalid login credentials':'이메일 또는 비밀번호가 올바르지 않습니다.',
      'Email not confirmed':'이메일 인증이 필요합니다. 메일함을 확인하거나 "인증 메일 재발송"을 눌러주세요.',
      'User already registered':'이미 가입된 계정입니다. 로그인하거나 인증 메일을 다시 받아주세요.',
      'Email rate limit exceeded':'잠시 후 다시 시도해주세요. 메일 발송 횟수 제한에 걸렸습니다.'
    };
    return map[message] || message || '인증 처리 중 오류가 발생했습니다.';
  }

  const baseSwitchTab = typeof window.switchTab === 'function'
    ? window.switchTab
    : function(mode){
        const loginTab = document.getElementById('tabLogin');
        const signupTab = document.getElementById('tabSignup');
        const authBtn = getAuthButton();
        if(loginTab) loginTab.classList.toggle('active', mode === 'login');
        if(signupTab) signupTab.classList.toggle('active', mode === 'signup');
        if(authBtn) authBtn.textContent = mode === 'login' ? '로그인' : '회원가입';
        setAuthMode(mode);
      };

  window.switchTab = function(mode){
    baseSwitchTab(mode);
    setAuthMode(mode);
    if(mode !== 'login' || !recoveryAccessToken){
      showResetBox(false, '');
    }
  };

  window.signIn = async function(email, password){
    const response = await fetch(SB_URL + '/auth/v1/token?grant_type=password', {
      method: 'POST',
      headers: {'Content-Type':'application/json','apikey':SB_KEY},
      body: JSON.stringify({ email, password })
    });
    const data = await response.json().catch(() => ({}));
    if(!response.ok){
      throw new Error(data.error_description || data.msg || data.error || data.message || '로그인에 실패했습니다.');
    }
    saveSession(data);
    return data;
  };

  window.signUp = async function(email, password){
    const response = await fetch(SB_URL + '/auth/v1/signup', {
      method: 'POST',
      headers: {'Content-Type':'application/json','apikey':SB_KEY},
      body: JSON.stringify({
        email,
        password,
        options: { emailRedirectTo: AUTH_REDIRECT_URL }
      })
    });
    const data = await response.json().catch(() => ({}));
    if(!response.ok){
      throw new Error(data.error_description || data.msg || data.error || data.message || '회원가입에 실패했습니다.');
    }
    return data;
  };

  window.doLogout = async function(){
    try{
      if(accessToken){
        await fetch(SB_URL + '/auth/v1/logout', {
          method: 'POST',
          headers: {'apikey':SB_KEY,'Authorization':'Bearer ' + accessToken}
        }).catch(() => {});
      }
    } finally {
      if(typeof clearSession === 'function') clearSession();
      recoveryAccessToken = null;
      showResetBox(false, '');
      if(typeof showPage === 'function') showPage('login');
      if(typeof switchLoginType === 'function') switchLoginType('staff');
      window.switchTab('login');
    }
  };

  window.doAuth = async function(){
    const email = getAuthEmail();
    const password = getAuthPassword();
    const button = getAuthButton();
    const mode = getAuthMode();

    if(!email || !password){
      setAuthMessage('이메일과 비밀번호를 입력해주세요.', 'err');
      return;
    }
    if(!isValidWorkEmail(email)){
      setAuthMessage('회사 이메일만 사용할 수 있습니다.', 'err');
      return;
    }
    if(password.length < 6){
      setAuthMessage('비밀번호는 6자 이상이어야 합니다.', 'err');
      return;
    }

    if(button){
      button.disabled = true;
      button.textContent = mode === 'login' ? '로그인 중...' : '가입 중...';
    }

    try{
      if(mode === 'login'){
        await window.signIn(email, password);
        if(typeof initApp === 'function'){
          await initApp();
        }
      }else{
        await window.signUp(email, password);
        window.switchTab('login');
        setAuthMessage('가입 완료! 이메일 인증 후 다시 로그인하면 관리자에게 가입 신청이 자동 접수됩니다. 관리자 승인 후 바로 접속할 수 있습니다.', 'ok');
      }
    }catch(error){
      setAuthMessage(mapAuthError(error), 'err');
    }finally{
      if(button){
        button.disabled = false;
        button.textContent = getAuthMode() === 'login' ? '로그인' : '회원가입';
      }
    }
  };

  window.cancelPasswordReset = function(){
    recoveryAccessToken = null;
    clearRecoveryUrlState();
    showResetBox(false, '');
    if(typeof switchLoginType === 'function') switchLoginType('staff');
    window.switchTab('login');
  };

  window.resendSignupEmail = async function(){
    const email = getAuthEmail();
    if(!isValidWorkEmail(email)){
      setAuthMessage('회사 이메일을 입력한 뒤 인증 메일을 다시 보내주세요.', 'err');
      return;
    }
    try{
      const response = await fetch(SB_URL + '/auth/v1/resend', {
        method: 'POST',
        headers: {'Content-Type':'application/json','apikey':SB_KEY},
        body: JSON.stringify({
          type: 'signup',
          email,
          options: { emailRedirectTo: AUTH_REDIRECT_URL }
        })
      });
      const data = await response.json().catch(() => ({}));
      if(!response.ok){
        throw new Error(data.error_description || data.msg || data.error || data.message || '인증 메일 재발송에 실패했습니다.');
      }
      setAuthMessage('인증 메일을 다시 보냈습니다. 메일함과 스팸함을 확인해주세요.', 'ok');
    }catch(error){
      setAuthMessage(mapAuthError(error), 'err');
    }
  };

  window.sendPasswordReset = async function(){
    const email = getAuthEmail();
    if(!isValidWorkEmail(email)){
      setAuthMessage('회사 이메일을 입력한 뒤 비밀번호 재설정을 요청해주세요.', 'err');
      return;
    }
    try{
      const response = await fetch(SB_URL + '/auth/v1/recover', {
        method: 'POST',
        headers: {'Content-Type':'application/json','apikey':SB_KEY},
        body: JSON.stringify({
          email,
          redirect_to: AUTH_REDIRECT_URL
        })
      });
      const data = await response.json().catch(() => ({}));
      if(!response.ok){
        throw new Error(data.error_description || data.msg || data.error || data.message || '비밀번호 재설정 메일 발송에 실패했습니다.');
      }
      setAuthMessage('비밀번호 재설정 메일을 보냈습니다. 메일의 링크를 열어 새 비밀번호를 설정해주세요.', 'ok');
    }catch(error){
      setAuthMessage(mapAuthError(error), 'err');
    }
  };

  window.completePasswordReset = async function(){
    const password = document.getElementById('resetPw')?.value || '';
    const confirm = document.getElementById('resetPwConfirm')?.value || '';
    const button = document.getElementById('resetPwBtn');

    if(!recoveryAccessToken){
      setAuthMessage('메일의 재설정 링크를 다시 열어주세요.', 'err');
      return;
    }
    if(password.length < 6){
      setAuthMessage('새 비밀번호는 6자 이상이어야 합니다.', 'err');
      return;
    }
    if(password !== confirm){
      setAuthMessage('새 비밀번호와 확인 값이 일치하지 않습니다.', 'err');
      return;
    }

    if(button) button.disabled = true;
    try{
      const response = await fetch(SB_URL + '/auth/v1/user', {
        method: 'PUT',
        headers: {
          'Content-Type':'application/json',
          'apikey':SB_KEY,
          'Authorization':'Bearer ' + recoveryAccessToken
        },
        body: JSON.stringify({ password })
      });
      const data = await response.json().catch(() => ({}));
      if(!response.ok){
        throw new Error(data.error_description || data.msg || data.error || data.message || '비밀번호 변경에 실패했습니다.');
      }
      recoveryAccessToken = null;
      clearRecoveryUrlState();
      showResetBox(false, '');
      if(typeof switchLoginType === 'function') switchLoginType('staff');
      window.switchTab('login');
      setAuthMessage('비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요.', 'ok');
    }catch(error){
      setAuthMessage(mapAuthError(error), 'err');
    }finally{
      if(button) button.disabled = false;
    }
  };

  function mountRecoveryState(){
    const recovery = readRecoveryParams();
    if(recovery.type !== 'recovery' || !recovery.accessToken) return;
    recoveryAccessToken = recovery.accessToken;
    if(typeof showPage === 'function') showPage('login');
    if(typeof switchLoginType === 'function') switchLoginType('staff');
    window.switchTab('login');
    showResetBox(true, '메일의 링크가 확인되었습니다. 아래에서 새 비밀번호를 입력해주세요.');
    setAuthMessage('새 비밀번호를 입력하고 저장해주세요.', 'ok');
  }

  const bootRecovery = function(){ setTimeout(mountRecoveryState, 0); };
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', bootRecovery);
  }else{
    bootRecovery();
  }
  window.addEventListener('load', bootRecovery);
})();
