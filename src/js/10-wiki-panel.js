/* ==========================================================================
 * 10-wiki-panel.js — ПАНЕЛЬ ВИКИ — нижние вкладки
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 18 JS-скриптов, подключаются строго по номеру.
 * Раздел оригинала: src/index.html, строки 2958–3054 (раздел 10 из 18).
 * Что делает: плавающая нижняя панель с вкладками (карта связей / заметки / сущности), переключение и сворачивание.
 * Ключевое: toggleWikiPanel, setPanelTab, panelTab, updatePanelTabs.
 * Зависимости: 01-core, 09-cooccurrence, 11-notes; кнопка #btnWiki в index.html («Все заметки» убраны — заметки открываются через Энциклопедию → вкладка «Заметки»).
 * ========================================================================== */
"use strict";
/* ===== ПАНЕЛЬ: плавающие вкладки в шапке ===== */
var panelTab='world';
var wpTid=0;                         /* дебаунс ввода в поиск вики */
function updatePanelTabs(){
  document.querySelectorAll('.wp-tab').forEach(function(b){
    b.classList.toggle('on', b.dataset.tab===panelTab);
  });
  var panel=$('#wikiPanel');
  var open=panel&&panel.classList.contains('on');
  /* aria-expanded кнопок-триггеров = состояние панели */
  var bw=$('#btnWiki');if(bw)bw.setAttribute('aria-expanded',String(!!open));
  var bnp2=$('#btnNotesPanel');if(bnp2)bnp2.setAttribute('aria-expanded',String(!!open));
  /* чат живёт внутри как раздел (#paneAi): .on панели чата и aria-expanded
     фабов ИИ = «панель открыта и показан раздел «Чат»» */
  var chatVis=!!open&&panelTab==='ai';
  var ap=$('#aiPanel');
  if(ap)ap.classList.toggle('on',chatVis);
  if(typeof aiFabs==='function'){
    var ex=String(chatVis);
    aiFabs().forEach(function(f){f.setAttribute('aria-expanded',ex)});
  }
  var ind=$('#wpTabsInd');
  if(ind){
    if(!open){
      ind.classList.remove('on');
    }else{
      var active=document.querySelector('.wp-tab.on');
      if(active&&active.offsetWidth){
        ind.style.width=active.offsetWidth+'px';
        ind.style.transform='translateX('+active.offsetLeft+'px)';
        ind.classList.add('on');
      }else if(!panel.offsetParent){
        /* M13: панель невидима (body.reader / display:none) — таймер
           самоплодился и парсил все главы каждые 60мс; полагаемся
           на ResizeObserver ниже */
        ind.classList.remove('on');
      }else{
        setTimeout(updatePanelTabs,60);
      }
    }
  }
  var cntEl=document.querySelector('.wp-tab .wt-cnt[data-cnt="notes"]');
  if(cntEl){
    try{
      var n=book()?collectNotes().length:0;
      cntEl.textContent=n?('· '+n):'';
    }catch(e){cntEl.textContent=''}
  }
}
if('ResizeObserver' in window){
  var tabsEl=document.querySelector('.wp-tabs');
  if(tabsEl){
    var tabsRo=new ResizeObserver(function(){
      clearTimeout(tabsRo._t);
      tabsRo._t=setTimeout(updatePanelTabs,30);
    });
    tabsRo.observe(tabsEl);
  }
}
function setPanelTab(t){
  panelTab=t;
  $('#paneWorld').hidden=(t!=='world');
  $('#paneNotes').hidden=(t!=='notes');
  $('#paneGraph').hidden=(t!=='graph');
  $('#paneAi').hidden=(t!=='ai');
  $('#wpAdd').style.display=(t==='world')?'':'none';
  $('#wpAuto').style.display=(t==='world')?'':'none';
  $('#wpTitleText').textContent=(t==='world')?'Энциклопедия':(t==='notes')?'Заметки':(t==='ai')?'ИИ-ассистент':'Карта связей';
  $('#wpCount').textContent='';
  updatePanelTabs();
  requestAnimationFrame(function(){ updatePanelTabs(); });
  setTimeout(updatePanelTabs, 480);
  if(t==='world'){if(typeof wikiMergeAuto==='function')wikiMergeAuto();renderWikiFilters();renderWiki()}
  else if(t==='notes'){renderNotes()}
  else if(t==='graph'){if(typeof wikiMergeAuto==='function')wikiMergeAuto();scheduleGraph()}
  else if(t==='ai'&&typeof aiRender==='function'){   /* чат — раздел панели */
    aiRender();aiRenderCtx();
    setTimeout(function(){
      var i=$('#aiInput');
      if(i&&(typeof aiBusy==='undefined'||!aiBusy)&&document.hasFocus())i.focus();
    },60);
  }
  renderMarksRail();
}
function toggleWikiPanel(force,tab){
  var on=(force===undefined)?!$('#wikiPanel').classList.contains('on'):force;
  $('#wikiPanel').classList.toggle('on',on);
  if(on){
    setPanelTab(tab||panelTab);
    setTimeout(positionEdRz,450);
  }else{
    $('#btnWiki').classList.remove('on');
    /* «Все заметки» переехали в Энциклопедию (вкладка «Заметки»), кнопки
       #btnNotesPanel в новой разметке уже нет — в устаревшей она ещё есть */
    var bnp=$('#btnNotesPanel');
    if(bnp)bnp.classList.remove('on');
    updatePanelTabs();
  }
  renderMarksRail();
}
document.querySelectorAll('.wp-tab').forEach(function(b){
  b.addEventListener('click',function(){
    setPanelTab(b.dataset.tab);
  });
});
$('#btnWiki').addEventListener('click',function(){
  var open=$('#wikiPanel').classList.contains('on');
  if(open && panelTab==='world'){toggleWikiPanel(false);return}
  toggleWikiPanel(true,'world');
});
$('#btnNotesPanel')&&$('#btnNotesPanel').addEventListener('click',function(){
  var open=$('#wikiPanel').classList.contains('on');
  if(open && panelTab==='notes'){toggleWikiPanel(false);return}
  toggleWikiPanel(true,'notes');
});
$('#wpClose').addEventListener('click',function(){toggleWikiPanel(false)});
$('#wpFull').addEventListener('click',function(){
  var on=$('#wikiPanel').classList.toggle('win');
  this.setAttribute('aria-pressed',on?'true':'false');
  setBtnTitle(this,on?'Во весь экран':'Маленький режим — встроить между хидером и строкой статуса');
  if(!$('#paneGraph').hidden)scheduleGraph();
  setTimeout(positionEdRz,450);
  updatePanelTabs();
  requestAnimationFrame(updatePanelTabs);
  setTimeout(updatePanelTabs,520);
  /* полоса тегов: после смены ширины пересчитать затемнение краёв */
  if(typeof wpFiltersEdge==='function')requestAnimationFrame(function(){
    wpFiltersEdge($('#wpFilters'));wpFiltersEdge($('#npFilters'));
  });
});
$('#wpAdd').addEventListener('click',function(){openWikiModal(null)});
$('#wpAuto').addEventListener('click',wikiAutoPersons);
$('#wpSearch').addEventListener('input',function(){
  wikiFilter=this.value;
  /* дебаунс: renderWiki для каждой статьи сканирует все главы (nameStats) */
  clearTimeout(wpTid);wpTid=setTimeout(renderWiki,140);
});

