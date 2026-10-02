/* ==========================================================================
 * 11-notes.js — ЗАМЕТКИ
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 18 JS-скриптов, подключаются строго по номеру.
 * Раздел оригинала: src/index.html, строки 3055–3244 (раздел 11 из 18).
 * Что делает: сбор заметок из глав, фильтры и карточки, переход к заметке, правка/удаление, вставка новой заметки в каретку.
 * Ключевое: collectNotes, renderNotes, renderNoteFilters, jumpToNote, editNote, deleteNote, insertNoteAtCursor.
 * Зависимости: 01-core, 07-layout (uiConfirm), 15-editor (caret, slash-меню «Заметка»).
 * ========================================================================== */
"use strict";
/* ===== ЗАМЕТКИ ===== */
var npQuery='',npFilter='all';
function collectNotes(){
  var b=book();if(!b)return [];
  var out=[];
  b.chapters.forEach(function(ch,i){
    var d=tmp(ch.html);
    var blocks=Array.prototype.slice.call(d.children);
    var nbIdx=0;
    blocks.forEach(function(el,bi){
      if(!el.classList||!el.classList.contains('nb'))return;
      var text=(el.textContent||'').trim();
      var ctx='';
      for(var k=bi-1;k>=0;k--){
        var t=(blocks[k].textContent||'').replace(/\s+/g,' ').trim();
        if(t){ctx=t.slice(-100);break}
      }
      out.push({
        nid:el.getAttribute('data-nid')||'',
        nbIndex:nbIdx,
        text:text,ctx:ctx,
        chId:ch.id,chIdx:i,chTitle:chapterTitle(ch),ord:bi,
        isNotesCh:isNotesCh(ch)
      });
      nbIdx++;
    });
  });
  return out;
}
function noteElIn(root,n){
  var els=root.querySelectorAll('.nb');
  if(n.nid){
    for(var i=0;i<els.length;i++){
      if(els[i].getAttribute('data-nid')===n.nid)return els[i];
    }
  }
  if(typeof n.nbIndex==='number')return els[n.nbIndex]||null;
  return null;
}
function renderNoteFilters(all){
  var box=$('#npFilters');if(!box)return;
  box.innerHTML='';
  function chip(label,val,cnt){
    var b=mk('button');
    b.className='wp-f nodia'+(npFilter===val?' on':'');
    b.innerHTML=label+' <span class="cnt">'+cnt+'</span>';
    b.addEventListener('click',function(){npFilter=val;renderNotes()});
    box.appendChild(b);
  }
  chip('Все','all',all.length);
  chip('С текстом','filled',all.filter(function(n){return n.text}).length);
  chip('Пустые','empty',all.filter(function(n){return !n.text}).length);
  var info=mk('span');
  info.style.cssText='font-family:var(--f-ui);font-size:8.5px;letter-spacing:.1em;text-transform:uppercase;color:var(--ink3);align-self:center;padding-left:4px';
  var byCh={};all.forEach(function(n){byCh[n.chId]=1});
  info.textContent='глав: '+Object.keys(byCh).length;
  box.appendChild(info);
}
function renderNotes(){
  var box=$('#npBody');if(!box)return;
  var b=book();if(!b)return;
  var all=collectNotes();
  $('#wpCount').textContent=all.length?fmt(all.length)+' '+plural(all.length,'заметка','заметки','заметок'):'';
  renderNoteFilters(all);
  updatePanelTabs();
  var q=npQuery.toLowerCase().trim();
  var listArr=all.filter(function(n){
    if(npFilter==='empty'&&n.text)return false;
    if(npFilter==='filled'&&!n.text)return false;
    if(!q)return true;
    return n.text.toLowerCase().indexOf(q)>=0||n.ctx.toLowerCase().indexOf(q)>=0||n.chTitle.toLowerCase().indexOf(q)>=0;
  });
  box.innerHTML='';
  if(!all.length){
    box.innerHTML='<div class="wp-empty">Заметок пока нет.<br><br>Нажмите <b>«+ заметка»</b> или введите <b>/</b> в тексте и выберите «Заметка» — такая врезка <b>не попадёт в печать и экспорт</b>.<br><br>А глава «Заметки» в списке глав — для свободных записей.</div>';
    return;
  }
  if(!listArr.length){box.innerHTML='<div class="wp-empty">ничего не найдено</div>';return}
  var byCh={};
  listArr.forEach(function(n){(byCh[n.chId]=byCh[n.chId]||[]).push(n)});
  Object.keys(byCh).forEach(function(cid){
    var arr=byCh[cid];
    arr.sort(function(a,b){return a.ord-b.ord});
    var g=mk('div');g.className='wp-group';
    g.innerHTML='<div class="wp-glabel">'+esc(arr[0].chTitle)+(arr[0].isNotesCh?' <span class="wp-gn">системная</span>':'')+'<span class="wp-gn">'+arr.length+'</span></div>';
    var wrap=mk('div');wrap.className='wg-cards';
    arr.forEach(function(n){wrap.appendChild(noteCard(n))});
    g.appendChild(wrap);box.appendChild(g);
  });
}
function noteCard(n){
  var card=mk('div');card.className='note-card';
  var head=mk('div');head.className='note-head';
  head.innerHTML='<b>'+esc(n.chTitle)+'</b><span>· '+esc(n.ctx?('…'+n.ctx.slice(-56)):'начало главы')+'</span>';
  card.appendChild(head);
  var t=mk('div');t.className='note-txt';
  if(n.text)t.textContent=n.text;
  else{t.textContent='пустая заметка';t.style.fontStyle='italic';t.style.color='var(--ink3)'}
  card.appendChild(t);
  var acts=mk('div');acts.className='note-acts';
  var bJump=mk('button');bJump.className='note-btn';bJump.textContent='Перейти';
  bJump.addEventListener('click',function(e){e.stopPropagation();jumpToNote(n)});
  var bEdit=mk('button');bEdit.className='note-btn';bEdit.textContent='Изменить';
  bEdit.addEventListener('click',function(e){e.stopPropagation();editNote(n)});
  var bDel=mk('button');bDel.className='note-btn';bDel.textContent='Удалить';
  bDel.addEventListener('click',function(e){e.stopPropagation();deleteNote(n)});
  acts.appendChild(bJump);acts.appendChild(bEdit);acts.appendChild(bDel);
  card.appendChild(acts);
  card.addEventListener('click',function(){card.classList.toggle('open')});
  return card;
}
function jumpToNote(n){
  var b=book();if(!b)return;
  if(b.current!==n.chId)openChapter(n.chId);
  setTimeout(function(){
    var el=null;
    if(n.nid)el=editor.querySelector('.nb[data-nid="'+escAttr(n.nid)+'"]');
    if(!el){
      var all=editor.querySelectorAll('.nb');
      el=all[n.nbIndex]||null;
      if(!el&&n.text){
        for(var i=0;i<all.length;i++){
          if((all[i].textContent||'').trim()===n.text){el=all[i];break}
        }
      }
    }
    if(!el){toast('Не удалось найти врезку');return}
    el.scrollIntoView({block:'center',behavior:'smooth'});
    el.classList.add('nb-flash');
    setTimeout(function(){el.classList.remove('nb-flash')},1700);
    editor.focus();
    var r=document.createRange();r.selectNodeContents(el);r.collapse(true);
    var s=getSelection();s.removeAllRanges();s.addRange(r);
  },120);
}
function editNote(n){
  var b=book();if(!b)return;
  var ch=b.chapters.filter(function(c){return c.id===n.chId})[0];if(!ch)return;
  uiAsk({title:'Заметка',value:n.text,placeholder:'текст заметки',input:true,ok:'СОХРАНИТЬ'}).then(function(v){
    if(v===null)return;
    var d=tmp(ch.html);
    var el=noteElIn(d,n);
    if(!el){toast('Не удалось найти врезку');return}
    el.textContent=v;
    ch.html=d.innerHTML;
    persist();invalidateCo();
    if(b.current===ch.id&&!workspace.hidden)loadChapter(ch);
    renderNotes();
    toast('Заметка обновлена');
  });
}
function deleteNote(n){
  var b=book();if(!b)return;
  var ch=b.chapters.filter(function(c){return c.id===n.chId})[0];if(!ch)return;
  uiConfirm('Удалить заметку?','Текст врезки будет стёрт безвозвратно.',true).then(function(ok){
    if(!ok)return;
    var d=tmp(ch.html);
    var el=noteElIn(d,n);
    if(el)el.remove();
    ch.html=d.innerHTML;
    persist();invalidateCo();
    if(b.current===ch.id&&!workspace.hidden)loadChapter(ch);
    renderNotes();
    toast('Заметка удалена');
  });
}
function insertNoteAtCursor(){
  var b=book(),ch=currentCh();
  if(!b||!ch){toast('Откройте главу');return}
  var block=null;
  try{block=getBlock()}catch(e){}
  if(!block)block=ensureLastP();
  if(block.classList&&block.classList.contains('sep')){
    var p=mk('p');block.after(p);block=p;
  }
  var d=mk('div');d.className='nb';d.setAttribute('data-nid',uid());
  d.textContent='';
  block.after(d);
  if(!d.nextElementSibling){var p2=mk('p');d.after(p2)}
  editor.focus();
  caretEnd(d);
  updateStats();scheduleSave();
  if($('#wikiPanel').classList.contains('on')&&panelTab==='notes')renderNotes();
  else updatePanelTabs();
  toast('Заметка добавлена — она не попадёт в печать');
}
$('#npAdd').addEventListener('click',function(){insertNoteAtCursor()});
$('#npSearch').addEventListener('input',function(){npQuery=this.value;renderNotes()});
$('#btnNote').addEventListener('click',function(){insertNoteAtCursor()});

