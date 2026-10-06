/* ==========================================================================
 * 19-mobile-reader.js — ЧИТАЛКА — режим чтения на телефоне (≤880px)
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 19 JS-скриптов, подключаются строго по номеру.
 * Что делает: превращает мобильную версию в читалку (по образцу Яндекс Книг):
 *   - applyReaderMode(): переключает режим чтения — текст только для чтения
 *     (contenteditable=false), zen выключается, шторки/меню закрываются;
 *   - тап-зоны по #scroller: левая треть — экран назад, правая — вперёд,
 *     центр — показать/спрятать панель; панель гаснет при скролле;
 *   - панель #rdTop/#rdHud: прогресс главы, «осталось ≈ N мин», переходы
 *     по главам (памятка и «Заметки» пропускаются), оглавление, шит «Aa»;
 *   - шит «Aa»: тема, размер шрифта, интерлиньяж, отступ от стенок,
 *     выравнивание текста — хранятся в state.theme и state.ui (rs/rl/pm/ra);
 *   - applyReaderPrefs(): шрифт (--rd-fs), интерлиньяж (--rd-lh), поля
 *     (--rd-pad), выравнивание (--rd-align, --rd-hyph).
 * Ключевое: applyReaderMode, applyReaderPrefs, updateReaderChrome,
 *   showReaderUi/hideReaderUi, readerGoto, isReader (01-core).
 * Зависимости: 01–18; вызывается из 17-start (startApp) и 15-editor
 *   (loadChapter/enterEditor/setWorkspaceVisible).
 * ========================================================================== */
"use strict";
/* ===== настройки чтения ===== */
var RD_FS=[15,16.5,18,19.5,21];   /* ступени размера шрифта, px */
var RD_LH=[1.6,1.8,2];            /* ступени интерлиньяжа */
var RD_PAD=[14,22,34];            /* отступ от стенок, px */
var RD_ALIGN=['left','justify'];  /* выравнивание текста */
var rdUiTimer=null, rdSeeking=false, rdLockUntil=0;

function rdSeg(sel,attr,val){
  var host=$(sel);if(!host)return;
  Array.prototype.forEach.call(host.querySelectorAll('button'),function(b){
    b.classList.toggle('on',b.getAttribute('data-'+attr)===String(val));
  });
}
function applyReaderPrefs(){
  var u=(state&&state.ui&&typeof state.ui==='object')?state.ui:{};
  var fi=(typeof u.rs==='number')?clamp(u.rs,0,RD_FS.length-1):2;
  var li=(typeof u.rl==='number')?clamp(u.rl,0,RD_LH.length-1):1;
  var pi=(typeof u.pm==='number')?clamp(u.pm,0,RD_PAD.length-1):1;
  var ai=(typeof u.ra==='number')?clamp(u.ra,0,RD_ALIGN.length-1):0;
  var align=RD_ALIGN[ai];
  var r=document.documentElement.style;
  r.setProperty('--rd-fs',RD_FS[fi]+'px');
  r.setProperty('--rd-lh',String(RD_LH[li]));
  r.setProperty('--rd-pad',RD_PAD[pi]+'px');
  r.setProperty('--rd-align',align);
  r.setProperty('--rd-hyph',align==='justify'?'auto':'manual');
  var fs=$('#rdFs');
  if(fs){
    if(document.activeElement!==fs)fs.value=String(fi);
    fs.style.setProperty('--p',(fi/(RD_FS.length-1)*100)+'%');
  }
  rdSeg('#rdTheme','t',state?state.theme:'light');
  rdSeg('#rdLh','i',li);
  rdSeg('#rdPad','i',pi);
  rdSeg('#rdAlign','i',ai);
}
function rdSetUi(k,v){
  state.ui=(state.ui&&typeof state.ui==='object')?state.ui:{};
  state.ui[k]=v;persist();applyReaderPrefs();
}
function rdStepFs(d){
  state.ui=(state.ui&&typeof state.ui==='object')?state.ui:{};
  var cur=(typeof state.ui.rs==='number')?state.ui.rs:2;
  state.ui.rs=clamp(cur+d,0,RD_FS.length-1);
  persist();applyReaderPrefs();
}

/* ===== режим чтения ===== */
function applyReaderMode(){
  var on=mqMobile.matches;
  document.body.classList.toggle('reader',on);
  if(on){
    if(document.body.classList.contains('zen'))toggleZen();
    editor.contentEditable='false';
  }else{
    editor.contentEditable=isReadOnly()?'false':'true';
    closeReaderSheet();
    hideReaderUi();
  }
  applyReaderPrefs();
  updateReaderChrome();
}

/* ===== панель управления ===== */
function showReaderUi(){
  if(!isReader())return;
  document.body.classList.add('rd-ui');
  rdLockUntil=Date.now()+700;
  clearTimeout(rdUiTimer);
  rdUiTimer=setTimeout(function(){hideReaderUi()},2800);
}
function hideReaderUi(){
  clearTimeout(rdUiTimer);
  if(document.body.classList.contains('rd-sheet'))return;
  document.body.classList.remove('rd-ui');
}
function toggleReaderUi(){
  if(document.body.classList.contains('rd-ui'))hideReaderUi();else showReaderUi();
}
function openReaderSheet(){
  if(!isReader())return;
  document.body.classList.add('rd-sheet');
  applyReaderPrefs();
  showReaderUi();
}
function closeReaderSheet(){
  if(!document.body.classList.contains('rd-sheet'))return;
  document.body.classList.remove('rd-sheet');
  /* панель могла «пережить» шит — перезапускаем автоскрытие */
  if(isReader()&&document.body.classList.contains('rd-ui'))showReaderUi();
}
function toggleReaderSheet(){
  if(document.body.classList.contains('rd-sheet'))closeReaderSheet();else openReaderSheet();
}

/* ===== прогресс главы ===== */
function readerScrollPct(){
  var max=scroller.scrollHeight-scroller.clientHeight;
  return max>4?clamp(scroller.scrollTop/max,0,1):0;
}
function updateReaderProgress(){
  if(!isReader())return;
  var p=readerScrollPct(),pct=Math.round(p*100);
  var seek=$('#rdSeek');
  if(seek&&!rdSeeking){
    seek.value=String(Math.round(p*1000));
    seek.style.setProperty('--p',(p*100).toFixed(1)+'%');
  }
  var pe=$('#rdPct');if(pe)pe.textContent=pct+'%';
  var ch=currentCh(),w=ch?chapterWords(ch):0;
  var le=$('#rdLeft');
  if(le)le.textContent=w?('ост ≈ '+Math.max(1,Math.ceil(w*(1-p)/180))+' мин'):'пустая глава';
}

/* ===== навигация по главам ===== */
function readerNeighbour(dir){
  var b=book();if(!b)return null;
  var arr=b.chapters,i=arr.indexOf(currentCh());
  if(i<0)return null;
  for(var k=i+dir;k>=0&&k<arr.length;k+=dir){
    if(!isPamatka(arr[k])&&!isNotesCh(arr[k]))return arr[k];
  }
  return null;
}
function readerGoto(dir){
  var ch=readerNeighbour(dir);if(!ch)return;
  openChapter(ch.id);
  showReaderUi();
}
function updateReaderChrome(){
  if(!isReader()||!state)return;
  var b=book();
  var rdB=$('#rdBook'),rdC=$('#rdCh'),rdP=$('#rdPos');
  if(!b){if(rdB)rdB.textContent='';if(rdC)rdC.textContent='';if(rdP)rdP.textContent='';return}
  if(rdB)rdB.textContent=b.title||'Без названия';
  var ch=currentCh();
  if(rdC)rdC.textContent=ch?chapterTitle(ch):'';
  var vis=visibleChapters(b),vi=ch?vis.indexOf(ch):-1;
  if(rdP)rdP.textContent=vi>=0
    ?('Глава '+(vi+1)+' из '+vis.length)
    :(isNotesCh(ch)?'Заметки':(isPamatka(ch)?'Памятка':'—'));
  var pr=$('#rdPrev'),nx=$('#rdNext');
  if(pr)pr.disabled=!readerNeighbour(-1);
  if(nx)nx.disabled=!readerNeighbour(1);
  updateReaderProgress();
  if(workspace.hidden)hideReaderUi();
}

/* ===== тап-зоны и скролл ===== */
scroller.addEventListener('click',function(e){
  if(!isReader()||workspace.hidden)return;
  if(e.target.closest('.wiki'))return;
  var x=(typeof e.clientX==='number'?e.clientX:0)/Math.max(1,innerWidth);
  var step=Math.max(240,innerHeight-140);
  if(x<0.34)scroller.scrollBy({top:-step,behavior:'smooth'});
  else if(x>0.66)scroller.scrollBy({top:step,behavior:'smooth'});
  else if(document.body.classList.contains('rd-ui'))hideReaderUi();
  else showReaderUi();
});
scroller.addEventListener('scroll',function(){
  if(!isReader()||workspace.hidden)return;
  updateReaderProgress();
  if(rdSeeking||Date.now()<rdLockUntil)return;
  hideReaderUi();
},{passive:true});

/* ===== ползунок прогресса ===== */
(function(){
  var seek=$('#rdSeek');if(!seek)return;
  function applySeek(){
    var v=+seek.value;
    var max=scroller.scrollHeight-scroller.clientHeight;
    scroller.scrollTop=(v/1000)*max;
    seek.style.setProperty('--p',(v/10)+'%');
    var pe=$('#rdPct');if(pe)pe.textContent=Math.round(v/10)+'%';
  }
  seek.addEventListener('pointerdown',function(){rdSeeking=true});
  seek.addEventListener('input',function(){if(!isReader())return;rdSeeking=true;applySeek()});
  seek.addEventListener('change',function(){rdSeeking=false;updateReaderProgress()});
  seek.addEventListener('pointerup',function(){rdSeeking=false;updateReaderProgress()});
  seek.addEventListener('pointercancel',function(){rdSeeking=false;updateReaderProgress()});
  /* отпустили пальцем вне ползунка — иначе rdSeeking залипает и панель не гаснет */
  window.addEventListener('pointerup',function(){
    if(!rdSeeking)return;
    rdSeeking=false;updateReaderProgress();
  });
})();

/* ===== кнопки панелей и шита ===== */
$('#rdBack').addEventListener('click',function(){hideReaderUi();toLibrary()});
$('#rdPrev').addEventListener('click',function(){readerGoto(-1)});
$('#rdNext').addEventListener('click',function(){readerGoto(1)});
$('#rdToc').addEventListener('click',function(){
  hideReaderUi();
  var b=book();if(!b)return;
  if(isReadOnly()){if(typeof openForeignOverview==='function')openForeignOverview();return}
  openBookOverview(b.id);
});
$('#rdAa').addEventListener('click',function(){toggleReaderSheet()});
$('#rdScrim').addEventListener('click',function(){closeReaderSheet()});

Array.prototype.forEach.call(document.querySelectorAll('#rdTheme button'),function(btn){
  btn.addEventListener('click',function(){setTheme(btn.getAttribute('data-t'));applyReaderPrefs()});
});
Array.prototype.forEach.call(document.querySelectorAll('#rdLh button'),function(btn){
  btn.addEventListener('click',function(){rdSetUi('rl',+btn.getAttribute('data-i'))});
});
Array.prototype.forEach.call(document.querySelectorAll('#rdPad button'),function(btn){
  btn.addEventListener('click',function(){rdSetUi('pm',+btn.getAttribute('data-i'))});
});
Array.prototype.forEach.call(document.querySelectorAll('#rdAlign button'),function(btn){
  btn.addEventListener('click',function(){rdSetUi('ra',+btn.getAttribute('data-i'))});
});
$('#rdFs').addEventListener('input',function(){if(state)rdSetUi('rs',+this.value)});
$('#rdFsMinus').addEventListener('click',function(){if(state)rdStepFs(-1)});
$('#rdFsPlus').addEventListener('click',function(){if(state)rdStepFs(1)});

document.addEventListener('keydown',function(e){
  if(e.key!=='Escape')return;
  if(document.body.classList.contains('rd-sheet')){closeReaderSheet();return}
  if(!isReader()||!document.body.classList.contains('rd-ui'))return;
  /* открытая модалка закрывается редакторским обработчиком — панель не гасим
     (слушатель в фазе capture, пока модалка ещё помечена как открытая) */
  if(($('#wikiViewModal')&&$('#wikiViewModal').classList.contains('on'))||
     ($('#wikiModal')&&$('#wikiModal').classList.contains('on'))||
     ($('#askModal')&&$('#askModal').classList.contains('on'))||
     ($('#dayModal')&&$('#dayModal').classList.contains('on'))||
     ($('#exportMenu')&&$('#exportMenu').classList.contains('on'))||
     ($('#accMenu')&&$('#accMenu').classList.contains('on')))return;
  hideReaderUi();
},true);

/* ===== старт ===== */
if(mqMobile.addEventListener)mqMobile.addEventListener('change',applyReaderMode);
else if(mqMobile.addListener)mqMobile.addListener(applyReaderMode);
applyReaderMode();
