/* ==========================================================================
 * 03-snapshots.js — СНАПШОТЫ — история правок
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 18 JS-скриптов, подключаются строго по номеру.
 * Раздел оригинала: src/index.html, строки 1805–1974 (раздел 3 из 18).
 * Что делает: снятие/восстановление снапшотов текста с лимитами (30 дней / 3,5 МБ), модалка выбора дня #dayModal.
 * Ключевое: snapshots, initSnapshots, takeSnapshot, restoreFromSnapshot, openDayModal, closeDayModal.
 * Зависимости: 01-core, 04-state-seed (persist), 07-layout (диалоги); вызывается из автосейва 15-editor.
 * ========================================================================== */
"use strict";
/* ===== снапшоты ===== */
var snapshots={};
function initSnapshots(){
  snapshots={};
  try{
    var snapRaw=localStorage.getItem(SNAP_LS);
    if(snapRaw){
      var parsed=JSON.parse(snapRaw);
      if(parsed&&typeof parsed==='object')snapshots=parsed;
    }
  }catch(e){}
}
function persistSnapshots(){
  try{
    var keys=Object.keys(snapshots).sort();
    if(keys.length>SNAP_MAX_DAYS)keys.slice(0,keys.length-SNAP_MAX_DAYS).forEach(function(k){delete snapshots[k]});
    var json=JSON.stringify(snapshots);
    while(json.length>SNAP_MAX_BYTES && Object.keys(snapshots).length>3){
      var ks=Object.keys(snapshots).sort();
      delete snapshots[ks[0]];
      json=JSON.stringify(snapshots);
    }
    localStorage.setItem(SNAP_LS,json);
  }catch(e){
    try{localStorage.removeItem(SNAP_LS)}catch(e2){}
    snapshots={};
  }
}
function takeSnapshot(){
  try{
    var key=todayKey();
    snapshots[key]={
      ts:Date.now(),
      books:state.books.map(function(b){
        return {
          id:b.id,title:b.title,color:b.color,updated:b.updated,current:b.current,
          customTypes:b.customTypes||[],wiki:b.wiki||[],
          chapters:(b.chapters||[]).map(function(c){return {id:c.id,html:c.html,pos:c.pos,marks:c.marks||[],kind:c.kind||''}})
        };
      })
    };
    persistSnapshots();
  }catch(e){}
}
function hasSnapshot(key){return !!snapshots[key]}

function openDayModal(key){
  var snap=snapshots[key];
  if(!snap){toast('Нет снапшота за этот день');return}
  var d=new Date(key+'T12:00:00');
  var dateStr=d.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric',weekday:'long'});
  $('#dmTitle').textContent=dateStr;

  var sortedKeys=Object.keys(snapshots).sort();
  var idx=sortedKeys.indexOf(key);
  var prevKey=idx>0?sortedKeys[idx-1]:null;
  var prevSnap=prevKey?snapshots[prevKey]:null;

  function collectBooks(bs){
    return (bs||[]).map(function(b){
      var words=0,chs={};
      (b.chapters||[]).forEach(function(c){
        if(c.kind==='notes')return;
        var h=tmp(c.html).querySelector('h1');
        var t=h?(h.textContent.trim()||'Без названия'):'Без названия';
        var w=countWords(tmp(c.html).textContent);
        words+=w;chs[c.id]={title:t,words:w};
      });
      return {id:b.id,title:b.title||'Без названия',words:words,chapters:chs};
    });
  }
  var beforeList=collectBooks(prevSnap&&prevSnap.books);
  var afterList=collectBooks(snap.books);
  var beforeMap={},afterMap={};
  beforeList.forEach(function(b){beforeMap[b.id]=b});
  afterList.forEach(function(b){afterMap[b.id]=b});

  var totalSnap=0,totalPrev=0;
  afterList.forEach(function(sb){
    totalSnap+=sb.words;
    var p=beforeMap[sb.id];if(p)totalPrev+=p.words;
  });
  Object.keys(beforeMap).forEach(function(id){
    if(!afterMap[id])totalPrev+=beforeMap[id].words;
  });

  var html='';
  afterList.forEach(function(sb){
    var before=beforeMap[sb.id];
    var beforeW=before?before.words:0;
    var delta=sb.words-beforeW;
    html+='<div class="dm-book'+(before?'':' dm-new')+'">';
    html+='<div class="dm-bh"><span class="dm-bt">'+esc(sb.title)+'</span>';
    if(delta>0)html+='<span class="dm-d pos">+'+fmt(delta)+'</span>';
    else if(delta<0)html+='<span class="dm-d neg">−'+fmt(Math.abs(delta))+'</span>';
    else html+='<span class="dm-d zero">без изменений</span>';
    if(before)html+='<span class="dm-w">'+fmt(beforeW)+' → '+fmt(sb.words)+' сл.</span>';
    else html+='<span class="dm-w">новая книга · '+fmt(sb.words)+' сл.</span>';
    html+='</div>';
    var chIds=Object.keys(sb.chapters);
    if(chIds.length){
      html+='<ul class="dm-ch">';
      chIds.forEach(function(cid){
        var ch=sb.chapters[cid];
        var prevW=(before&&before.chapters[cid])?before.chapters[cid].words:null;
        var d2=prevW==null?ch.words:ch.words-prevW;
        var sign=d2>0?'+':d2<0?'−':'';
        var cls=d2>0?'pos':d2<0?'neg':'zero';
        html+='<li><span class="dm-ct">'+esc(ch.title)+'</span><span class="dm-cd '+cls+'">'+sign+fmt(Math.abs(d2))+'</span></li>';
      });
      html+='</ul>';
    }
    html+='</div>';
  });
  Object.keys(beforeMap).forEach(function(id){
    if(!afterMap[id]){
      var cb=beforeMap[id];
      html+='<div class="dm-book dm-new"><div class="dm-bh"><span class="dm-bt">'+esc(cb.title)+'</span><span class="dm-d neg">−'+fmt(cb.words)+'</span><span class="dm-w">книга удалена · было '+fmt(cb.words)+' сл.</span></div></div>';
    }
  });
  if(!html)html='<div class="dm-empty">изменений нет</div>';
  $('#dmBody').innerHTML=html;

  var deltaTotal=totalSnap-totalPrev;
  var sign=deltaTotal>0?'+':deltaTotal<0?'−':'';
  var clsCls=deltaTotal>0?'pos':deltaTotal<0?'neg':'';
  $('#dmMeta').innerHTML='Всего: <b>'+fmt(totalPrev)+'</b> → <b>'+fmt(totalSnap)+'</b> '+plural(totalSnap,'слово','слова','слов')+' · <span class="'+clsCls+'">'+sign+fmt(Math.abs(deltaTotal))+'</span>';

  $('#dmNote').innerHTML='Снапшоты хранятся в <b>localStorage</b> по ключу <code>chernovik.snapshots.v1</code>, сами книги — по ключу <code>chernovik.v2</code>. Очистите данные браузера — история пропадёт. Для надёжности — резервные копии кнопкой «скачать» в правом верхнем углу.';

  $('#dmRestore').onclick=function(){closeDayModal();restoreFromSnapshot(key)};
  $('#dayModal').classList.add('on');
}
function closeDayModal(){$('#dayModal').classList.remove('on')}
$('#dmClose').addEventListener('click',closeDayModal);
$('#dmCloseBtn').addEventListener('click',closeDayModal);
$('#dayModal').addEventListener('click',function(e){if(e.target===this)closeDayModal()});

function restoreFromSnapshot(key){
  var snap=snapshots[key];
  if(!snap)return;
  var d=new Date(key+'T12:00:00');
  var dateStr=d.toLocaleDateString('ru-RU',{day:'numeric',month:'long',year:'numeric'});
  var bookCount=snap.books.length;
  uiConfirm('Откатить к состоянию на '+dateStr+'?','Все книги ('+bookCount+' шт.) будут заменены. Текущие изменения будут потеряны.',true).then(function(ok){
    if(!ok)return;
    state.books=snap.books.map(function(b){
      return {
        id:b.id,title:b.title||'Без названия',
        color:(COLORS.indexOf(b.color)>=0)?b.color:COLORS[0],
        updated:b.updated||Date.now(),current:b.current||null,
        customTypes:Array.isArray(b.customTypes)?b.customTypes:[],
        wiki:Array.isArray(b.wiki)?b.wiki:[],
        chapters:(b.chapters||[]).map(function(c){return {id:c.id,html:c.html||'',pos:c.pos||0,marks:Array.isArray(c.marks)?c.marks:[],kind:c.kind||''}})
      };
    });
    state.activeBookId=null;
    Object.keys(snapshots).forEach(function(k){if(k>key)delete snapshots[k]});
    persistSnapshots();persist();
    invalidateCo();
    closeMenu();selbar.classList.remove('on');hideSynbar();clearSearch();
    toggleWikiPanel(false);hideMarkTip();
    setWorkspaceVisible(false);
    library.hidden=false;library.scrollTop=0;viewIn(library);
    renderLibrary();renderStats();
    renderMarksRail();
    toast('Откат к '+dateStr+' выполнен');
  });
}

