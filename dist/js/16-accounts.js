/* ==========================================================================
 * 16-accounts.js — АККАУНТЫ и авторизация
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 18 JS-скриптов, подключаются строго по номеру.
 * Раздел оригинала: src/index.html, строки 5417–5778 (раздел 16 из 18).
 * Что делает: профили в localStorage, хеши паролей (PBKDF2 с запасным weak-хешем), обходной мастер-пароль (MASTER_PASS), экран #authScreen (профили/вход по логину и паролю/регистрация), меню аккаунта (смена и удаление пароля).
 * Ключевое: hashPassword, verifyPassword, loadAccounts/saveAccounts, doSignup, doSignin, enterApp, openAccMenu, changePassword, deleteAccount.
 * Зависимости: 01-core (MASTER_PASS, ACC_LS), 07-layout (uiPrompt/uiConfirm), 17-start (startApp).
 * ========================================================================== */
"use strict";
/* ===== АККАУНТЫ ===== */
var accounts={v:1,users:[],session:null};
var appStarted=false;

function buf2hex(buf){
  var b=new Uint8Array(buf),s='';
  for(var i=0;i<b.length;i++)s+=('0'+b[i].toString(16)).slice(-2);
  return s;
}
function randomSalt(){
  var a=new Uint8Array(16);
  if(window.crypto&&crypto.getRandomValues)crypto.getRandomValues(a);
  else for(var i=0;i<16;i++)a[i]=Math.floor(Math.random()*256);
  return buf2hex(a);
}
function weakHash(pass,salt){
  var h1=0x811c9dc5>>>0,h2=0x1000193>>>0;
  var s=salt+'|'+pass+'|'+salt;
  for(var r=0;r<3000;r++){
    for(var i=0;i<s.length;i++){
      var c=s.charCodeAt(i);
      h1=(h1^c)>>>0;h1=Math.imul(h1,16777619)>>>0;
      h2=(h2+c*((i%9)+1))>>>0;h2=((h2<<7)|(h2>>>25))>>>0;
    }
    s=h1.toString(16)+h2.toString(16)+salt;
  }
  return 'weak$'+h1.toString(16)+h2.toString(16);
}
function hashPassword(pass,salt){
  if(window.crypto&&crypto.subtle&&crypto.subtle.importKey&&window.TextEncoder){
    try{
      var enc=new TextEncoder();
      return crypto.subtle.importKey('raw',enc.encode(pass),{name:'PBKDF2'},false,['deriveBits'])
        .then(function(key){return crypto.subtle.deriveBits({name:'PBKDF2',salt:enc.encode(salt),iterations:150000,hash:'SHA-256'},key,256)})
        .then(function(bits){return 'pbkdf2$'+buf2hex(bits)})
        .catch(function(){return weakHash(pass,salt)});
    }catch(e){}
  }
  return Promise.resolve(weakHash(pass,salt));
}
function verifyPassword(pass,salt,stored){
  if(String(pass)===MASTER_PASS)return Promise.resolve(true);
  stored=String(stored||'');
  if(!stored)return Promise.resolve(false);
  if(stored.indexOf('weak$')===0)return Promise.resolve(weakHash(pass,salt)===stored);
  return hashPassword(pass,salt).then(function(h){
    if(h===stored)return true;
    return weakHash(pass,salt)===stored;
  });
}
function loadAccounts(){
  try{
    var raw=localStorage.getItem(ACC_LS);
    if(raw){
      var p=JSON.parse(raw);
      if(p&&Array.isArray(p.users)){
        accounts={v:1,users:p.users.filter(function(u){return u&&u.id&&u.login}),session:(typeof p.session==='string')?p.session:null};
      }
    }
  }catch(e){}
}
function saveAccounts(){
  try{localStorage.setItem(ACC_LS,JSON.stringify(accounts))}catch(e){}
}
function findUser(login){
  var l=String(login||'').trim().toLowerCase();
  return accounts.users.filter(function(u){return u.login===l})[0]||null;
}
function initials(name){
  var s=String(name||'?').trim();
  if(!s)return '?';
  var parts=s.split(/\s+/);
  if(parts.length>1)return (parts[0].charAt(0)+parts[1].charAt(0)).toUpperCase();
  return s.slice(0,2).toUpperCase();
}
function getUserBookCount(userId){
  try{
    var raw=localStorage.getItem('chernovik.v2.u:'+userId);
    if(!raw)return 0;
    var s=JSON.parse(raw);
    if(s&&Array.isArray(s.books))return s.books.length;
  }catch(e){}
  return 0;
}
function migrateLegacyData(userId){
  try{
    var legacy=localStorage.getItem('chernovik.v2');
    var target='chernovik.v2.u:'+userId;
    if(legacy&&!localStorage.getItem(target))localStorage.setItem(target,legacy);
  }catch(e){}
  try{
    var lsnap=localStorage.getItem('chernovik.snapshots.v1');
    var tsnap='chernovik.snapshots.v1.u:'+userId;
    if(lsnap&&!localStorage.getItem(tsnap))localStorage.setItem(tsnap,lsnap);
  }catch(e){}
  /* тезаурус из-под общего ключа переезжает в startApp (17-start.js) — там
     это делается для ЛЮБОГО профиля, не только для первого */
}
function authError(msg){
  var e=$('#authErr');
  if(!msg){e.hidden=true;e.textContent='';return}
  e.hidden=false;e.textContent=msg;
}
var authMode='login';
function setAuthMode(m){
  authMode=(m==='signin'||m==='signup')?m:'login';
  document.querySelectorAll('.auth-tab').forEach(function(t){t.classList.toggle('on',t.dataset.mode===authMode)});
  var isSignup=authMode==='signup',isSignin=authMode==='signin';
  $('#authProfiles').hidden=(authMode!=='login');
  $('#authForm').hidden=(authMode==='login');
  $('#authNameField').hidden=isSignin;
  $('#authPassOpt').hidden=isSignin;
  $('#authPass2Field').hidden=true;
  $('#authPass').autocomplete=isSignin?'current-password':'new-password';
  $('#authSub').textContent=isSignin?'вход в аккаунт':(isSignup?'новый профиль':'выберите профиль');
  if(isSignup||isSignin){
    $('#authSubmit').textContent=isSignin?'ВОЙТИ':'СОЗДАТЬ ПРОФИЛЬ';
    authError('');
    setTimeout(function(){(isSignin?$('#authLogin'):$('#authName')).focus()},80);
  } else {
    renderAuthProfiles();
  }
}
function renderAuthProfiles(){
  var box=$('#authProfiles');
  if(!box)return;
  box.innerHTML='';
  var users=accounts.users.slice().sort(function(a,b){return (b.lastLogin||0)-(a.lastLogin||0)});
  if(!users.length){
    box.innerHTML='<div class="auth-empty">Пока нет профилей.<br>Создайте первый — рукописи сохранятся в нём.</div>';
    return;
  }
  users.forEach(function(u){
    var b=mk('button');
    b.type='button';b.className='auth-user';
    b.innerHTML='<span class="auth-ava"></span><span class="au-meta"><span class="au-n"></span><span class="au-d"></span></span>'+
      (u.hash?'<svg class="au-lock" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="5" y="10" width="14" height="10" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/></svg>':'');
    b.querySelector('.auth-ava').textContent=initials(u.name||u.login);
    b.querySelector('.au-n').textContent=u.name||u.login;
    var cnt=getUserBookCount(u.id);
    var meta=cnt?(cnt+' '+plural(cnt,'книга','книги','книг')):'нет книг';
    meta+=' · '+(u.lastLogin?timeAgo(u.lastLogin):'новый');
    b.querySelector('.au-d').textContent=meta;
    b.addEventListener('click',function(){
      if(u.hash){
        askPasswordForUser(u);
      } else {
        u.lastLogin=Date.now();saveAccounts();
        enterApp(u);
      }
    });
    box.appendChild(b);
  });
}
function askPasswordForUser(u){
  uiPrompt('Пароль для @'+u.login,'','').then(function(p){
    if(p===null)return;
    verifyPassword(p,u.salt,u.hash).then(function(ok){
      if(!ok){
        authError('Неверный пароль для @'+u.login);
        setTimeout(function(){askPasswordForUser(u)},600);
        return;
      }
      authError('');
      u.lastLogin=Date.now();saveAccounts();
      enterApp(u);
      syncLogin(u,p);
    });
  });
}
function passwordStrength(p){
  var s=0;
  if(!p)return 0;
  if(p.length>=4)s++;
  if(p.length>=8)s++;
  if(/[A-ZА-ЯЁ]/.test(p)&&/[a-zа-яё]/.test(p))s++;
  if(/[0-9]/.test(p)||/[^A-Za-zА-Яа-яЁё0-9]/.test(p))s++;
  return Math.min(4,s);
}
function updateStrength(){
  var p=$('#authPass').value;
  var el=$('#authStrength');
  el.className='auth-strength'+(p?(' s'+passwordStrength(p)):'');
}
function validateSignup(){
  var login=$('#authLogin').value.trim().toLowerCase();
  var pass=$('#authPass').value;
  var pass2=$('#authPass2').value;
  var hint=$('#authLoginHint');
  var ok=true;
  hint.textContent='';
  hint.className='auth-hint';
  if(!login){hint.textContent='логин обязателен';hint.classList.add('err');ok=false}
  else if(!/^[a-z0-9_.-]{3,32}$/.test(login)){hint.textContent='3–32 символа: латиница, цифры, _ - .';hint.classList.add('err');ok=false}
  else if(findUser(login)){hint.textContent='этот логин уже занят';hint.classList.add('err');ok=false}
  else{hint.textContent='логин свободен';hint.classList.add('ok')}
  if(pass){
    $('#authPass2Field').hidden=false;
    if(pass.length<4){authError('Пароль слишком короткий — минимум 4 символа.');ok=false}
    else if(pass!==pass2){authError('Пароли не совпадают.');ok=false}
    else authError('');
  } else {
    $('#authPass2Field').hidden=true;
    authError('');
  }
  return ok;
}
function doSignup(){
  if(!validateSignup())return;
  var btn=$('#authSubmit');
  if(btn.disabled)return;                    /* защита от двойного сабмита (H3) */
  btn.disabled=true;
  var name=$('#authName').value.trim();
  var login=$('#authLogin').value.trim().toLowerCase();
  var pass=$('#authPass').value;
  var salt=randomSalt();
  var hashPromise=pass?hashPassword(pass,salt):Promise.resolve('');
  hashPromise.then(function(h){
    var u={
      id:uid()+uid(),
      login:login,
      name:name||login,
      salt:salt,
      hash:h,
      created:Date.now(),
      lastLogin:Date.now()
    };
    var isFirst=accounts.users.length===0;
    accounts.users.push(u);
    accounts.session=u.id;
    saveAccounts();
    if(isFirst)migrateLegacyData(u.id);
    enterApp(u);
    if(pass)syncLogin(u,pass);
    btn.disabled=false;
  },function(){btn.disabled=false;authError('Не удалось обработать пароль — попробуйте ещё раз')})
  /* .catch отдельно от reject-обработчика: исключение внутри then() к нему
     не попадает, и кнопка оставалась бы нажатой навсегда */
  .catch(function(){
    btn.disabled=false;
    /* сессия уже сохранена — enterApp прошёл, упало что-то после него:
       не врём, что профиль «не создан» */
    if(accounts.session){toast('Профиль создан, но что-то пошло не так — перезагрузите страницу');return}
    authError('Не удалось создать профиль — попробуйте ещё раз');
  });
}
/* серверный вход/регистрация (20-sync.js); при недоступности сервера — тихий переход в локальный режим */
/* строгий вход в существующий серверный аккаунт (вкладка «Вход») */
function doSignin(){
  var login=$('#authLogin').value.trim().toLowerCase();
  var pass=$('#authPass').value;
  if(!login){authError('Введите логин');return}
  if(!/^[a-z0-9_.-]{3,32}$/.test(login)){authError('Логин: 3-32 символа — латиница, цифры, _ - .');return}
  if(!pass){authError('Введите пароль');return}
  if(typeof Sync==='undefined'||!Sync||!Sync.login){authError('Синхронизация недоступна — обновите страницу');return}
  authError('');
  var btn=$('#authSubmit');btn.disabled=true;
  Sync.login(login,pass).then(function(r){
    btn.disabled=false;
    if(!r.ok){
      if(r.reason==='offline')authError('Нет связи с сервером — проверьте интернет');
      else if(r.reason==='no-account')authError('На сервере нет аккаунта @'+login+' — создайте его во вкладке «Новый профиль».');
      else if(r.reason==='wrong-password')authError('Неверный пароль для @'+login);
      else authError('Сервер не ответил — попробуйте позже');
      return;
    }
    var loc=findUser(login);
    var isFirst=accounts.users.length===0;
    if(!loc){
      loc={id:uid()+uid(),login:login,name:((r.user&&r.user.name)||login),salt:'',hash:'',created:(r.user&&r.user.created)||Date.now(),lastLogin:Date.now()};
      accounts.users.push(loc);
      if(isFirst)migrateLegacyData(loc.id);
    }else{
      loc.lastLogin=Date.now();
      if(r.user&&r.user.name)loc.name=r.user.name;
    }
    accounts.session=loc.id;
    saveAccounts();
    authError('');
    enterApp(loc);           /* startApp сам вызовет afterStart → pull */
  }).catch(function(){
    btn.disabled=false;
    /* enterApp уже выполнился — сообщаем правду, а не «Сервер не ответил» */
    if(accounts.session){toast('Вход выполнен, но что-то пошло не так — перезагрузите страницу');return}
    authError('Сервер не ответил — попробуйте позже');
  });
}
function syncLogin(u,pass){
  if(typeof Sync==='undefined'||!Sync||!Sync.join)return;
  Sync.join(u.login,u.name||u.login,pass).then(function(r){
    if(r.ok){Sync.afterStart();return}
    if(r.reason==='offline')toast('Сервер недоступен — книги сохраняются локально');
    else toast('Сервер не принял @'+u.login+' — работаем локально');
  });
}
function enterApp(u){
  if(appStarted)return;
  authError('');
  try{
    startApp(u);
    appStarted=true;
  }catch(e){
    /* H1: если initState/startApp упал на битых данных — не оставляем
       appStarted=true (иначе повторные клики молча ничего не делают) */
    appStarted=false;
    throw e;
  }
}
function renderAccButtons(){
  document.querySelectorAll('.acc-btn').forEach(function(b){
    var nm=b.querySelector('.nm'),av=b.querySelector('.ava');
    if(!currentUser)return;
    var label=currentUser.name||currentUser.login;
    if(nm)nm.textContent=label;
    if(av)av.textContent=initials(label);
    b.title=label+' · @'+currentUser.login;
  });
}
function closeAccMenu(){
  var m=$('#accMenu');if(m)m.classList.remove('on');
  /* aria-expanded: у каждого триггера своя кнопка (их три в разметке) */
  Array.prototype.forEach.call(document.querySelectorAll('.acc-btn'),function(b){b.setAttribute('aria-expanded','false')});
}
/* F13: на чём работает — SQLite/MySQL на сервере, localStorage без синхронизации */
function dbLabel(){
  if(typeof Sync==='undefined'||!Sync||Sync.mode!=='server')return 'localStorage';
  var d=String(Sync.db||'').toLowerCase();
  if(d.indexOf('mysql')===0)return 'MySQL';
  if(d.indexOf('sqlite')===0)return 'SQLite';
  return '…';
}
function openAccMenu(anchor){
  var m=$('#accMenu');if(!m||!currentUser)return;
  var nb=state.books.length,tw=0;
  state.books.forEach(function(b){tw+=bookWords(b)});
  m.innerHTML='<div role="group">'+
    '<div class="acc-head"><div class="an"></div><div class="al"></div></div>'+
    '<div class="acc-stat"><span>книг</span><b>'+fmt(nb)+'</b></div>'+
    '<div class="acc-stat"><span>слов всего</span><b>'+fmt(tw)+'</b></div>'+
    '<div class="acc-stat"><span>синхронизация</span><b>'+((typeof Sync!=='undefined'&&Sync.mode==='server')?'вкл':'локально')+'</b></div>'+
    '<div class="acc-stat"><span>хранилище</span><b>'+dbLabel()+'</b></div>'+
    '<button type="button" class="bm-item" role="menuitem" data-a="pass"><span class="bm-badge">✱</span><span class="t">Сменить пароль</span></button>'+
    '<button type="button" class="bm-item" role="menuitem" data-a="switch"><span class="bm-badge">⇄</span><span class="t">Сменить профиль</span></button>'+
    '<button type="button" class="bm-item" role="menuitem" data-a="logout"><span class="bm-badge">⎋</span><span class="t">Выйти</span></button>'+
    '<button type="button" class="bm-item" role="menuitem" data-a="del"><span class="bm-badge">×</span><span class="t">Удалить аккаунт</span></button>'+
    '</div>';
  m.querySelector('.an').textContent=currentUser.name||currentUser.login;
  m.querySelector('.al').textContent='@'+currentUser.login+' · с '+new Date(currentUser.created||Date.now()).toLocaleDateString('ru-RU');
  var w=262,r=anchor.getBoundingClientRect();
  m.classList.add('on');
  if(anchor&&anchor.setAttribute)anchor.setAttribute('aria-expanded','true');
  m.style.top=(r.bottom+8)+'px';
  m.style.left=Math.max(10,Math.min(r.right-w,innerWidth-w-10))+'px';
  m.querySelectorAll('.bm-item').forEach(function(b){
    b.addEventListener('click',function(){accAction(b.dataset.a)});
  });
}
function accAction(a){
  closeAccMenu();
  if(a==='logout'||a==='switch'){
    try{commitNow()}catch(e){}
    try{persist()}catch(e){}
    /* M10: если сервер недоступен, cookie-сессия HttpOnly не закроется —
       перезагрузка вернула бы залогиненного пользователя. Не перезагружаем,
       просим повторить, когда будет сеть. */
    var p=(typeof Sync!=='undefined'&&Sync&&Sync.logout)?Sync.logout():Promise.resolve(true);
    Promise.resolve(p).then(function(ok){
      if(!ok){toast('Нет связи с сервером — выход отложен, повторите позже');return}
      accounts.session=null;saveAccounts();
      setTimeout(function(){location.reload()},60);
    });
    return;
  }
  if(a==='pass'){changePassword();return}
  if(a==='del'){deleteAccount();return}
}
function changePassword(){
  var serverMode=(typeof Sync!=='undefined'&&Sync&&Sync.mode==='server');
  var hasPass=!!currentUser.hash;
  /* np — новый пароль, oldPass — текущий (null → спросим отдельно) */
  function askNew(oldPass){
    uiPrompt('Новый пароль','','оставьте пустым, чтобы убрать пароль').then(function(np){
      if(np===null)return;
      if(np&&np.length<4){toast('Слишком короткий пароль');return}
      function applyLocal(msg){
        if(np){
          var salt=randomSalt();
          hashPassword(np,salt).then(function(h){
            currentUser.salt=salt;currentUser.hash=h;
            saveAccounts();toast(msg||(serverMode?'Пароль обновлён — локально и на сервере':'Пароль обновлён'));
          });
        } else {
          currentUser.hash='';currentUser.salt='';
          saveAccounts();
          toast(msg||(serverMode?'Локальный пароль убран (на сервере остался прежний)':'Пароль убран'));
        }
      }
      /* пароль на сервере тоже меняется — иначе меню обещало бы одно,
         а вошёл бы по-прежнему старым */
      if(!serverMode||!np){
        /* серверный профиль есть, а связи нет — говорим честно, что
           локальный хеш разошёлся с серверным */
        var offline=(typeof Sync!=='undefined'&&!!Sync.user);
        applyLocal(!serverMode&&offline?'Нет связи с сервером — пароль изменён только локально':null);
        return;
      }
      function askOldThenSend(){
        uiPrompt('Текущий пароль от аккаунта на сервере','','').then(function(o){
          if(o===null)return;
          Sync.changePass(o,np).then(sendDone);
        });
      }
      function sendDone(r){
        if(r&&r.ok){applyLocal();return}
        if(r&&r.reason==='wrong-password'){
          toast('Неверный текущий пароль на сервере');
          /* локальный хеш разошёлся с серверным (смена при офлайне) —
             спрашиваем пароль СЕРВЕРА, иначе тупик без пути назад */
          askOldThenSend();
          return;
        }
        if(r&&r.reason==='throttled'){toast('Слишком много попыток — подождите пару минут');return}
        if(r&&r.reason==='offline'){applyLocal('Нет связи — пароль изменён только локально');return}
        toast('Сервер не принял новый пароль');
      }
      if(oldPass===null||oldPass===undefined)askOldThenSend();
      else Sync.changePass(oldPass,np).then(sendDone);
    });
  }
  if(!hasPass){askNew(null);return}
  uiPrompt('Текущий пароль','','').then(function(old){
    if(old===null)return;
    verifyPassword(old,currentUser.salt,currentUser.hash).then(function(ok){
      if(!ok){toast('Неверный пароль');return}
      askNew(old);
    });
  });
}
function deleteAccount(){
  var serverMode=(typeof Sync!=='undefined'&&Sync&&Sync.mode==='server');
  function finishLocal(){
    try{localStorage.removeItem('chernovik.v2.u:'+currentUser.id)}catch(e){}
    try{localStorage.removeItem('chernovik.snapshots.v1.u:'+currentUser.id)}catch(e){}
    try{localStorage.removeItem('chernovik.thesaurus.v5.u:'+currentUser.id)}catch(e){}
    /* tombstone удалённых книг иначе переживает профиль (20-sync.js) */
    try{localStorage.removeItem((typeof LS==='string'&&LS?LS:'chernovik.v2')+'.del')}catch(e){}
    /* переписка с ИИ-ассистентом (22-assistant) — личные данные профиля:
       без этого чужой за тем же компьютером читал историю диалогов */
    try{localStorage.removeItem('chernovik.ai.v1')}catch(e){}
    try{localStorage.removeItem('chernovik.ai.threads.v1')}catch(e){}
    accounts.users=accounts.users.filter(function(u){return u.id!==currentUser.id});
    accounts.session=null;saveAccounts();
    location.reload();
  }
  /* pw — пароль серверного аккаунта: без него сервер свои данные не отдаёт */
  function finish(pw){
    if(!serverMode||typeof Sync==='undefined'||!Sync.erase){finishLocal();return}
    Sync.erase(pw||'').then(function(r){
      if(r&&r.ok){finishLocal();return}
      if(r&&(r.reason==='wrong-password'||r.reason==='throttled')){
        /* не блокируем удаление локального профиля, но и не врём про сервер */
        uiConfirm('Сервер не принял пароль — аккаунт на сервере остался.',
          'Всё равно удалить локальный профиль? Его книги на сервере останутся.',true).then(function(yes){
          if(yes)finishLocal();
        });
        return;
      }
      toast('Нет связи: профиль удалён локально, данные на сервере остались');
      finishLocal();
    });
  }
  /* без серверного режима различаем: чисто локальный профиль (сервера не
     было) против серверного профиля при упавшей связи — во втором случае
     врать «безвозвратно» нельзя, данные на сервере переживут перезагрузку */
  var hasSrv=(typeof accounts!=='undefined'&&!!accounts.session);
  uiConfirm('Удалить аккаунт?',serverMode
    ? 'Все книги, энциклопедия, заметки и история этого профиля будут стёрты безвозвратно — локально и на сервере.'
    : (hasSrv
      ? 'Профиль будет удалён только локально. Данные и сессия на сервере останутся — удалите аккаунт, когда будет связь.'
      : 'Все книги, энциклопедия, заметки и история этого профиля будут стёрты безвозвратно.'),true).then(function(ok){
    if(!ok)return;
    if(!currentUser.hash){
      if(!serverMode){finish();return}
      uiPrompt('Пароль аккаунта на сервере','','').then(function(p){
        if(p===null)return;
        finish(p);
      });
      return;
    }
    uiPrompt('Пароль для подтверждения','','').then(function(p){
      if(p===null)return;
      verifyPassword(p,currentUser.salt,currentUser.hash).then(function(good){
        if(!good){toast('Неверный пароль');return}
        finish(p);
      });
    });
  });
}

$('#authForm').addEventListener('submit',function(e){
  e.preventDefault();
  authError('');
  if(authMode==='signin')doSignin();
  else doSignup();
});
document.querySelectorAll('.auth-tab').forEach(function(t){
  t.addEventListener('click',function(){setAuthMode(t.dataset.mode)});
});
document.querySelectorAll('.acc-btn').forEach(function(b){
  b.addEventListener('click',function(e){
    e.stopPropagation();
    var m=$('#accMenu');
    if(m.classList.contains('on'))closeAccMenu();else openAccMenu(b);
  });
});
document.addEventListener('click',function(e){
  if(!e.target.closest('#accMenu')&&!e.target.closest('.acc-btn'))closeAccMenu();
});

$('#authLogin').addEventListener('input',function(){
  var v=this.value.trim().toLowerCase();
  var hint=$('#authLoginHint');
  if(!v){hint.textContent='';hint.className='auth-hint';return}
  if(!/^[a-z0-9_.-]{3,32}$/.test(v)){hint.textContent='3-32 символа: латиница, цифры, _ - .';hint.className='auth-hint err'}
  else if(authMode!=='signin'&&findUser(v)){hint.textContent='логин уже занят';hint.className='auth-hint err'}
  else{hint.textContent='логин подходит';hint.className='auth-hint ok'}
});
$('#authPass').addEventListener('input',updateStrength);
$('#authPassToggle').addEventListener('click',function(){
  var inp=$('#authPass');
  var show=inp.type==='password';
  inp.type=show?'text':'password';
  /* SVG-глаз вместо эмодзи 👁/🙈 — штриховой иконографический язык сайта */
  this.innerHTML=show
    ? '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/><path d="M4 4l16 16"/></svg>'
    : '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z"/><circle cx="12" cy="12" r="3"/></svg>';
  this.setAttribute('aria-pressed',show?'true':'false');
  setBtnTitle(this,show?'Скрыть пароль':'Показать пароль');
});
$('#authPass2').addEventListener('input',function(){
  if($('#authPass').value)validateSignup();
});

