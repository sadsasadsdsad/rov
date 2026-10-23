/* ==========================================================================
 * 01-core.js — ЯДРО — константы и хелперы
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 18 JS-скриптов, подключаются строго по номеру.
 * Раздел оригинала: src/index.html, строки 1315–1380 (раздел 1 из 18).
 * Что делает: константы приложения (ключи localStorage, мастер-пароль, типы вики, палитра), ссылки на ключевой DOM (editor/scroller/list/state…), mqMobile, набор глобальных утилит, которыми пользуются все остальные скрипты.
 * Ключевое: LS, MASTER_PASS, WIKI_TYPES, $, uid, plural, fmt, esc, escRe, todayKey, clamp, mk, tmp, state, mqMobile.
 * Зависимости: нет — подключается ПЕРВЫМ, всё остальное использует эти глобалы.
 * ========================================================================== */
"use strict";
var LS='chernovik.v2';
var THESAURUS_LS='chernovik.thesaurus.v5';
var SNAP_LS='chernovik.snapshots.v1';
var ACC_LS='chernovik.accounts.v1';
var MASTER_PASS='123321578gsQ$@158';
var SNAP_MAX_DAYS=30;
var SNAP_MAX_BYTES=3500000;
var COLORS=['#c93a2b','#b3762c','#2e6f5e','#39618f','#7a4a8b','#a04a68'];
var WIKI_TYPES=[
  {k:'city',t:'Города',s:'Город',color:'#39618f'},
  {k:'country',t:'Страны',s:'Страна',color:'#2e6f5e'},
  {k:'person',t:'Персонажи',s:'Персонаж',color:'#c93a2b'},
  {k:'org',t:'Организации',s:'Организация',color:'#6d3b57'},
  {k:'item',t:'Предметы',s:'Предмет',color:'#b3762c'},
  {k:'event',t:'События',s:'Событие',color:'#7a4a8b'},
  {k:'other',t:'Другое',s:'Другое',color:'#6a5f4c'}
];
function $(s){return document.querySelector(s)}
function isReader(){return document.body.classList.contains('reader')}
function isReadOnly(){return document.body.classList.contains('ro')}
/* страница книги открыта (не полка библиотеки): #library скрыт.
   На ней только и доступны ИИ и окно музыки (просьба: «открывать
   только на странице книги») — см. aiOpenPanel и openMusic */
function inBookPage(){return !!(typeof library!=='undefined'&&library&&library.hidden===true)}
function clamp(v,a,b){return Math.max(a,Math.min(b,v))}
var editor=$('#editor'), scroller=$('#scroller'), list=$('#chlist'),
    selbar=$('#selbar'), synbar=$('#synbar'), menu=$('#blockmenu'),
    saveTxt=$('#saveTxt'), saveDot=$('#saveDot'),
    library=$('#library'), workspace=$('#workspace'), shelf=$('#shelf'),
    bookView=$('#bookView'), bvGrid=$('#bvGrid'),
    wpBody=$('#wpBody'), edRz=$('#edRz'), spCols=$('#spCols');
var mqMobile=matchMedia('(max-width:880px)');
var state, menuOpen=false, menuBlock=null, menuItems=[], menuIdx=0, selectedSep=null, saveTimer=null;
var dragChId=null, editingWikiId=null, wikiFilter='', wikiTypeFilter='all', selectedType='city';
var searchOpen=false, searchResults=[], searchIdx=0;
var zenAnchor=null;
var lastCaretOffset=null;
var currentUser=null;

function uid(){return Math.random().toString(36).slice(2,10)}
function plural(n,a,b,c){n=Math.abs(n)%100;var d=n%10;if(n>10&&n<20)return c;if(d>1&&d<5)return b;if(d===1)return a;return c}
function fmt(n){return n.toLocaleString('ru-RU')}
function countWords(s){s=(s||'').trim();return s?s.split(/\s+/).length:0}
function mk(t){return document.createElement(t)}
function tmp(html){var d=mk('div');d.innerHTML=html;return d}
/* Текст из HTML-строки БЕЗ DOM: раньше каждая глава гонялась через
   tmp() (innerHTML) при рендере ленты, открытии энциклопедии, поиске и
   построении связей — на «Войне и мир» это сотни разборов документа.
   Результат совпадает с textContent: комментарии и теги исчезают,
   сущности декодируются так же, как это сделал бы браузер. */
var HTML_ENT={nbsp:'\u00a0',NonBreakingSpace:'\u00a0',shy:'\u00ad',amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",
  mdash:'—',ndash:'–',hellip:'…',laquo:'«',raquo:'»',bull:'•',middot:'·',
  minus:'−',times:'×',copy:'©',reg:'®',deg:'°',plusmn:'±',sect:'§',
  para:'¶',euro:'€',trade:'™',
  lsquo:'‘',rsquo:'’',ldquo:'“',rdquo:'”',bdquo:'„',dagger:'†',
  thinsp:'\u2009',ensp:'\u2000',emsp:'\u2003',zwnj:'\u200c',zwj:'\u200d'};
function entChr(c){
  if(!(c>=0))return '';
  if(c<0x10000)return String.fromCharCode(c);
  c-=0x10000;
  return String.fromCharCode(0xD800+(c>>10),0xDC00+(c&0x3FF));   /* суррогатная пара — как fromCodePoint, но ES5 */
}
function htmlDecode(s){
  return s.replace(/&(?:#x([0-9a-f]+)|#(\d+)|([a-z]+));/gi,function(m,h,d,n){
    if(h!=null)return entChr(parseInt(h,16));
    if(d!=null)return entChr(parseInt(d,10));
    if(n){var v=HTML_ENT[n.toLowerCase()];if(v!==undefined)return v}
    return m;                              /* неизвестная сущность — браузер оставляет строкой */
  });
}
function htmlText(html,nl){
  var s=String(html==null?'':html);
  if(nl)s=s.replace(/<\/(p|h[1-6]|div|li|blockquote)>/gi,'\n');
  s=s.replace(/<!--[\s\S]*?-->/g,'');      /* как textContent: комментарии — не текст */
  s=s.replace(/<[^>]*>/g,'');
  return htmlDecode(s);
}
/* Раунд I: фоновые порции. Тяжёлые производные (счётчики слов глав,
   цитаты превью, статистика полки) считаются порциями уже после отрисовки —
   открытие книги/главы не ждёт разбора чужих текстов. Порция ≈10 мс,
   между порциями управление возвращается браузеру. */
var _bgq=[],_bgOn=false;
function bgJob(fn){
  if(typeof fn!=='function')return;
  _bgq.push(fn);
  if(!_bgOn){_bgOn=true;setTimeout(_bgRun,0)}
}
function _bgRun(){
  var t0=Date.now();
  while(_bgq.length&&Date.now()-t0<10){
    var f=_bgq.shift();
    try{f()}catch(e){}
  }
  if(_bgq.length)setTimeout(_bgRun,0);else _bgOn=false;
}
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function escAttr(s){return esc(s).replace(/"/g,'&quot;')}
function escRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function todayKey(d){d=d||new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
/* Цвета приходят из localStorage/сервера/бэкапа — принимаем от них только
   литерал CSS (без ';' и скобок с содержимым), иначе «red;background:url(...)»
   уезжает прямо в style-атрибут и в --tc. */
function safeColor(c,fb){
  if(typeof c!=='string')return fb;
  var s=c.trim();
  return (/^(#[0-9a-f]{3,8}|[a-z]+|rgba?\([\d.,\s%]+\)|hsla?\([\d.,\s%]+\))$/i.test(s))?s:fb;
}
/** копия типа вики с проверенным цветом (экземпляры не переиспользуем:
 *  вызывающие не меняют объекты, а чужие данные не должны попадать в DOM) */
function safeType(tp){
  var fb=WIKI_TYPES[WIKI_TYPES.length-1];
  if(!tp||typeof tp!=='object')return {k:fb.k,t:fb.t,s:fb.s,color:fb.color};
  var o={};
  for(var k in tp)if(Object.prototype.hasOwnProperty.call(tp,k))o[k]=tp[k];
  o.color=safeColor(tp.color,fb.color);
  return o;
}
function getWikiType(k){
  for(var i=0;i<WIKI_TYPES.length;i++)if(WIKI_TYPES[i].k===k)return WIKI_TYPES[i];
  var b=book();
  if(b&&b.customTypes)for(var j=0;j<b.customTypes.length;j++)if(b.customTypes[j].k===k)return safeType(b.customTypes[j]);
  return WIKI_TYPES[WIKI_TYPES.length-1];
}
function allTypes(){
  var b=book(),ct=(b&&b.customTypes)||[],out=WIKI_TYPES.slice();
  for(var i=0;i<ct.length;i++)out.push(safeType(ct[i]));
  return out;
}
function wikiTypeLabel(k){return getWikiType(k).s}
function wikiTypeColor(k){return getWikiType(k).color}
function timeAgo(ts){
  if(!ts)return '';
  var d=Date.now()-ts,m=Math.floor(d/60000);
  if(m<1)return 'только что';
  if(m<60)return m+' мин назад';
  var h=Math.floor(m/60);
  if(h<24)return h+' ч назад';
  var days=Math.floor(h/24);
  if(days===1)return 'вчера';
  if(days<7)return days+' дн назад';
  return new Date(ts).toLocaleDateString('ru-RU');
}
/* =========================================================================
   ДОСТУПНОСТЬ: иконочные кнопки получают aria-label из title (title сам по
   себе не везде объявляется скринридерами и не показывается на тач-экранах),
   декоративные svg прячутся от AT. Вызывать после отрисовки динамических
   списков: a11yPass(container).
   ========================================================================= */
function a11yPass(root){
  root=root||document;
  if(!root.querySelectorAll)return;
  var btns=root.querySelectorAll('button,a[href],[role="button"]');
  Array.prototype.forEach.call(btns,function(b){
    /* декоративные svg внутри действия не должны объявляться AT */
    Array.prototype.forEach.call(b.querySelectorAll('svg'),function(s){
      if(s.getAttribute('aria-hidden')==='true')return;
      s.setAttribute('aria-hidden','true');
      s.setAttribute('focusable','false');
    });
    if(b.getAttribute('aria-label'))return;
    var txt=(b.textContent||'').replace(/\s+/g,' ').trim();
    if(txt)return;                       /* есть текст — он и есть имя */
    var t=b.getAttribute('title');
    if(t)b.setAttribute('aria-label',t);
  });
}
/* смена title у динамических кнопок — держим aria-label синхронным */
function setBtnTitle(b,t){
  if(!b)return;
  b.title=t;
  b.setAttribute('aria-label',t);
}

