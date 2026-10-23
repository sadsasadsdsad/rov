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
    /* блоки → '\n': переводов строк в тексте нет, а абзац — единица
       разговора (см. ниже); разбор строки с кэшем по главе — chText */
    var text=chText(ch,true);
    /* Абзац — единица сцены: реплики и действие разнесены по разным
       предложениям, но персонажи одного абзаца работают вместе.
       Вес пары: +2 в одном предложении, +1 просто в одном абзаце —
       разговор через реплики («Зурин… Гринёв») тоже даёт связь. */
    var paras=text.split('\n');
    for(var pi=0;pi<paras.length;pi++){
      var segs=paras[pi].split(/[.!?…;]+/);
      var uniq={},order=[],inSen={};
      for(var si=0;si<segs.length;si++){
        var seg=segs[si];
        if(seg.length<4)continue;   /* 4: «— Пётр» — уже имя, раньше порог 8 рвал диалоги */
        var present=[];
        for(var ei=0;ei<entries.length;ei++){
          var e=entries[ei];
          if(!e._re)continue;
          e._re.lastIndex=0;
          if(e._re.test(seg))present.push(e);
        }
        for(var i=0;i<present.length;i++){
          counts[present[i].id]++;
          if(!uniq[present[i].id]){uniq[present[i].id]=1;order.push(present[i])}
          for(var j=i+1;j<present.length;j++){
            var a=present[i].id,c=present[j].id;
            var k=a<c?a+'|'+c:c+'|'+a;
            res[k]=(res[k]||0)+1;
            inSen[k]=1;
          }
        }
      }
      /* пара абзаца, не побывавшая в одном предложении, — связь +1 */
      for(var oi=0;oi<order.length;oi++)for(var oj=oi+1;oj<order.length;oj++){
        var oa=order[oi].id,ob=order[oj].id;
        var k2=oa<ob?oa+'|'+ob:ob+'|'+oa;
        if(inSen[k2])continue;
        res[k2]=(res[k2]||0)+1;
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
/* Обёртка куска диапазона в подсветку. ВАЖНО: вызывать только для
   диапазона ВНУТРИ одного блока — тогда extractContents не клонирует
   блочные элементы и разметка не ломается. */
function flashWrap(rr,spans){
  var sp=mk('span');sp.className='hit-flash';
  try{sp.appendChild(rr.extractContents());rr.insertNode(sp)}catch(e){return false}
  spans.push(sp);
  return true;
}
/* Блок редактора (прямой ребёнок #editor), внутри которого лежит узел */
function flashBlockOf(node){
  if(!editor||!node)return null;
  var el=node.nodeType===1?node:node.parentNode;
  while(el&&el.parentNode!==editor)el=el.parentNode;
  return (el&&el.parentNode===editor)?el:null;
}
/* Подсветка диапазона [off,off+len] без порчи разметки.
   Раньше диапазон резался одним куском: если он начинался в заголовке и
   заканчивался в следующем абзаце, extractContents выдёргивал куски из
   ДВУХ блоков, insertNode вкладывал клоны <h1>/<p> в span, а уборка
   заменяла всё плоским текстом — заголовок оставался пустым, текст
   вываливался наружу, абзац терял первые буквы (просьба: «поставил метку
   на заголовок — после перехода он перестаёт быть заголовком»).
   Теперь диапазон режется ПО БЛОКАМ: каждый блок получает свою подсветку,
   блочные теги не трогаются. */
function flashRange(off,len,ms){
  var r=rangeFromOffset(off,len);
  if(!r)return false;
  var spans=[];
  var b1=flashBlockOf(r.startContainer),b2=flashBlockOf(r.endContainer);
  if(!b1||!b2||b1===b2){
    flashWrap(r,spans);
  }else{
    var list=[],el=b1,guard=0;
    while(el&&guard++<400){list.push(el);if(el===b2)break;el=el.nextSibling}
    if(list[list.length-1]!==b2){list=[b1];b2=null}
    for(var i=0;i<list.length;i++){
      var b=list[i],rr=document.createRange();
      try{
        rr.selectNodeContents(b);
        if(b===b1)rr.setStart(r.startContainer,r.startOffset);
        if(b2&&b===b2)rr.setEnd(r.endContainer,r.endOffset);
      }catch(e){continue}
      flashWrap(rr,spans);
    }
  }
  if(!spans.length)return false;
  try{
    spans[0].scrollIntoView({block:'center',behavior:(window.matchMedia&&matchMedia('(prefers-reduced-motion: reduce)').matches)?'auto':'smooth'});
  }catch(e){}
  setTimeout(function(){
    /* снимаем подсветку РАЗВОРАЧИВАНИЕМ: текст и инлайн-разметка остаются
       на месте (замена на textContent теряла <em>, ссылки и <br>) */
    for(var i=0;i<spans.length;i++){
      var sp=spans[i];
      if(!sp.parentNode)continue;
      while(sp.firstChild)sp.parentNode.insertBefore(sp.firstChild,sp);
      sp.parentNode.removeChild(sp);
    }
    if(editor)editor.normalize();
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
  var text=chText(ch);
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

/* ===== слить дубликаты вики =====
   Записи, чьи имена — падежные формы друг друга («Марья Ивановна» и
   «Марьей Ивановной», «Василиса Егоровна» и «Василисы Егоровны»), — это
   один объект. Побеждает более упоминаемый (при равенстве — первый в
   списке, детектор ставит именительный падеж первым), имя и алиасы
   проигравшего уходят в алиасы победителя, описание не теряется.
   Возвращает число слитых дублей. */
function wikiMergeDupes(b){
  var list=(b&&b.wiki)||[];
  if(!Array.isArray(list)||list.length<2)return 0;
  var formsOf=list.map(function(en){   /* все падежные формы имени и алиасов */
    if(!en||!en.name)return null;
    var f={};
    namesOf(en).forEach(function(n){declForms(n).forEach(function(x){f[String(x).toLowerCase()]=1})});
    return f;
  });
  var co=buildCoOccurrence();   /* один проход по тексту (кэш), счёт — упоминания */
  var cntOf=list.map(function(en){return en&&en.id?(co.counts[en.id]||0):0});
  function aliasAdd(keep,nm){
    if(!nm)return;
    keep.aliases=Array.isArray(keep.aliases)?keep.aliases:[];
    var low=String(nm).trim().toLowerCase();
    if(low===String(keep.name||'').trim().toLowerCase())return;
    for(var z=0;z<keep.aliases.length;z++)if(String(keep.aliases[z]).trim().toLowerCase()===low)return;
    keep.aliases.push(String(nm).trim());
  }
  var out=[],keptF=[],keptC=[],merged=0,i,j;
  for(i=0;i<list.length;i++){
    var en=list[i],f=formsOf[i];
    if(!en||!en.name||!f){out.push(en);keptF.push(f);keptC.push(cntOf[i]);continue}
    var hit=-1;
    for(j=0;j<out.length;j++){
      var ko=out[j];
      if(!ko||!ko.name||!keptF[j])continue;
      if(keptF[j][String(en.name||'').trim().toLowerCase()]||f[String(ko.name||'').trim().toLowerCase()]){hit=j;break}
    }
    if(hit<0){out.push(en);keptF.push(f);keptC.push(cntOf[i]);continue}
    var keep=out[hit],drop=en;
    if(cntOf[i]>keptC[hit]){out[hit]=drop;keptC[hit]=cntOf[i];drop=keep;keep=en}
    aliasAdd(keep,drop.name);   /* имя проигравшего не теряем — оно алиас */
    (Array.isArray(drop.aliases)?drop.aliases:[]).forEach(function(nm){aliasAdd(keep,nm)});
    if(!keep.desc&&drop.desc)keep.desc=drop.desc;
    var kf=keptF[hit];
    for(var kk in f)if(Object.prototype.hasOwnProperty.call(f,kk))kf[kk]=1;
    merged++;
  }
  if(merged){b.wiki=out;invalidateCo()}
  return merged;
}
/* тихое слитие дублей (без тоста) — энциклопедия и схема чистятся при
   открытии вкладки, чтобы повторы не дожидались нажатия кнопки */
function wikiMergeAuto(){
  if(typeof isReadOnly==='function'&&isReadOnly())return 0;
  var wb=book();if(!wb)return 0;
  var m=wikiMergeDupes(wb);
  if(m){wb.updated=Date.now();persist()}
  return m;
}

/* ===== автообнаружение персонажей (кнопка #wpAuto в шапке панели) =====
   Сканируем текст глав: слова с заглавной буквы, встречающиеся в середине
   предложения (в начале фразы заглавная ничего не значит), — кандидаты в
   персонажи. Порог — 3+ упоминания, стоп-список не-персонажей (месяцы,
   дни недели, «Глава/Часть», порядковые), уже известные имена/алиасы не
   дублируются, похожие падежные формы (Иван/Ивана) сходятся в одну запись.
   Добавляются как персонажи БЕЗ описания — его потом можно собрать в
   модалке статьи («Собрать описание из текста»). */
var WIKI_STOP={
  /* не-персонажи: общеупотребительные слова и стартовые слова фраз */
  'Что':1,'Чтобы':1,'Как':1,'Вот':1,'Так':1,'Это':1,'Этот':1,'Эта':1,'Она':1,'Они':1,'Там':1,'Здесь':1,
  'Когда':1,'Где':1,'Почему':1,'Сейчас':1,'Тогда':1,'Ведь':1,'Еще':1,'Ещё':1,'Уже':1,'Очень':1,'Даже':1,
  'Может':1,'Можно':1,'Нужно':1,'Хорошо':1,'Плохо':1,'Давайте':1,'Скажи':1,'Смотрите':1,'Пожалуй':1,
  'Вдруг':1,'Наконец':1,'Вместе':1,'Опять':1,'Снова':1,'Потом':1,'После':1,'Прежде':1,'Теперь':1,
  'Почти':1,'Именно':1,'Только':1,'Просто':1,'Всегда':1,'Никогда':1,'Иногда':1,'Конечно':1,'Вероятно':1,
  'Январь':1,'Февраль':1,'Март':1,'Апрель':1,'Май':1,'Июнь':1,'Июль':1,
  'Август':1,'Сентябрь':1,'Октябрь':1,'Ноябрь':1,'Декабрь':1,
  'Понедельник':1,'Вторник':1,'Среда':1,'Четверг':1,'Пятница':1,'Суббота':1,'Воскресенье':1,
  'Северный':1,'Южный':1,'Восточный':1,'Западный':1,'Север':1,'Юг':1,'Восток':1,'Запад':1,
  'Глава':1,'Часть':1,'Том':1,'Приложение':1,'Продолжение':1,'Начало':1,'Конец':1,'Итог':1,
  'Первый':1,'Второй':1,'Третий':1,'Четвёртый':1,'Четвертый':1,'Пятый':1,'Шестой':1,'Седьмой':1,
  'Восьмой':1,'Девятый':1,'Десятый':1,'Господи':1,'Боже':1,'Государь':1
};
/* реальные города, моря, страны — строчными; в вымышленной книге их не
   отличить от персонажей, поэтому глушим хотя бы известные названия */
var WIKI_PLACES={
  'москва':1,'петербург':1,'питер':1,'казань':1,'одесса':1,'новороссийск':1,'астрахань':1,
  'волгоград':1,'екатеринбург':1,'иркутск':1,'калининград':1,'краснодар':1,'красноярск':1,
  'мурманск':1,'новосибирск':1,'омск':1,'пермь':1,'ростов':1,'самара':1,'саратов':1,'сочи':1,
  'ставрополь':1,'тверь':1,'тюмень':1,'уфа':1,'владивосток':1,'владимир':1,'воронеж':1,
  'ярославль':1,'псков':1,'суздаль':1,'выборг':1,'тобольск':1,'архангельск':1,'нижний':1,
  'оренбург':1,'ижевск':1,'чита':1,'махачкала':1,'грозный':1,'якутск':1,'хабаровск':1,
  'киев':1,'минск':1,'севастополь':1,'симферополь':1,'брест':1,'вильнюс':1,
  'крым':1,'алтай':1,'урал':1,'кавказ':1,'байкал':1,'волга':1,'днепр':1,'обь':1,'енисей':1,'кама':1,
  'америка':1,'европа':1,'азия':1,'африка':1,'россия':1,'украина':1,'беларусь':1,'грузия':1,
  'франция':1,'германия':1,'италия':1,'испания':1,'англия':1,'лондон':1,'париж':1,'берлин':1,'рим':1
};
/* предлог-маркер места перед словом: «в Казани», «из Одессы», «около Уфы» */
var WIKI_PREP=/^(в|во|из|из-за|около|близ|среди|между|от|до|через)$/i;
/* сосед-маркер места: «г. Казань», «остров Береговой», «Казань городом»… */
var WIKI_PLACE_CTX=/^(г|город|города|городу|городе|городом|городская|городской|село|села|селе|деревня|деревни|деревне|местечко|посёлок|поселок|посёлка|станица|улица|улицы|улице|ул|набережная|набережной|площадь|площади|проспект|проспекта|проспекте|переулок|переулке|бульвар|бульваре|остров|острова|острове|станция|станции|вокзал|вокзале|аэропорт|аэропорту|отель|отеле|гостиница|гостиницы|кафе|ресторан|ресторане|театр|театре|музей|музее|университет|университета|академия|академии|больница|больнице|госпиталь|церковь|церкви|собор|соборе|храм|храме|замок|замке|замка|крепость|крепости|дворец|дворце|парк|парке|сад|саду|рынок|рынке|квартал|квартале|мост|мосту|моста|провинция|провинции|область|области|край|крае|район|районе|курорт|курорте|пляж|пляже|озеро|озере|озера|река|реки|реке|реку|гора|горы|горе|гору|хребет|лес|лесу|лесом|пустыня|пустыне|бухта|бухте|залив|заливе|долина|долине)$/i;
/* отчество в любом падеже: Иванович, Ивановичу, Ивановичем, Ивановна,
   Ивановну, Ивановне, Ивановной, Ивановною, Марковична… */
function wikiIsPatr(w){
  if(w.length<4)return false;
  return /(ович|евич|ьич|льич)(?:а|у|е|ем|ому|ом|ы|ами|ах|ой|ою)?$/.test(w)
    ||/(овна|овну|овне|овной|овною|овны|овнах|овнами|евна|евну|евне|евной|евною|евны|евнах|евнами|ична|ичну|ичне|ичной|ичною|ичны|ичнах|ичнами)$/.test(w);
}
/* одна падежная форма другого вида: «маша»/«машу», «марья»/«марье» —
   меняется только конец (буква-гласная); «мария»/«марина» — НЕ то же */
function sameNameKey(a,b){
  if(a===b)return true;
  var m=Math.min(a.length,b.length);
  if(m>=3&&Math.abs(a.length-b.length)<=1){
    var p=0;while(p<m&&a.charAt(p)===b.charAt(p))p++;
    if(p>=m-1){
      var ra=a.slice(p),rb=b.slice(p);
      if(ra.length<=2&&rb.length<=2&&/^[аоеёиуюяэ]/.test(ra)&&/[аоеёиуюяэ]$/.test(ra)
         &&/^[аоеёиуюяэ]/.test(rb)&&/[аоеёиуюяэ]$/.test(rb))return true;
    }
  }
  if(a.indexOf(b)===0||b.indexOf(a)===0)return Math.abs(a.length-b.length)<=2;
  return false;
}
/* форма-именительный предпочтительнее косвенной: Иван(3) > Маша(2) > Машу(1) */
function nomScore(nm){
  var w=String(nm||'').split(' ')[0];
  if(/[бвгджзклмнпрстфхцчшщжйь]$/.test(w))return 3;
  if(/[ая]$/.test(w))return 2;
  return 1;
}
function wikiPlainAll(b){   /* весь текст книги без тегов; абзацы — через 
 */
  var out='',chs=(b&&b.chapters)||[],i;
  for(i=0;i<chs.length;i++){
    out+=' '+chText(chs[i],true)+'\n';     /* без DOM: строка + кэш главы */
  }
  return out;
}
function wikiDetectPersons(b){
  var text=wikiPlainAll(b),known={},i,q;
  var wlist=(b&&b.wiki)||[];
  for(i=0;i<wlist.length;i++){
    var we=wlist[i];if(!we)continue;
    if(we.name)known[String(we.name).toLowerCase()]=1;
    var al=we.aliases||[];
    for(q=0;q<al.length;q++)if(al[q])known[String(al[q]).toLowerCase()]=1;
  }
  function prevWordAt(idx){   /* предыдущее слово */
    var j=idx-1;
    while(j>=0&&/[\s\u00A0]/.test(text.charAt(j)))j--;
    var e=j+1;
    while(j>=0&&/[А-ЯЁа-яёA-Za-z]/.test(text.charAt(j)))j--;
    if(j+1===e&&j>=0&&text.charAt(j)==='.'){   /* сокращение: «г. Казань» */
      j--;
      while(j>=0&&/[А-ЯЁа-яёA-Za-z]/.test(text.charAt(j)))j--;
      return text.slice(j+1,e-1)+'. ';
    }
    return text.slice(j+1,e);
  }
  function nextWordAt(idx){   /* следующее слово */
    var j=idx,l=text.length;
    while(j<l&&!/[А-ЯЁа-яёA-Za-z]/.test(text.charAt(j)))j++;
    var e=j;
    while(e<l&&/[А-ЯЁа-яёA-Za-z]/.test(text.charAt(e)))e++;
    return text.slice(j,e);
  }
  var cnt={},frm={},pair={},patrSolo={},m,re=/[А-ЯЁ][а-яё]{2,19}/g;
  while((m=re.exec(text))){
    var w=m[0],key=w.toLowerCase();
    /* отчество (в любом падеже) — часть имени персонажа, не кандидат */
    if(wikiIsPatr(w)){
      var pw=prevWordAt(m.index);
      if(pw.length>=3&&/^[А-ЯЁ][а-яё]{2,19}$/.test(pw)&&!WIKI_STOP[pw]&&!wikiIsPatr(pw)&&!known[pw.toLowerCase()]){
        var pk=pw.toLowerCase();
        if(!pair[pk])pair[pk]={};
        pair[pk][w]=(pair[pk][w]||0)+1;
      }else patrSolo[w]=(patrSolo[w]||0)+1;
      continue;
    }
    /* ТОЛЬКО середина фразы: перед именем (через пробелы) — строчная
       буква. «Потом Иван» — да; «, Как», «. Что», «(Вот», «— Ну» — нет */
    var j=m.index-1;
    while(j>=0&&/[\s\u00A0]/.test(text.charAt(j)))j--;
    if(j<0||!/[а-яёa-z]/.test(text.charAt(j)))continue;
    if(WIKI_STOP[w]||known[key])continue;
    /* окончания не-имён: «Ассоциация», «Свободно», «Красный», «Ленинград» */
    if(/(ский|цкий|ые|ое|ая|ый|ой|ция|зия|тия|ости|ении|ние|тие|ство|град|бург|поль)$/.test(w))continue;
    /* место: известный город (по основе — «Оренбурге» = «Оренбург»),
       сосед-маркер («г. Казань», «остров») или предлог («в Казани») */
    if(WIKI_PLACES[key]){continue}
    var stemHit=false;
    for(var st=key.length-1;st>=key.length-3&&st>=2;st--){if(WIKI_PLACES[key.slice(0,st)]){stemHit=true;break}}
    if(stemHit)continue;
    var pw2=prevWordAt(m.index),nw=nextWordAt(m.index+w.length);
    if(WIKI_PLACE_CTX.test(pw2)||/^г\.?\s*$/i.test(pw2)||WIKI_PREP.test(pw2)||WIKI_PLACE_CTX.test(nw))continue;
    cnt[key]=(cnt[key]||0)+1;
    if(!frm[key]||w.length<frm[key].length)frm[key]=w;
  }
  var top=[];
  for(var k in cnt)if(Object.prototype.hasOwnProperty.call(cnt,k)){
    var name=frm[k],aliases=[],hasPatr=false;
    var pr=pair[k];
    if(pr){   /* имя стоит с отчеством — это полное имя одного персонажа */
      var bp='',bc=0,bn='',bnC=0;
      for(var p in pr)if(Object.prototype.hasOwnProperty.call(pr,p)){
        if(pr[p]>bc){bc=pr[p];bp=p}
        if(/(ович|евич|ьич|льич|овна|евна|ична)$/.test(p)&&pr[p]>bnC){bn=p;bnC=pr[p]}
      }
      var use=bn||bp;
      if(use){name=frm[k]+' '+use;hasPatr=true;aliases.push(frm[k]);if(patrSolo[use])aliases.push(use)}
    }
    top.push({key:k,short:frm[k],name:name,aliases:aliases,hasPatr:hasPatr,count:cnt[k],top:cnt[k]});
  }
  top.sort(function(x,y){return y.count-x.count});
  /* формы одного имени (Иван/Ивана, Маша/Машу, Марья/Марье) — в одну
     запись; полное имя с отчеством и именительный падеж важнее */
  var out=[];
  for(i=0;i<top.length;i++){
    var c=top[i],hit=null;
    for(q=0;q<out.length;q++){
      if(sameNameKey(out[q].key,c.key)){hit=out[q];break}
    }
    if(hit){
      hit.count+=c.count;
      var better=false;
      if(c.hasPatr&&!hit.hasPatr)better=true;
      else if(c.hasPatr===hit.hasPatr){
        if(nomScore(c.name)>nomScore(hit.name))better=true;
        else if(nomScore(c.name)===nomScore(hit.name)&&c.count>hit.top)better=true;
      }
      var loser=better?hit.short:c.short;   /* проигравшая падежная форма — алиасом */
      if(better){hit.name=c.name;hit.short=c.short;hit.hasPatr=c.hasPatr;hit.top=c.count}
      var seen={},ua=[],z;
      for(z=0;z<hit.aliases.length;z++)if(hit.aliases[z]&&!seen[hit.aliases[z]]){seen[hit.aliases[z]]=1;ua.push(hit.aliases[z])}
      for(z=0;z<c.aliases.length;z++)if(c.aliases[z]&&!seen[c.aliases[z]]){seen[c.aliases[z]]=1;ua.push(c.aliases[z])}
      if(loser&&String(loser).toLowerCase()!==String(hit.name).toLowerCase()&&!seen[loser]){seen[loser]=1;ua.push(loser)}
      hit.aliases=ua;   /* алиасы обеих форм живут в одной записи */
    }else out.push(c);
  }
  out.sort(function(x,y){return y.count-x.count});
  out=out.filter(function(c){return c.count>=3});   /* порог — после слияния падежей */
  return out.slice(0,25).map(function(c){
    var own=String(c.name||'').toLowerCase(),al=[];
    for(var z=0;z<(c.aliases||[]).length;z++)if(c.aliases[z]&&String(c.aliases[z]).toLowerCase()!==own)al.push(c.aliases[z]);
    return {name:c.name,count:c.count,aliases:al};
  });
}
function wikiAutoPersons(){
  if(isReadOnly()){toast('Чужая книга — только чтение');return}
  var b=book();if(!b)return;
  b.wiki=Array.isArray(b.wiki)?b.wiki:[];
  var merged=wikiMergeDupes(b);   /* старые дубли («Марьей Ивановной») схлопываются */
  var found=wikiDetectPersons(b),added=0,i,q;
  var known={},knownForm={};
  for(q=0;q<b.wiki.length;q++){
    var we2=b.wiki[q];if(!we2)continue;
    known[String(we2.name||'').trim().toLowerCase()]=1;
    var al2=we2.aliases||[];
    for(var z=0;z<al2.length;z++)if(al2[z])known[String(al2[z]).trim().toLowerCase()]=1;
    /* все падежные формы известных статей: «Марье» не станет отдельной
       строкой рядом с «Марья Ивановна» */
    namesOf(we2).forEach(function(nmx){declForms(nmx).forEach(function(xf){knownForm[String(xf).toLowerCase()]=1})});
  }
  for(i=0;i<found.length;i++){
    var nm=String(found[i].name).trim(),low=nm.toLowerCase();
    if(known[low]||knownForm[low])continue;   /* имя или его падежная форма уже есть */
    var ali=found[i].aliases||[],dup=false;
    for(q=0;q<ali.length;q++)if(known[String(ali[q]).trim().toLowerCase()])dup=true;
    if(dup)continue;
    b.wiki.push({id:uid(),type:'person',name:nm,desc:'',aliases:ali});   /* без описания */
    known[low]=1;added++;
  }
  if(!added&&!merged){toast('Новых персонажей не нашлось');return}
  b.updated=Date.now();
  persist();invalidateCo();
  if($('#wikiPanel').classList.contains('on')){renderWikiFilters();renderWiki()}
  if(!$('#paneGraph').hidden)scheduleGraph();
  toast(merged?(added?('Слито дублей: '+merged+' · новых персонажей: '+added):('Слито дублей: '+merged)):('Добавлено персонажей: '+added));
}

function renderTypeChips(){
  var box=$('#wmTypeChips');box.innerHTML='';
  allTypes().forEach(function(tp){
    var isCustom=tp.k.indexOf('custom_')===0;
    var chip=mk('div');
    chip.className='type-chip'+(selectedType===tp.k?' on':'');
    chip.style.setProperty('--tc',tp.color);
    /* чип — обычный div: и выбор, и удаление живут в настоящих <button> */
    chip.innerHTML='<button type="button" class="tc-pick" aria-pressed="'+(selectedType===tp.k?'true':'false')+'"><span>'+esc(tp.s)+'</span></button>'+(isCustom?'<button class="tc-del" type="button" title="Удалить тип" aria-label="Удалить тип «'+escAttr(tp.s)+'»">×</button>':'');
    function selectType(){
      selectedType=tp.k;
      box.querySelectorAll('.type-chip').forEach(function(c){
        c.classList.toggle('on',c===chip);
        var p=c.querySelector('.tc-pick');
        if(p)p.setAttribute('aria-pressed',c===chip?'true':'false');
      });
      paintTypeBadge();
    }
    chip.addEventListener('click',function(e){
      if(e.target.closest('.tc-del'))return;
      selectType();
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
      b.updated=Date.now();                  /* H5 */
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
    b.updated=Date.now();                    /* H5 */
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
  wpFiltersBind(box);requestAnimationFrame(function(){wpFiltersEdge(box)});
}
/* ── Полоса тегов в свёрнутой энц: листается колесом, края затемнены,
   когда есть что листать (просьба: «не листается и нет затемнения
   по краям») ── */
function wpFiltersEdge(box){
  if(!box)return;
  box.classList.toggle('edge-l',box.scrollLeft>2);
  box.classList.toggle('edge-r',box.scrollLeft+box.clientWidth<box.scrollWidth-2);
}
function wpFiltersBind(box){
  if(!box||box._wfBound)return;
  box._wfBound=1;
  box.addEventListener('scroll',function(){wpFiltersEdge(box)});
  box.addEventListener('wheel',function(e){
    if(box.scrollWidth<=box.clientWidth)return;
    var d=Math.abs(e.deltaY)>Math.abs(e.deltaX)?e.deltaY:e.deltaX;
    if(!d)return;
    box.scrollLeft+=d;wpFiltersEdge(box);e.preventDefault();
  },{passive:false});
  window.addEventListener('resize',function(){wpFiltersEdge(box)});
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
      card.innerHTML='<div class="wk-top"><button type="button" class="wk-open"><span class="wk-dia" style="background:'+wikiTypeColor(en.type)+'"></span><span class="wk-name"></span><span class="wk-type">'+esc(wikiTypeLabel(en.type))+'</span></button><button type="button" class="wk-del" title="Удалить статью" aria-label="Удалить статью">×</button></div>'+
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
        if(isReadOnly())return;              /* M5: guard ro-режима */
        uiConfirm('Удалить статью?','«'+en.name+'» исчезнет из энциклопедии.',true).then(function(ok){
          if(!ok)return;
          b.wiki=b.wiki.filter(function(x){return x.id!==en.id});
          b.updated=Date.now();              /* H5 */
          persist();invalidateCo();renderWiki();
        });
      });
      wrap.appendChild(card);
    });
    g.appendChild(wrap);wpBody.appendChild(g);
  });
}
function openWikiModal(id,prefill){
  if(isReadOnly()){toast('Чужая книга — только чтение');return}
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

