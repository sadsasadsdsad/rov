/* ==========================================================================
 * 07-layout.js — LAYOUT и UI-диалоги
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 18 JS-скриптов, подключаются строго по номеру.
 * Раздел оригинала: src/index.html, строки 2448–2529 (раздел 7 из 18).
 * Что делает: CSS-переменные раскладки (ширины колонок), позиционирование правого редактора, drag-хелпер (dragify), универсальные модалки-обёртки.
 * Ключевое: setLayoutVars, positionEdRz, setWorkspaceVisible, dragify, uiAsk, uiPrompt, uiConfirm.
 * Зависимости: 01-core; uiPrompt/uiConfirm используют 11-notes, 15-editor, 16-accounts.
 * ========================================================================== */
"use strict";
/* ===== layout ===== */
function setLayoutVars(){
  var u=state.ui,r=document.documentElement.style;
  r.setProperty('--side-w',(u.sideW||272)+'px');
  r.setProperty('--wiki-w',(u.wikiW||390)+'px');
  r.setProperty('--ed-w',(u.edW||660)+'px');
  positionEdRz();
}
function positionEdRz(){
  if(workspace.hidden)return;
  var r=editor.getBoundingClientRect();
  edRz.style.left=Math.min(r.right+8,innerWidth-8)+'px';
}
function setWorkspaceVisible(v){
  workspace.hidden=!v;
}
function dragX(handle,onMove){
  var active=false,lx=0;
  handle.addEventListener('pointerdown',function(e){active=true;lx=e.clientX;handle.setPointerCapture(e.pointerId);handle.classList.add('on');e.preventDefault();e.stopPropagation()});
  handle.addEventListener('pointermove',function(e){if(!active)return;var dx=e.clientX-lx;lx=e.clientX;onMove(dx)});
  handle.addEventListener('pointerup',function(){active=false;handle.classList.remove('on');persist()});
  handle.addEventListener('pointercancel',function(){active=false;handle.classList.remove('on')});
}
dragX(edRz,function(dx){state.ui.edW=clamp((state.ui.edW||660)+dx*2,520,1040);document.documentElement.style.setProperty('--ed-w',state.ui.edW+'px');positionEdRz()});
addEventListener('resize',function(){
  positionEdRz();
  updateStats();
  if(searchOpen)positionSearchResults();
  if(!$('#paneGraph').hidden)scheduleGraph();
  updatePanelTabs();
});

function dragify(modal,cardSel,headSel){
  var card=modal.querySelector(cardSel),head=modal.querySelector(headSel);
  var dx=0,dy=0,sx=0,sy=0,drag=false;
  head.addEventListener('pointerdown',function(e){
    if(e.target.closest('button'))return;
    drag=true;sx=e.clientX-dx;sy=e.clientY-dy;card.classList.add('dragging');
    try{head.setPointerCapture(e.pointerId)}catch(err){}
  });
  head.addEventListener('pointermove',function(e){
    if(!drag)return;dx=e.clientX-sx;dy=e.clientY-sy;
    card.style.transform='translate('+dx+'px,'+dy+'px)';
  });
  head.addEventListener('pointerup',function(){drag=false;card.classList.remove('dragging')});
  modal._dragReset=function(){dx=0;dy=0;card.style.transform='';card.classList.remove('dragging')};
}
dragify($('#wikiModal'),'.wm-card','.wm-head');

var askResolve=null;
function uiAsk(cfg){
  return new Promise(function(resolve){
    var m=$('#askModal');
    askResolve=resolve;
    $('#amTitle').textContent=cfg.title||'';
    var msg=$('#amMsg');
    if(cfg.message){msg.textContent=cfg.message;msg.hidden=false}else{msg.hidden=true;msg.textContent=''}
    var inp=$('#amInput');
    if(cfg.input){inp.hidden=false;inp.value=(cfg.value==null?'':cfg.value);inp.placeholder=cfg.placeholder||''}
    else{inp.hidden=true;inp.value=''}
    var ok=$('#amOk');
    ok.textContent=cfg.ok||'ОК';
    ok.classList.toggle('danger',!!cfg.danger);
    m.classList.add('on');
    setTimeout(function(){if(cfg.input){inp.focus();inp.select()}else ok.focus()},60);
  });
}
function askClose(val){
  var m=$('#askModal');
  if(!m.classList.contains('on'))return;
  m.classList.remove('on');
  var r=askResolve;askResolve=null;if(r)r(val);
}
function uiPrompt(title,value,placeholder){return uiAsk({title:title,value:value,placeholder:placeholder,input:true,ok:'СОХРАНИТЬ'})}
function uiConfirm(title,message,danger){return uiAsk({title:title,message:message,input:false,ok:danger?'УДАЛИТЬ':'ОК',danger:danger})}
$('#amOk').addEventListener('click',function(){var inp=$('#amInput');askClose(inp.hidden?true:(inp.value.trim()||null))});
$('#amCancel').addEventListener('click',function(){askClose(null)});
$('#askModal').addEventListener('click',function(e){if(e.target===this)askClose(null)});
$('#amInput').addEventListener('keydown',function(e){
  if(e.key==='Enter'){e.preventDefault();e.stopPropagation();askClose(this.value.trim()||null)}
  else if(e.key==='Escape'){e.preventDefault();e.stopPropagation();askClose(null)}
});

