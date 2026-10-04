/* ==========================================================================
 * 21-shared.js — ОБЩИЙ ДОСТУП — чужие книги, каталог, доступ к своей книге
 * Проект: «Черновик» — веб-редактор рукописей.
 * Что делает:
 *   - openForeignBook(b, meta) — показывает чужую книгу (объект ВНЕ state.books):
 *     body.ro, contenteditable=false, сохранение/экспорт своих данных не трогаются;
 *   - openForeignOverview() — экран обзора без полезной нагрузки в свой state
 *     (для кнопки «Оглавление» в мобильной читалке);
 *   - closeForeignBook() — снимает режим и возвращает normal-состояние;
 *   - updateRoChrome() — бейдж «чтение» и строка статуса «Только чтение»;
 *   - renderBookAccess / setBookVisibility — блок «Доступ» в обзоре книги
 *     (закрыта/по ссылке/публичная + share-ссылка) при серверном режиме;
 *   - setLibTab / discoverShared — вкладка «Общие книги»: каталог публичных
 *     книг с поиском по названию и автору (api/discover.php);
 *   - openSharedBook / routeReadHash — открытие чужой книги с сервера
 *     (api/read.php) по клику и по hash-ссылке #/read/<id>[/<token>].
 * Ключевое: openForeignBook, closeForeignBook, isForeign, renderBookAccess,
 *   openSharedBook, routeReadHash.
 * Зависимости: 01–20 (book(), renderBookView, applyReaderMode, commitNow,
 *   toast, timeAgo, Sync — через typeof).
 * ========================================================================== */
"use strict";

function isForeign(){return !!foreignDoc}

function roNormalize(b){
  if(!b||typeof b!=='object')return b;
  b.wiki=Array.isArray(b.wiki)?b.wiki:[];
  b.customTypes=Array.isArray(b.customTypes)?b.customTypes:[];
  if(typeof b.title!=='string'||!b.title)b.title='Без названия';
  if(!Array.isArray(b.chapters))b.chapters=[];
  b.chapters.forEach(function(ch){
    if(!Array.isArray(ch.marks))ch.marks=[];
    if(typeof ch.html!=='string')ch.html='';
    if(typeof ch.pos!=='number')ch.pos=0;
  });
  if(!b.chapters.some(function(c){return c.id===b.current})&&b.chapters.length)b.current=b.chapters[0].id;
  return b;
}

function updateRoChrome(){
  var ro=isReadOnly();
  var badge=$('#roBadge');
  if(badge)badge.hidden=!ro;
  var bt=$('#bookTitle');
  if(bt)bt.readOnly=ro;
  if(ro)saveTxt.textContent='Только чтение';
}

/* открыть чужую книгу: b — книга с сервера, meta — {line:'Автор: …'} */
function openForeignBook(b,meta){
  if(!b||typeof b!=='object')return false;
  if(!isReadOnly()){commitNow();clearTimeout(saveTimer)} /* дописать свои правки */
  roNormalize(b);
  foreignMeta=meta||{};
  foreignDoc=b;
  document.body.classList.add('ro');
  applyReaderMode();               /* contenteditable=false, шиты/меню закрыты */
  library.hidden=true;bookView.hidden=false;
  setWorkspaceVisible(false);
  bookView.scrollTop=0;viewIn(bookView);
  renderBookView();
  renderMarksRail();
  updateRoChrome();
  return true;
}

/* обзор чужой книги без изменения своего state (кнопка «Оглавление» в читалке) */
function openForeignOverview(){
  if(!foreignDoc)return false;
  library.hidden=true;bookView.hidden=false;
  setWorkspaceVisible(false);
  bookView.scrollTop=0;viewIn(bookView);
  renderBookView();
  renderMarksRail();
  updateRoChrome();
  return true;
}

function closeForeignBook(){
  if(!foreignDoc)return;
  foreignDoc=null;foreignMeta={};
  document.body.classList.remove('ro');
  applyReaderMode();
  updateRoChrome();
  if((location.hash||'').indexOf('#/read/')===0){
    try{history.replaceState(null,'',location.pathname+location.search)}catch(e){location.hash=''}
  }
}

/* ==========================================================================
 * Доступ к своей книге — блок «Доступ» в обзоре (server-режим)
 * ========================================================================== */
function newShareToken(){
  var a=new Uint8Array(16);
  if(window.crypto&&crypto.getRandomValues)crypto.getRandomValues(a);
  else for(var i=0;i<16;i++)a[i]=Math.floor(Math.random()*256);
  var s='';
  for(var j=0;j<16;j++)s+=(a[j]<16?'0':'')+a[j].toString(16);
  return s;
}

function shareLinkFor(b){
  if(!b||!b.id)return '';
  var base=location.href.split('#')[0];
  var link=base+'#/read/'+b.id;
  if(b.visibility!=='public'&&b.share_token)link+='/'+b.share_token;
  return link;
}

function serverSynced(){return typeof Sync!=='undefined'&&Sync&&Sync.mode==='server'}

function renderBookAccess(){
  var box=$('#bvAccess');if(!box)return;
  var own=!isForeign()&&!!(state&&book())&&serverSynced();
  box.hidden=!own;
  if(!own)return;
  var b=book();if(!b)return;
  var v=b.visibility||'private';
  var seg=$('#bvVis');
  if(seg)seg.querySelectorAll('button').forEach(function(btn){
    btn.classList.toggle('on',(btn.getAttribute('data-v')||'')===v);
  });
  var row=$('#bvShareRow');
  var showLink=(v!=='private');
  if(row)row.hidden=!showLink;
  if(showLink){
    var inp=$('#bvShareLink');
    if(inp)inp.value=shareLinkFor(b);
  }
}

function setBookVisibility(v){
  if(['private','unlisted','public'].indexOf(v)<0)return;
  var b=book();if(!b||isReadOnly())return;
  if((b.visibility||'private')===v){renderBookAccess();return}
  b.visibility=v;
  if(v!=='private'&&!b.share_token)b.share_token=newShareToken();
  b.updated=Date.now();            /* LWW: смена доступа — правка книги */
  persist();
  renderBookAccess();
}

function copyShareLink(){
  var inp=$('#bvShareLink');
  if(!inp||!inp.value)return;
  var ok=function(){if(typeof toast==='function')toast('Ссылка скопирована')};
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(inp.value).then(ok,function(){inp.select();try{document.execCommand('copy');ok()}catch(e){}});
  }else{
    inp.select();
    try{document.execCommand('copy');ok()}catch(e){}
  }
}

/* ==========================================================================
 * Каталог «Общие книги» — вкладка в библиотеке
 * ========================================================================== */
var libTab='mine';
var sharedReq=0;

function setLibTab(t){
  libTab=(t==='shared')?'shared':'mine';
  var tabs=$('#libTabs');
  if(tabs)tabs.querySelectorAll('button').forEach(function(b){
    b.classList.toggle('on',(b.getAttribute('data-t')||'')===libTab);
  });
  var box=$('#sharedBox'),shelf=$('#shelf');
  if(box)box.hidden=(libTab!=='shared');
  if(shelf)shelf.hidden=(libTab==='shared');
  if(libTab==='shared'){
    var ss=$('#sharedSearch');
    discoverShared(ss?ss.value.trim():'');
  }
}

function discoverShared(q){
  var box=$('#sharedList');if(!box)return;
  var n=++sharedReq;
  if(!q)box.innerHTML='<div class="shared-empty">загрузка…</div>';
  fetch('api/discover.php'+(q?'?q='+encodeURIComponent(q):''),{credentials:'same-origin'})
    .then(function(r){return r.json()})
    .then(function(d){
      if(n!==sharedReq)return;
      var list=(d&&Array.isArray(d.books))?d.books:[];
      if(!list.length){
        box.innerHTML='<div class="shared-empty">'+(q?'ничего не найдено':'пока пусто — никто не публикует книги')+'</div>';
        return;
      }
      box.innerHTML='';
      list.forEach(function(it){
        var c=document.createElement('div');
        c.className='shared-card';
        c.setAttribute('role','button');
        c.setAttribute('tabindex','0');
        var st=document.createElement('div');st.className='st';st.textContent=it.title||'';
        var sa=document.createElement('div');sa.className='sa';sa.textContent=it.author||'';
        var sd=document.createElement('div');sd.className='sd';sd.textContent=timeAgo(it.updated)||'';
        c.appendChild(st);c.appendChild(sa);c.appendChild(sd);
        var open=function(){openSharedBook(it.id,null)};
        c.addEventListener('click',open);
        c.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}});
        box.appendChild(c);
      });
    })
    .catch(function(){
      if(n!==sharedReq)return;
      box.innerHTML='<div class="shared-empty">сервер недоступен</div>';
    });
}

/* ==========================================================================
 * Открытие чужой книги с сервера + hash-роут #/read/<id>[/<token>]
 * ========================================================================== */
function openSharedBook(id,token){
  if(!id)return Promise.resolve(false);
  var url='api/read.php?id='+encodeURIComponent(id)+(token?'&t='+encodeURIComponent(token):'');
  return fetch(url,{credentials:'same-origin'})
    .then(function(r){
      if(!r.ok)throw new Error('http '+r.status);
      return r.json();
    })
    .then(function(j){
      if(!j||!j.book)return false;
      var meta={line:(j.meta&&j.meta.author)?('Автор: '+j.meta.author):'чужая книга'};
      openForeignBook(roNormalize(j.book),meta);
      return true;
    })
    .catch(function(){
      if(typeof toast==='function')toast('Книга недоступна');
      /* битая/приватная ссылка — убираем hash, чтобы не повторять при перезагрузке */
      if((location.hash||'').indexOf('#/read/')===0){
        try{history.replaceState(null,'',location.pathname+location.search)}catch(e){}
      }
      return false;
    });
}

function routeReadHash(){
  var h=location.hash||'';
  if(h.indexOf('#/read/')!==0)return false;
  var parts=h.slice(7).split('/');
  var id=(parts[0]||'').replace(/[^a-zA-Z0-9_\-]/g,'');
  var tok=(parts[1]||'').replace(/[^a-f0-9]/gi,'').toLowerCase();
  if(!id)return false;
  if(foreignDoc&&foreignDoc.id===id)return true;
  openSharedBook(id,tok||null);
  return true;
}

window.addEventListener('hashchange',function(){
  var h=location.hash||'';
  if(h.indexOf('#/read/')===0){routeReadHash();return}
  if(foreignDoc){
    closeForeignBook();
    bookView.hidden=true;library.hidden=false;
    setWorkspaceVisible(false);
    viewIn(library);renderLibrary();
  }
});

/* ===== обработчики разметки (скрипт в конце body — DOM готов) ===== */
(function(){
  var lt=document.getElementById('libTabs');
  if(lt)lt.addEventListener('click',function(e){
    var b=e.target&&e.target.closest?e.target.closest('button[data-t]'):null;
    if(b)setLibTab(b.getAttribute('data-t'));
  });
  var ss=document.getElementById('sharedSearch');
  if(ss){
    var timer=null;
    ss.addEventListener('input',function(){
      clearTimeout(timer);
      timer=setTimeout(function(){discoverShared(ss.value.trim())},300);
    });
  }
  var vis=document.getElementById('bvVis');
  if(vis)vis.addEventListener('click',function(e){
    var b=e.target&&e.target.closest?e.target.closest('button[data-v]'):null;
    if(b)setBookVisibility(b.getAttribute('data-v'));
  });
  var cp=document.getElementById('bvShareCopy');
  if(cp)cp.addEventListener('click',copyShareLink);
})();
