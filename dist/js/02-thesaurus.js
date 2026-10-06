/* ==========================================================================
 * 02-thesaurus.js — ТЕЗАУРУС — синонимы и антонимы
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 18 JS-скриптов, подключаются строго по номеру.
 * Раздел оригинала: src/index.html, строки 1381–1804 (раздел 2 из 18).
 * Что делает: кеш тезаура с TTL, лемматизация слов, разбор слов из текста, запросы к словарям через цепочку CORS-прокси, подписи статусов для UI.
 * Ключевое: THESAURUS_CACHE, lemmatize, variants, parseWordsFromText, fetchSynonymOnline, fetchAntonymOnline, CORS_PROXIES.
 * Зависимости: 01-core (хелперы); вызывается из селектора выделения в 15-editor.
 * ========================================================================== */
"use strict";
/* ===== тезаурус ===== */
var THESAURUS_CACHE={};
var THESAURUS_TTL=1000*60*60*24*60;
var SPECIALIZED_TIMEOUT=7000;
function initThesaurusCache(){
  THESAURUS_CACHE={};
  try{
    var savedRaw=localStorage.getItem(THESAURUS_LS);
    if(savedRaw){
      var saved=JSON.parse(savedRaw);
      if(saved&&typeof saved==='object'){
        Object.keys(saved).forEach(function(k){
          var v=saved[k];
          if(v&&typeof v==='object'){
            var syn=Array.isArray(v.syn)?v.syn:[];
            var ant=Array.isArray(v.ant)?v.ant:[];
            if(syn.length||ant.length)THESAURUS_CACHE[k]={syn:syn,ant:ant,source:v.source||'кеш',ts:v.ts||Date.now()};
          }
        });
      }
    }
  }catch(e){}
}
function persistThesaurusCache(){
  try{
    var keys=Object.keys(THESAURUS_CACHE);
    if(keys.length>1500){
      keys.map(function(k){return {k:k,ts:THESAURUS_CACHE[k].ts||0}})
        .sort(function(a,b){return a.ts-b.ts})
        .slice(0,keys.length-1500)
        .forEach(function(x){delete THESAURUS_CACHE[x.k]});
    }
    localStorage.setItem(THESAURUS_LS,JSON.stringify(THESAURUS_CACHE));
  }catch(e){}
}
function normWord(w){return String(w||'').trim().toLowerCase().replace(/ё/g,'е')}
function variants(w){
  var base=String(w||'').trim();
  if(!base)return [];
  var out=[base, base.toLowerCase(), normWord(base)];
  if(/[Ёё]/.test(base)) out.push(base.replace(/[Ёё]/g,'е'), base.replace(/[Ёё]/g,'Е'));
  else if(/[Ее]/.test(base)) out.push(base.replace(/[Ее]/g,'ё'), base.replace(/[Ее]/g,'Ё'));
  var seen={},res=[];
  out.forEach(function(x){if(x&&!seen[x]){seen[x]=1;res.push(x)}});
  return res;
}
var LEMMA_RULES=[
  [/(ого|его)$/,'ый'],[/ому|ему$/,'ый'],[/ыми|ими$/,'ый'],
  [/(ая|яя)$/,'ый'],[/(ое|ее)$/,'ый'],[/ую|юю$/,'ый'],
  [/(ых|их)$/,'ый'],[/(ой|ей)$/,'ый'],[/(ом|ем)$/,'ый'],
  [/(ее|ей)$/,'ий'],
  [/ами$/,'а'],[/ями$/,'я'],[/ов$/,''],[/ев$/,''],[/ёв$/,''],
  [/ей$/,''],[/ой$/,'а'],[/ам$/,'а'],[/ям$/,'я'],[/ах$/,'а'],[/ях$/,'я'],
  [/ою$/,'а'],[/ею$/,'я'],
  [/ии$/,'ия'],[/ию$/,'ия'],[/ией$/,'ия'],[/ий$/,'ия'],
  [/иям$/,'ия'],[/иях$/,'ия'],[/иями$/,'ия'],
  [/ешься$/,'ться'],[/ишься$/,'ться'],[/ется$/,'ться'],[/ится$/,'ться'],
  [/ются$/,'ться'],[/атся$/,'ться'],[/яться$/,'ться'],[/лся$/,'ться'],
  [/тесь$/,'ться'],[/лась$/,'ться'],[/лось$/,'ться'],[/лись$/,'ться'],
  [/ешь$/,'ть'],[/ишь$/,'ть'],[/ете$/,'ть'],[/ите$/,'ть'],
  [/ет$/,'ть'],[/ут$/,'ть'],[/ют$/,'ть'],[/ит$/,'ть'],[/ат$/,'ть'],[/ят$/,'ть'],
  [/ла$/,'ть'],[/ло$/,'ть'],[/ли$/,'ть'],[/л$/,'ть'],
  [/ью$/,'ь'],[/ье$/,'ье'],[/ьи$/,'ь']
];
function lemmatize(word){
  var w=normWord(word);
  if(!w)return [w];
  var out=[w],seen={};seen[w]=1;
  LEMMA_RULES.forEach(function(p){
    if(p[0].test(w)){
      var cand=w.replace(p[0],p[1]);
      if(cand.length>1 && !seen[cand]){seen[cand]=1;out.push(cand)}
    }
  });
  if(out.length===1){
    var last=w.slice(-1);
    if('аеиоуыэюя'.indexOf(last)>=0 && w.length>2){
      var cand=w.slice(0,-1);
      if(!seen[cand]){seen[cand]=1;out.push(cand)}
    }
  }
  return out;
}
var UI_LABELS={'синонимы':1,'синоним':1,'антонимы':1,'антоним':1,'синонимов':1,'антонимов':1,
  'скачать':1,'поиск':1,'наверх':1,'главная':1,'меню':1,'войти':1,'регистрация':1,
  'контакты':1,'помощь':1,'реклама':1,'о проекте':1,'правила':1,'политика':1,
  'cookies':1,'куки':1,'ещё':1,'еще':1,'все':1,'показать':1,'найти':1,'искать':1,
  'словарь':1,'словари':1,'толкование':1,'значение':1,'морфология':1,'примеры':1,
  'ударение':1,'перевод':1,'поговорки':1,'пословицы':1,'синонимайзер':1,
  'антонимайзер':1,'предложения':1,'сочетания':1,'ассоциации':1,'рифмы':1,
  'разбор':1,'звук':1,'буквы':1,'слоги':1,'часть речи':1,'начальная форма':1,
  'перейти':1,'открыть':1,'закрыть':1,'далее':1,'назад':1,'вперёд':1,'написать':1,
  'комментарии':1,'отзывы':1,'похожие':1,'поделиться':1,'слова':1,'слово':1,
  'введите слово':1,'найти синонимы':1,'найти антонимы':1,'русский':1,'язык':1,
  'текст':1,'контекст':1,'формы':1,'словоформы':1,'словосочетания':1,
  'однокоренные':1,'корень':1,'приставка':1,'суффикс':1,'окончание':1,
  'толковый словарь':1,'орфографический':1,'этимологический':1,'фразеологизмы':1,
  'синоним к слову':1,'антоним к слову':1,'значение слова':1,'все синонимы':1,
  'все антонимы':1,'популярные':1,'запросы':1,'алфавит':1,'азбука':1,
  'например':1,'выберите':1,'пожалуйста':1,'введите':1,'нажмите':1,
  'карта сайта':1,'обратная связь':1,'мобильная версия':1,'полная версия':1,
  'отправить':1,'печать':1,'печатать':1,'распечатать':1,'загрузить':1,
  'копировать':1,'вставить':1,'вырезать':1,'сохранить':1,'удалить':1,'изменить':1,
  'добавить':1,'создать':1,'выйти':1,'вход':1,'выход':1,'подписаться':1,
  'купить':1,'заказать':1,'читать':1,'смотреть':1,'слушать':1,'скрыть':1,
  'готово':1,'отмена':1,'применить':1,'сбросить':1,'обновить':1,'проверить':1,
  'настроить':1,'ответить':1,'пожаловаться':1,'опубликовать':1,'редактировать':1,
  'выбрать':1,'выделить':1,'очистить':1,'свернуть':1,'развернуть':1,
  'показать все':1,'показать ещё':1,'показать еще':1,'читать далее':1,
  'читать больше':1,'смотреть все':1,'загрузить ещё':1,'загрузить еще':1,
  'войти на сайт':1,'вход на сайт':1,'личный кабинет':1,'мои слова':1,
  'мои словари':1,'добавить в словарь':1,'случайное слово':1,'слово дня':1,
  'играть':1,'игра':1,'тест':1,'тесты':1,'упражнения':1,'карточки':1,
  'главная страница':1,'на главную':1,'вернуться':1,'вернуться назад':1,
  'поделиться в':1,'рассказать друзьям':1,'в избранное':1,'в закладки':1,
  'оценить':1,'голосовать':1,'жалоба':1,'сообщить об ошибке':1,
  'пользователь':1,'пользователи':1,'аккаунт':1,'профиль':1,'настройки':1,
  'запомнить меня':1,'восстановить пароль':1,'забыли пароль':1,
  'проверка':1,'проверка слова':1,'проверить слово':1,
  'введите текст':1,'вставьте текст':1,'загрузить файл':1,'выбрать файл':1,
  'экспорт':1,'импорт':1,'распечатать страницу':1,'версия для печати':1,
  'просмотров':1,'просмотры':1,'рейтинг':1,'подписчики':1
};
function dedup(arr){
  var seen={},out=[];
  (arr||[]).forEach(function(w){
    if(!w)return;
    var s=String(w).trim();
    if(!s)return;
    var k=normWord(s);
    if(!k||seen[k])return;
    seen[k]=1;out.push(s);
  });
  return out;
}
function isGoodWord(w){
  if(!w)return false;
  w=String(w).trim();
  if(w.length<2||w.length>25)return false;
  if(/\s/.test(w))return false;
  if(!/^[А-Яа-яЁёA-Za-z][А-Яа-яЁёA-Za-z-]*$/.test(w))return false;
  var low=normWord(w);
  if(UI_LABELS[low])return false;
  if(/(.)\1{3,}/.test(low))return false;
  if(low.length>=3 && /^[аеиоуыэюя]{3,}$/.test(low)) return false;
  if(/[бвгджзклмнпрстфхцчшщ]{6,}/.test(low)) return false;
  return true;
}
function isSameStem(a,b){
  a=normWord(a);b=normWord(b);
  if(a===b)return true;
  var n=Math.min(a.length,b.length);
  if(n<4)return false;
  var i=0;
  while(i<n && a[i]===b[i])i++;
  return i>=4 && i/n>=0.7;
}
function fetchWithTimeout(url,ms,opts){
  opts=opts||{};
  return new Promise(function(resolve,reject){
    var ctrl=('AbortController' in window)?new AbortController():null;
    var t=setTimeout(function(){if(ctrl)try{ctrl.abort()}catch(e){};reject(new Error('timeout'))},ms);
    fetch(url,{signal:ctrl?ctrl.signal:undefined,redirect:'follow',headers:opts.headers||{}})
      .then(function(r){clearTimeout(t);if(!r.ok)throw new Error('HTTP '+r.status);return r.text()})
      .then(function(txt){clearTimeout(t);resolve(txt)})
      .catch(function(e){clearTimeout(t);reject(e)});
  });
}
var CORS_PROXIES=[
  function(u){return 'https://r.jina.ai/'+u},
  function(u){return 'https://api.codetabs.com/v1/proxy?quest='+encodeURIComponent(u)},
  function(u){return 'https://corsproxy.io/?url='+encodeURIComponent(u)},
  function(u){return 'https://api.allorigins.win/raw?url='+encodeURIComponent(u)},
  function(u){return 'https://cors.eu.org/'+u}
];
function fetchDirect(url,ms){
  return new Promise(function(resolve,reject){
    var ctrl=('AbortController' in window)?new AbortController():null;
    var t=setTimeout(function(){if(ctrl)try{ctrl.abort()}catch(e){};reject(new Error('timeout'))},ms);
    fetch(url,{signal:ctrl?ctrl.signal:undefined,mode:'cors',credentials:'omit',redirect:'follow'})
      .then(function(r){clearTimeout(t);if(!r.ok)throw new Error('HTTP '+r.status);return r.text()})
      .then(function(txt){clearTimeout(t);resolve(txt)})
      .catch(function(e){clearTimeout(t);reject(e)});
  });
}
function raceProxies(targetUrl,timeout){
  return new Promise(function(resolve,reject){
    var urls=[targetUrl].concat(CORS_PROXIES.map(function(fn){return fn(targetUrl)}));
    var settled=false,pending=urls.length;
    function done(v){if(settled)return;settled=true;resolve(v)}
    function fail(){if(settled)return;if(--pending===0){settled=true;reject(new Error('all proxies failed'))}}
    urls.forEach(function(u){
      fetchDirect(u,timeout||4500)
        .then(function(txt){if(!txt||txt.length<200)throw new Error('too short');done(txt)})
        .catch(fail);
    });
  });
}
function withTimeout(promise,ms,fallback){return Promise.race([promise,new Promise(function(resolve){setTimeout(function(){resolve(fallback)},ms)})])}
function parseWordsFromText(text,baseUrl,excludeLower){
  var words=[],seen={};
  var baseHost='',basePath='';
  try{
    var bu=new URL(baseUrl);
    baseHost=bu.hostname;
    try{basePath=decodeURIComponent(bu.pathname)}catch(e){basePath=bu.pathname}
    basePath=basePath.replace(/\/+$/,'').toLowerCase();
  }catch(e){}
  function isDictionaryLink(url){
    if(!url)return false;
    var full=url;
    if(url.indexOf('http')!==0&&url.indexOf('//')!==0)full='https://'+baseHost+(url.charAt(0)==='/'?'':'/')+url;
    else if(url.indexOf('//')===0)full='https:'+url;
    var u;try{u=new URL(full)}catch(e){return false}
    if(u.hostname!==baseHost)return false;
    var p=u.pathname;try{p=decodeURIComponent(p)}catch(e){}
    var norm=p.replace(/\/+$/,'').toLowerCase();
    if(norm===basePath)return false;
    if(!/^\/[A-Za-zА-Яа-яЁё][\/-]/.test(p))return false;
    return true;
  }
  function push(w){
    var t=String(w||'').replace(/\s+/g,' ').trim();
    t=t.replace(/\s*\([^)]*\)\s*$/,'');
    t=t.replace(/[.,;:!?()"«»„""''\[\]{}<>\*]/g,'').trim();
    if(!isGoodWord(t))return;
    var low=normWord(t);
    if(low===excludeLower)return;
    if(UI_LABELS[low])return;
    if(seen[low])return;
    seen[low]=1;words.push(t);
  }
  var mdRe=/\[([^\]\n]{1,80})\]\(([^)\s]+)\)/g,m;
  while((m=mdRe.exec(text))){if(isDictionaryLink(m[2]))push(m[1])}
  if(!words.length&&/<a\s/i.test(text)){
    try{
      var doc=new DOMParser().parseFromString(text,'text/html');
      doc.querySelectorAll('a[href]').forEach(function(a){if(isDictionaryLink(a.getAttribute('href')||''))push(a.textContent||'')});
    }catch(e){}
  }
  if(words.length<8){
    var lines=text.split('\n'),inSec=false;
    for(var i=0;i<lines.length;i++){
      var l=lines[i].trim();
      if(/^#+\s*(Синонимы|Антонимы|Значение)/i.test(l)){inSec=true;continue}
      if(inSec&&/^#+\s/.test(l)){inSec=false;continue}
      if(l.length>140)continue;
      if(/^\[?[А-ЯЁ]{20,}/.test(l))continue;
      if(inSec){
        var clean=l.replace(/\[([^\]]+)\]\([^)]+\)/g,'$1').replace(/^\s*[-*•]\s*/,'');
        clean.split(/[,;]/).forEach(function(p){p=p.trim();if(p.length>25)return;push(p)});
      }
    }
  }
  if(words.length<5){
    try{
      var doc2=new DOMParser().parseFromString(text,'text/html');
      doc2.querySelectorAll('a[href]').forEach(function(a){
        var t=(a.textContent||'').trim();
        if(!t||t.length>25)return;
        if(!isGoodWord(t))return;
        push(t);
      });
    }catch(e){}
  }
  return words.slice(0,50);
}
function siteWordUrl(base,word){var w=normWord(word);var letter=w.charAt(0).toUpperCase();return base+'/'+encodeURIComponent(letter)+'/'+encodeURIComponent(w)}
function fetchSynonymOnline(word){var url=siteWordUrl('https://synonymonline.ru',word);return raceProxies(url,4600).then(function(t){return parseWordsFromText(t,url,normWord(word))}).catch(function(){return []})}
function fetchAntonymOnline(word){var url=siteWordUrl('https://antonymonline.ru',word);return raceProxies(url,4600).then(function(t){return parseWordsFromText(t,url,normWord(word))}).catch(function(){return []})}

function parseSiteLinks(text,host,letter,excludeLower){
  var out=[],seen={};
  var h=host.replace(/^https?:\/\//,'').replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
  var re=new RegExp('href="(?:https?:\\/\\/'+h+')?\\/'+letter+'\\/([^"#?\\s>]+)"','gi');
  var m;
  while((m=re.exec(text))){
    var w;
    try{w=decodeURIComponent(m[1])}catch(e){w=m[1]}
    w=w.replace(/[_+]+/g,' ').replace(/\s+/g,' ').trim();
    if(!isGoodWord(w))continue;
    var low=normWord(w);
    if(low===excludeLower||seen[low]||UI_LABELS[low])continue;
    seen[low]=1;out.push(w);
  }
  return out;
}
function extractSection(text,kind,word){
  var startRe;
  if(kind==='ant'){
    startRe=/(?:^|\n)(?:#{1,6}\s*|\*\*)?(?:Антонимы\s+к\s+слову|Все\s+антонимы|Антонимы)(?:\*\*)?[^\n]{0,80}\n/i;
  }else{
    startRe=/(?:^|\n)(?:#{1,6}\s*|\*\*)?(?:Синонимы\s+к\s+слову|Все\s+синонимы|Синонимы)(?:\*\*)?[^\n]{0,80}\n/i;
  }
  var m=startRe.exec(text);
  if(!m)return null;
  var rest=text.slice(m.index+m[0].length);
  var endRe=/(?:^|\n)#{1,6}\s|(?:^|\n)(?:Значение\s+слова|Значение\s+«|Значение\s+"|Предложения\s+со\s+словом|Словосочетания\s+со\s+словом|Морфологический\s+разбор|Разбор\s+по\s+составу|Слова\s+из\s+слова|Схожие\s+слова|Однокоренные\s+слова|Поговорки|Пословицы|Ассоциации|Фразеологизмы|Цитаты\s+со\s+словом|Рифмы|Стихи|Словарь\s+синонимов|Словарь\s+антонимов)/i;
  var em=endRe.exec(rest);
  if(em)rest=rest.slice(0,em.index);
  if(rest.length>12000)rest=rest.slice(0,12000);
  return rest;
}
function fetchSiteWordlist(host,kind,word){
  var letter=(kind==='ant')?'a':'s';
  var url=host+'/'+letter+'/'+encodeURIComponent(normWord(word));
  var key=normWord(word);
  return raceProxies(url,5000).then(function(t){
    var section=extractSection(t,kind,word);
    var text=section||t;
    if(!section&&text.length>4000)text=text.slice(0,4000);
    var words=[];
    var mdRe=/\[([^\]\n]{1,60})\]\(([^)\s]+)\)/g,m;
    while((m=mdRe.exec(text))){
      var w=String(m[1]).replace(/\s+/g,' ').trim();
      if(!isGoodWord(w))continue;
      if(normWord(w)===key)continue;
      if(UI_LABELS[normWord(w)])continue;
      words.push(w);
    }
    var extra=parseSiteLinks(text,host,letter,key);
    return dedup(words.concat(extra)).slice(0,50);
  }).catch(function(){return []});
}
function fetchWiktionary(word){
  var url='https://ru.wiktionary.org/w/api.php?action=parse&page='+encodeURIComponent(word)+'&prop=wikitext&format=json&formatversion=2&origin=*&redirects=1&disabletoc=1';
  return fetchWithTimeout(url,5000).then(function(txt){
    var data=JSON.parse(txt);
    if(!data||!data.parse)return {syn:[],ant:[],ok:false};
    var wt=data.parse.wikitext;
    if(typeof wt!=='string'&&wt&&typeof wt['*']==='string')wt=wt['*'];
    if(typeof wt!=='string')return {syn:[],ant:[],ok:false};
    function sectionBullets(name){
      var re=new RegExp('\\n=+\\s*'+name+'\\s*=+\\s*\\n([\\s\\S]*?)(?=\\n=+|$)','i');
      var mm=wt.match(re);if(!mm)return [];
      var out=[];
      mm[1].split('\n').forEach(function(l){
        var t=l.trim();
        if((t.charAt(0)==='#'||t.charAt(0)==='*')&&t.charAt(1)!=='#'&&t.charAt(1)!=='*')out.push(t.replace(/^[#*]+\s*/,''));
      });
      return out;
    }
    function templateWords(name){
      var re=new RegExp('\\{\\{\\s*'+name+'\\s*\\|([^}]*)\\}\\}','gi');
      var acc=[],m;
      while((m=re.exec(wt))){m[1].split('|').forEach(function(p){var t=p.trim();t=t.replace(/^\d+\s*=\s*/,'');if(t)acc.push(t)})}
      return acc;
    }
    function cleanList(raw){
      if(!raw||!raw.length)return [];
      var joined=raw.join(', ');
      joined=joined.replace(/<!--[\s\S]*?-->/g,'');
      joined=joined.replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g,'$2');
      joined=joined.replace(/\[\[([^\]]+)\]\]/g,'$1');
      for(var i=0;i<4;i++)joined=joined.replace(/\{\{[^{}]*\}\}/g,'');
      joined=joined.replace(/<[^>]+>/g,'').replace(/'''?/g,'').replace(/''/g,'');
      var found=[];
      joined.split(/[,;\/]\s*|\s+и\s+/).forEach(function(p){
        var w=p.trim().replace(/[.,;:!?()"«»„""''\[\]{}<>\*]/g,'').trim();
        if(isGoodWord(w))found.push(w);
      });
      return found;
    }
    var key=normWord(word);
    var syn=dedup(cleanList(sectionBullets('Синонимы').concat(templateWords('синонимы'))));
    var ant=dedup(cleanList(sectionBullets('Антонимы').concat(templateWords('антонимы'))));
    var ok=!!(syn.length||ant.length);
    return {syn:syn.filter(function(w){return normWord(w)!==key&&!isSameStem(w,word)}),ant:ant.filter(function(w){return normWord(w)!==key&&!isSameStem(w,word)}),ok:ok};
  }).catch(function(){return {syn:[],ant:[],ok:false}});
}
function fetchSpecialized(word){
  return Promise.all([
    fetchSiteWordlist('https://sinonim.org','syn',word).then(function(l){return {syn:l,ant:[],src:'sinonim.org'}}),
    fetchSiteWordlist('https://sinonim.org','ant',word).then(function(l){return {syn:[],ant:l,src:'sinonim.org'}}),
    fetchSiteWordlist('https://antonim.org','ant',word).then(function(l){return {syn:[],ant:l,src:'antonim.org'}}),
    fetchSynonymOnline(word).then(function(l){return {syn:l,ant:[],src:'synonymonline'}}),
    fetchAntonymOnline(word).then(function(l){return {syn:[],ant:l,src:'antonymonline'}})
  ]).then(function(res){
    var syn=[],ant=[],sources=[];
    res.forEach(function(r){
      if(r.syn&&r.syn.length){syn=syn.concat(r.syn);if(sources.indexOf(r.src)<0)sources.push(r.src)}
      if(r.ant&&r.ant.length){ant=ant.concat(r.ant);if(sources.indexOf(r.src)<0)sources.push(r.src)}
    });
    var key=normWord(word);
    syn=dedup(syn).filter(function(w){return normWord(w)!==key&&!isSameStem(w,word)});
    ant=dedup(ant).filter(function(w){return normWord(w)!==key&&!isSameStem(w,word)});
    return {syn:syn.slice(0,40),ant:ant.slice(0,40),sources:sources};
  });
}
function fetchAllSources(word){
  var specialized=fetchSpecialized(word);
  var wikiPromise=fetchWiktionary(word);
  return withTimeout(specialized,SPECIALIZED_TIMEOUT,{syn:[],ant:[],sources:[]})
    .then(function(spec){
      if(spec&&(spec.syn.length||spec.ant.length))return {syn:spec.syn,ant:spec.ant,source:spec.sources.length?spec.sources.join(', '):'словари'};
      return wikiPromise.then(function(wk){return {syn:wk.syn,ant:wk.ant,source:wk.ok?'Wiktionary':'—'}});
    });
}
function fetchThesaurus(word){
  var original=String(word||'').trim();
  if(!original)return Promise.resolve(null);
  var key=normWord(original);
  var cached=THESAURUS_CACHE[key];
  if(cached && (Date.now()-(cached.ts||0))<THESAURUS_TTL)return Promise.resolve({syn:cached.syn,ant:cached.ant,source:cached.source,fromCache:true});
  if(cached)delete THESAURUS_CACHE[key];
  var candidates=dedup([original].concat(variants(original)).concat(lemmatize(original))).filter(function(x){return x.length>=2});
  function tryCandidate(i){
    if(i>=candidates.length)return Promise.resolve({syn:[],ant:[],source:'—'});
    var cand=candidates[i];
    return fetchAllSources(cand).then(function(res){
      if(res.syn.length||res.ant.length){
        var entry={syn:res.syn,ant:res.ant,source:res.source,ts:Date.now()};
        THESAURUS_CACHE[key]=entry;
        var ck=normWord(cand);
        if(ck!==key && !THESAURUS_CACHE[ck])THESAURUS_CACHE[ck]=entry;
        persistThesaurusCache();
        return {syn:res.syn,ant:res.ant,source:res.source};
      }
      return tryCandidate(i+1);
    });
  }
  return tryCandidate(0);
}

