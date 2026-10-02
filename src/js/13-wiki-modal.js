/* ==========================================================================
 * 13-wiki-modal.js — МОДАЛКИ ВИКИ-СТАТЕЙ
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 18 JS-скриптов, подключаются строго по номеру.
 * Раздел оригинала: src/index.html, строки 4039–4154 (раздел 13 из 18).
 * Что делает: модалка просмотра/редактирования статьи вики (#wikiViewModal, #wikiModal), fade-привязки открытия/закрытия.
 * Ключевое: openWikiView, closeWikiView, bindFade.
 * Зависимости: 01-core, 04-state-seed, 09-cooccurrence (данные и отрисовка wiki).
 * ========================================================================== */
"use strict";
/* ===== модалка вики ===== */
$('#wmClose').addEventListener('click',closeWikiModal);
$('#wmCancel').addEventListener('click',closeWikiModal);
$('#wikiModal').addEventListener('click',function(e){if(e.target===this)closeWikiModal()});
$('#wmName').addEventListener('input',updateWikiPreview);
$('#wmAliases').addEventListener('input',updateWikiPreview);
$('#wmSave').addEventListener('click',function(){
  var b=book();if(!b)return;
  b.wiki=Array.isArray(b.wiki)?b.wiki:[];
  var name=$('#wmName').value.trim();
  if(!name)return;
  var aliases=currentModalAliases();
  if(editingWikiId){
    var en=wikiById(editingWikiId);
    if(en){en.name=name;en.desc=$('#wmDesc').value.trim();en.type=selectedType;en.aliases=aliases}
  }else{
    b.wiki.push({id:uid(),type:selectedType,name:name,desc:$('#wmDesc').value.trim(),aliases:aliases});
  }
  persist();invalidateCo();
  closeWikiModal();renderWiki();
  if(!$('#paneGraph').hidden)scheduleGraph();
  toast('Статья сохранена');
});
$('#wmDelete').addEventListener('click',function(){
  var b=book();if(!b||!editingWikiId)return;
  var en=wikiById(editingWikiId);
  uiConfirm('Удалить статью?','«'+(en?en.name:'')+'» исчезнет из энциклопедии.',true).then(function(ok){
    if(!ok)return;
    b.wiki=b.wiki.filter(function(x){return x.id!==editingWikiId});
    persist();invalidateCo();
    closeWikiModal();renderWiki();
    if(!$('#paneGraph').hidden)scheduleGraph();
  });
});
function openWikiView(id){
  var en=wikiById(id);if(!en)return;
  var st=nameStats(en);var ctx=findContexts(en);var tp=getWikiType(en.type);
  $('#wvName').textContent=en.name;
  var typeEl=$('#wvType');typeEl.textContent=tp.s;typeEl.style.color=tp.color;
  var aliasBox=$('#wvAlias');
  if(en.aliases&&en.aliases.length){
    aliasBox.innerHTML=en.aliases.map(function(a){return '<span>'+esc(a)+'</span>'}).join('');
  }else{aliasBox.innerHTML=''}
  $('#wvDesc').innerHTML=en.desc?esc(en.desc).replace(/\n/g,'<br>'):'<span style="color:var(--ink3);font-style:italic">описание пока отсутствует</span>';
  $('#wvTimeline').innerHTML='<div class="lbl" style="text-align:center;margin-bottom:4px">Где встречается</div>'+
    timelineHtml(st.appear,st.total)+
    '<div class="hc-count" style="text-align:center">'+(st.totalMatches?st.totalMatches+' '+plural(st.totalMatches,'упоминание','упоминания','упоминаний'):'пока не встречается в тексте')+'</div>';
  var relBox=$('#wvRel');
  var rels=relationsOf(en.id).slice(0,14);
  if(rels.length){
    relBox.innerHTML='<div class="lbl" style="text-align:center;margin:16px 0 2px">Связи · встречается рядом</div>'+
      '<div class="wv-cols2">'+rels.map(function(r){
        return '<button class="wv-rel" data-id="'+escAttr(r.en.id)+'"><span class="wv-rel-d" style="background:'+wikiTypeColor(r.en.type)+'"></span>'+esc(r.en.name)+' <b>'+fmt(r.w)+'</b></button>';
      }).join('')+'</div>';
    relBox.querySelectorAll('.wv-rel').forEach(function(btn){
      btn.addEventListener('click',function(){
        var nid=btn.getAttribute('data-id');
        closeWikiView();
        setTimeout(function(){openWikiView(nid)},200);
      });
    });
  }else{
    relBox.innerHTML='';
  }
  var box=$('#wvQuotes'),hint=$('#wvHint');
  box.innerHTML='';box.classList.remove('cols');hint.textContent='';
  if(ctx.length){
    if(ctx.length>6){
      box.classList.add('cols');
      var wrap=mk('div');wrap.className='wv-cols-wrap';
      var byCh={};ctx.forEach(function(c){(byCh[c.ch]=byCh[c.ch]||[]).push(c)});
      var keys=Object.keys(byCh).map(Number).sort(function(a,b){return a-b});
      keys.forEach(function(k,ci){
        var col=mk('div');col.className='wv-col';
        col.style.animationDelay=(ci*70)+'ms';
        var h=mk('div');h.className='wc-h';h.title='Перейти к главе '+(k+1);
        h.innerHTML='<span>Глава '+(k+1)+'</span><b>'+byCh[k].length+'</b>';
        h.addEventListener('click',function(){jumpToQuote(k,null,en.name)});
        col.appendChild(h);
        var body=mk('div');body.className='col-body fadebox';
        byCh[k].forEach(function(c){
          var q=mk('button');q.className='wv-q';q.innerHTML='<span>'+esc(c.text)+'</span>';
          q.addEventListener('click',function(){jumpToQuote(c.ch,c.text,en.name)});
          body.appendChild(q);
        });
        col.appendChild(body);bindFade(body);wrap.appendChild(col);
      });
      box.appendChild(wrap);
      hint.textContent='цитаты разбиты по главам · клик по цитате — переход к месту текста';
    }else{
      var single=mk('div');single.className='wv-single';
      var oneCh=ctx.every(function(c){return c.ch===ctx[0].ch});
      ctx.forEach(function(c){
        var q=mk('button');q.className='wv-q';
        q.innerHTML=(oneCh?'':'<em>гл.'+(c.ch+1)+'</em>')+'<span>'+esc(c.text)+'</span>';
        q.addEventListener('click',function(){jumpToQuote(c.ch,c.text,en.name)});
        single.appendChild(q);
      });
      box.appendChild(single);
      hint.textContent='клик по цитате — переход к месту текста';
    }
  }else{
    hint.textContent=st.totalMatches>0?'упоминается в тексте, но цитат не нашлось':'в тексте пока не встречается';
  }
  $('#wvEdit').onclick=function(){closeWikiView();setTimeout(function(){openWikiModal(id)},200)};
  $('#wikiViewModal').classList.add('on');
}
function closeWikiView(){$('#wikiViewModal').classList.remove('on')}
$('#wvClose').addEventListener('click',closeWikiView);
$('#wvCloseBtn').addEventListener('click',closeWikiView);
$('#wikiViewModal').addEventListener('click',function(e){if(e.target===this)closeWikiView()});
function bindFade(el){
  var upd=function(){el.classList.toggle('f-top',el.scrollTop>4);el.classList.toggle('f-bot',el.scrollTop+el.clientHeight<el.scrollHeight-4)};
  el.addEventListener('scroll',upd,{passive:true});upd();return upd;
}

