/* ==========================================================================
 * 14-search.js — ПОИСК ПО КНИГЕ
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 18 JS-скриптов, подключаются строго по номеру.
 * Раздел оригинала: src/index.html, строки 4155–4307 (раздел 14 из 18).
 * Что делает: поле поиска в топбаре, выпадающая панель результатов, подсветка совпадений в тексте, переход к результату, позиционирование панели (в т.ч. fallback-якорь для узких экранов).
 * Ключевое: positionSearchResults, showSearchResults, hideSearchResults, renderSearchResults, paintSearch, goToResult.
 * Зависимости: 01-core, 04-state-seed, 08-declensions (варианты имён); хоткей Ctrl+F из 15-editor.
 * ========================================================================== */
"use strict";
/* ===== ПОИСК ===== */
function positionSearchResults(){
  var sr=$('#spResults'),box=$('#tbSearch');
  if(!sr||!box)return;
  var b=box.getBoundingClientRect();
  var anchor=(b.width>0&&b.height>0)?b.bottom:(($('#topbar')&&$('#topbar').getBoundingClientRect().bottom)||54);
  var cols=spCols.children.length||2;
  var perCol=280;
  var w=Math.max(620,cols*perCol+24);
  if(w>innerWidth-40)w=innerWidth-40;
  var left=(b.width>0?(b.left+b.width/2):innerWidth/2)-w/2;
  left=Math.max(10,Math.min(left,innerWidth-w-10));
  sr.style.top=(anchor+6)+'px';
  sr.style.left=left+'px';
  sr.style.width=w+'px';
}
function showSearchResults(){positionSearchResults();$('#spResults').classList.add('on');searchOpen=true}
function hideSearchResults(){$('#spResults').classList.remove('on');searchOpen=false}
function clearSearch(){
  $('#spInput').value='';
  $('#tbSearch').classList.remove('has-val');
  $('#spCount').textContent='';spCols.innerHTML='';
  searchResults=[];searchIdx=0;hideSearchResults();
}
$('#spClose').addEventListener('click',function(e){e.preventDefault();clearSearch();$('#spInput').focus()});
$('#spInput').addEventListener('input',function(){
  var q=this.value.trim();
  $('#tbSearch').classList.toggle('has-val',!!q);
  spCols.innerHTML='';$('#spCount').textContent='';
  searchResults=[];searchIdx=0;
  if(q.length<2){hideSearchResults();return}
  var ql=q.toLowerCase();var b=book();if(!b)return;
  var chHits=[],wkHits=[],noteHits=[];
  visibleChapters(b).forEach(function(ch){
    var i=b.chapters.indexOf(ch);
    var text=tmp(ch.html).textContent,lower=text.toLowerCase();
    var idx=lower.indexOf(ql);
    while(idx>=0&&chHits.length<60){
      var from=Math.max(0,idx-46);
      var snip=(from>0?'…':'')+text.slice(from,idx+ql.length+64).replace(/\s+/g,' ');
      chHits.push({kind:'ch',i:i,idx:idx,len:ql.length,snip:snip,q:ql});
      idx=lower.indexOf(ql,idx+ql.length);
    }
  });
  (b.wiki||[]).forEach(function(en){
    var name=en.name||'',desc=en.desc||'',al=(en.aliases||[]).join(' ');
    var hay=(name+' '+al+' '+desc).toLowerCase();
    var idx=hay.indexOf(ql);
    if(idx>=0){
      var text=name+(en.aliases&&en.aliases.length?' (он же: '+en.aliases.join(', ')+')':'')+(desc?' — '+desc:'');
      var from=Math.max(0,idx-46);
      var snip=(from>0?'…':'')+text.slice(from,idx+ql.length+64).replace(/\s+/g,' ');
      var nameLower=(name+' '+al).toLowerCase();
      var nameIdx=nameLower.indexOf(ql);
      var priority=nameIdx===0?0:(nameIdx>0?1:2);
      wkHits.push({kind:'wiki',id:en.id,type:en.type,name:name,snip:snip,q:ql,priority:priority});
    }
  });
  wkHits.sort(function(a,b){if(a.priority!==b.priority)return a.priority-b.priority;return a.name.localeCompare(b.name,'ru')});
  collectNotes().forEach(function(n){
    var text=(n.text||'');
    var ctx=(n.ctx||'');
    var lower=(text+' '+ctx).toLowerCase();
    var idx=lower.indexOf(ql);
    if(idx<0)return;
    if(noteHits.length>=60)return;
    var full=text?text:ctx;
    var localIdx=text?text.toLowerCase().indexOf(ql):-1;
    var from=localIdx>=0?Math.max(0,localIdx-42):0;
    var snip=(from>0?'…':'')+full.slice(from,from+ql.length+90).replace(/\s+/g,' ');
    noteHits.push({kind:'note',nid:n.nid,nbIndex:n.nbIndex,chId:n.chId,chIdx:n.chIdx,chTitle:n.chTitle,text:n.text,snip:snip,q:ql});
  });
  searchResults=chHits.concat(wkHits).concat(noteHits);
  $('#spCount').textContent=searchResults.length?fmt(searchResults.length):'';
  renderSearchResults(chHits,wkHits,noteHits);showSearchResults();paintSearch();
});
$('#spInput').addEventListener('focus',function(){if(this.value.trim().length>=2)showSearchResults()});
$('#spInput').addEventListener('keydown',function(e){
  if(e.key==='Escape'){clearSearch();this.blur();return}
  if(!searchResults.length)return;
  if(e.key==='ArrowDown'){e.preventDefault();searchIdx=(searchIdx+1)%searchResults.length;paintSearch();scrollSearchAct()}
  if(e.key==='ArrowUp'){e.preventDefault();searchIdx=(searchIdx-1+searchResults.length)%searchResults.length;paintSearch();scrollSearchAct()}
  if(e.key==='Enter'){
    e.preventDefault();
    var r=searchResults[searchIdx];if(!r)return;
    if(r.kind==='wiki'){hideSearchResults();openWikiView(r.id)}
    else if(r.kind==='note'){hideSearchResults();jumpToNote(r)}
    else goToResult(r);
  }
});
function renderSearchResults(chHits,wkHits,noteHits){
  spCols.innerHTML='';
  if(!chHits.length&&!wkHits.length&&!noteHits.length){
    var e=mk('div');e.className='sp-empty';e.textContent='ничего не найдено';spCols.appendChild(e);return;
  }
  var b2=book();
  function mark(snip,q){
    var safe=esc(snip);
    try{
      var re=new RegExp('('+escRe(esc(q))+')','i');
      return safe.replace(re,'<mark>$1</mark>');
    }catch(e){return safe}
  }
  function makeCol(label,items,kind){
    var col=mk('div');col.className='sp-col';
    var head=mk('div');head.className='sp-col-head';
    head.innerHTML=label+' <span class="cnt">'+items.length+'</span>';
    col.appendChild(head);
    var body=mk('div');body.className='sp-col-body';
    if(!items.length){
      var em=mk('div');em.className='sp-col-empty';em.textContent='—';body.appendChild(em);
    }else{
      items.forEach(function(r){
        var it=mk('div');it.className='sp-item';
        var title,bodyTxt;
        if(kind==='wiki'){
          title='<em class="wk">Э</em>'+esc(wikiTypeLabel(r.type))+' · '+esc(r.name);
          bodyTxt=mark(r.snip,r.q);
        }else if(kind==='note'){
          title='<em class="nt">✎</em>'+esc(r.chTitle);
          bodyTxt=mark(r.snip,r.q);
        }else{
          title='<em>гл.'+(r.i+1)+'</em>'+esc(chapterTitle(b2.chapters[r.i]));
          bodyTxt=mark(r.snip,r.q);
        }
        it.innerHTML='<span class="t">'+title+'</span><span class="s">'+bodyTxt+'</span>';
        it.addEventListener('click',function(){
          if(kind==='wiki'){hideSearchResults();openWikiView(r.id)}
          else if(kind==='note'){hideSearchResults();jumpToNote(r)}
          else goToResult(r);
        });
        body.appendChild(it);
      });
    }
    col.appendChild(body);return col;
  }
  spCols.appendChild(makeCol('В тексте',chHits,'ch'));
  spCols.appendChild(makeCol('В энциклопедии',wkHits,'wiki'));
  spCols.appendChild(makeCol('В заметках',noteHits,'note'));
}
function paintSearch(){spCols.querySelectorAll('.sp-item').forEach(function(el,i){el.classList.toggle('act',i===searchIdx)})}
function scrollSearchAct(){var items=spCols.querySelectorAll('.sp-item');var el=items[searchIdx];if(el)el.scrollIntoView({block:'nearest'})}
function goToResult(r){
  hideSearchResults();
  if(!r||r.kind==='wiki'||r.kind==='note')return;
  var b=book();if(!b)return;
  var ch=b.chapters[r.i];if(!ch)return;
  enterEditor(ch.id);
  setTimeout(function(){flashRange(r.idx,r.len,2000)},80);
}
document.addEventListener('click',function(e){
  if(searchOpen&&!e.target.closest('#spResults')&&!e.target.closest('#tbSearch'))hideSearchResults();
});

