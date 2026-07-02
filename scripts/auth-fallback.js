window.switchLoginType = window.switchLoginType || function(type){
  var staffBtn=document.getElementById('typeStaff');
  var clientBtn=document.getElementById('typeClient');
  var staffArea=document.getElementById('staffLoginArea');
  var clientArea=document.getElementById('clientLoginArea');
  if(staffBtn) staffBtn.classList.toggle('active',type==='staff');
  if(clientBtn) clientBtn.classList.toggle('active',type==='client');
  if(staffArea) staffArea.style.display=type==='staff'?'block':'none';
  if(clientArea) clientArea.style.display=type==='client'?'block':'none';
};
window.switchTab = window.switchTab || function(mode){
  var loginTab=document.getElementById('tabLogin');
  var signupTab=document.getElementById('tabSignup');
  var authBtn=document.getElementById('authBtn');
  var authMsg=document.getElementById('authMsg');
  if(loginTab) loginTab.classList.toggle('active',mode==='login');
  if(signupTab) signupTab.classList.toggle('active',mode==='signup');
  if(authBtn) authBtn.textContent=mode==='login'?'로그인':'회원가입';
  if(authMsg) authMsg.textContent='';
  window.__loginAuthMode=mode;
};
window.addEventListener('DOMContentLoaded',function(){
  window.switchLoginType('staff');
  window.switchTab('login');
});
