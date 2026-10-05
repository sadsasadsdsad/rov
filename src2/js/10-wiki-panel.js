/* ==========================================================================
 * 10-wiki-panel.js — ПАНЕЛЬ ВИКИ — нижние вкладки
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 18 JS-скриптов, подключаются строго по номеру.
 * Раздел оригинала: src/index.html, строки 2958–3054 (раздел 10 из 18).
 * Что делает: плавающая нижняя панель с вкладками (карта связей / заметки / сущности), переключение и сворачивание.
 * Ключевое: toggleWikiPanel, setPanelTab, panelTab, updatePanelTabs.
 * Зависимости: 01-core, 09-cooccurrence, 11-notes; кнопки #btnWiki/#btnNotesPanel в 15-editor.
 * ========================================================================== */
"use strict";
/* ===== ПАНЕЛЬ: плавающие вкладки в шапке ===== */
var panelTab='world';
function updatePanelTabs(){
  document.querySelectorAll('.wp-tab').forEach(function(b){
    b.classList.toggle('on', b.dataset.tab===panelTab);
  });
  var panel=$('#wikiPanel');
  var open=panel&&panel.classList.contains('on');
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
  $('#wpAdd').style.display=(t==='world')?'':'none';
  $('#wpTitleText').textContent=(t==='world')?'Энциклопедия':(t==='notes')?'Заметки':'Карта связей';
  $('#wpCount').textContent='';
  updatePanelTabs();
  requestAnimationFrame(function(){ updatePanelTabs(); });
  setTimeout(updatePanelTabs, 480);
  if(t==='world'){renderWikiFilters();renderWiki()}
  else if(t==='notes'){renderNotes()}
  else if(t==='graph'){scheduleGraph()}
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
    $('#btnNotesPanel').classList.remove('on');
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
$('#btnNotesPanel').addEventListener('click',function(){
  var open=$('#wikiPanel').classList.contains('on');
  if(open && panelTab==='notes'){toggleWikiPanel(false);return}
  toggleWikiPanel(true,'notes');
});
$('#wpClose').addEventListener('click',function(){toggleWikiPanel(false)});
$('#wpFull').addEventListener('click',function(){
  $('#wikiPanel').classList.toggle('full');
  if(!$('#paneGraph').hidden)scheduleGraph();
  setTimeout(positionEdRz,450);
  updatePanelTabs();
  requestAnimationFrame(updatePanelTabs);
  setTimeout(updatePanelTabs,520);
});
$('#wpAdd').addEventListener('click',function(){openWikiModal(null)});
$('#wpSearch').addEventListener('input',function(){wikiFilter=this.value;renderWiki()});

