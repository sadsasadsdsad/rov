/* ==========================================================================
 * 27-news.js — СТРАНИЦА «ЖУРНАЛ»: обновления сайта и статьи разработчиков
 * Проект: «Черновик» — веб-редактор рукописей. ES5, без сборщика.
 * Что делает: полноэкранный оверлей #newsPage с двумя разделами.
 *   «Обновления» — записи берутся из панели «Что нового» (#chgScroll):
 *   страница клонирует те же <li>, чтобы текст обновлений не жил в двух
 *   местах. «Статьи разработчиков» — с api/news.php: список с лидом,
 *   читалка (GET ?id=), а для админа (is_admin — профиль «123») —
 *   форма редактора: новая / изменить / удалить (POST / PUT / DELETE).
 *   Без админа кнопка «Новая статья» скрыта, черновики не приходят
 *   (сервер фильтрует), а попытка писать упирается в 403 — сервер
 *   главный в этой проверке, клиент её только показывает.
 *   Текст статьи хранится обычным: пустая строка = абзац, HTML
 *   экранируется при выводе (newsEsc) — разметка не выполняется.
 *   Входы: кнопка «Журнал →» в панели «Что нового» (#npOpen) и пункт
 *   «Журнал и статьи» в меню настроек (26-settings.js → smAct 'news').
 *   Escape: из читалки/редактора — назад к списку, из списка — закрыть.
 * Ключевое: openNews, closeNews, newsLoad, newsRender, newsOpen,
 *   newsEditStart, newsSave, newsDel, newsShow, newsFillUpdates.
 * Зависимости: 01-core ($), 15-editor (toast).
 * ========================================================================== */
var newsPage=$('#newsPage'),newsAdmin=false,newsList=[],newsView='updates',newsCur=null,newsTab='updates',newsHideTimer=null;

function newsEsc(s){
  return String(s==null?'':s).replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}
function newsDate(ms){
  try{return new Date(+ms||0).toLocaleDateString('ru-RU',{day:'numeric',month:'short',year:'numeric'})}
  catch(e){return ''}
}
function newsFind(id){
  for(var i=0;i<newsList.length;i++)if(newsList[i].id===id)return newsList[i];
  return null;
}
function newsVisibleCount(){
  var n=0;
  for(var i=0;i<newsList.length;i++){
    if(newsAdmin||newsList[i].status==='published')n++;
  }
  return n;
}

/* ── раздел «Обновления»: клоны строк панели «Что нового» ──────────────── */
function newsFillUpdates(){
  var dst=$('#npUpdates'),src=$('#chgScroll');
  if(!dst||!src)return;
  dst.innerHTML='';
  for(var i=0;i<src.children.length;i++)dst.appendChild(src.children[i].cloneNode(true));
}

/* ── показ разделов: список / читалка / редактор ────────────────────────── */
function newsShow(v){
  newsView=v;
  $('#npUpdates').hidden=(v!=='updates');
  $('#npArticles').hidden=(v!=='articles');
  $('#npEmpty').hidden=(v!=='articles'||newsVisibleCount()>0);
  $('#npRead').hidden=(v!=='read');
  $('#npEdit').hidden=(v!=='edit');
  /* въезд активного раздела (та же пружина, что у разделов библиотеки) */
  var el=(v==='read')?$('#npRead'):(v==='edit')?$('#npEdit'):(v==='articles')?$('#npArticles'):$('#npUpdates');
  if(el){
    el.classList.remove('np-in');void el.offsetWidth;el.classList.add('np-in');
  }
  $('#npBody').scrollTop=0;
}
function newsPickTab(t){
  newsTab=t;
  $('#npTabUpd').classList.toggle('on',t==='updates');
  $('#npTabUpd').setAttribute('aria-selected',t==='updates'?'true':'false');
  $('#npTabArt').classList.toggle('on',t==='articles');
  $('#npTabArt').setAttribute('aria-selected',t==='articles'?'true':'false');
  newsShow(t);
}

/* ── статьи: загрузка и список ──────────────────────────────────────────── */
function newsLoad(){
  return fetch('api/news.php',{credentials:'same-origin'})
    .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})})
    .then(function(res){
      if(!res.ok||!res.j||!res.j.ok)throw new Error('http');
      newsAdmin=!!res.j.admin;
      newsList=res.j.articles||[];
      newsRender();
      $('#npNew').hidden=!newsAdmin;
      return true;
    })
    .catch(function(){
      newsRender();                     /* офлайн: показываем что есть */
      toast('Сервер недоступен — статьи не загрузились');
      return false;
    });
}
function newsRender(){
  var box=$('#npArticles');
  box.innerHTML='';
  for(var i=0;i<newsList.length;i++){
    var a=newsList[i];
    if(!newsAdmin&&a.status!=='published')continue;
    var card=document.createElement('div');
    card.className='np-card';
    card.setAttribute('data-id',a.id);
    card.innerHTML=
      '<button type="button" class="np-card-main">'+
        '<span class="np-meta"><span>'+newsDate(a.updated)+'</span>'+
          (a.tag?'<span>· '+newsEsc(a.tag)+'</span>':'')+
          (a.status==='draft'?'<span class="np-draft">черновик</span>':'')+'</span>'+
        '<b class="np-h">'+newsEsc(a.title)+'</b>'+
        '<span class="np-lead">'+newsEsc(a.lead||'')+'…</span>'+
      '</button>'+
      (newsAdmin?'<div class="np-card-adm">'+
        '<button type="button" class="np-mini" data-e="edit">Изменить</button>'+
        '<button type="button" class="np-mini danger" data-e="del">Удалить</button>'+
      '</div>':'');
    box.appendChild(card);
  }
}

/* ── читалка статьи ─────────────────────────────────────────────────────── */
function newsOpen(id){
  if(!id)return;
  fetch('api/news.php?id='+encodeURIComponent(id),{credentials:'same-origin'})
    .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})})
    .then(function(res){
      if(!res.ok||!res.j||!res.j.article)throw new Error('http');
      var a=res.j.article;
      newsCur=id;
      var paras=String(a.body||'').split(/\n{2,}/),html='';
      for(var i=0;i<paras.length;i++){
        var t=paras[i].replace(/^\n+|\n+$/g,'');
        if(t)html+='<p>'+newsEsc(t).replace(/\n/g,'<br>')+'</p>';
      }
      $('#npRead').innerHTML=
        '<div class="np-rd-top">'+
          '<span class="np-meta"><span>'+newsDate(a.updated)+'</span>'+
            (a.tag?'<span>· '+newsEsc(a.tag)+'</span>':'')+
            '<span>· '+newsEsc(a.author||'разработчик')+'</span>'+
            (a.status==='draft'?'<span class="np-draft">черновик</span>':'')+'</span>'+
          '<span class="sp" style="flex:1"></span>'+
          '<button type="button" class="m-btn" id="npRdBack">← К СПИСКУ</button>'+
          (newsAdmin?'<button type="button" class="m-btn" id="npRdEdit">ИЗМЕНИТЬ</button>':'')+
        '</div>'+
        '<h1>'+newsEsc(a.title)+'</h1>'+
        '<div class="np-rd-body">'+html+'</div>';
      $('#npRdBack').addEventListener('click',function(){newsPickTab(newsTab)});
      var re=$('#npRdEdit');
      if(re)re.addEventListener('click',function(){newsEditStart(id)});
      newsShow('read');
      return true;
    })
    .catch(function(){toast('Статья недоступна')});
}

/* ── редактор (только админ; сервер всё равно проверяет is_admin) ───────── */
function newsEditStart(id){
  if(!newsAdmin){toast('Статьи пишет только разработчик');return}
  if(!id){
    newsCur=null;
    $('#npFTitle').value='';$('#npFTag').value='';$('#npFBody').value='';
    $('#npFStatus').checked=false;$('#npFDelete').hidden=true;
    newsShow('edit');
    $('#npFTitle').focus();
    return;
  }
  fetch('api/news.php?id='+encodeURIComponent(id),{credentials:'same-origin'})
    .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})})
    .then(function(res){
      if(!res.ok||!res.j||!res.j.article)throw new Error('http');
      var a=res.j.article;
      newsCur=id;
      $('#npFTitle').value=a.title||'';$('#npFTag').value=a.tag||'';
      $('#npFBody').value=a.body||'';
      $('#npFStatus').checked=(a.status==='draft');
      $('#npFDelete').hidden=false;
      newsShow('edit');
      $('#npFTitle').focus();
    })
    .catch(function(){toast('Статья недоступна')});
}
function newsSave(){
  var payload={
    title:$('#npFTitle').value,tag:$('#npFTag').value,body:$('#npFBody').value,
    status:$('#npFStatus').checked?'draft':'published'
  };
  if(newsCur)payload.id=newsCur;
  fetch('api/news.php',{method:newsCur?'PUT':'POST',credentials:'same-origin',
    headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)})
  .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})})
  .then(function(res){
    if(!res.ok||!res.j||!res.j.ok){
      toast('Не получилось: '+((res.j&&res.j.error)?res.j.error:'сервер ответил ошибкой'));
      return;
    }
    toast('Статья сохранена');
    newsLoad().then(function(){newsPickTab('articles')});
  })
  .catch(function(){toast('Сервер недоступен')});
}
function newsDel(id){
  if(!id||!newsAdmin)return;
  if(!window.confirm('Удалить статью без возврата?'))return;
  fetch('api/news.php?id='+encodeURIComponent(id),{method:'DELETE',credentials:'same-origin'})
    .then(function(r){return r.json().then(function(j){return {ok:r.ok,j:j}})})
    .then(function(res){
      if(!res.ok||!res.j||!res.j.ok){
        toast('Не получилось: '+((res.j&&res.j.error)?res.j.error:'сервер ответил ошибкой'));
        return;
      }
      toast('Статья удалена');
      newsLoad().then(function(){newsPickTab('articles')});
    })
    .catch(function(){toast('Сервер недоступен')});
}

/* ── выбор пункта в таббаре ────────────────────────────────────────────────
   Пока журнал открыт, «выбран» — «Журнал» (.on + aria-pressed, а круглая
   точка выделения .tabbar-ind переезжает к кнопке через window.tabbarIndTo
   из 25-ui.js); разделы «Мои / Общие» на это время гаснут. При закрытии
   выбор возвращается на текущий раздел библиотеки (data-tab) — по нему же,
   поэтому повторный вызов безвреден и порядок кликов не важен */
function newsSel(on){
  var bar=document.getElementById('libTabs');
  if(!bar)return;
  var i,ts=bar.querySelectorAll('button[data-t]'),nj=bar.querySelector('button[data-news]'),act=null;
  var t=bar.getAttribute('data-tab')||'mine';
  for(i=0;i<ts.length;i++){
    var same=!on&&((ts[i].getAttribute('data-t')||'')===t);
    if(same)act=ts[i];
    ts[i].classList.toggle('on',same);
    ts[i].setAttribute('aria-pressed',same?'true':'false');
  }
  if(nj){
    if(on){nj.classList.add('on');nj.setAttribute('aria-pressed','true')}
    else{nj.classList.remove('on');nj.setAttribute('aria-pressed','false')}
  }
  /* вход в журнал — через tabbarNewsInd (25-ui.js): подпись сворачивается
     в тот же кадр, и точка едет на ФИНАЛЬНУЮ позицию кнопки; выход —
     обычный переезд на кнопку текущего раздела */
  if(on){if(window.tabbarNewsInd)window.tabbarNewsInd()}
  else if(window.tabbarIndTo&&act)window.tabbarIndTo(act);
}

/* ── открытие/закрытие страницы ─────────────────────────────────────────── */
function openNews(tab){
  if(!newsPage)return;
  clearTimeout(newsHideTimer);
  /* страница ниже wikiPanel по слою (55 < 90) — открытую энциклопедию
     закрываем, иначе она накроет журнал */
  var wp=document.getElementById('wikiPanel');
  if(wp&&wp.classList.contains('on')&&typeof toggleWikiPanel==='function')toggleWikiPanel(false);
  newsFillUpdates();
  newsPage.hidden=false;
  void newsPage.offsetHeight;         /* форсируем кадр — иначе transition не идёт */
  newsPage.classList.add('on');
  newsSel(true);                      /* «Журнал» показывается выбранным */
  if(typeof uiTip!=='undefined'&&uiTip&&uiTip.hide)uiTip.hide();  /* пузырь от кнопки-входа */
  newsPickTab(tab==='articles'?'articles':'updates');
  newsLoad();
  var back=$('#npBack');if(back)back.focus();
}
function closeNews(){
  if(!newsPage||newsPage.hidden)return;
  newsPage.classList.remove('on');
  newsSel(false);                     /* выбор — обратно на раздел библиотеки */
  clearTimeout(newsHideTimer);
  newsHideTimer=setTimeout(function(){newsPage.hidden=true},320);
}

/* ── события ────────────────────────────────────────────────────────────── */
if(newsPage){
  var npOpen=$('#npOpen');
  if(npOpen)npOpen.addEventListener('click',function(){openNews('updates')});
  /* таббар библиотеки: «Журнал» — toggle, «Мои / Общие» при открытом
     журнале — закрывают его и переключают раздел (25-ui.js не трогает
     data-news: у той кнопки нет data-t) */
  var npTabNews=document.getElementById('libTabs');
  if(npTabNews)npTabNews.addEventListener('click',function(e){
    var b=e.target&&e.target.closest?e.target.closest('button'):null;
    if(!b||!newsPage)return;
    if(b.hasAttribute&&b.hasAttribute('data-news')){
      if(newsPage.classList.contains('on'))closeNews();else openNews('updates');
    }else if(b.getAttribute('data-t')&&newsPage.classList.contains('on')){
      closeNews();
    }
  });
  $('#npBack').addEventListener('click',closeNews);
  $('#npTabUpd').addEventListener('click',function(){newsPickTab('updates')});
  $('#npTabArt').addEventListener('click',function(){newsPickTab('articles');newsLoad()});
  $('#npNew').addEventListener('click',function(){newsEditStart(null)});
  $('#npArticles').addEventListener('click',function(e){
    var main=e.target.closest('.np-card-main');
    if(main){newsOpen(main.closest('.np-card').getAttribute('data-id'));return}
    var act=e.target.closest('[data-e]');
    if(act){
      var id=act.closest('.np-card').getAttribute('data-id');
      if(act.getAttribute('data-e')==='edit')newsEditStart(id);
      else newsDel(id);
    }
  });
  $('#npFCancel').addEventListener('click',function(){
    if(newsCur)newsOpen(newsCur);else newsPickTab('articles');
  });
  $('#npFSave').addEventListener('click',newsSave);
  $('#npFDelete').addEventListener('click',function(){newsDel(newsCur)});
  document.addEventListener('keydown',function(e){
    if(e.key!=='Escape'||!newsPage||newsPage.hidden)return;
    /* модалки и меню настроек обрабатывают Escape сами — не отбираем */
    if(document.querySelector('#dayModal.on,#wikiModal.on,#wikiViewModal.on,#askModal.on,#aiSetModal.on,#aiResModal.on,#musicModal.on'))return;
    if(typeof smMenu!=='undefined'&&smMenu&&smMenu.classList.contains('on'))return;
    if(newsView==='read'||newsView==='edit'){e.preventDefault();newsPickTab(newsTab);return}
    e.preventDefault();closeNews();
  });
}
