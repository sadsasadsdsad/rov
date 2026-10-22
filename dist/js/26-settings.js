/* ==========================================================================
 * 26-settings.js — МЕНЮ НАСТРОЕК (Motion Slide Menu по образцу unlumen-ui)
 * Проект: «Черновик» — веб-редактор рукописей. ES5, без сборщика.
 * Что делает: аккаунт-кнопка (.acc-btn) открывает многоуровневое меню
 *   #slideMenu — уровень уезжает влево на 60%, новый въезжает справа с
 *   лёгким подъёмом (пружина — как у Motion Tabs Menu); шапка уровня —
 *   «морф» выбранного пункта: фиксированный слот, иконка кроссфейдится
 *   в шеврон «назад». Корень: Профиль → / Настройки → / Резервная копия /
 *   Восстановить (кнопки переехали из шапки — обработчики в 15-editor.js
 *   висят на id #btnBackup/#btnRestore, меню просто кликает по ним).
 *   Уровень «Профиль»: имя, @логин, счётчики (книг/слов/синхронизация/
 *   хранилище) и действия аккаунта (accAction из 16-accounts.js).
 *   Уровень «Настройки»: сегмент «Модалки» (маленькие/большие —
 *   body[data-msize] включает широкие карточки в 13-ui.css), сегмент
 *   «Тема» (light/sepia/dark — setTheme из 15-editor.js), ползунок
 *   «Сила блюра» (токен --modal-blur, 0–30px). Настройки хранятся
 *   отдельным ключом localStorage chernovik.ui.v1 и применяются
 *   при загрузке — до первого открытия модалки, без мигания.
 *   Клавиатура: ←/Escape — назад, Tab — по пунктам; вне клик закрывает;
 *   prefers-reduced-motion оставляет только смену состояний.
 * Ключевое: smToggle, smOpen, smClose, smNav, smBack, uiPref,
 *   uiApplyPrefs, window.smToggle (его ждёт слушатель 16-accounts.js).
 * Зависимости: 01-core ($, mk), 15-editor (setTheme), 16-accounts
 *   (accAction, currentUser), 04-state (state, bookWords, fmt).
 * ========================================================================== */
var UI_PREF_KEY='chernovik.ui.v1';
var uiPrefs={modalSize:'small',blur:16};
try{
  var raw=localStorage.getItem(UI_PREF_KEY);
  if(raw){var p=JSON.parse(raw);if(p&&typeof p==='object'){
    if(p.modalSize==='large'||p.modalSize==='small')uiPrefs.modalSize=p.modalSize;
    if(typeof p.blur==='number'&&p.blur>=0&&p.blur<=30)uiPrefs.blur=Math.round(p.blur);
  }}
}catch(e){}
function uiSavePrefs(){try{localStorage.setItem(UI_PREF_KEY,JSON.stringify(uiPrefs))}catch(e){}}
function uiPref(k,v){
  uiPrefs[k]=v;uiSavePrefs();uiApplyPrefs();
}
function uiApplyPrefs(){
  document.documentElement.style.setProperty('--modal-blur',uiPrefs.blur+'px');
  document.body.setAttribute('data-msize',uiPrefs.modalSize);
}

/* ── иконки (плотные штрихи 1.7, как в остальной шапке) ─────────────────── */
var SM_ICONS={
  profile:'<path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  gear:'<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1A1.6 1.6 0 0 0 9 19.4a1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1A1.6 1.6 0 0 0 4.6 9a1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  down:'<path d="M12 4v9m0 0 3.5-3.5M12 13 8.5 9.5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  up:'<path d="M12 13V4m0 0 3.5 3.5M12 4 8.5 7.5"/><path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15"/>',
  news:'<rect x="4" y="5" width="16" height="14" rx="1.5"/><path d="M8 9h6M8 13h8M8 17h5"/>',
  key:'<circle cx="8" cy="14" r="3.5"/><path d="m11 11 8-8m-2 2 2 2m-5 1 2 2"/>',
  swap:'<path d="M4 8h13m0 0-3.5-3.5M17 8l-3.5 3.5"/><path d="M20 16H7m0 0 3.5-3.5M7 16l3.5 3.5"/>',
  logout:'<path d="M9 4H5.5A1.5 1.5 0 0 0 4 5.5v13A1.5 1.5 0 0 0 5.5 20H9"/><path d="M14 8.5 17.5 12 14 15.5M17.5 12H9"/>',
  trash:'<path d="M5 7h14M9.5 7V5h5v2M6.5 7l.8 12.1A1.5 1.5 0 0 0 8.8 20.5h6.4a1.5 1.5 0 0 0 1.5-1.4L17.5 7"/><path d="M10.5 11v6M13.5 11v6"/>'
};
function smSvg(name){
  return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">'+(SM_ICONS[name]||'')+'</svg>';
}
function smItem(opts){
  /* opts: {a:действие, icon, label, ch(шеврон), danger} */
  return '<button type="button" class="sm-item'+(opts.danger?' danger':'')+'" role="menuitem" data-a="'+opts.a+'">'+
    '<span class="ic">'+smSvg(opts.icon)+'</span><span class="t">'+opts.label+'</span>'+
    (opts.ch?'<span class="ch" aria-hidden="true">›</span>':'')+'</button>';
}

/* ── уровни меню ─────────────────────────────────────────────────────────── */
function smLevelRoot(){
  return smItem({a:'nav:profile',icon:'profile',label:'Профиль',ch:1})+
    smItem({a:'nav:settings',icon:'gear',label:'Настройки',ch:1})+
    smItem({a:'news',icon:'news',label:'Журнал и статьи'})+
    '<div class="sm-sep"></div>'+
    smItem({a:'backup',icon:'down',label:'Резервная копия'})+
    smItem({a:'restore',icon:'up',label:'Восстановить'});
}
function smLevelProfile(){
  if(typeof currentUser==='undefined'||!currentUser)return smLevelRoot();
  var nb=state.books.length,tw=0;
  state.books.forEach(function(b){tw+=bookWords(b)});
  return '<div class="sm-prof"><div class="nm"></div><div class="lg"></div></div>'+
    '<div class="sm-stats"><span>книг <b>'+fmt(nb)+'</b></span><span>слов <b>'+fmt(tw)+'</b></span>'+
    '<span>синхронизация <b>'+((typeof Sync!=='undefined'&&Sync.mode==='server')?'вкл':'локально')+'</b></span>'+
    '<span>хранилище <b>'+dbLabel()+'</b></span></div>'+
    smItem({a:'acc:pass',icon:'key',label:'Сменить пароль'})+
    smItem({a:'acc:switch',icon:'swap',label:'Сменить профиль'})+
    smItem({a:'acc:logout',icon:'logout',label:'Выйти'})+
    smItem({a:'acc:del',icon:'trash',label:'Удалить аккаунт',danger:1});
}
function smSeg(id,active,variants){
  var h='<span class="sm-seg" role="group" data-seg="'+id+'">';
  variants.forEach(function(v){
    h+='<button type="button" data-v="'+v[0]+'"'+(v[0]===active?' class="on"':'')+'>'+v[1]+'</button>';
  });
  return h+'</span>';
}
function smLevelSettings(){
  var theme=(document.documentElement.dataset.theme||'dark');
  return '<div class="sm-set"><span class="lb">Модалки по умолчанию</span>'+
      smSeg('modalSize',uiPrefs.modalSize,[['small','мал.'],['large','больш.']])+'</div>'+
    '<div class="sm-sep"></div>'+
    '<div class="sm-set"><span class="lb">Тема</span>'+
      smSeg('theme',theme,[['light','день'],['sepia','сепия'],['dark','ночь']])+'</div>'+
    '<div class="sm-sep"></div>'+
    '<div class="sm-set"><span class="lb">Сила блюра фона</span></div>'+
    '<div class="sm-range"><input type="range" min="0" max="30" step="1" value="'+uiPrefs.blur+'" aria-label="Сила блюра фона модалок, px"><output>'+uiPrefs.blur+' px</output></div>';
}
var SM_LEVELS={
  root:{title:'',build:smLevelRoot},
  profile:{title:'Профиль',build:smLevelProfile},
  settings:{title:'Настройки',build:smLevelSettings}
};

/* ── навигация уровнями (слайд 60% + подъём) ─────────────────────────────── */
var smMenu=$('#slideMenu'),smTrigger=null,smStack=['root'],smAnim=null;
function smRender(name){
  var lv=document.createElement('div');
  lv.className='sm-level';
  lv.innerHTML=SM_LEVELS[name].build();
  lv.dataset.level=name;
  if(name==='profile'){
    var nm=lv.querySelector('.nm'),lg=lv.querySelector('.lg');
    if(nm)nm.textContent=currentUser.name||currentUser.login;
    if(lg)lg.textContent='@'+currentUser.login+' · с '+new Date(currentUser.created||Date.now()).toLocaleDateString('ru-RU');
  }
  lv.querySelectorAll('[data-a]').forEach(function(b){
    b.addEventListener('click',function(){smAct(b.dataset.a)});
  });
  var seg=lv.querySelector('[data-seg="modalSize"]');
  if(seg)seg.querySelectorAll('button').forEach(function(b){
    b.addEventListener('click',function(){
      uiPref('modalSize',b.dataset.v);
      seg.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===b)});
    });
  });
  var sth=lv.querySelector('[data-seg="theme"]');
  if(sth)sth.querySelectorAll('button').forEach(function(b){
    b.addEventListener('click',function(){
      if(typeof setTheme==='function')setTheme(b.dataset.v);
      sth.querySelectorAll('button').forEach(function(x){x.classList.toggle('on',x===b)});
    });
  });
  var rng=lv.querySelector('.sm-range input');
  if(rng)rng.addEventListener('input',function(){
    var out=lv.querySelector('.sm-range output');
    uiPref('blur',parseInt(rng.value,10)||0);
    if(out)out.value=uiPrefs.blur+' px';
  });
  return lv;
}
function smSetHeight(el){
  var body=smMenu.querySelector('.sm-body');
  body.style.height=el.offsetHeight+'px';
}
function smNav(name,dir){
  if(!smMenu)return;
  var body=smMenu.querySelector('.sm-body');
  var old=body.querySelector('.sm-level:not(.sl-abs)');
  var lv=smRender(name);
  if(!old||window.matchMedia('(prefers-reduced-motion:reduce)').matches){
    body.innerHTML='';body.appendChild(lv);body.style.height='';
    smMenu.dataset.depth=name==='root'?'0':'1';
    smSetTitle(SM_LEVELS[name].title);
    return;
  }
  lv.classList.add('sl-abs','sl-'+(dir==='back'?'back':'fwd')+'-in');
  body.appendChild(lv);
  old.classList.add('sl-abs','sl-'+(dir==='back'?'back':'fwd')+'-out');
  smSetHeight(lv);
  smMenu.dataset.depth=name==='root'?'0':'1';
  smSetTitle(SM_LEVELS[name].title);
  clearTimeout(smAnim);
  smAnim=setTimeout(function(){
    if(old&&old.parentNode)old.parentNode.removeChild(old);
    lv.classList.remove('sl-abs','sl-fwd-in','sl-back-in');
    if(body.contains(lv))body.style.height='';
  },300);
}
function smSetTitle(t){
  var el=smMenu.querySelector('.sm-title');
  if(el)el.textContent=t||'';
}
function smAct(a){
  if(a.indexOf('nav:')===0){smStack.push(a.slice(4));smNav(a.slice(4),'fwd');return}
  if(a.indexOf('acc:')===0){
    /* accAction сам закрывает меню — через closeAccMenu, он безвреден тут */
    if(typeof accAction==='function')accAction(a.slice(4));
    smClose();
    return;
  }
  if(a==='news'){smClose();if(typeof openNews==='function')openNews('updates');return}
  if(a==='backup'){var b=$('#btnBackup');if(b)b.click();smClose();return}
  if(a==='restore'){var r=$('#btnRestore');if(r)r.click();smClose();return}
}
function smBack(){
  if(smStack.length<=1){smClose();return}
  smStack.pop();
  smNav(smStack[smStack.length-1],'back');
}
function smOpen(anchor){
  smTrigger=anchor||null;
  smStack=['root'];
  var body=smMenu.querySelector('.sm-body');
  body.innerHTML='';
  body.appendChild(smRender('root'));
  body.style.height='';
  smMenu.dataset.depth='0';
  smSetTitle('');
  smMenu.classList.add('on');
  /* подсказка от нажатой кнопки (data-ftip) нависала бы над пунктами */
  if(typeof uiTip!=='undefined'&&uiTip&&uiTip.hide)uiTip.hide();
  /* панель — под нажатой кнопкой, прижата к её правому краю */
  if(smTrigger&&smTrigger.getBoundingClientRect){
    var r=smTrigger.getBoundingClientRect(),w=300;
    var top=r.bottom+8;
    var maxTop=innerHeight-smMenu.offsetHeight-10;
    smMenu.style.top=Math.max(10,Math.min(top,maxTop))+'px';
    smMenu.style.left=Math.max(10,Math.min(r.right-w,innerWidth-w-10))+'px';
  }
  document.querySelectorAll('.acc-btn').forEach(function(b){
    b.setAttribute('aria-expanded',b===smTrigger?'true':'false');
  });
  var first=smMenu.querySelector('.sm-item');
  if(first)first.focus();
}
function smClose(){
  if(!smMenu)return;
  smMenu.classList.remove('on');
  smMenu.dataset.depth='0';
  document.querySelectorAll('.acc-btn').forEach(function(b){b.setAttribute('aria-expanded','false')});
  if(smTrigger&&smTrigger.focus)smTrigger.focus();
  smTrigger=null;smStack=['root'];
}
function smToggle(anchor){
  if(!smMenu)return;
  if(smMenu.classList.contains('on')&&smTrigger===anchor){smClose();return}
  smOpen(anchor);
}

/* ── события ─────────────────────────────────────────────────────────────── */
var smBackBtn=smMenu?smMenu.querySelector('.sm-back'):null;
if(smBackBtn)smBackBtn.addEventListener('click',function(e){
  e.stopPropagation();smBack();
});
document.addEventListener('mousedown',function(e){
  if(!smMenu||!smMenu.classList.contains('on'))return;
  if(e.target.closest('#slideMenu')||e.target.closest('.acc-btn'))return;
  smClose();
});
document.addEventListener('keydown',function(e){
  if(!smMenu||!smMenu.classList.contains('on'))return;
  if(e.key==='Escape'||e.key==='ArrowLeft'){e.preventDefault();smBack()}
});
/* панель прижата к кнопке — на скролле/ресайзе убираем, чтобы не висела */
document.addEventListener('scroll',function(){
  if(smMenu&&smMenu.classList.contains('on'))smClose();
},true);

uiApplyPrefs();
