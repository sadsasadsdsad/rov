/* ==========================================================================
 * 06-marks.js — МЕТКИ — закладки в тексте
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 18 JS-скриптов, подключаются строго по номеру.
 * Раздел оригинала: src/index.html, строки 2369–2447 (раздел 6 из 18).
 * Что делает: создание/удаление/переход по закладкам в тексте, всплывашка подсказки #markTip, подсветка рельса закладок.
 * Ключевое: createMarkAtCursor, deleteMark, jumpToMark, showMarkTip, hideMarkTip.
 * Зависимости: 01-core, 04-state-seed, 15-editor (caret); кнопка #btnBookmark в 15-editor.
 * ========================================================================== */
"use strict";
/* ===== метки ===== */
function showMarkTip(dotEl,label,chapterNum,flip){
  var tip=$('#markTip');
  if(!tip||!dotEl)return;
  tip.innerHTML='<span class="mt-num">ГЛ. '+chapterNum+'</span>'+esc(label);
  var r=dotEl.getBoundingClientRect();
  tip.style.top=(r.top+r.height/2)+'px';
  if(flip){
    tip.style.left='auto';
    tip.style.right=(innerWidth-r.left+12)+'px';
    tip.classList.add('flip');
  }else{
    tip.style.right='auto';
    tip.style.left=(r.right+12)+'px';
    tip.classList.remove('flip');
  }
  tip.classList.add('on');
}
function hideMarkTip(){var tip=$('#markTip');if(tip)tip.classList.remove('on')}
function resolveMarkPos(ch,mark){
  var text=tmp(ch.html).textContent;
  if(mark.snippet && mark.pos>=0 && text.substr(mark.pos,mark.snippet.length)===mark.snippet)return mark.pos;
  if(mark.snippet){
    var idx=text.indexOf(mark.snippet);if(idx>=0)return idx;
    var partial=mark.snippet.slice(0,24);
    if(partial.length>6){idx=text.indexOf(partial);if(idx>=0)return idx}
  }
  return Math.min(Math.max(0,mark.pos|0),text.length);
}
function createMarkAtCursor(){
  if(isReadOnly())return;
  var b=book();if(!b)return;
  var ch=currentCh();if(!ch)return;
  var pos=null;
  if(document.activeElement===editor){
    pos=saveCaretOffset();
  }
  if(pos==null)pos=lastCaretOffset;
  if(pos==null)pos=0;
  var text=tmp(ch.html).textContent;
  var snippet=text.slice(pos,pos+60).replace(/\s+/g,' ').trim();
  var suggested='';
  var after=text.slice(pos,pos+40).replace(/\s+/g,' ').trim();
  if(after){
    var firstWord=after.split(/[.!?,;:…]/)[0].trim();
    if(firstWord&&firstWord.length<=40)suggested=firstWord;
  }
  uiPrompt('Название метки',suggested,'Например, «Пролог»').then(function(label){
    if(label===null)return;
    if(!label)label='Метка '+((ch.marks||[]).length+1);
    ch.marks=ch.marks||[];
    ch.marks.push({id:uid(),label:label,pos:pos,snippet:snippet});
    ch.marks.sort(function(a,b){return a.pos-b.pos});
    persist();renderList(false);
    toast('Метка «'+label+'» добавлена');
  });
}
function deleteMark(chapterId,markId){
  if(isReadOnly())return;
  var b=book();if(!b)return;
  var ch=b.chapters.find(function(c){return c.id===chapterId});if(!ch||!ch.marks)return;
  var mark=ch.marks.find(function(m){return m.id===markId});if(!mark)return;
  uiConfirm('Удалить метку?','«'+mark.label+'» больше не появится в навигации.',true).then(function(ok){
    if(!ok)return;
    ch.marks=ch.marks.filter(function(m){return m.id!==markId});
    persist();renderList(false);
  });
}
function jumpToMark(chapterId,markId){
  var b=book();if(!b)return;
  var ch=b.chapters.find(function(c){return c.id===chapterId});if(!ch)return;
  var mark=(ch.marks||[]).find(function(m){return m.id===markId});if(!mark)return;
  if(b.current!==ch.id)openChapter(ch.id);
  setTimeout(function(){
    var text=tmp(ch.html).textContent;
    var pos=resolveMarkPos(ch,mark);
    var len=Math.min(24,Math.max(8,text.length-pos));
    if(pos>=0&&pos<text.length)flashRange(pos,len,2200);
  },90);
}

