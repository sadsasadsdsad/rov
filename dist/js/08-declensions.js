/* ==========================================================================
 * 08-declensions.js — СКЛОНЕНИЯ и варианты имён
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 18 JS-скриптов, подключаются строго по номеру.
 * Раздел оригинала: src/index.html, строки 2530–2608 (раздел 8 из 18).
 * Что делает: формы склонения слов, генерация альтернативных написаний имён/топонимов для поиска и подсветки, таймлайн-разметка.
 * Ключевое: declForms, namesOf, buildNameAltsAll, buildNameRegexAll, findContexts, timelineHtml.
 * Зависимости: 01-core; используется 09-cooccurrence и 14-search.
 * ========================================================================== */
"use strict";
/* ===== склонения / вики ===== */
function declForms(name){
  var w=(name||'').trim().toLowerCase();
  if(!w)return [w];
  var f={};f[w]=1;
  function add(x){if(x&&x.length>1)f[x]=1}
  var hard='бвгджзклмнпрстфхцчшщ';
  var last=w.slice(-1),stem;
  if(last==='а'&&w.length>2){stem=w.slice(0,-1);add(stem+'а');add(stem+'е');add(stem+'у');
    if(/[кгхжшщчй]/.test(stem.slice(-1))){add(stem+'и');add(stem+'ей');add(stem+'ею')}else{add(stem+'ы');add(stem+'ой');add(stem+'ою')}
  }else if(last==='я'&&w.length>2){stem=w.slice(0,-1);add(stem+'я');add(stem+'и');add(stem+'е');add(stem+'ю');add(stem+'ей');add(stem+'ею');
  }else if((last==='о'||last==='е')&&w.length>2){stem=w.slice(0,-1);add(stem+'о');add(stem+'е');add(stem+'а');add(stem+'у');add(stem+'ом');add(stem+'ем');
  }else if(last==='й'&&w.length>2){stem=w.slice(0,-1);add(stem+'я');add(stem+'ю');add(stem+'ем');add(stem+'е');
  }else if(last==='ь'&&w.length>2){stem=w.slice(0,-1);add(stem+'и');add(stem+'ю');add(stem+'ью');add(stem+'е');
  }else if(hard.indexOf(last)>=0&&w.length>1){add(w+'а');add(w+'у');add(w+'е');add(w+'ом');add(w+'ем');add(w+'ы');add(w+'и')}
  return Object.keys(f);
}
function namesOf(enOrName,aliases){
  var list=[];
  if(enOrName&&typeof enOrName==='object'){list.push(enOrName.name);(enOrName.aliases||[]).forEach(function(a){list.push(a)})}
  else{list.push(enOrName);(aliases||[]).forEach(function(a){list.push(a)})}
  return list.map(function(s){return String(s||'').trim()}).filter(Boolean);
}
function buildNameAltsAll(enOrName,aliases){
  var names=namesOf(enOrName,aliases);
  var seen={},out=[];
  names.forEach(function(n){
    declForms(n).forEach(function(f){if(!seen[f]){seen[f]=1;out.push(escRe(f))}});
    if(!seen[n]){seen[n]=1;out.push(escRe(n))}
  });
  out.sort(function(a,b){return b.length-a.length});
  return out.join('|');
}
function buildNameRegexAll(enOrName,aliases){
  var a=buildNameAltsAll(enOrName,aliases);
  if(!a)return null;
  return new RegExp('(^|[^а-яёa-z0-9])('+a+')(?![а-яёa-z0-9])','gi');
}
function buildNameRegex(name){return buildNameRegexAll(name,null)}
function nameStats(enOrName,aliases){
  var b=book(),re=buildNameRegexAll(enOrName,aliases),appear=[],totalMatches=0;
  if(b&&re){
    visibleChapters(b).forEach(function(ch){
      var m=tmp(ch.html).textContent.match(re);
      var c=m?m.length:0;
      if(c>0){appear.push(b.chapters.indexOf(ch));totalMatches+=c}
    });
  }
  var names=namesOf(enOrName,aliases);
  return {forms:names.reduce(function(acc,n){return acc.concat(declForms(n))},[]).filter(function(v,i,a){return a.indexOf(v)===i}),appear:appear,total:b?visibleChapters(b).length:0,totalMatches:totalMatches};
}
function findContexts(enOrName,aliases){
  var b=book(),out=[];if(!b)return out;
  var alts=buildNameAltsAll(enOrName,aliases);if(!alts)return out;
  var testRe=new RegExp('(^|[^а-яёa-z0-9])('+alts+')(?![а-яёa-z0-9])','i');
  visibleChapters(b).forEach(function(ch){
    var i=b.chapters.indexOf(ch);
    var text=tmp(ch.html).textContent;
    var parts=text.match(/[^.!?\n]+[.!?…]*/g)||[];
    parts.forEach(function(s){
      s=s.replace(/\s+/g,' ').trim();
      if(!s||s.length<12||out.length>=200)return;
      testRe.lastIndex=0;
      if(testRe.test(s))out.push({ch:i,text:(s.length>220?s.slice(0,217)+'…':s)});
    });
  });
  return out;
}
function timelineHtml(appear,totalCh,mini){
  if(!appear.length)return '<div class="hc-tl empty">пока не встречается в тексте</div>';
  var dense=(appear.length>6||mini)?' dense':'';
  var ticks=appear.map(function(idx,i){
    var left=totalCh>1?(idx/(totalCh-1))*100:50;
    left=Math.min(97,Math.max(3,left));
    return '<span class="hc-tick '+((i%2===0)?'top':'bottom')+'" style="left:'+left+'%"><i></i><em>Глава '+(idx+1)+'</em></span>';
  }).join('');
  return '<div class="hc-tl'+dense+(mini?' mini':'')+'">'+ticks+'</div>';
}

