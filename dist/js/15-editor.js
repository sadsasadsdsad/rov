/* ==========================================================================
 * 15-editor.js — РЕДАКТОР — ядро редактирования
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 18 JS-скриптов, подключаются строго по номеру.
 * Раздел оригинала: src/index.html, строки 4308–5416 (раздел 15 из 18).
 * Что делает: caret-хелперы, работа с блоками и slash-меню, панели выделения/синонимов, хоткеи, тема/zen, боковая панель глав (#btnSide/#veil), переключение глав, экспорт/печать, автосейв (scheduleSave) и тосты (toast).
 * Ключевое: caretStart/caretEnd, getBlock, convertBlock, openSlash, ITEMS, scheduleSave, toast, enterEditor, toggleZen, setTheme, createMarkAtCursor-вызовы, buildPrintBook.
 * Зависимости: крупнейший файл: использует 01–14; его toast/editor/caret используют 11, 16, 18.
 * ========================================================================== */
"use strict";
/* ===== caret helpers ===== */
function caretEnd(el){var r=document.createRange(),s=getSelection();r.selectNodeContents(el);r.collapse(false);s.removeAllRanges();s.addRange(r)}
function caretStart(el){var r=document.createRange(),s=getSelection();r.setStart(el,0);r.collapse(true);s.removeAllRanges();s.addRange(r)}
function getBlock(){
  var s=getSelection();if(!s.rangeCount)return null;
  var n=s.anchorNode;if(!n||!editor.contains(n))return null;
  if(n.nodeType===3)n=n.parentElement;
  return n.closest('p,h1,h2,blockquote,.nb');
}
function caretAtStartOf(block){
  var s=getSelection();if(!s.rangeCount)return false;
  var r=s.getRangeAt(0).cloneRange();r.collapse(true);
  var pre=r.cloneRange();pre.selectNodeContents(block);pre.setEnd(r.endContainer,r.endOffset);
  return pre.toString().length===0;
}
function convertBlock(block,tag){
  if(!block)return;
  if(block.tagName.toLowerCase()===tag){caretEnd(block);return}
  var n=mk(tag);while(block.firstChild)n.appendChild(block.firstChild);
  block.replaceWith(n);caretEnd(n);scheduleSave();
}
function reTag(block,tag,text){var n=mk(tag);n.textContent=text||'';block.replaceWith(n);caretEnd(n);scheduleSave()}
function makeSepFrom(block){
  var s=mk('div');s.className='sep';s.contentEditable='false';
  s.innerHTML='<span><i></i><i></i><i></i></span>';
  var p=mk('p');block.replaceWith(s);s.after(p);caretStart(p);scheduleSave();
}
function makeNoteFrom(block){
  var d=mk('div');d.className='nb';d.setAttribute('data-nid',uid());
  d.textContent=block.textContent||'';
  var p=mk('p');
  block.replaceWith(d);d.after(p);
  caretEnd(d);scheduleSave();
  if($('#wikiPanel').classList.contains('on')&&panelTab==='notes')renderNotes();
  else updatePanelTabs();
}
function splitBlock(block){
  var s=getSelection(),r=s.getRangeAt(0);r.deleteContents();
  var tail=document.createRange();tail.selectNodeContents(block);tail.setStart(r.endContainer,r.endOffset);
  var tag=(block.tagName==='H1'||block.tagName==='H2')?'p':block.tagName.toLowerCase();
  var p=mk(tag);p.appendChild(tail.extractContents());block.after(p);caretStart(p);scheduleSave();
}
function ensureLastP(){
  var last=editor.lastElementChild;
  if(!last||last.classList.contains('sep')||/^(H1|H2)$/.test(last.tagName)){
    var p=mk('p');editor.appendChild(p);last=p;
  }
  return last;
}

var ITEMS=[
  {tag:'h1',badge:'Н1',title:'Заголовок главы',hint:'CTRL ALT 1',al:'title заголовок h1'},
  {tag:'h2',badge:'Н2',title:'Подзаголовок',hint:'CTRL ALT 2',al:'subtitle подзаголовок h2'},
  {tag:'p',badge:'Aa',title:'Обычный текст',hint:'CTRL ALT 0',al:'text текст параграф p'},
  {tag:'blockquote',badge:'❝',title:'Цитата',hint:'CTRL ALT 3',al:'quote цитата эпиграф bq'},
  {tag:'nb',badge:'✎',title:'Заметка (не печатается)',hint:'CTRL ALT 4',al:'note заметка nb врезка комментарий'},
  {tag:'sep',badge:'✦',title:'Разделитель',hint:'— — —',al:'sep разделитель сцена'}
];
menu.innerHTML='<div role="group"><div class="bm-head">Вставить блок</div>'+ITEMS.map(function(it,i){
  return '<div class="bm-item" role="menuitem" tabindex="-1" data-i="'+i+'"><span class="bm-badge">'+it.badge+'</span><span class="t">'+it.title+'</span><span class="h">'+it.hint+'</span></div>';
}).join('')+'</div>';
var itemEls=Array.prototype.slice.call(menu.querySelectorAll('.bm-item'));
itemEls.forEach(function(el){
  el.addEventListener('mousedown',function(e){e.preventDefault()});
  el.addEventListener('click',function(){applyItem(ITEMS[+el.dataset.i])});
});
function openSlash(block,q){
  menuBlock=block;
  q=(q||'').toLowerCase().trim();
  menuItems=ITEMS.filter(function(it){return !q||it.title.toLowerCase().indexOf(q)>=0||it.tag.indexOf(q)>=0||(it.al||'').indexOf(q)>=0});
  itemEls.forEach(function(el,i){el.style.display=menuItems.indexOf(ITEMS[i])>=0?'':'none'});
  menuIdx=0;paintMenu();
  if(!menuItems.length){closeMenu();return}
  var r=null;
  try{var sel=getSelection();if(sel.rangeCount){var cr=sel.getRangeAt(0).getBoundingClientRect();if(cr&&(cr.top||cr.bottom))r=cr}}catch(e){}
  if(!r)r=block.getBoundingClientRect();
  var left=Math.max(10,r.left);
  if(left+254>innerWidth)left=innerWidth-264;
  menu.style.left=left+'px';menu.style.top=(r.bottom+8)+'px';
  menu.classList.add('on');menuOpen=true;
}
function paintMenu(){itemEls.forEach(function(el){el.classList.toggle('act',+el.dataset.i===ITEMS.indexOf(menuItems[menuIdx]))})}
function closeMenu(){menu.classList.remove('on');menuOpen=false;menuBlock=null}
function applyItem(item){
  if(!item)return;
  var block=menuBlock||getBlock();closeMenu();editor.focus();
  if(!block)return;
  if(item.tag==='sep'){block.textContent='';makeSepFrom(block);return}
  if(item.tag==='nb'){block.textContent='';makeNoteFrom(block);return}
  block.textContent='';convertBlock(block,item.tag);
}

var selbarButtons=selbar.querySelectorAll('.sb-row button');
selbarButtons.forEach(function(b){
  b.addEventListener('mousedown',function(e){e.preventDefault()});
  b.addEventListener('click',function(){
    if(isReadOnly())return;
    if(b.dataset.cmd==='wiki'){
      var t=getSelection().toString().replace(/\s+/g,' ').trim().slice(0,60);
      if(t)openWikiModal(null,t);
      return;
    }
    document.execCommand(b.dataset.cmd);editor.focus();refreshFloats();
  });
});

var activeSelRange=null;
var lastThesaurusWord=null;
function captureSelectionRange(){
  var s=getSelection();
  if(s.rangeCount&&!s.isCollapsed&&editor.contains(s.anchorNode)){
    activeSelRange=s.getRangeAt(0).cloneRange();return true;
  }
  return false;
}
function replaceSelectionWith(word){
  if(!activeSelRange||isReadOnly())return;
  try{
    var r=activeSelRange.cloneRange();
    r.deleteContents();
    var textNode=document.createTextNode(word);
    r.insertNode(textNode);
    var s=getSelection();s.removeAllRanges();
    var r2=document.createRange();
    r2.setStart(textNode,word.length);r2.collapse(true);
    s.addRange(r2);
  }catch(e){}
  activeSelRange=null;
  updateStats();scheduleSave();
}

var synbarLoadToken=0;
var thesaurusTimer=null;
var THESAURUS_DELAY=450;
var synSec=$('#synSec'),antSec=$('#antSec');
var synChips=$('#synChips'),antChips=$('#antChips');
var synSrc=$('#synSrc'),antSrc=$('#antSrc');
var synRetry=$('#synRetry');
function hideSynbar(){
  synbar.classList.remove('on');
  synSec.hidden=true;antSec.hidden=true;
  synChips.innerHTML='';antChips.innerHTML='';
  synSrc.textContent='';antSrc.textContent='';
  synRetry.hidden=true;lastThesaurusWord=null;
}
function fillChips(box,list){
  box.innerHTML='';
  if(!list||!list.length)return false;
  list.slice(0,40).forEach(function(w){
    var b=mk('button');b.type='button';b.textContent=w;
    b.title='Заменить на «'+w+'»';
    b.addEventListener('mousedown',function(e){e.preventDefault()});
    b.addEventListener('click',function(e){
      e.preventDefault();
      replaceSelectionWith(w);
      hideSynbar();selbar.classList.remove('on');
      editor.focus();
    });
    box.appendChild(b);
  });
  return true;
}
function fillMessage(box,txt,isErr){box.innerHTML='<div class="sb-empty'+(isErr?' err':'')+'">'+esc(txt)+'</div>'}
function fillLoading(box){box.innerHTML='<div class="sb-loading"><svg class="sp-ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round"><path d="M12 3a9 9 0 0 1 9 9"/></svg>ищем…</div>'}
function showThesaurusResult(word,res){
  if(!res){hideSynbar();return}
  var okSyn=fillChips(synChips,res.syn);
  var okAnt=fillChips(antChips,res.ant);
  if(!okSyn)fillMessage(synChips,'синонимов не нашлось');
  if(!okAnt)fillMessage(antChips,'антонимов не нашлось');
  var src=res.source||'—';
  if(res.fromCache)src+=' · кеш';
  synSrc.textContent=src;antSrc.textContent=src;
  synRetry.hidden=false;
}
function scheduleThesaurus(word,force){
  clearTimeout(thesaurusTimer);
  var token=++synbarLoadToken;
  synbar.classList.remove('on');
  synSec.hidden=true;antSec.hidden=true;
  lastThesaurusWord=word;
  thesaurusTimer=setTimeout(function(){
    if(token!==synbarLoadToken)return;
    synSec.hidden=false;antSec.hidden=false;
    synSrc.textContent='';antSrc.textContent='';
    synRetry.hidden=true;
    fillLoading(synChips);fillLoading(antChips);
    synbar.classList.add('on');
    fetchThesaurus(word).then(function(res){
      if(token!==synbarLoadToken)return;
      showThesaurusResult(word,res);
    }).catch(function(){
      if(token!==synbarLoadToken)return;
      fillMessage(synChips,'не удалось получить ответ',true);
      fillMessage(antChips,'не удалось получить ответ',true);
      synRetry.hidden=false;
    });
  },force?0:THESAURUS_DELAY);
}
synRetry.addEventListener('click',function(e){
  e.preventDefault();
  if(lastThesaurusWord){
    var k=normWord(lastThesaurusWord);
    if(THESAURUS_CACHE[k])delete THESAURUS_CACHE[k];
    scheduleThesaurus(lastThesaurusWord,true);
  }
});

function refreshFloats(){
  if(isReader()){selbar.classList.remove('on');hideSynbar();return}
  var s=getSelection(),showBar=false;
  if(s.rangeCount&&editor.contains(s.anchorNode)&&!s.isCollapsed){
    var txt=s.toString().trim();
    if(txt){
      var r=s.getRangeAt(0).getBoundingClientRect();
      var x=Math.min(Math.max(r.left+r.width/2,90),innerWidth-90);
      selbar.style.left=x+'px';
      selbar.style.top=Math.max(60,r.top-34)+'px';
      showBar=true;
      try{
        selbar.querySelector('[data-cmd=bold]').classList.toggle('active',document.queryCommandState('bold'));
        selbar.querySelector('[data-cmd=italic]').classList.toggle('active',document.queryCommandState('italic'));
      }catch(err){}
      captureSelectionRange();
      var oneWord=/^[А-Яа-яЁёA-Za-z-]{2,30}$/.test(txt);
      if(oneWord){
        synbar.style.left=x+'px';
        synbar.style.top=(r.bottom+14)+'px';
        if(txt!==lastThesaurusWord || !synbar.classList.contains('on'))scheduleThesaurus(txt,false);
      }else{
        clearTimeout(thesaurusTimer);synbarLoadToken++;hideSynbar();
      }
    }
  }
  if(!showBar){
    clearTimeout(thesaurusTimer);synbarLoadToken++;hideSynbar();
  }
  selbar.classList.toggle('on',showBar);
  var zen=document.body.classList.contains('zen');
  var blocks=Array.prototype.slice.call(editor.children);
  var act=getBlock();
  if(act)zenAnchor=act;
  var anchor=zenAnchor||act;
  var ai=anchor?blocks.indexOf(anchor):-1;
  blocks.forEach(function(el,i){
    if(zen){
      var d=Math.abs(i-ai);
      var op=(ai<0)?1:(d===0?1:(d===1?.5:(d===2?.26:.1)));
      el.style.opacity=op;
      el.classList.toggle('lit',d===0);
    }else{
      el.style.opacity='';el.classList.remove('lit');
    }
  });
  if(menuOpen&&menuBlock){
    var rm=menuBlock.getBoundingClientRect();
    menu.style.top=(rm.bottom+8)+'px';
  }
}
document.addEventListener('selectionchange',function(){
  refreshFloats();
  try{
    var s=getSelection();
    if(s.rangeCount&&editor.contains(s.anchorNode)){
      var r=s.getRangeAt(0);
      var pre=r.cloneRange();
      pre.selectNodeContents(editor);
      pre.setEnd(r.startContainer,r.startOffset);
      lastCaretOffset=pre.toString().length;
    }
  }catch(e){}
});
scroller.addEventListener('scroll',function(){selbar.classList.remove('on');hideSynbar()});

editor.addEventListener('keydown',function(e){
  if(isReader()||isReadOnly())return;
  if(selectedSep&&(e.key==='Delete'||e.key==='Backspace')){
    e.preventDefault();selectedSep.remove();selectedSep=null;scheduleSave();return;
  }
  if(e.key==='Escape'){closeMenu();return}
  if(menuOpen){
    if(e.key==='ArrowDown'){e.preventDefault();menuIdx=(menuIdx+1)%menuItems.length;paintMenu();return}
    if(e.key==='ArrowUp'){e.preventDefault();menuIdx=(menuIdx-1+menuItems.length)%menuItems.length;paintMenu();return}
    if(e.key==='Enter'||e.key==='Tab'){e.preventDefault();applyItem(menuItems[menuIdx]);return}
  }
  if((e.ctrlKey||e.metaKey)&&e.altKey&&e.code==='KeyM'){e.preventDefault();createMarkAtCursor();return}
  if((e.ctrlKey||e.metaKey)&&e.altKey&&e.code==='KeyN'){e.preventDefault();insertNoteAtCursor();return}
  if((e.ctrlKey||e.metaKey)&&e.altKey&&(e.code==='ArrowUp'||e.code==='ArrowDown')){
    e.preventDefault();
    var cur=currentCh();if(cur)moveChapter(cur.id,e.code==='ArrowUp'?-1:1);
    return;
  }
  var block=getBlock();
  if(e.key==='Enter'&&!e.shiftKey&&block){
    var tag=block.tagName;
    if(block.classList&&block.classList.contains('nb')){
      e.preventDefault();
      var np=mk('p');block.after(np);caretStart(np);scheduleSave();return;
    }
    if(tag==='H1'||tag==='H2'){
      e.preventDefault();
      if(!block.textContent.trim())convertBlock(block,'p');
      else{var p=mk('p');block.after(p);caretStart(p)}
      scheduleSave();return;
    }
    if(block.textContent.trim()==='---'){e.preventDefault();makeSepFrom(block);return}
    e.preventDefault();splitBlock(block);return;
  }
  if(e.key===' '&&block&&block.tagName==='P'){
    var t=block.textContent,m;
    if(t==='---'){e.preventDefault();makeSepFrom(block);return}
    if((m=t.match(/^##\s?(.*)$/))){e.preventDefault();reTag(block,'h2',m[1]);return}
    if((m=t.match(/^#\s?(.*)$/))){e.preventDefault();reTag(block,'h1',m[1]);return}
  }
  if(e.key==='Backspace'&&block){
    var prev=block.previousElementSibling;
    if(prev&&prev.classList.contains('sep')&&caretAtStartOf(block)){
      e.preventDefault();prev.remove();scheduleSave();return;
    }
    if(block.classList&&block.classList.contains('nb')&&!block.textContent.trim()&&caretAtStartOf(block)){
      e.preventDefault();block.remove();scheduleSave();
      if($('#wikiPanel').classList.contains('on')&&panelTab==='notes')renderNotes();
      else updatePanelTabs();
      return;
    }
  }
  if((e.ctrlKey||e.metaKey)&&e.altKey){
    var map={Digit1:'h1',Digit2:'h2',Digit3:'blockquote',Digit0:'p'}[e.code];
    if(map){e.preventDefault();convertBlock(block,map);return}
    if(e.code==='Digit4'){e.preventDefault();insertNoteAtCursor();return}
  }
});

editor.addEventListener('input',function(){
  var block=getBlock();
  if(block&&block.tagName==='P'){
    var t=block.textContent;
    if(t.indexOf('/')===0){openSlash(block,t.slice(1));updateStats();return}
    if(t==='---'){makeSepFrom(block);updateStats();return}
  }
  if(menuOpen&&(!block||block!==menuBlock||block.textContent.indexOf('/')!==0))closeMenu();
  updateStats();
  scheduleSave();
});

editor.addEventListener('paste',function(e){
  e.preventDefault();
  if(isReadOnly())return;
  var t=(e.clipboardData||window.clipboardData).getData('text/plain');
  if(t)document.execCommand('insertText',false,t);
});

editor.addEventListener('click',function(e){
  var wsp=e.target.closest('.wiki');
  if(wsp){openWikiView(wsp.dataset.wiki);return}
  if(isReader()||isReadOnly())return;
  var s=e.target.closest('.sep');
  if(selectedSep){selectedSep.classList.remove('selected');selectedSep=null}
  if(s){
    selectedSep=s;s.classList.add('selected');
    var nxt=s.nextElementSibling;
    if(!nxt){nxt=mk('p');s.after(nxt)}
    caretStart(nxt);
  }
});
scroller.addEventListener('click',function(e){
  if(isReader()||isReadOnly())return;
  if(e.target!==scroller&&e.target!==editor)return;
  caretEnd(ensureLastP());editor.focus();
});
document.addEventListener('click',function(e){
  if(selectedSep&&!e.target.closest('.sep')){selectedSep.classList.remove('selected');selectedSep=null}
  if(menuOpen&&!e.target.closest('#blockmenu'))closeMenu();
});

var statsTid=0;
/* дебаунс: вызывается на каждый ввод (innerText + layout) — хватает 120 мс,
   рендер статуса запаздывает незаметно, а лишние reflow на keystroke уходят */
function updateStats(){clearTimeout(statsTid);statsTid=setTimeout(updateStatsNow,120)}
function updateStatsNow(){
  var t=editor.innerText||'';
  var w=countWords(t),c=t.replace(/\s/g,'').length;
  var m=Math.ceil(w/180);
  var pos='',b=book();
  if(b){
    var ch=currentCh(),idx=ch?b.chapters.indexOf(ch):-1;
    if(idx>=0)pos='гл. '+(idx+1)+'/'+b.chapters.length+' · ';
  }
  var narrow=innerWidth<=560;
  var right=pos;
  if(w)right+=narrow?('≈'+m+' мин · '):('≈ '+m+' мин чтения · ');
  right+=fmt(w)+' '+(narrow?'сл.':plural(w,'слово','слова','слов'))+' · '+fmt(c)+' '+(narrow?'зн.':plural(c,'знак','знака','знаков'));
  $('#statRight').textContent=right;
}
function rememberPos(){var b=book();if(!b)return;var ch=currentCh();if(ch)ch.pos=scroller.scrollTop}
function commitNow(){
  if(typeof state==='undefined'||!state)return;   /* до инициализации состояния писать нечего */
  if(isReadOnly())return;
  var b=book();
  if(b&&workspace.hidden===false&&editorOwned){
    var ch=currentCh();
    var oldHtml=ch?ch.html:null;
    rememberPos();
    if(ch){ch.html=cleanHtml();if(ch.html!==oldHtml)b.updated=Date.now()}
    snapshotStats();persist();
  }
}
function scheduleSave(){
  if(typeof state==='undefined'||!state)return;   /* до инициализации состояния — не рисуем статус */
  if(isReadOnly()){saveTxt.textContent='Только чтение';return}
  saveTxt.textContent='Сохранение…';
  clearTimeout(saveTimer);
  saveTimer=setTimeout(function(){
    var b=book();if(!b)return;
    rememberPos();
    var ch=currentCh();
    var oldHtml=ch?ch.html:null;
    /* F12: пишем DOM в главу только когда редактор открыт — иначе можно
       затереть главу пустым/чужим содержимым (закрытая чужая книга, старт);
       F14: и только если в DOM действительно своя глава */
    if(ch&&workspace.hidden===false&&editorOwned)ch.html=cleanHtml();
    if(ch&&ch.html!==oldHtml)b.updated=Date.now();
    snapshotStats();
    persist();invalidateCo();renderList(false);
    if($('#wikiPanel').classList.contains('on')){
      if(panelTab==='world')renderWiki();
      else if(panelTab==='notes')renderNotes();
      else if(panelTab==='graph')scheduleGraph();
    }
    updateCrumb();
    saveTxt.textContent='Сохранено · '+new Date().toLocaleTimeString('ru-RU',{hour:'2-digit',minute:'2-digit'});
    saveDot.classList.remove('pulse');void saveDot.offsetWidth;saveDot.classList.add('pulse');
  },600);
}
addEventListener('beforeunload',commitNow);
/* вкладка ушла в фон — дописываем сразу, а не через 600 мс автосейва:
   вкладку могут выгрузить, пока «Сохранение…» ещё в очереди */
document.addEventListener('visibilitychange',function(){if(document.hidden)commitNow()});

$('#btnBackup').addEventListener('click',function(){
  commitNow();
  var d=new Date();
  var name='chernovik-backup-'+d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')+'.json';
  var a=mk('a');
  a.href=URL.createObjectURL(new Blob([JSON.stringify(state,null,2)],{type:'application/json'}));
  a.download=name;a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href)},1000);
});
$('#btnRestore').addEventListener('click',function(){$('#restoreInput').click()});
$('#restoreInput').addEventListener('change',function(){
  var f=this.files&&this.files[0];this.value='';
  if(f)restoreBackup(f);
});
function restoreBackup(file){
  var reader=new FileReader();
  reader.onload=function(){
    var st=null;
    try{st=normalizeState(JSON.parse(reader.result))}catch(e){st=null}
    if(st)st=migrateHeroes(st);
    if(st)st=ensureMarksOnChapters(st);
    /* санитайзер из 21-shared: защита от импорта вредоносного бэкапа */
    if(st&&typeof sanitizeChapterHtml==='function'){
      st.books.forEach(function(bk){(bk.chapters||[]).forEach(function(c){c.html=sanitizeChapterHtml(c.html)})});
    }
    if(!st){toast('Это не похоже на резервную копию «Черновика» — файл не читается.');return}
    uiConfirm('Загрузить резервную копию?','Текущие книги будут полностью заменены.',false).then(function(ok){
      if(!ok)return;
      state=st;state.spell=false;
      state.ui=(state.ui&&typeof state.ui==='object')?state.ui:{};
      state.stats=(state.stats&&typeof state.stats==='object')?state.stats:{};
      Object.keys(state.stats).forEach(function(k){
        if(typeof state.stats[k]==='number')state.stats[k]={__all:state.stats[k]};
      });
      state.books.forEach(refreshPamatka);
      state.books.forEach(function(b){
        b.customTypes=Array.isArray(b.customTypes)?b.customTypes:[];
        b.wiki=Array.isArray(b.wiki)?b.wiki:[];
        b.wiki.forEach(function(w){w.aliases=Array.isArray(w.aliases)?w.aliases:[]});
        ensureNotesChapter(b);
        /* откат из бэкапа должен победить свежую серверную копию (H8):
           иначе LWW сразу вернёт серверную версию по старому updated */
        b.updated=Date.now();
      });
      if(typeof Sync!=='undefined'&&Sync){Sync.sentBooks={};Sync.markDirty()}
      persist();invalidateCo();
      document.body.classList.remove('zen','side-open');
      $('#btnZen').classList.remove('on');
      setTheme(state.theme||'light');
      setLayoutVars();
      closeMenu();selbar.classList.remove('on');hideSynbar();clearSearch();
      toggleWikiPanel(false);
      setWorkspaceVisible(false);
      library.hidden=false;library.scrollTop=0;viewIn(library);
      renderLibrary();
      renderMarksRail();
    });
  };
  reader.readAsText(file);
}

function clearDropMarks(){
  list.querySelectorAll('.drop-before,.drop-after').forEach(function(n){n.classList.remove('drop-before','drop-after')});
  list.classList.remove('drop-end');
}
/* moveChapter определён ниже — рядом с клавиатурной перестановкой Alt+↑/↓ */
function dropAtEnd(){
  var b=book();if(!b||!dragChId||isReadOnly())return;
  var arr=b.chapters;
  var from=arr.findIndex(function(x){return x.id===dragChId});
  if(from>=0&&from<arr.length-1){
    var it=arr.splice(from,1)[0];arr.push(it);
    b.updated=Date.now();                  /* H5 */
    persist();renderList(false);updateStats();
  }
}
list.addEventListener('dragover',function(e){
  if(!dragChId)return;
  if(e.target===list){e.preventDefault();clearDropMarks();list.classList.add('drop-end')}
});
list.addEventListener('dragleave',function(e){if(e.target===list)list.classList.remove('drop-end')});
list.addEventListener('drop',function(e){if(dragChId&&list.classList.contains('drop-end')){e.preventDefault();dropAtEnd()}});

/* перестановка глав с клавиатуры (Alt+↑/↓) — альтернатива drag&drop */
function moveChapter(id,dir){
  var b=book();if(!b||isReadOnly())return;
  var arr=b.chapters,i=-1;
  for(var k=0;k<arr.length;k++){if(arr[k].id===id){i=k;break}}
  var j=i+dir;
  if(i<0||j<0||j>=arr.length)return;
  arr.splice(j,0,arr.splice(i,1)[0]);
  b.updated=Date.now();                          /* H5: дата пишется при любой правке */
  persist();renderList(false);
  var rows=list.querySelectorAll('.ch');
  if(rows[j]){
    var ob=rows[j].querySelector('.ch-open');
    if(ob)ob.focus();
  }
  toast('Глава перемещена на '+(j+1)+'-е место');
}

function renderList(animate){
  var b=book();if(!b)return;
  var keepScroll=list.scrollTop;        /* пересборка строк сбрасывает скролл —
     позицию сохраняем: клик по главе не дёргает список, а центрирование
     ниже доводит его плавно */
  list.innerHTML='';
  var total=0;
  b.chapters.forEach(function(ch,i){
    var isNotes=isNotesCh(ch);
    var w=(isNotes||isPamatka(ch))?0:chapterWords(ch);total+=w;
    var el=mk('div');
    el.className='ch'+(ch.id===b.current?' active':'')+(animate?' boot':'')+(isNotes?' notes-ch':'');
    el.setAttribute('data-ch',ch.id);         /* адрес для копий-колец и поиска */
    if(animate)el.style.animationDelay=(i*35)+'ms';
    el.draggable=!isReadOnly();
    var nbIc='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" style="width:11px;height:11px"><path d="M4 20l1-4L16.5 4.5a1.8 1.8 0 0 1 2.6 0l.4.4a1.8 1.8 0 0 1 0 2.6L8 19l-4 1Z"/><path d="M14.5 6.5l3 3"/></svg>';
    el.innerHTML='<button type="button" class="ch-open"><span class="num">'+(isNotes?nbIc:String(i+1).padStart(2,'0'))+'</span><span class="ttl"></span><span class="wc"></span></button>'+
      (isNotes||isReadOnly()?'':'<button type="button" class="del" title="Удалить главу" aria-label="Удалить главу">×</button>');
    el.querySelector('.ttl').textContent=chapterTitle(ch);
    el.querySelector('.wc').textContent=isNotes?'—':fmt(w);
    el.addEventListener('click',function(){openChapter(ch.id)});
    var openBtn=el.querySelector('.ch-open');
    /* клавиатурная альтернатива перетаскиванию: Alt+↑ / Alt+↓ */
    openBtn.addEventListener('keydown',function(e){
      if(!e.altKey||(e.key!=='ArrowUp'&&e.key!=='ArrowDown'))return;
      e.preventDefault();e.stopPropagation();
      moveChapter(ch.id,e.key==='ArrowUp'?-1:1);
    });
    var delBtn=el.querySelector('.del');
    if(delBtn){
      delBtn.addEventListener('click',function(e){
        e.stopPropagation();
        if(b.chapters.length===1)return;
        uiConfirm('Удалить главу?','«'+chapterTitle(ch)+'» будет удалена безвозвратно.',true).then(function(ok){
          if(!ok)return;
          b.chapters=b.chapters.filter(function(x){return x.id!==ch.id});
          b.updated=Date.now();               /* H5: без бампа правка не уезжает на сервер */
          if(b.current===ch.id)openChapter(b.chapters[0].id,true);
          persist();invalidateCo();renderList(true);
        });
      });
    }
    el.addEventListener('dragstart',function(e){
      dragChId=ch.id;el.classList.add('drag');
      e.dataTransfer.effectAllowed='move';
      try{e.dataTransfer.setData('text/plain',ch.id)}catch(err){}
    });
    el.addEventListener('dragend',function(){el.classList.remove('drag');dragChId=null;clearDropMarks()});
    el.addEventListener('dragover',function(e){
      if(!dragChId||dragChId===ch.id)return;
      e.preventDefault();e.stopPropagation();
      e.dataTransfer.dropEffect='move';
      var r=el.getBoundingClientRect();
      var before=(e.clientY-r.top)<r.height/2;
      clearDropMarks();
      el.classList.add(before?'drop-before':'drop-after');
    });
    el.addEventListener('drop',function(e){
      e.preventDefault();e.stopPropagation();
      if(!dragChId||dragChId===ch.id)return;
      var before=el.classList.contains('drop-before');
      var arr=b.chapters;
      var from=arr.findIndex(function(x){return x.id===dragChId});
      if(from<0)return;
      var item=arr.splice(from,1)[0];
      var to=arr.findIndex(function(x){return x.id===ch.id});
      arr.splice(before?to:to+1,0,item);
      dragChId=null;clearDropMarks();
      b.updated=Date.now();                  /* H5 */
      persist();invalidateCo();renderList(false);updateStats();
    });
    list.appendChild(el);

    if(ch.marks&&ch.marks.length){
      var marksWrap=mk('div');
      marksWrap.className='ch-marks';
      ch.marks.forEach(function(m){
        var mi=mk('div');
        mi.className='mark-item';
        mi.innerHTML='<button type="button" class="mark-open"><span class="mark-lbl"></span></button><button type="button" class="mark-del" title="Удалить метку" aria-label="Удалить метку">×</button>';
        mi.querySelector('.mark-lbl').textContent=m.label;
        mi.addEventListener('click',function(e){e.stopPropagation();jumpToMark(ch.id,m.id)});
        mi.querySelector('.mark-del').addEventListener('click',function(e){
          e.stopPropagation();deleteMark(ch.id,m.id);
        });
        marksWrap.appendChild(mi);
      });
      list.appendChild(marksWrap);
    }
  });
  /* кольцо бесконечной рейки: второй ряд копий строк — прокрутка замикается
     бесшовно (в момент стыка видимые строки не меняются); в раскрытом
     списке и на мобиле копии скрыты (CSS .dupe). Метки в копиях не
     дублируются: в рейке .ch-marks и так скрыт, в раскрытом списке копий     не видно */
  var ringSrc=[];
  for(var q=0;q<list.children.length;q++){
    var oc=list.children[q];
    if(oc.classList&&oc.classList.contains('ch')&&!oc.classList.contains('dupe'))ringSrc.push(oc);
  }
  for(var q2=0;q2<ringSrc.length;q2++){
    var cl=ringSrc[q2].cloneNode(true);
    cl.classList.remove('boot');
    cl.classList.add('dupe');
    cl.setAttribute('aria-hidden','true');
    list.appendChild(cl);
  }
  /* копии без своих слушателей: клик и перетаскивание — делегированием */
  if(!list.__dupeBound){
    list.__dupeBound=true;
    list.addEventListener('click',function(e){
      var row=e.target&&e.target.closest?e.target.closest('.ch.dupe'):null;
      if(!row)return;
      e.stopPropagation();
      openChapter(row.getAttribute('data-ch'));
    });
    list.addEventListener('dragstart',function(e){
      var row=e.target&&e.target.closest?e.target.closest('.ch.dupe'):null;
      if(!row)return;
      dragChId=row.getAttribute('data-ch');
      e.dataTransfer.effectAllowed='move';
      try{e.dataTransfer.setData('text/plain',dragChId)}catch(err){}
    });
    list.addEventListener('dragend',function(e){
      if(e.target&&e.target.closest&&e.target.closest('.ch.dupe')){dragChId=null;clearDropMarks()}
    });
  }
  /* копии скрываем, если список с ними помещается — иначе дубли по центру */
  loopFit();
  list.scrollTop=keepScroll;            /* позиция восстановлена после пересборки */
  $('#chCount').textContent=b.chapters.length+' шт.';
  $('#totalWords').textContent=fmt(total)+' '+plural(total,'слово','слова','слов');
  $('#totalRead').textContent=total?('≈ '+Math.ceil(total/180)+' мин'):'';
  renderMarksRail();
  railCenterActive();
  if(chWheelUpdate)chWheelUpdate();          /* новый ряд — сразу в барабан */
  if(typeof a11yPass==='function')a11yPass(list);
}

/* кольцо копий скрывается, если блок оригиналов помещается в экран (с тем
   же запасом, что и цикл в «колесе») — иначе в узкой рейке с центрированием
   были бы видны дубли */
function loopFit(){
  var l=$('#chlist');if(!l)return;
  var chs=l.querySelectorAll('.ch:not(.dupe)');
  var fit=true;
  if(chs.length){
    var f=chs[0],last=chs[chs.length-1];
    fit=(last.offsetTop+last.offsetHeight-f.offsetTop)<=l.clientHeight+150;
  }
  l.classList.toggle('no-loop',fit);
}

var chWheelGoto=null;     /* плавный довод прокрутки рейки — см. «колесо» ниже */

/* при большом числе глав в рейке (body.side-hidden) активная глава
   держится в центре экрана — остальные уходят за края под маской */
function railCenterActive(){
  var chlist=$('#chlist');if(!chlist)return;
  if(!document.body.classList.contains('side-hidden')||mqMobile.matches)return;
  var act=chlist.querySelector('.ch.active');if(!act)return;
  if(chlist.scrollHeight<=chlist.clientHeight+4)return;
  var top=act.offsetTop-(chlist.clientHeight/2)+(act.offsetHeight/2);
  /* главы у верхнего края ленты (первая и соседние): цель уходит за 0 и
     глава осталась бы вверху — центрируемся по её копии в кольце (та же
     строка на период ниже, видимый ряд не меняется); кольца нет
     (.no-loop) — обрезаем по краю, как раньше */
  if(top<0&&!chlist.classList.contains('no-loop')){
    var o0=chlist.querySelector('.ch:not(.dupe)');
    var d0=chlist.querySelector('.ch.dupe');
    if(o0&&d0){
      var per=d0.offsetTop-o0.offsetTop;
      var max=chlist.scrollHeight-chlist.clientHeight;
      if(per>0&&top+per<=max)top+=per;
    }
  }
  if(top<0)top=0;
  /* клик по любой главе: барабан доводит её в центр плавно — той же
     инерцией, что у колеса (16% остатка за кадр, мягкий стоп); вне рейки
     или пока «колесо» не готово — как раньше, мгновенно */
  if(chWheelGoto)chWheelGoto(top);
  else chlist.scrollTop=top;
}

/* эффект палок: в рейке выноска главы растёт, когда курсор проходит
   рядом по вертикали (квадратичный спад в радиусе RADIUS) */
(function(){
  var chlist=$('#chlist');if(!chlist)return;
  var RADIUS=110,BOOST=22;
  var raf=null;
  function isRail(){return document.body.classList.contains('side-hidden')&&!mqMobile.matches}
  function setBars(clientY){
    if(!isRail())return;
    chlist.querySelectorAll('.ch').forEach(function(ch){
      var num=ch.querySelector('.num');if(!num)return;
      var r=num.getBoundingClientRect();
      var cy=r.top+r.height/2;
      var d=Math.abs(clientY-cy);
      var t=Math.max(0,1-d/RADIUS);t=t*t;
      var base=ch.classList.contains('active')?12:8;
      num.style.setProperty('--bw',(base+t*BOOST)+'px');
    });
  }
  function reset(){chlist.querySelectorAll('.ch .num').forEach(function(n){n.style.removeProperty('--bw')})}
  chlist.addEventListener('pointermove',function(e){
    if(!isRail())return;
    var y=e.clientY;
    if(raf)cancelAnimationFrame(raf);
    raf=requestAnimationFrame(function(){setBars(y)});
  },{passive:true});
  chlist.addEventListener('pointerleave',reset);
  var ob=new MutationObserver(function(){if(!isRail())reset()});
  ob.observe(document.body,{attributes:true,class:'class'});
})();

/* «колесо»: в рейке прокрутка списка глав — инерционная: шаг по deltaY
   превращается в цель, а список догоняет её по кадрам с затуханием (каждый
   кадр — 16% остатка): барабан крутится мягко, без щелчка на каждый «зуб»
   колеса. Кольцо бесконечное и бесшовное: за границей цель и позиция
   прыгают на период копий строк — видимые строки в момент стыка не
   меняются, поэтому за последней главой идёт первая и наоборот, без
   видимой перемотки; если копий меньше экрана — упираемся в границу. В
   раскрытом списке — обычная прокрутка, без перехвата */
(function(){
  var list=$('#chlist');if(!list)return;
  var target=0,cur=0,applied=0,raf=null,anim=false;
  function active(){return !mqMobile.matches&&document.body.classList.contains('side-hidden')}
  /* период кольца — высота блока оригиналов (первая копия стартует через
     неё); меньше экрана с запасом — цикл не включаем */
  function ringPeriod(){
    var o=list.querySelector('.ch:not(.dupe)'),d=list.querySelector('.ch.dupe');
    if(!o||!d)return 0;
    var p=d.offsetTop-o.offsetTop;
    return p>=list.clientHeight+150?p:0;
  }
  function sync(){ /* жить от реального скролла */
    if(raf){cancelAnimationFrame(raf);raf=null}
    anim=false;
    cur=target=applied=list.scrollTop;
  }
  function tick(){
    raf=null;
    if(!active()){sync();return}              /* список раскрыли/мобиле — хватит */
    var d=target-cur;
    if(Math.abs(d)<0.5){                      /* цель догнана — мягкая остановка */
      cur=target;
      anim=false;
      applied=list.scrollTop=target;
      return;
    }
    anim=true;
    cur+=d*0.16;
    applied=list.scrollTop=cur;
    raf=requestAnimationFrame(tick);
  }
  /* плавный довод извне (клик по главе в рейке): цель меняется, список
     догоняет её той же инерцией; вне рейки — просто ставим позицию */
  chWheelGoto=function(pos){
    if(!active()){list.scrollTop=pos;return}
    if(!anim)sync();
    var max=list.scrollHeight-list.clientHeight;
    if(pos<0)pos=0;
    if(pos>max)pos=max;
    target=pos;
    anim=true;
    if(!raf)raf=requestAnimationFrame(tick);
  };
  list.addEventListener('wheel',function(e){
    if(mqMobile.matches)return;               /* на мобиле список — своя шторка */
    if(!document.body.classList.contains('side-hidden'))return;
    var max=list.scrollHeight-list.clientHeight;
    if(max<=4)return;                         /* весь список виден — крутить нечего */
    e.preventDefault();
    if(!anim)sync();                          /* первый шаг — от текущего места */
    target+=e.deltaY;
    var jumped=false,per=ringPeriod();
    if(per){
      /* бесшовное кольцо: прыжок на период — видимые строки не меняются */
      if(target>max){target-=per;cur-=per;jumped=true}
      else if(target<0){target+=per;cur+=per;jumped=true}
    }else{
      if(target>max)target=max;               /* упёрлись в последнюю главу — стоп */
      if(target<0)target=0;                   /* упёрлись в первую — стоп */
    }
    if(target>max)target=max;                 /* страховка после цикла */
    if(target<0)target=0;
    if(cur>max)cur=max;
    if(cur<0)cur=0;
    if(jumped)applied=list.scrollTop=cur;     /* прыжок на том же тике */
    anim=true;
    if(!raf)raf=requestAnimationFrame(tick);
  },{passive:false});
  /* внешняя прокрутка (скроллбар, программный центринг) — принимаем её как
     свою цель; свою догоняющую анимацию в этот момент останавливаем */
  list.addEventListener('scroll',function(){
    if(!anim){cur=target=applied=list.scrollTop;return}
    if(Math.abs(list.scrollTop-applied)>2)sync();
  },{passive:true});
  window.addEventListener('resize',function(){
    if(anim){
      var max=list.scrollHeight-list.clientHeight;
      if(target>max)target=max;
      if(target<0)target=0;
    }else sync();
  });
})();

/* визуальное «колесо» — только в свёрнутой рейке (body.side-hidden): ряды едут
   по горизонтали волной — сверху выезжают из-за левого края (гаснут, пока
   цифры не внутри), к середине встают ровно на своё место (не торчат вправо
   от стены: максимум --wx = 0 = позиция без колеса), снизу снова уезжают
   влево за край и гаснут (ступень |t|^3). Половинок номеров на краю не
   остаётся. Никакого rotateX/сжатия: высота строк, символы и палки не
   меняются — двигается только translateX (--wx). В раскрытом списке глав
   барабана нет — обычный список; на мобиле/в zen переменные снимаются */
var chWheelUpdate=null;
(function(){
  var list=$('#chlist');if(!list)return;
  var raf=null;
  var reduce=matchMedia&&matchMedia('(prefers-reduced-motion:reduce)').matches;
  function clear(){
    var rows=list.children;
    for(var i=0;i<rows.length;i++){
      rows[i].style.removeProperty('--wx');
      rows[i].style.removeProperty('--wo');
      rows[i].style.removeProperty('--wco');
    }
  }
  function paint(){
    raf=null;
    loopFit();                               /* держать no-loop в актуальном виде */
    /* эффект — только в рейке: раскрытый список, мобиле, zen, reduce — чисто */
    if(reduce||mqMobile.matches||workspace.hidden
       ||document.body.classList.contains('zen')
       ||!document.body.classList.contains('side-hidden')){clear();return}
    var h=list.clientHeight;
    if(h<40){clear();return}
    var box=list.getBoundingClientRect();
    var half=box.height/2,ctr=box.top+half;
    var Aneg=24,K=3;
    var rows=list.children,i;
    var els=[],ts=[],nls=[];
    /* сперва все замеры (один reflow), затем запись */
    for(i=0;i<rows.length;i++){
      var el=rows[i];
      var r=el.getBoundingClientRect();
      if(!r.height){els.push(null);ts.push(0);nls.push(0);continue}
      var d=((r.top+r.height/2)-ctr)/half;
      if(d>1)d=1;else if(d<-1)d=-1;
      var prev=parseFloat(el.style.getPropertyValue('--wx'))||0;
      var num=el.querySelector('.num');
      /* база без текущего сдвига: левый край номера (или блока меток) */
      var nl=(num?num.getBoundingClientRect().left:r.left)-prev;
      els.push(el);ts.push(d);nls.push(nl);
    }
    for(i=0;i<els.length;i++){
      if(!els[i])continue;
      var t=ts[i];
      /* т=0 (середина) -> 0: на своём месте, без выступа вправо от стены;
         |т|=1 (края) -> -Aneg: уходят влево за край и гаснут */
      var w=-Aneg*Math.pow(Math.abs(t),K);
      var e=els[i];
      e.style.setProperty('--wx',w.toFixed(1)+'px');
      /* слева: ряд тускнеет, приближаясь к краю, и гаснет к −13px — выезжает
         из-за левого края и уезжает за него без полуглифов; полная яркость —
         с позиции покоя (relL>=1) */
      var relL=nls[i]+w-box.left;
      var opL=Math.min(1,Math.max(0,(relL+13)/14));
      if(opL<0.995)e.style.setProperty('--wo',opL.toFixed(3));
      else e.style.removeProperty('--wo');
      e.style.removeProperty('--wco');
    }
  }
  function schedule(){if(raf==null)raf=requestAnimationFrame(paint)}
  chWheelUpdate=schedule;
  list.addEventListener('scroll',schedule,{passive:true});
  window.addEventListener('resize',schedule);
  /* при перетаскивании метки drop-позиции меряются по rect — барабан мешает */
  list.addEventListener('dragstart',function(){clear()});
  list.addEventListener('dragend',schedule);
  var ob=new MutationObserver(schedule);
  ob.observe(document.body,{attributes:true,class:'class'});
})();

function renderMarksRail(){
  var rail=$('#marksRail');
  if(!rail)return;
  var visible=document.body.classList.contains('side-hidden')
    && !mqMobile.matches
    && !workspace.hidden
    && !document.body.classList.contains('zen')
    && !$('#wikiPanel').classList.contains('on');
  var b=visible?book():null;
  var all=[];
  if(b){
    b.chapters.forEach(function(ch,i){
      (ch.marks||[]).forEach(function(m){all.push({ch:ch,idx:i,m:m})});
    });
  }
  if(!all.length){
    rail.classList.remove('on');
    rail.innerHTML='';
    return;
  }
  rail.innerHTML='';
  all.forEach(function(it){
    var dot=mk('button');
    dot.type='button';
    var cur=it.ch.id===b.current;
    dot.className='mr-dot'+(cur?' act':' other');
    dot.title=it.m.label+(cur?'':' · гл. '+(it.idx+1));
    var d=mk('span');d.className='d';d.setAttribute('aria-hidden','true');dot.appendChild(d);
    var t=mk('span');t.className='t';t.textContent=it.m.label;dot.appendChild(t);
    dot.addEventListener('click',function(e){e.stopPropagation();jumpToMark(it.ch.id,it.m.id)});
    rail.appendChild(dot);
  });
  rail.classList.add('on');
  if(typeof a11yPass==='function')a11yPass(rail);
}

function updateCrumb(){
  var b=book();
  $('#crumbBook').textContent=b?(b.title||'Без названия'):'';
  var ch=currentCh();
  $('#crumbCh').textContent=ch?chapterTitle(ch):'';
  document.title=((b&&b.title)||'Без названия')+' — Черновик';
}
function loadChapter(c){
  zenAnchor=null;
  if(!c||typeof c!=='object')c={id:null,html:'<p></p>',pos:0,marks:[]};   /* L7 */
  /* F15: html из хранилища/сервера вставляем в живой DOM; если в нём видна
     исполняемая разметка (обработчик события, svg onload, ссылка-скрипт) —
     прогоняем через санитайзер. Обычный текст и комментарии Памятки
     (<!--pamatka-v32-->) не трогаем, чтобы не сбрасывать их на шаблон. */
  var html=c.html||'<p></p>';
  if(typeof hardenChapterHtml==='function'){
    var hardened=hardenChapterHtml(html);
    if(hardened!==html&&c.id){
      /* санированную копию пишем в хранилище сразу: иначе печать/чталка
         и следующие loadChapter будут читать исходную грязь из ch.html */
      c.html=hardened;html=hardened;
      try{persist()}catch(e){}
    }
  }
  editor.innerHTML=html;
  if(!editor.firstElementChild)editor.innerHTML='<p></p>';
  editorOwned=!foreignDoc&&!isReadOnly();   /* F14: DOM = своя глава? */
  lastCaretOffset=null;                     /* позиция каретки старой главы не нужна */
  ensureNoteIds();
  applyMarks(false);
  scroller.scrollTop=(typeof c.pos==='number')?c.pos:0;
  positionEdRz();
  updateReaderChrome();
}
function openChapter(id,skipSave){
  var b=book();if(!b)return;
  if(!skipSave){
    clearTimeout(saveTimer);              /* отложенный save не должен сравнить уже новую главу (H6) */
    var prev=currentCh();
    if(prev){
      if(!isReadOnly()&&editorOwned){
        var oldHtml=prev.html;
        prev.html=cleanHtml();
        if(prev.html!==oldHtml)b.updated=Date.now();
      }
      prev.pos=scroller.scrollTop;
    }
  }
  closeMenu();selbar.classList.remove('on');hideSynbar();
  b.current=id;
  loadChapter(currentCh());
  renderList(false);updateCrumb();updateStats();persist();
  if(mqMobile.matches)document.body.classList.remove('side-open');
  updatePanelTabs();
}
$('#addCh').addEventListener('click',function(){
  if(isReadOnly())return;
  var b=book();if(!b)return;
  var ch=currentCh();if(ch&&editorOwned){ch.html=cleanHtml();ch.pos=scroller.scrollTop}
  var n={id:uid(),html:'<h1></h1><p></p>',pos:0,marks:[]};
  b.chapters.push(n);
  b.updated=Date.now();                   /* структурная правка должна уезжать на сервер (H5) */
  persist();openChapter(n.id,true);
  editor.focus();caretStart(editor.querySelector('h1'));
});
$('#bookTitle').addEventListener('input',function(){
  if(isReadOnly())return;
  var b=book();if(!b)return;
  var v=$('#bookTitle').value;
  if(b.title!==v){b.title=v;b.updated=Date.now()}   /* смена названия должна уезжать на сервер */
  updateCrumb();scheduleSave();
});
$('#bvAuthor').addEventListener('change',function(){
  if(isReadOnly())return;
  var b=book();if(!b)return;
  var v=this.value.trim();
  if((b.author||'')===v)return;
  b.author=v;
  b.updated=Date.now();   /* как переименование: LWW-бамп, книга уйдёт на сервер */
  persist();
  if(typeof renderLibrary==='function')renderLibrary();
});

function openBookOverview(id){
  /* F14: обзор СВОЕЙ книги — если ещё висит чужая (мимо closeForeignBook),
     закрываем: иначе book() вернёт foreignDoc и обзор/коммиты пойдут в чужое */
  if(typeof foreignDoc!=='undefined'&&foreignDoc&&typeof closeForeignBook==='function')closeForeignBook();
  state.activeBookId=id;
  var b=book();if(!b)return;
  b.wiki=Array.isArray(b.wiki)?b.wiki:[];
  b.customTypes=Array.isArray(b.customTypes)?b.customTypes:[];
  commitNow();
  library.hidden=true;bookView.hidden=false;
  setWorkspaceVisible(false);
  bookView.scrollTop=0;viewIn(bookView);
  renderBookView();persist();
  renderMarksRail();
}
function renderBookView(){
  var b=book();if(!b)return;
  $('#bvTitle').textContent=b.title||'Без названия';
  var ba=$('#bvAuthor');
  if(ba){
    ba.hidden=false;
    ba.disabled=isReadOnly();
    ba.placeholder=isReadOnly()?'автор не указан':'Автор — как подписывать книгу';
    ba.value=isForeign()?((foreignMeta&&foreignMeta.author)||''):((typeof b.author==='string')?b.author:'');
  }
  var w=bookWords(b),min=Math.ceil(w/180);
  var vis=visibleChapters(b);
  var nch=vis.length;
  var notesCount=collectNotes().length;
  var pills='<span class="bv-pill"><b>'+nch+'</b> '+plural(nch,'глава','главы','глав')+'</span>'+
            '<span class="bv-pill"><b>'+fmt(w)+'</b> '+plural(w,'слово','слова','слов')+'</span>';
  if(w)pills+='<span class="bv-pill">≈ <b>'+min+'</b> '+plural(min,'минута','минуты','минут')+' чтения</span>';
  if(notesCount)pills+='<span class="bv-pill">✎ <b>'+notesCount+'</b> '+plural(notesCount,'заметка','заметки','заметок')+'</span>';
  $('#bvDesc').innerHTML=pills;
  $('#bvStats').innerHTML=isReadOnly()
    ? '<span class="ro-badge">чтение</span>'+esc((foreignMeta&&foreignMeta.line)||'автор не указан')
    :(b.updated?esc('изменено '+timeAgo(b.updated)):'');
  var bvOpenBtn=$('#bvOpen');
  if(bvOpenBtn)setBtnTitle(bvOpenBtn,isReadOnly()?'Читать':'Открыть в редакторе');
  bvGrid.innerHTML='';
  var displayIdx=0;
  b.chapters.forEach(function(ch,i){
    var isNotes=isNotesCh(ch);
    if(!isNotes)displayIdx++;
    var cw=isNotes?0:chapterWords(ch);
    var card=mk('div');
    card.className='bv-card'+(ch.id===b.current?' cur':'')+(isNotes?' sys':'');
    card.style.animationDelay=(Math.min(i,7)*45)+'ms';
    card.setAttribute('role','button');card.tabIndex=0;
    var label=isNotes?'✎ Заметки':('Глава '+displayIdx);
    card.innerHTML='<div class="bv-ch"><span>'+label+'</span><b>'+(isNotes?'—':fmt(cw))+'</b></div>'+
      '<div class="bv-ct"></div>'+
      '<div class="bv-ex"></div>'+
      '<div class="bv-meta">'+(isNotes?'не печатается и не считается':(cw?('≈ '+Math.ceil(cw/180)+' мин чтения'):'пустая глава'))+(ch.id===b.current?' · <span class="here">вы остановились здесь</span>':'')+'</div>';
    card.querySelector('.bv-ct').textContent=chapterTitle(ch);
    var exEl=card.querySelector('.bv-ex');
    var boxes=chapterExcerpt(ch,2);
    if(!boxes.length){
      var eb=mk('div');eb.className='bv-box';eb.style.fontStyle='italic';eb.textContent=isNotes?'свободные записи':'в главе пока нет текста';
      exEl.appendChild(eb);
    }
    boxes.forEach(function(bx){
      var d2=mk('div');d2.className='bv-box'+(bx.sep?' sep':'');d2.textContent=bx.text;
      exEl.appendChild(d2);
    });
    card.addEventListener('click',function(){enterEditor(ch.id)});
    card.addEventListener('keydown',function(e){if(e.key==='Enter')enterEditor(ch.id)});
    bvGrid.appendChild(card);
  });
  if(!isReadOnly()){
    var nc=mk('button');
    nc.className='bv-card new';
    nc.style.animationDelay=(b.chapters.length*45)+'ms';
    nc.innerHTML='<span class="nc-dia"></span><span class="nc-t">Новая глава</span>';
    nc.addEventListener('click',function(){
      var b2=book();if(!b2||isReadOnly())return;
      var n={id:uid(),html:'<h1></h1><p></p>',pos:0,marks:[]};
      b2.chapters.push(n);
      b2.updated=Date.now();                 /* H5 */
      persist();
      enterEditor(n.id);
      editor.focus();caretStart(editor.querySelector('h1'));
    });
    bvGrid.appendChild(nc);
  }
  document.title=(b.title||'Без названия')+' — Черновик';
  if(typeof renderBookAccess==='function')renderBookAccess();
}
function chapterExcerpt(ch,maxBlocks){
  var d=tmp(ch.html),out=[];
  for(var i=0;i<d.children.length&&out.length<maxBlocks;i++){
    var el=d.children[i];
    if(el.tagName==='H1')continue;
    if(el.classList.contains('nb')){out.push({sep:false,text:'✎ '+(el.textContent||'').replace(/\s+/g,' ').trim().slice(0,120)});continue}
    if(el.classList.contains('sep')){out.push({sep:true,text:'✦ ✦ ✦'});continue}
    var t=(el.textContent||'').replace(/\s+/g,' ').trim();
    if(!t)continue;
    if(t.length>150)t=t.slice(0,147)+'…';
    out.push({sep:false,text:t});
  }
  return out;
}
function enterEditor(chId){
  var b=book();if(!b)return;
  /* дописать текущую главу ДО переключения (H7): иначе набранный текст
     остаётся только в DOM и теряется при loadChapter чужой главы (F14: своё) */
  if(!isReadOnly()&&!workspace.hidden&&editorOwned){
    clearTimeout(saveTimer);
    var cur=currentCh();
    if(cur){
      var oldHtml=cur.html;
      cur.html=cleanHtml();
      if(cur.html!==oldHtml)b.updated=Date.now();
      cur.pos=scroller.scrollTop;
    }
  }
  b.wiki=Array.isArray(b.wiki)?b.wiki:[];
  b.customTypes=Array.isArray(b.customTypes)?b.customTypes:[];
  if(!b.chapters.length&&!isReadOnly()){
    var c0={id:uid(),html:'<h1></h1><p></p>',pos:0,marks:[]};
    b.chapters.push(c0);b.current=c0.id;
  }
  if(chId)b.current=chId;
  if(!b.chapters.some(function(c){return c.id===b.current})&&b.chapters.length)b.current=b.chapters[0].id;
  $('#bookTitle').value=b.title||'';
  library.hidden=true;bookView.hidden=true;
  setWorkspaceVisible(true);
  viewIn(workspace);
  loadChapter(currentCh()||{id:null,html:'<p></p>',pos:0,marks:[]});
  renderList(false);updateCrumb();updateStats();persist();
  setTimeout(positionEdRz,60);
  if(isReadOnly()){editor.contentEditable='false';saveTxt.textContent='Только чтение';hideSynbar();selbar.classList.remove('on')}
  else if(isReader())showReaderUi();else editor.focus();
}
$('#bvBack').addEventListener('click',function(){
  if(typeof closeForeignBook==='function')closeForeignBook();
  bookView.hidden=true;library.hidden=false;library.scrollTop=0;viewIn(library);renderLibrary();
  renderMarksRail();
});
$('#bvOpen').addEventListener('click',function(){enterEditor(null)});

function renderLibrary(){
  shelf.innerHTML='';
  var sorted=state.books.slice().sort(function(a,b){return (b.updated||0)-(a.updated||0)});
  var total=0;
  sorted.forEach(function(b,i){
    var w=bookWords(b);total+=w;
    var el=mk('div');
    el.className='cover boot';el.setAttribute('role','button');el.tabIndex=0;
    el.style.setProperty('--c',b.color||COLORS[0]);
    el.style.animationDelay=(Math.min(i,7)*50)+'ms';
    el.innerHTML=
      '<span class="cv-top"><span class="cv-dia"></span><span class="cv-vis" hidden></span><span class="cv-tools">'+
      '<button class="cv-ren" title="Переименовать"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linejoin="round"><path d="M4 20l1-4L16 5l3 3L8 19l-4 1zM14 7l3 3"/></svg></button>'+
      '<button class="cv-del" title="Удалить"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></button></span></span>'+
      '<span class="cv-title"></span>'+
      '<span class="cv-author"></span>'+
      '<span class="cv-rule"></span>'+
      '<span class="cv-meta"></span>'+
      '<span class="cv-time"></span>';
    el.querySelector('.cv-title').textContent=b.title||'Без названия';
    var author=(typeof b.author==='string'&&b.author.trim())?b.author.trim():((currentUser&&(currentUser.name||currentUser.login))||'');
    var av=el.querySelector('.cv-author');
    av.textContent=author;
    av.hidden=!author;
    var vis=el.querySelector('.cv-vis');
    var visLabel=(b.visibility==='public')?'публичная':(b.visibility==='unlisted'?'по ссылке':'');
    if(visLabel){vis.hidden=false;vis.textContent=visLabel;vis.setAttribute('data-v',b.visibility)}
    var visList=visibleChapters(b);
    var visN=visList.length;
    var curIdx=0;
    for(var vi=0;vi<visList.length;vi++){if(visList[vi].id===b.current){curIdx=vi+1;break}}
    el.querySelector('.cv-meta').innerHTML=
      '<span>'+visN+' '+plural(visN,'глава','главы','глав')+'</span>'+
      '<span class="cv-dot"></span>'+
      '<span>'+fmt(w)+' '+plural(w,'слово','слова','слов')+'</span>';
    var timeTxt=b.updated?('изменено '+timeAgo(b.updated)):'';
    var prog=(curIdx>1&&visN>1)?('гл. '+curIdx+' из '+visN):'';
    el.querySelector('.cv-time').innerHTML=prog?
      '<span>'+prog+'</span><span class="cv-dot"></span><span>'+esc(timeTxt)+'</span>':
      '<span>'+esc(timeTxt)+'</span>';
    el.addEventListener('click',function(){openBookOverview(b.id)});
    el.addEventListener('keydown',function(e){if(e.key==='Enter')openBookOverview(b.id)});
    el.querySelector('.cv-ren').addEventListener('click',function(e){
      e.stopPropagation();
      uiPrompt('Название книги',b.title,'Без названия').then(function(t){
        if(t===null)return;
        b.title=t||b.title;b.updated=Date.now();persist();renderLibrary();
      });
    });
    el.querySelector('.cv-del').addEventListener('click',function(e){
      e.stopPropagation();
      uiConfirm('Удалить книгу?','«'+(b.title||'Без названия')+'» и все её главы будут удалены безвозвратно.',true).then(function(ok){
        if(!ok)return;
        state.books=state.books.filter(function(x){return x.id!==b.id});
        if(state.activeBookId===b.id)state.activeBookId=null;
        /* H4: сразу помечаем удаление — иначе после перезапуска
           reconcile воскресит книгу с сервера (sentBooks пуст) */
        if(typeof Sync!=='undefined'&&Sync&&Sync.tombBook)Sync.tombBook(b.id);
        snapshotStats();persist();invalidateCo();renderLibrary();renderStats();
      });
    });
    shelf.appendChild(el);
  });
  var nc=mk('button');
  nc.className='cover new boot';
  nc.style.animationDelay=(sorted.length*50)+'ms';
  nc.innerHTML='<span class="nc-dia"></span><span class="nc-t">Новая книга</span><span class="nc-h">начать рукопись</span>';
  nc.addEventListener('click',createBook);
  shelf.appendChild(nc);
  var n=state.books.length;
  $('#libStats').innerHTML=n
    ? fmt(n)+' '+plural(n,'книга','книги','книг')+'<br>'+fmt(total)+' '+plural(total,'слово','слова','слов')+' во всех рукописях'
    : 'полка пуста —<br>начните первую книгу';

  renderStats();
  if(typeof a11yPass==='function')a11yPass(shelf);
}
function createBook(){
  var first={id:uid(),html:'<h1></h1><p></p>',pos:0,marks:[]};
  var b={
    id:uid(),title:'Без названия',
    color:COLORS[state.books.length%COLORS.length],
    updated:Date.now(),
    chapters:[first,{id:uid(),html:pamatkaHtml(),pos:0,marks:[]},{id:uid(),kind:'notes',html:notesChapterHtml(),pos:0,marks:[]}],
    current:first.id,customTypes:[],wiki:[]
  };
  state.books.push(b);state.activeBookId=b.id;persist();invalidateCo();
  enterEditor(first.id);
  $('#bookTitle').focus();$('#bookTitle').select();
}
function viewIn(el){el.classList.remove('view-in');void el.offsetWidth;el.classList.add('view-in')}
function toLibrary(){
  if(typeof closeForeignBook==='function')closeForeignBook();
  commitNow();
  closeMenu();selbar.classList.remove('on');hideSynbar();clearSearch();
  toggleWikiPanel(false);hideMarkTip();
  if(typeof closeMusic==='function')closeMusic();   /* музыка — только на странице книги */
  library.hidden=false;bookView.hidden=true;
  setWorkspaceVisible(false);
  library.scrollTop=0;viewIn(library);
  renderLibrary();
  renderMarksRail();
}
$('#btnShelf').addEventListener('click',toLibrary);

function buildPrintBook(){
  var pb=$('#printBook');pb.innerHTML='';
  document.body.classList.toggle('pb-on',workspace.hidden===false);
  if(workspace.hidden)return;
  var b=book();if(!b)return;
  var cur=currentCh();
  /* печать служебной главы (Памятка/Заметки): она вне состава книги —
     печатаем только её, иначе Ctrl+P отдаёт всю рукопись без неё */
  if(cur&&(isPamatka(cur)||isNotesCh(cur))){
    var svc=mk('div');svc.className='pb-ch';svc.innerHTML=hardenChapterHtml(cleanHtml());
    pb.appendChild(svc);
    return;
  }
  var t=mk('div');t.className='pb-title';t.textContent=b.title||'Без названия';pb.appendChild(t);
  visibleChapters(b).forEach(function(ch){
    var html=(cur&&ch.id===cur.id)?cleanHtml():ch.html;
    /* F15: печать минует гейт loadChapter — прогоняем через детектор,
       иначе <img onerror> из хранилища выполнится и в #printBook */
    if(typeof hardenChapterHtml==='function')html=hardenChapterHtml(html);
    var d=mk('div');d.className='pb-ch';d.innerHTML=html;pb.appendChild(d);
  });
}
addEventListener('beforeprint',buildPrintBook);

$('#btnSide').addEventListener('click',function(){
  if(mqMobile.matches)document.body.classList.toggle('side-open');
  else{
    var hidden=document.body.classList.toggle('side-hidden');
    setBtnTitle(this,hidden?'Показать панель глав':'Скрыть панель глав');
  }
  hideMarkTip();
  renderMarksRail();
  setTimeout(railCenterActive,420);
  setTimeout(positionEdRz,500);
});
$('#veil').addEventListener('click',function(){document.body.classList.remove('side-open')});
$('#btnZen').addEventListener('click',toggleZen);
$('#zenpill').addEventListener('click',toggleZen);
/* пилюля «РЕЖИМ ФОКУСА» гаснет через ~3.5с — в фокусе не должно быть мусора;
   всплывает снова при движении курсора/тапе и по ESC */
var zenPillTid=0;
function zenPillShow(reset){
  var p=$('#zenpill');if(!p)return;
  clearTimeout(zenPillTid);
  if(!document.body.classList.contains('zen')){p.classList.remove('hide');return}
  if(reset!==false)p.classList.remove('hide');
  zenPillTid=setTimeout(function(){p.classList.add('hide')},3500);
}
document.addEventListener('mousemove',function(){
  if(document.body.classList.contains('zen'))zenPillShow();
},{passive:true});
document.addEventListener('touchstart',function(){
  if(document.body.classList.contains('zen'))zenPillShow();
},{passive:true});
function toggleZen(){
  var on=document.body.classList.toggle('zen');
  $('#btnZen').classList.toggle('on',on);
  state.zen=on;persist();
  if(on)document.body.classList.remove('side-open');
  zenPillShow(on);
  if(!on){
    zenAnchor=null;
    Array.prototype.forEach.call(editor.children,function(el){el.style.opacity='';el.classList.remove('lit')});
  }
  renderMarksRail();
  editor.focus();refreshFloats();
}
function setTheme(t){
  document.documentElement.dataset.theme=t;state.theme=t;
  document.querySelectorAll('.ic-sun').forEach(function(i){i.style.display=(t==='light')?'':'none'});
  document.querySelectorAll('.ic-sepia').forEach(function(i){i.style.display=(t==='sepia')?'':'none'});
  document.querySelectorAll('.ic-moon').forEach(function(i){i.style.display=(t==='dark')?'':'none'});
  var tc=document.querySelector('meta[name="theme-color"]');
  if(tc){var bgc={light:'#f4f2ec',dark:'#161411',sepia:'#f2e6cf'}[t];if(bgc)tc.setAttribute('content',bgc)}
  var tt={light:'Тема: день',dark:'Тема: ночь',sepia:'Тема: сепия'}[t];
  if(tt)document.querySelectorAll('.btn-theme').forEach(function(b){setBtnTitle(b,tt)});
  persist();renderStats();
  if(!$('#paneGraph').hidden)scheduleGraph();
}
var THEME_NEXT={light:'dark',dark:'sepia',sepia:'light'};
document.querySelectorAll('.btn-theme').forEach(function(b){
  b.addEventListener('click',function(){
    setTheme(THEME_NEXT[document.documentElement.dataset.theme]||'dark');
  });
});

function sanitizeFileName(s){
  s=String(s||'рукопись').trim()||'рукопись';
  s=s.replace(/[\\/:*?"<>|#%{}$!'@+`=~]/g,' ').replace(/\s+/g,' ').trim();
  if(s.length>80)s=s.slice(0,80).trim();
  return s||'рукопись';
}
function eachBlock(html,cb){
  var d=tmp(html);
  Array.prototype.forEach.call(d.childNodes,function(n){
    if(n.nodeType!==1)return;
    if(n.classList&&n.classList.contains('nb'))return;
    if(n.classList&&n.classList.contains('sep')){cb({sep:true});return}
    var t=(n.textContent||'').replace(/\s+/g,' ').trim();
    if(!t)return;
    var tag=n.tagName==='H1'?'h1':(n.tagName==='H2'?'h2':(n.tagName==='BLOCKQUOTE'?'quote':'p'));
    cb({sep:false,tag:tag,text:t});
  });
}
function buildTxt(b){
  var out=(b.title||'Без названия').toUpperCase()+'\n';
  visibleChapters(b).forEach(function(c){
    out+='\n\n';
    eachBlock(c.html,function(bl){
      if(bl.sep){out+='\n* * *\n\n';return}
      out+=bl.text+'\n'+(bl.tag==='h1'||bl.tag==='h2'?'\n':'');
    });
  });
  return out;
}
function buildMd(b){
  var out='# '+(b.title||'Без названия')+'\n';
  visibleChapters(b).forEach(function(c){
    out+='\n';
    eachBlock(c.html,function(bl){
      if(bl.sep){out+='\n* * *\n\n';return}
      if(bl.tag==='h1')out+='\n## '+bl.text+'\n\n';
      else if(bl.tag==='h2')out+='\n### '+bl.text+'\n\n';
      else if(bl.tag==='quote')out+='\n> '+bl.text+'\n\n';
      else out+=bl.text+'\n\n';
    });
  });
  return out;
}
function buildHtmlDoc(b){
  var chapters=visibleChapters(b);
  var dateStr=new Date().toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
  var toc=chapters.length>1
    ? '<nav class="toc"><h2>Содержание</h2><ol>'+chapters.map(function(c,i){
        return '<li><a href="#ch-'+(i+1)+'"><span class="toc-num">'+String(i+1).padStart(2,'0')+'</span><span class="toc-t">'+esc(chapterTitle(c))+'</span></a></li>';
      }).join('')+'</ol></nav>'
    : '';
  var css =
    '@import url("https://fonts.googleapis.com/css2?family=Literata:ital,opsz,wght@0,7..72,300..700;1,7..72,300..700&family=JetBrains+Mono:wght@400;500&display=swap");'+
    ':root{--ink:#1a1814;--ink2:#5a564d;--ink3:#8a8574;--accent:#b7301f;--bg:#f6f4ee;--line:rgba(26,24,20,.14);--line2:rgba(26,24,20,.08)}'+
    '@media (prefers-color-scheme:dark){:root{--ink:#ece7d8;--ink2:#b8b1a1;--ink3:#8d8778;--accent:#ff6a52;--bg:#161411;--line:rgba(233,228,214,.2);--line2:rgba(233,228,214,.1)}}'+
    '*{box-sizing:border-box}html{background:var(--bg)}'+
    'body{margin:0;background:var(--bg);color:var(--ink);font-family:"Literata",Georgia,"Times New Roman",serif;font-size:18px;line-height:1.78;-webkit-font-smoothing:antialiased}'+
    'a{color:inherit}'+
    '.title-page{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:60px 24px}'+
    '.tp-mark{width:14px;height:14px;background:var(--accent);transform:rotate(45deg);margin-bottom:30px}'+
    '.tp-title{font-size:clamp(30px,5vw,46px);font-weight:600;letter-spacing:-.02em;line-height:1.15;margin:0;max-width:820px;text-wrap:balance}'+
    '.tp-rule{width:64px;height:2px;background:var(--accent);margin:32px 0}'+
    '.tp-meta{font-family:"JetBrains Mono",ui-monospace,Menlo,monospace;font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:var(--ink3)}'+
    '.tp-meta b{color:var(--ink2);font-weight:500}'+
    '.toc{max-width:640px;margin:0 auto;padding:90px 32px 40px}'+
    '.toc h2{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11px;letter-spacing:.26em;text-transform:uppercase;color:var(--ink3);font-weight:500;margin:0 0 26px;padding-bottom:14px;border-bottom:1px solid var(--line)}'+
    '.toc ol{list-style:none;padding:0;margin:0}.toc li{margin:0 0 14px}'+
    '.toc a{display:flex;align-items:baseline;gap:16px;padding:6px 0;text-decoration:none;border-bottom:1px dashed transparent;transition:border-color .2s,color .2s}'+
    '.toc a:hover{color:var(--accent);border-bottom-color:var(--accent)}'+
    '.toc-num{font-family:"JetBrains Mono",ui-monospace,monospace;font-size:11px;color:var(--accent);letter-spacing:.08em;flex:0 0 auto}'+
    '.toc-t{font-size:18px;font-weight:500;letter-spacing:-.01em;flex:1}'+
    '.chapter{max-width:660px;margin:0 auto;padding:60px 32px 90px}.chapter+.chapter{border-top:1px solid var(--line)}'+
    '.chapter h1{font-size:clamp(26px,3.6vw,34px);font-weight:600;line-height:1.2;letter-spacing:-.02em;margin:0 0 .8em}'+
    '.chapter h2{font-size:20px;font-weight:600;letter-spacing:-.005em;margin:2.2em 0 .9em}'+
    '.chapter h2::before{content:"";display:block;width:36px;height:2px;background:var(--accent);margin-bottom:.7em}'+
    '.chapter p{margin:0 0 1.05em;text-align:justify;hyphens:auto}'+
    '.chapter p.dropcap::first-letter{float:left;font-size:3.7em;line-height:.82;font-weight:600;color:var(--accent);padding:.05em .12em 0 0}'+
    '.chapter blockquote{margin:1.6em 0;padding:4px 0 4px 20px;border-left:2px solid var(--accent);color:var(--ink2);font-style:italic;text-align:left}'+
    '.chapter .sep{display:flex;justify-content:center;letter-spacing:.6em;color:var(--accent);font-size:12px;margin:2.4em 0;user-select:none}'+
    '.colophon{max-width:660px;margin:0 auto;padding:0 32px 80px;text-align:center;font-family:"JetBrains Mono",ui-monospace,monospace;font-size:10px;letter-spacing:.24em;text-transform:uppercase;color:var(--ink3)}'+
    '.colophon .rule{width:40px;height:1px;background:var(--line);margin:0 auto 20px}'+
    '@media print{html,body{background:#fff;color:#000}.title-page{min-height:auto;padding-top:32vh;page-break-after:always}.toc{page-break-after:always}.chapter+.chapter{page-break-before:always;border-top:none;padding-top:0}.colophon{display:none}.chapter p.dropcap::first-letter{color:#000}}';
  var body='<div class="title-page"><div class="tp-mark"></div><h1 class="tp-title">'+esc(b.title||'Без названия')+'</h1><div class="tp-rule"></div><div class="tp-meta"><b>'+chapters.length+' '+plural(chapters.length,'глава','главы','глав')+'</b> · '+esc(dateStr)+'</div></div>';
  body+=toc;
  chapters.forEach(function(c,i){
    body+='<section class="chapter" id="ch-'+(i+1)+'">';
    var firstP=true;
    eachBlock(c.html,function(bl){
      if(bl.sep){body+='<div class="sep">✦ ✦ ✦</div>';return}
      if(bl.tag==='h1'){body+='<h1>'+esc(bl.text)+'</h1>';return}
      if(bl.tag==='h2'){body+='<h2>'+esc(bl.text)+'</h2>';return}
      if(bl.tag==='quote'){body+='<blockquote>'+esc(bl.text)+'</blockquote>';return}
      var drop=firstP;
      body+='<p'+(drop?' class="dropcap"':'')+'>'+esc(bl.text)+'</p>';
      firstP=false;
    });
    body+='</section>';
  });
  body+='<div class="colophon"><div class="rule"></div>Экспортировано из «Черновика» · '+esc(dateStr)+'</div>';
  return '<!DOCTYPE html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="color-scheme" content="light dark"><title>'+esc(b.title||'Без названия')+'</title><style>'+css+'</style></head><body>'+body+'</body></html>';
}
function downloadBlob(content,mime,name){
  var a=mk('a');
  a.href=URL.createObjectURL(new Blob([content],{type:mime}));
  a.download=name;document.body.appendChild(a);a.click();a.remove();
  setTimeout(function(){URL.revokeObjectURL(a.href)},1500);
}
var toastTimer=null;
function toast(msg){
  var t=$('#toast');if(!t)return;
  t.textContent=msg;t.classList.add('on');
  clearTimeout(toastTimer);toastTimer=setTimeout(function(){t.classList.remove('on')},2200);
}
function syncCurrentChapter(){
  var ch=currentCh();if(ch&&workspace.hidden===false&&editorOwned){ch.html=cleanHtml();ch.pos=scroller.scrollTop}
}
function doExport(kind){
  var b=book();if(!b)return;
  syncCurrentChapter();persist();
  var base=sanitizeFileName(b.title);
  var w=bookWords(b);
  if(kind==='md'){downloadBlob(buildMd(b),'text/markdown;charset=utf-8',base+'.md');toast('Сохранено '+base+'.md · '+fmt(w)+' слов')}
  else if(kind==='html'){downloadBlob(buildHtmlDoc(b),'text/html;charset=utf-8',base+'.html');toast('Сохранено '+base+'.html · '+fmt(w)+' слов')}
  else{downloadBlob(buildTxt(b),'text/plain;charset=utf-8',base+'.txt');toast('Сохранено '+base+'.txt · '+fmt(w)+' слов')}
}
function closeExportMenu(){$('#exportMenu').classList.remove('on');var eb=$('#btnExport');if(eb)eb.setAttribute('aria-expanded','false')}
function openExportMenu(){
  var m=$('#exportMenu'),b=book();if(!b)return;
  var w=bookWords(b),n=visibleChapters(b).length,notes=collectNotes().length;
  m.innerHTML='<div role="group"><div class="bm-head">Скачать рукопись · '+n+' '+plural(n,'глава','главы','глав')+' · '+fmt(w)+' слов</div>'+
    '<button type="button" class="bm-item" role="menuitem" data-k="txt"><span class="bm-badge">Tx</span><span class="t">Простой текст</span><span class="h">.TXT</span></button>'+
    '<button type="button" class="bm-item" role="menuitem" data-k="md"><span class="bm-badge">Md</span><span class="t">Markdown</span><span class="h">.MD</span></button>'+
    '<button type="button" class="bm-item" role="menuitem" data-k="html"><span class="bm-badge">&lt;&gt;</span><span class="t">Веб-страница</span><span class="h">.HTML</span></button>'+
    '<button type="button" class="bm-item" role="menuitem" data-k="print"><span class="bm-badge">⎙</span><span class="t">Печать / PDF</span><span class="h">CTRL+P</span></button>'+
    (notes?('<div class="bm-head" style="padding-top:10px">'+fmt(notes)+' '+plural(notes,'заметка','заметки','заметок')+' не войдут в файл</div>'):'')+
    '</div>';
  var r=$('#btnExport').getBoundingClientRect();
  m.style.top=(r.bottom+8)+'px';
  m.style.left=Math.max(10,Math.min(r.left-180,innerWidth-260))+'px';
  m.classList.add('on');
  $('#btnExport').setAttribute('aria-expanded','true');
  m.querySelectorAll('.bm-item').forEach(function(btn){
    btn.addEventListener('click',function(){
      var k=btn.dataset.k;closeExportMenu();
      if(k==='print'){buildPrintBook();setTimeout(function(){print()},60);return}
      doExport(k);
    });
  });
}
$('#btnExport').addEventListener('click',function(e){
  e.stopPropagation();
  var m=$('#exportMenu');
  if(m.classList.contains('on'))closeExportMenu();else openExportMenu();
});
document.addEventListener('click',function(e){
  if(!e.target.closest('#exportMenu')&&!e.target.closest('#btnExport'))closeExportMenu();
});

$('#btnBookmark').addEventListener('mousedown',function(e){e.preventDefault()});
$('#btnBookmark').addEventListener('click',function(){createMarkAtCursor()});

document.addEventListener('keydown',function(e){
  if($('#askModal').classList.contains('on')){
    if(e.key==='Escape'){e.preventDefault();askClose(null)}return;
  }
  if($('#dayModal').classList.contains('on')){
    if(e.key==='Escape'){e.preventDefault();closeDayModal()}return;
  }
  if($('#musicModal').classList.contains('on')){
    /* Escape только закрывает окно — мелодия продолжает играть */
    if(e.key==='Escape'){e.preventDefault();closeMusic()}return;
  }
  if(isReader()&&(e.ctrlKey||e.metaKey||e.altKey))return;
  if((e.ctrlKey||e.metaKey)&&(e.key==='s'||e.key==='S')){e.preventDefault();scheduleSave()}
  if((e.ctrlKey||e.metaKey)&&e.altKey&&(e.key==='m'||e.key==='M')&&!workspace.hidden){e.preventDefault();createMarkAtCursor();return}
  if((e.ctrlKey||e.metaKey)&&e.altKey&&(e.key==='n'||e.key==='N')&&!workspace.hidden){e.preventDefault();insertNoteAtCursor();return}
  if((e.ctrlKey||e.metaKey)&&(e.key==='f'||e.key==='F')&&workspace.hidden===false){
    e.preventDefault();
    var inp=$('#spInput');inp.focus();inp.select();
    if(inp.value.trim().length>=2)showSearchResults();
    return;
  }
  /* defaultPrevented: поиск в #spInput уже сработал (14-search.js) —
     не закрываем вдобавок панель/чужую книгу */
  if(e.key==='Escape'&&!e.defaultPrevented){
    if($('#exportMenu')&&$('#exportMenu').classList.contains('on')){closeExportMenu();return}
    if($('#accMenu')&&$('#accMenu').classList.contains('on')){closeAccMenu();return}
    if($('#wikiViewModal').classList.contains('on')){closeWikiView();return}
    if($('#wikiModal').classList.contains('on')){closeWikiModal();return}
    if(searchOpen){hideSearchResults();return}
    if(document.activeElement===$('#spInput')){clearSearch();$('#spInput').blur();return}
    if($('#wikiPanel').classList.contains('on')){toggleWikiPanel(false);return}
    if(!bookView.hidden){if(typeof closeForeignBook==='function')closeForeignBook();bookView.hidden=true;library.hidden=false;viewIn(library);renderLibrary();renderMarksRail();return}
    if(menuOpen){closeMenu();return}
    if(document.body.classList.contains('zen'))toggleZen();
  }
});

