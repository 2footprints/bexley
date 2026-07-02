function getModalArea(){
  return document.getElementById('modalArea');
}
function getInputModalOverlayHtml(){
  return '<div class="overlay" data-modal-kind="input" data-backdrop-close="off">';
}
function lockBodyScroll(){
  document.body.style.overflow='hidden';
}
function unlockBodyScroll(){
  document.body.style.overflow='';
}
function bindModalEscapeHandler(){
  if(window.__modalEscapeHandler)document.removeEventListener('keydown',window.__modalEscapeHandler);
  window.__modalEscapeHandler=function(event){
    if(event.key==='Escape'&&getModalArea()?.innerHTML.trim())closeModal();
  };
  document.addEventListener('keydown',window.__modalEscapeHandler);
}
function clearModalEscapeHandler(){
  if(window.__modalEscapeHandler){
    document.removeEventListener('keydown',window.__modalEscapeHandler);
    window.__modalEscapeHandler=null;
  }
}
function closeModal(){
  clearModalEscapeHandler();
  unlockBodyScroll();
  getModalArea().innerHTML='';
}
