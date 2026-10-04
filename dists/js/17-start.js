/* ==========================================================================
 * 17-start.js — BOOT — запуск приложения
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 18 JS-скриптов, подключаются строго по номеру.
 * Раздел оригинала: src/index.html, строки 5779–5821 (раздел 17 из 18).
 * Что делает: startApp(пользователь): первичная инициализация состояния, рендер, восстановление сессии; вызов loadAccounts() и автологин (локальный + серверный через 20-sync).
 * Ключевое: startApp, boot.
 * Зависимости: опирается на все 01–16; последний из файлов оригинала; 20-sync подключается позже (boot отложенный).
 * ========================================================================== */
"use strict";
/* ===== СТАРТ ===== */
function startApp(user){
  currentUser=user;
  LS='chernovik.v2.u:'+user.id;
  SNAP_LS='chernovik.snapshots.v1.u:'+user.id;
  THESAURUS_LS='chernovik.thesaurus.v5.u:'+user.id;
  /* новый профиль без локальных данных — сид книги не должен дублироваться при синхронизации */
  if(typeof Sync!=='undefined')Sync.freshSeed=!localStorage.getItem(LS);

  initThesaurusCache();
  initSnapshots();
  initState();
  renderAccButtons();

  $('#authScreen').classList.add('off');

  setLayoutVars();
  setTheme(state.theme||'light');
  if(state.zen){document.body.classList.add('zen');$('#btnZen').classList.add('on')}
  if(typeof applyReaderMode==='function')applyReaderMode();
  snapshotStats();persist();
  library.hidden=false;
  setWorkspaceVisible(false);
  bookView.hidden=true;
  renderLibrary();
  bindChartHover();
  saveTxt.textContent='Сохранено';
  updatePanelTabs();
  if(typeof Sync!=='undefined'&&Sync.afterStart)Sync.afterStart();
  /* hash-ссылка #/read/<id>[/<token>] — открыть чужую книгу при загрузке */
  if(typeof routeReadHash==='function')routeReadHash();
}

loadAccounts();
function localBoot(){
  var sess=accounts.users.filter(function(u){return u.id===accounts.session})[0];
  if(sess){enterApp(sess);return}
  /* гостевое чтение по ссылке #/read/… — без входа в аккаунт */
  if((location.hash||'').indexOf('#/read/')===0){
    enterApp({id:'guest',login:'guest',name:'Гость',salt:'',hash:'',created:Date.now(),lastLogin:Date.now()});
    return;
  }
  $('#authScreen').classList.remove('off');
  if(accounts.users.length){
    setAuthMode('login');
    setTimeout(function(){var el=$('.auth-user');if(el)el.focus()},80);
  }else{
    setAuthMode('signup');
    if(localStorage.getItem('chernovik.v2')){
      authError('Найдены рукописи без аккаунта — они перейдут в первый созданный профиль.');
    }
    setTimeout(function(){$('#authName').focus()},80);
  }
}
function boot(){
  /* сначала — серверная сессия (api/auth.php): если она есть, входим без локального пароля */
  if(typeof Sync==='undefined'||!Sync||!Sync.boot){localBoot();return}
  Sync.boot().then(function(u){
    if(!u){localBoot();return}
    var loc=findUser(u.login);
    if(!loc){
      loc={id:uid()+uid(),login:u.login,name:(u.name||u.login),salt:'',hash:'',created:(u.created||Date.now()),lastLogin:Date.now()};
      accounts.users.push(loc);
    }else{
      loc.lastLogin=Date.now();
      if(u.name)loc.name=u.name;
    }
    accounts.session=loc.id;
    saveAccounts();
    enterApp(loc);
  });
}
/* boot — после загрузки всех скриптов (20-sync.js подключается после 17-start.js) */
if(document.readyState==='loading')addEventListener('DOMContentLoaded',boot);
else setTimeout(boot,0);
