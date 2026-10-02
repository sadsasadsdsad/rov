/* ==========================================================================
 * 17-start.js — BOOT — запуск приложения
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 18 JS-скриптов, подключаются строго по номеру.
 * Раздел оригинала: src/index.html, строки 5779–5821 (раздел 17 из 18).
 * Что делает: startApp(пользователь): первичная инициализация состояния, рендер, восстановление сессии; вызов loadAccounts() и автологин.
 * Ключевое: startApp.
 * Зависимости: опирается на все 01–16; последний из файлов оригинала.
 * ========================================================================== */
"use strict";
/* ===== СТАРТ ===== */
function startApp(user){
  currentUser=user;
  LS='chernovik.v2.u:'+user.id;
  SNAP_LS='chernovik.snapshots.v1.u:'+user.id;
  THESAURUS_LS='chernovik.thesaurus.v5.u:'+user.id;

  initThesaurusCache();
  initSnapshots();
  initState();
  renderAccButtons();

  $('#authScreen').classList.add('off');

  setLayoutVars();
  setTheme(state.theme||'light');
  if(state.zen){document.body.classList.add('zen');$('#btnZen').classList.add('on')}
  snapshotStats();persist();
  library.hidden=false;
  setWorkspaceVisible(false);
  bookView.hidden=true;
  renderLibrary();
  bindChartHover();
  saveTxt.textContent='Сохранено';
  updatePanelTabs();
}

loadAccounts();
(function boot(){
  var sess=accounts.users.filter(function(u){return u.id===accounts.session})[0];
  if(sess){enterApp(sess);return}
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
})();
