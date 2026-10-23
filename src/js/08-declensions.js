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
/* ===== склонения / вики =====
   Одно слово склонялось по последней букве — для составных названий это
   давало мусор («великая буря» → «великая бури»): в русском меняется и
   прилагательное («великой бури», «великую бурю»). Ниже каждое слово
   получает набор форм по падежам (слоты 0–7: им, рд, дт, вн, тв, пр,
   мн.им, мн.рд), затем слоты склеиваются пословно — согласование само
   получается из формы каждого слова («северный» + «город» → «северному
   городу»). Лишние варианты безвредны: чего нет в тексте — то не найдётся. */

/* слоты существительного; неизменяемое слово остаётся собой во всех слотах */
function declNounSlots(w){
  var slot=[],i;
  for(i=0;i<8;i++)slot.push([w]);
  if(w.length<3)return slot;
  var hard='бвгджзклмнпрстфхцчшщ';
  var last=w.slice(-1),stem;
  if(last==='а'){
    stem=w.slice(0,-1);
    slot[1]=[stem+'ы',stem+'и'];slot[2]=[stem+'е'];slot[3]=[stem+'у'];
    slot[4]=[stem+'ой',stem+'ей',stem+'ою',stem+'ею'];slot[5]=[stem+'е'];
    slot[6]=[stem+'ы',stem+'и'];slot[7]=[stem,stem+'ь',stem+'ей'];
  }else if(last==='я'){
    stem=w.slice(0,-1);
    slot[1]=[stem+'и'];slot[2]=[stem+'е'];slot[3]=[stem+'ю'];
    slot[4]=[stem+'ей',stem+'ею'];slot[5]=[stem+'е'];
    slot[6]=[stem+'и'];slot[7]=[stem+'ь',stem+'ей'];
  }else if(last==='о'||last==='е'){
    stem=w.slice(0,-1);
    slot[1]=[stem+'а'];slot[2]=[stem+'у'];
    slot[4]=[stem+'ом',stem+'ем'];slot[5]=[stem+'е'];
    slot[6]=[stem+'а',stem+'я'];slot[7]=[stem];
  }else if(last==='й'){
    stem=w.slice(0,-1);
    slot[1]=[stem+'я'];slot[2]=[stem+'ю'];slot[3]=[w,stem+'я'];
    slot[4]=[stem+'ем'];slot[5]=[stem+'е'];
    slot[6]=[stem+'и'];slot[7]=[stem+'ев'];
  }else if(last==='ь'){
    stem=w.slice(0,-1);
    slot[1]=[stem+'и',stem+'я'];slot[2]=[stem+'и',stem+'ю'];
    slot[4]=[stem+'ью',stem+'ем'];slot[5]=[stem+'и',stem+'е'];
    slot[6]=[stem+'и'];slot[7]=[stem+'ей'];
  }else if(last==='ы'||last==='и'){
    /* слово уже стоит во множественном («горы», «земли») — меняем по мн. падежам */
    stem=w.slice(0,-1);
    slot[1]=[stem,stem+'ей',stem+'ь'];            /* рд. мн.: гор, земель */
    slot[2]=[stem+'ам',stem+'ям'];
    slot[4]=[stem+'ами',stem+'ями'];
    slot[5]=[stem+'ах',stem+'ях'];
    slot[7]=[stem,stem+'ей',stem+'ь'];
  }else if(hard.indexOf(last)>=0){
    var st=w;
    /* беглая гласная: клинок → клинка, молодец → молодца */
    if(/[ое]к$/.test(w))st=w.slice(0,-2)+'к';
    else if(/ец$/.test(w))st=w.slice(0,-2)+'ц';
    slot[1]=[st+'а'];slot[2]=[st+'у'];slot[3]=[w,st+'а'];
    slot[4]=[st+'ом',st+'ем'];slot[5]=[st+'е'];
    slot[6]=[st+'ы',st+'и',st+'а'];slot[7]=[st+'ов',st+'ей'];
  }
  return slot;
}
/* слоты прилагательного (и фамилий типа «Петрова»): в каждом слоте даём
   оба варианта окончания — твёрдый и мягкий («северного»/«синего»,
   «великой»/«синей») — лишний просто не встретится в тексте */
function declAdjSlots(w){
  var slot=[],i;
  for(i=0;i<8;i++)slot.push([w]);
  if(w.length<5)return slot;
  var st;
  if(/(ый|ий|ой)$/.test(w)){
    st=w.slice(0,-2);
    slot[1]=[st+'ого',st+'его'];
    slot[2]=[st+'ому',st+'ему'];
    slot[3]=[w,st+'ого',st+'его'];
    slot[4]=[st+'ым',st+'им'];
    slot[5]=[st+'ом',st+'ем'];
    slot[6]=[st+'ые',st+'ие'];slot[7]=[st+'ых',st+'их'];
  }else if(/(ая|яя)$/.test(w)){
    st=w.slice(0,-2);
    slot[1]=[st+'ой',st+'ей'];slot[2]=[st+'ой',st+'ей'];
    slot[3]=[st+'ую',st+'юю'];
    slot[4]=[st+'ой',st+'ей',st+'ою',st+'ею'];
    slot[5]=[st+'ой',st+'ей'];
    slot[6]=[st+'ые',st+'ие'];slot[7]=[st+'ых',st+'их'];
  }else if(/(ое|ее)$/.test(w)){
    st=w.slice(0,-2);
    slot[1]=[st+'ого',st+'его'];slot[2]=[st+'ому',st+'ему'];
    slot[4]=[st+'ым',st+'им'];slot[5]=[st+'ом',st+'ем'];
    slot[6]=[st+'ые',st+'ие'];slot[7]=[st+'ых',st+'их'];
  }else if(/(ые|ие)$/.test(w)){
    st=w.slice(0,-2);
    slot[1]=[st+'ых',st+'их'];slot[2]=[st+'ым',st+'им'];
    slot[4]=[st+'ыми',st+'ими'];slot[5]=[st+'ых',st+'их'];
    slot[7]=[st+'ых',st+'их'];
  }else if(/(ов|ев|ёв|ин|ын)а$/.test(w)){
    st=w.slice(0,-1);
    slot[1]=[st+'ой'];slot[2]=[st+'ой'];slot[3]=[st+'у'];
    slot[4]=[st+'ой'];slot[5]=[st+'ой'];
    slot[6]=[st+'ы'];slot[7]=[st+'ых'];
  }
  return slot;
}
/* «похоже ли слово на прилагательное» — иначе его склоняем как существительное */
function declIsAdj(w){
  return w.length>4&&/(ый|ий|ой|ая|яя|ое|ее|ые|ие|(ов|ев|ёв|ин|ын)а)$/.test(w);
}
/* одиночное слово: прежние формы (на них завязаны поиск и подсветка) плюс
   падежные варианты из слотов — больше форм, ни одна старая не потеряна */
function declFormsSingle(w){
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
  }else if(hard.indexOf(last)>=0&&w.length>1){add(w+'а');add(w+'у');add(w+'е');add(w+'ом');add(w+'ем');add(w+'ым');add(w+'ы');add(w+'и')}
  /* плюс падежные слоты: «городе» уже есть, а «городах/городов» не хватало */
  declNounSlots(w).forEach(function(opts){opts.forEach(add)});
  return Object.keys(f);
}
function declForms(name){
  var w=(name||'').trim().toLowerCase();
  if(!w)return [w];
  var words=w.split(/\s+/);
  if(words.length<2||words.length>3)return declFormsSingle(w);
  var slots=words.map(function(x){return declIsAdj(x)?declAdjSlots(x):declNounSlots(x)});
  /* каждое слово всегда можно оставить как есть — в названиях вроде
     «клинок зари» второе слово заморожено в одной форме, и падеж несёт
     первое слово: «клинка зари», «клинком зари» */
  slots.forEach(function(sl,i){
    for(var c0=0;c0<8;c0++)if(sl[c0].indexOf(words[i])<0)sl[c0].push(words[i]);
  });
  var f={};f[w]=1;
  function add(x){if(x&&x.length>1)f[x]=1}
  /* слот за слотом: слова согласованы по падежу; внутри слота — перебор
     вариантов (обычно 1–4) с предохранителем от взрыва */
  for(var c=0;c<8;c++){
    var combos=[''],j;
    for(j=0;j<slots.length;j++){
      var opts=slots[j][c],next=[],a,b;
      for(a=0;a<combos.length;a++)for(b=0;b<opts.length;b++)next.push(combos[a]?combos[a]+' '+opts[b]:opts[b]);
      combos=next;
      if(combos.length>40)break;
    }
    for(j=0;j<combos.length;j++)add(combos[j]);
    if(Object.keys(f).length>120)break;
  }
  return Object.keys(f);
}
function namesOf(enOrName,aliases){
  var list=[];
  if(enOrName&&typeof enOrName==='object'){list.push(enOrName.name);(enOrName.aliases||[]).forEach(function(a){list.push(a)})}
  else{list.push(enOrName);(aliases||[]).forEach(function(a){list.push(a)})}
  return list.map(function(s){return String(s||'').trim()}).filter(Boolean);
}
var NAME_ALTS_MEM={};
function buildNameAltsAll(enOrName,aliases){
  var names=namesOf(enOrName,aliases);
  var key=names.join('|');
  var hit=NAME_ALTS_MEM[key];
  if(hit!=null)return hit;   /* формы имени не меняются — считаем один раз */
  var seen={},out=[];
  function push(f){
    if(!f||seen[f])return;
    seen[f]=1;out.push(escRe(f));
    /* ё/е: одна книга пишет «Гринёв» и «Гринёвым», другая — «Гринев» и
       «Гриневым»; без пары вариантов персонаж не находился и связи рвались */
    var e=f.replace(/ё/g,'е'),yo=f.replace(/е/g,'ё');
    if(!seen[e]){seen[e]=1;out.push(escRe(e))}
    if(yo!==f&&!seen[yo]){seen[yo]=1;out.push(escRe(yo))}
  }
  names.forEach(function(n){
    declForms(n).forEach(push);
    push(n);
  });
  out.sort(function(a,b){return b.length-a.length});
  var res=out.join('|');
  if(Object.keys(NAME_ALTS_MEM).length>600)NAME_ALTS_MEM={};
  NAME_ALTS_MEM[key]=res;
  return res;
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
    /* ЕДИНАЯ нумерация — абсолютная (по b.chapters): findContexts, поиск
       «гл. N» и цитаты уже считают по ней; по visible-индексам таймлайн и
       «главы» в карточке расходились с цитатами на ≥2 (Памятка/Заметки) */
    visibleChapters(b).forEach(function(ch){
      var m=chText(ch).match(re);
      var c=m?m.length:0;
      if(c>0){appear.push(b.chapters.indexOf(ch));totalMatches+=c}
    });
  }
  var names=namesOf(enOrName,aliases);
  return {forms:names.reduce(function(acc,n){return acc.concat(declForms(n))},[]).filter(function(v,i,a){return a.indexOf(v)===i}),appear:appear,total:b?b.chapters.length:0,totalMatches:totalMatches};
}
function findContexts(enOrName,aliases){
  var b=book(),out=[];if(!b)return out;
  var alts=buildNameAltsAll(enOrName,aliases);if(!alts)return out;
  var testRe=new RegExp('(^|[^а-яёa-z0-9])('+alts+')(?![а-яёa-z0-9])','i');
  visibleChapters(b).forEach(function(ch){
    var i=b.chapters.indexOf(ch);
    var text=chText(ch);
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

