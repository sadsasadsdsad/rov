/* ==========================================================================
 * 09-cooccurrence.js — СО-ВСТРЕЧАЕМОСТЬ и разметка текста
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 18 JS-скриптов, подключаются строго по номеру.
 * Раздел оригинала: src/index.html, строки 2609–2957 (раздел 9 из 18).
 * Что делает: граф со-встречаемости сущностей, обёртка упоминаний вики-объектов в тексте (<span class="wiki">), работа с данными wiki, cleanHtml для автосейва.
 * Ключевое: buildCoOccurrence, relationsOf, wrapMarks, applyMarks, cleanHtml, wikiById, renderWiki, saveCaretOffset.
 * Зависимости: 01-core, 04-state-seed, 08-declensions; текст через cleanHtml сохраняет 15-editor.
 * ========================================================================== */
"use strict";
/* ===== СО-ВСТРЕЧАЕМОСТЬ ===== */
var coCache=null;
function invalidateCo(){coCache=null}
function buildCoOccurrence(force){
  var b=book();
  if(!b)return {matrix:{},counts:{}};
  var sig=(b.wiki||[]).length+'|'+(b.updated||0)+'|'+b.chapters.length;
  if(!force&&coCache&&coCache.sig===sig&&coCache.bid===b.id)return coCache.data;
  var entries=(b.wiki||[]).filter(function(e){return e.name});
  var res={},counts={};
  entries.forEach(function(e){
    counts[e.id]=0;
    e._re=buildNameRegexAll(e.name,e.aliases);
  });
  visibleChapters(b).forEach(function(ch){
    var text=tmp(ch.html).textContent;
    var segs=text.split(/[.!?…\n;]+/);
    for(var si=0;si<segs.length;si++){
      var seg=segs[si];
      if(seg.length<8)continue;
      var present=[];
      for(var ei=0;ei<entries.length;ei++){
        var e=entries[ei];
        if(!e._re)continue;
        e._re.lastIndex=0;
        if(e._re.test(seg))present.push(e);
      }
      for(var i=0;i<present.length;i++){
        counts[present[i].id]++;
        for(var j=i+1;j<present.length;j++){
          var a=present[i].id,c=present[j].id;
          var k=a<c?a+'|'+c:c+'|'+a;
          res[k]=(res[k]||0)+1;
        }
      }
    }
  });
  entries.forEach(function(e){delete e._re});
  var data={matrix:res,counts:counts};
  coCache={sig:sig,bid:b.id,data:data};
  return data;
}
function relationsOf(enId){
  var b=book();if(!b)return [];
  var co=buildCoOccurrence();
  var out=[];
  (b.wiki||[]).forEach(function(o){
    if(o.id===enId)return;
    var k=enId<o.id?enId+'|'+o.id:o.id+'|'+enId;
    var w=co.matrix[k]||0;
    if(w>0)out.push({en:o,w:w});
  });
  out.sort(function(a,b){return b.w-a.w});
  return out;
}

function saveCaretOffset(){
  var s=getSelection();if(!s.rangeCount)return null;
  var r=s.getRangeAt(0);
  if(!editor.contains(r.startContainer))return null;
  var pre=r.cloneRange();pre.selectNodeContents(editor);pre.setEnd(r.startContainer,r.startOffset);
  return pre.toString().length;
}
function restoreCaretOffset(off){
  if(off==null)return;
  var walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT,null);
  var acc=0,node;
  while((node=walker.nextNode())){
    var len=node.nodeValue.length;
    if(acc+len>=off){
      var r=document.createRange();
      r.setStart(node,off-acc);r.collapse(true);
      var s=getSelection();s.removeAllRanges();s.addRange(r);
      return;
    }
    acc+=len;
  }
}
function rangeFromOffset(off,len){
  var walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT,null);
  var acc=0,node,sN=null,sO=0,eN=null,eO=0;
  while((node=walker.nextNode())){
    var l=node.nodeValue.length;
    if(sN===null&&off<acc+l){sN=node;sO=off-acc}
    if(off+len<=acc+l){eN=node;eO=off+len-acc;break}
    acc+=l;
  }
  if(!sN||!eN)return null;
  var r=document.createRange();
  try{r.setStart(sN,sO);r.setEnd(eN,eO)}catch(e){return null}
  return r;
}
function flashRange(off,len,ms){
  var r=rangeFromOffset(off,len);
  if(!r)return false;
  var sp=mk('span');sp.className='hit-flash';
  try{sp.appendChild(r.extractContents());r.insertNode(sp)}catch(e){return false}
  sp.scrollIntoView({block:'center',behavior:'smooth'});
  setTimeout(function(){
    if(sp.parentNode){
      sp.replaceWith(document.createTextNode(sp.textContent));
      editor.normalize();
    }
  },ms||2000);
  return true;
}
function findQuoteOffset(text,quote,name){
  var off=-1,len=0;
  if(quote){
    var q=quote.replace(/\s+/g,' ').trim();
    var i=text.indexOf(q);
    if(i>=0){off=i;len=q.length}
    else{
      var head=q.slice(0,Math.min(28,q.length));
      i=text.indexOf(head);
      if(i>=0){off=i;len=Math.min(head.length,text.length-i)}
    }
  }
  if(off<0&&name){
    var re=buildNameRegex(name);
    if(re){var m=re.exec(text);if(m){off=m.index+m[1].length;len=m[2].length}}
  }
  return off>=0?{off:off,len:len}:null;
}
function jumpToQuote(idx,quote,name){
  closeWikiView();
  var b=book();if(!b)return;
  var ch=b.chapters[idx];if(!ch)return;
  enterEditor(ch.id);
  var text=tmp(ch.html).textContent;
  var f=findQuoteOffset(text,quote,name);
  if(f)setTimeout(function(){flashRange(f.off,f.len,2200)},80);
}
function unwrapMarks(){
  var spans=editor.querySelectorAll('.wiki');
  if(!spans.length)return;
  spans.forEach(function(sp){sp.replaceWith(document.createTextNode(sp.textContent))});
  editor.normalize();
}
function wrapMarks(re,en){
  var walker=document.createTreeWalker(editor,NodeFilter.SHOW_TEXT,null);
  var nodes=[];while(walker.nextNode())nodes.push(walker.currentNode);
  nodes.forEach(function(node){
    var p=node.parentNode;
    if(p&&p.classList&&(p.classList.contains('wiki')||p.closest('.nb')))return;
    var text=node.nodeValue;re.lastIndex=0;
    var m,last=0,frag=null;
    while((m=re.exec(text))){
      if(!frag)frag=document.createDocumentFragment();
      var start=m.index+m[1].length,word=m[2];
      frag.appendChild(document.createTextNode(text.slice(last,start)));
      var sp=document.createElement('span');
      sp.className='wiki';sp.dataset.wiki=en.id;
      if(en.type==='person')sp.classList.add('wk-person');
      sp.textContent=word;
      frag.appendChild(sp);
      last=start+word.length;
      if(re.lastIndex===m.index)re.lastIndex++;
    }
    if(!frag)return;
    frag.appendChild(document.createTextNode(text.slice(last)));
    node.parentNode.replaceChild(frag,node);
  });
}
function applyMarks(savePosition){
  var b=book();
  if(!b||!b.wiki||!b.wiki.length)return;
  var saved=savePosition?saveCaretOffset():null;
  unwrapMarks();
  b.wiki.forEach(function(en){
    var re=buildNameRegexAll(en.name,en.aliases);
    if(re)wrapMarks(re,en);
  });
  if(saved!=null)restoreCaretOffset(saved);
}
function ensureNoteIds(){
  editor.querySelectorAll('.nb').forEach(function(el){
    if(!el.getAttribute('data-nid'))el.setAttribute('data-nid',uid());
  });
}
function cleanHtml(){
  ensureNoteIds();
  var d=mk('div');d.innerHTML=editor.innerHTML;
  d.querySelectorAll('.wiki,.hit-flash').forEach(function(sp){sp.replaceWith(document.createTextNode(sp.textContent))});
  d.normalize();
  return d.innerHTML;
}
function wikiById(id){var b=book();return b&&b.wiki?b.wiki.find(function(w){return w.id===id}):null}

function renderTypeChips(){
  var box=$('#wmTypeChips');box.innerHTML='';
  allTypes().forEach(function(tp){
    var isCustom=tp.k.indexOf('custom_')===0;
    var chip=mk('div');
    chip.className='type-chip'+(selectedType===tp.k?' on':'');
    chip.style.setProperty('--tc',tp.color);
    chip.tabIndex=0;
    chip.innerHTML='<span>'+esc(tp.s)+'</span>'+(isCustom?'<button class="tc-del" type="button" title="Удалить тип">×</button>':'');
    chip.addEventListener('click',function(e){
      if(e.target.closest('.tc-del'))return;
      selectedType=tp.k;
      box.querySelectorAll('.type-chip').forEach(function(c){c.classList.toggle('on',c===chip)});
      paintTypeBadge();
    });
    if(isCustom)chip.querySelector('.tc-del').addEventListener('click',function(e){e.stopPropagation();removeType(tp.k)});
    box.appendChild(chip);
  });
  var add=mk('button');add.type='button';add.className='type-chip add';add.innerHTML='<span>+ свой</span>';
  add.addEventListener('click',function(){
    var b=book();if(!b)return;
    uiPrompt('Новый тип','','Например, «Артефакты»').then(function(name){
      if(!name)return;
      b.customTypes=b.customTypes||[];
      var k='custom_'+uid();
      var color=COLORS[(b.customTypes.length+3)%COLORS.length];
      b.customTypes.push({k:k,t:name,s:name,color:color});
      persist();selectedType=k;renderTypeChips();
    });
  });
  box.appendChild(add);paintTypeBadge();
}
function removeType(k){
  var b=book();if(!b)return;
  var used=b.wiki.filter(function(w){return w.type===k});
  uiConfirm('Удалить тип?',used.length?'Этот тип используется — все статьи этого типа станут «Другое».':'«'+getWikiType(k).s+'» больше не будет доступен при создании статей.',true)
  .then(function(ok){
    if(!ok)return;
    b.customTypes=(b.customTypes||[]).filter(function(t){return t.k!==k});
    used.forEach(function(w){w.type='other'});
    if(selectedType===k)selectedType='other';
    persist();invalidateCo();renderTypeChips();
    if($('#wikiPanel').classList.contains('on')){renderWikiFilters();renderWiki()}
  });
}
function paintTypeBadge(){var tp=getWikiType(selectedType),b=$('#wmTypeBadge');b.textContent=tp.s;b.style.color=tp.color}
function renderWikiFilters(){
  var box=$('#wpFilters');box.innerHTML='';
  var b0=book(),entries=(b0&&b0.wiki)||[];
  function cnt(k){if(k==='all')return entries.length;return entries.filter(function(x){return x.type===k}).length}
  var all=mk('button');
  all.className='wp-f nodia'+(wikiTypeFilter==='all'?' on':'');
  all.innerHTML='Все <span class="cnt">'+cnt('all')+'</span>';
  all.addEventListener('click',function(){wikiTypeFilter='all';renderWikiFilters();renderWiki()});
  box.appendChild(all);
  allTypes().forEach(function(tp){
    var n=cnt(tp.k);if(!n&&wikiTypeFilter!==tp.k)return;
    var b=mk('button');
    b.className='wp-f'+(wikiTypeFilter===tp.k?' on':'');
    b.style.setProperty('--tc',tp.color);
    b.innerHTML=esc(tp.s)+' <span class="cnt">'+n+'</span>';
    b.addEventListener('click',function(){wikiTypeFilter=tp.k;renderWikiFilters();renderWiki()});
    box.appendChild(b);
  });
}
function renderWiki(){
  wpBody.innerHTML='';
  var b=book();var entries=(b&&b.wiki)||[];
  $('#wpCount').textContent=entries.length?fmt(entries.length)+' '+plural(entries.length,'статья','статьи','статей'):'';
  var q=wikiFilter.toLowerCase().trim();
  var shown=entries.filter(function(en){
    if(wikiTypeFilter!=='all'&&en.type!==wikiTypeFilter)return false;
    if(!q)return true;
    if(en.name.toLowerCase().indexOf(q)>=0)return true;
    if((en.desc||'').toLowerCase().indexOf(q)>=0)return true;
    return (en.aliases||[]).some(function(a){return a.toLowerCase().indexOf(q)>=0});
  });
  if(!entries.length){wpBody.innerHTML='<div class="wp-empty">здесь живёт мир вашей книги: добавляйте города, страны, персонажей, предметы и события.<br><br>Вкладка <b>«Карта»</b> сама построит структурную схему связей.</div>';return}
  if(!shown.length){wpBody.innerHTML='<div class="wp-empty">ничего не найдено — попробуйте другой запрос или тип</div>';return}
  allTypes().forEach(function(tp){
    var group=shown.filter(function(en){return en.type===tp.k});
    if(!group.length)return;
    var g=mk('div');g.className='wp-group';
    g.innerHTML='<div class="wp-glabel">'+esc(tp.t)+'<span class="wp-gn">'+group.length+'</span></div>';
    var wrap=mk('div');wrap.className='wg-cards';
    group.forEach(function(en){
      var st=nameStats(en);
      var card=mk('div');card.className='wk-card';card.dataset.type=en.type;
      card.innerHTML='<div class="wk-top"><span class="wk-dia" style="background:'+wikiTypeColor(en.type)+'"></span><span class="wk-name"></span><span class="wk-type">'+esc(wikiTypeLabel(en.type))+'</span><button class="wk-del" title="Удалить статью">×</button></div>'+
        ((en.aliases&&en.aliases.length)?'<div class="wk-alias"></div>':'')+
        (en.desc?'<div class="wk-desc"></div>':'')+
        (st.appear.length?'<div class="wk-tl">'+timelineHtml(st.appear,st.total,true)+'</div>':'')+
        '<div class="wk-count"></div>';
      card.querySelector('.wk-name').textContent=en.name;
      if(en.aliases&&en.aliases.length)card.querySelector('.wk-alias').textContent='он же: '+en.aliases.join(', ');
      if(en.desc)card.querySelector('.wk-desc').textContent=en.desc;
      card.querySelector('.wk-count').textContent=st.totalMatches?st.totalMatches+' '+plural(st.totalMatches,'упоминание','упоминания','упоминаний')+' · главы '+st.appear.map(function(i){return i+1}).join(', '):'в тексте пока не встречается';
      card.addEventListener('click',function(){openWikiView(en.id)});
      card.querySelector('.wk-del').addEventListener('click',function(e){
        e.stopPropagation();
        uiConfirm('Удалить статью?','«'+en.name+'» исчезнет из энциклопедии.',true).then(function(ok){
          if(!ok)return;
          b.wiki=b.wiki.filter(function(x){return x.id!==en.id});
          persist();invalidateCo();renderWiki();
        });
      });
      wrap.appendChild(card);
    });
    g.appendChild(wrap);wpBody.appendChild(g);
  });
}
function openWikiModal(id,prefill){
  editingWikiId=id||null;
  var en=id?wikiById(id):null;
  if($('#wikiModal')._dragReset)$('#wikiModal')._dragReset();
  $('#wmTitle').textContent=en?en.name:'Новая статья';
  $('#wmName').value=en?en.name:(prefill||'');
  $('#wmAliases').value=en?(en.aliases||[]).join(', '):'';
  $('#wmDesc').value=en?(en.desc||''):'';
  selectedType=en?en.type:'person';
  renderTypeChips();
  $('#wmDelete').style.display=en?'':'none';
  updateWikiPreview();
  $('#wikiModal').classList.add('on');
  setTimeout(function(){$('#wmName').focus()},60);
}
function closeWikiModal(){$('#wikiModal').classList.remove('on');editingWikiId=null}
function currentModalAliases(){
  return $('#wmAliases').value.split(',').map(function(s){return s.trim()}).filter(Boolean);
}
function updateWikiPreview(){
  var name=$('#wmName').value.trim(),prev=$('#wmPrev');
  if(name)$('#wmTitle').textContent=name;else $('#wmTitle').textContent=editingWikiId?'Статья':'Новая статья';
  if(!name){prev.innerHTML='<div class="hc-tl empty">введите название — я сам найду упоминания в тексте и предложу описание</div>';return}
  var aliases=currentModalAliases();
  var st=nameStats(name,aliases);var ctx=findContexts(name,aliases);
  var html='<div class="m-forms">'+st.forms.slice(0,10).map(function(f){return '<span>'+esc(f)+'</span>'}).join('')+'</div>';
  html+=timelineHtml(st.appear,st.total);
  html+='<div class="hc-count" style="text-align:center">'+(st.totalMatches?st.totalMatches+' '+plural(st.totalMatches,'упоминание','упоминания','упоминаний'):'пока не встречается — будет искаться по мере письма')+'</div>';
  if(ctx.length){
    var shown=ctx.slice(0,4);
    html+='<div class="wp-sug-label">найдено в тексте ('+ctx.length+') — нажмите, чтобы добавить в описание</div>';
    html+='<div class="wm-qs">'+shown.map(function(c,i){
      return '<button class="wv-q" data-i="'+i+'"><em>гл.'+(c.ch+1)+'</em><span>'+esc(c.text)+'</span></button>';
    }).join('')+'</div>';
    if(ctx.length>4)html+='<div class="wm-more">и ещё '+(ctx.length-4)+' · все цитаты — в досье</div>';
    html+='<div style="margin-top:10px"><button class="m-btn" id="wmAuto">СОБРАТЬ ОПИСАНИЕ ИЗ ТЕКСТА</button></div>';
  }
  prev.innerHTML=html;
  prev.querySelectorAll('.wv-q').forEach(function(btn){
    btn.addEventListener('click',function(){
      var c=ctx[+btn.dataset.i];
      var ta=$('#wmDesc');
      ta.value=(ta.value?ta.value.replace(/\s+$/,'')+' ':'')+c.text;
    });
  });
  var auto=$('#wmAuto');
  if(auto)auto.addEventListener('click',function(){$('#wmDesc').value=ctx.map(function(c){return c.text}).join(' ')});
}

