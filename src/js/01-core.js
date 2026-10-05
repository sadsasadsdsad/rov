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
function esc(s){return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')}
function escAttr(s){return esc(s).replace(/"/g,'&quot;')}
function escRe(s){return s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&')}
function todayKey(d){d=d||new Date();return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0')}
function getWikiType(k){
  for(var i=0;i<WIKI_TYPES.length;i++)if(WIKI_TYPES[i].k===k)return WIKI_TYPES[i];
  var b=book();
  if(b&&b.customTypes)for(var j=0;j<b.customTypes.length;j++)if(b.customTypes[j].k===k)return b.customTypes[j];
  return WIKI_TYPES[WIKI_TYPES.length-1];
}
function allTypes(){var b=book();return WIKI_TYPES.concat((b&&b.customTypes)||[])}
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

