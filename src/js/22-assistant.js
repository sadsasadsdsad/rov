/* ==========================================================================
 * 22-assistant.js — ИИ-ассистент — чат по книге + исправление/улучшение
 *   выделенного текста. Проект: «Черновик» — веб-редактор рукописей.
 * Что делает: кнопки «Спросить ИИ» (.ai-open — #aiFab в #topbar редактора
 *   на месте «Все заметки» и #aiFabLib в шапке библиотеки; пилюля .ai-tb
 *   с точкой связи) открывают панель чата (#aiPanel)
 *   с контекстом текущей книги/главы и живого выделения; кнопки .sb-ai в
 *   #selbar («Испр.»/«Улуч.») прогоняют выделение через модель и показывают
 *   результат в #aiResModal («Применить» подменяет выделение с сохранением
 *   абзацев, заголовков и инлайн-форматирования). Модель умеет создавать
 *   книги и главы: попросите словами или чипом «＋ Новая книга» — она
 *   ответит JSON-действием (create_book / create_chapter / replace_chapter),
 *   лента покажет карточку с планом, а по кнопке действие исполнится
 *   (см. aiTryAction/aiRunAction).
 * Ключевое: по умолчанию ходит через свой сервер — /api/ai.php (релей в
 *   src/api/ai.php), который сам идёт в прокси deepseek-web2api на сервере
 *   (127.0.0.1:8080) с ключом, лежащим там же. Работает с любого устройства
 *   и без ключей у читателя. Если в настройках задан свой адрес (base) —
 *   ходит напрямую в локальный прокси с CORS (режим разработки): адрес, ключ
 *   и модель лежат в localStorage (AI_LS).
 * Отказы (5xx/429/обрыв сети): в ленте «DeepSeek временно недоступен» с
 *   кнопкой «Повторить» и автоповтором через минуту — см. aiRetryable/aiMaybeRetry.
 * Зависимости: 01-core ($, mk, esc, editor, workspace, isReader, isReadOnly),
 *   04-state-seed (book, currentCh, chapterTitle, isNotesCh, editorOwned),
 *   15-editor (toast, captureSelectionRange, replaceSelectionWith,
 *   activeSelRange, updateStats, scheduleSave, refreshFloats). Маркеры уже в
 *   index.html; файл подключается последним (после 21-shared).
 * ========================================================================== */
"use strict";

/* ── Конфигурация ──────────────────────────────────────────────────────── */
var AI_LS='chernovik.ai.v1';
var aiCfg={base:'',key:'',model:'deepseek-chat'}; /* base='' → релей /api/ai.php */
var aiHist=[];                 /* [{role,content,think?}] — история чата */
var aiBusy=false;              /* идёт ли генерация */
var aiAbort=null;              /* AbortController текущего запроса */
var aiErrMsg='';               /* текст последней ошибки в ленте */
var aiResult={src:'',out:'',apply:false};
var aiCtxTimer=0;
var aiRetryTimer=0;            /* автоповтор вопроса после недоступности */
var aiRetryPending=false;      /* показывать кнопку «Повторить» в ленте */
var aiRetried=false;           /* автоповтор уже срабатывал на эту ошибку */
var aiPingTimer=0;             /* автоперепроверка связи, когда ИИ лёг */
var aiLastKind='';             /* последний режим правки (fix|improve) */
var aiLastBtn=null;            /* кнопка, запустившая правку (для busy) */

/* Версия разметки, под которую написан этот файл (см. ?v=.. в index.html) и
   адрес, с которого файл загрузился. Нужно, чтобы заметить устаревший
   index.html в кэше браузера (без Cache-Control браузер держит его по
   эвристике): ассеты подгружаются свежие, а разметка — прошлая, и панель ИИ
   в ней просто отсутствует. document.currentScript живёт только во время
   выполнения скрипта, поэтому значение фиксируем здесь, сразу. */
var AI_HTML_V='07';
var AI_SRC=(typeof document!=='undefined'&&document.currentScript&&document.currentScript.src)||'';

function aiEl(id){return document.getElementById(id)}
/* Все кнопки открытия панели: #aiFab (в #topbar редактора) и
   #aiFabLib (в шапке библиотеки); устаревшая разметка содержит только
   #aiFab (плавающая пилюля) — она тоже попадает в список */
function aiFabs(){
  var out=[],ids=['aiFab','aiFabLib'];
  for(var i=0;i<ids.length;i++){
    var el=aiEl(ids[i]);
    if(el)out.push(el);
  }
  return out;
}
function aiBase(){return String(aiCfg.base||'').replace(/\/+$/,'')}
/* base пусто → через свой сервер (/api/ai.php, ключ не нужен, любой девайс);
   иначе — напрямую в заданный прокси (локальная разработка, ключ обязателен) */
function aiOwnProxy(){return !!aiCfg.base}
function aiUrl(kind){
  if(aiOwnProxy())return aiBase()+(kind==='chat'?'/v1/chat/completions':'/v1/models');
  return '/api/ai.php?action='+kind;
}

function aiLoadCfg(){
  try{
    var raw=localStorage.getItem(AI_LS);
    if(!raw)return;
    var j=JSON.parse(raw);
    if(!j||typeof j!=='object')return;
    if(typeof j.base==='string'&&j.base)aiCfg.base=j.base;
    if(typeof j.key==='string')aiCfg.key=j.key;
    if(typeof j.model==='string'&&j.model)aiCfg.model=j.model;
  }catch(e){}
}
function aiSaveCfg(){try{localStorage.setItem(AI_LS,JSON.stringify(aiCfg))}catch(e){}}

function aiHeaders(){
  var h={'Content-Type':'application/json'};
  if(aiOwnProxy())h['Authorization']='Bearer '+aiCfg.key; /* ключ — только при своём прокси */
  return h;
}
function aiCut(s,n){s=String(s==null?'':s);return s.length>n?s.slice(0,n)+' …':s}

/* ── Контекст книги/выделения ──────────────────────────────────────────── */
function aiBookTitle(){try{var b=book();return b?String(b.title||''):''}catch(e){return ''}}
function aiChTitle(){
  try{
    var c=currentCh();
    if(!c)return '';
    if(typeof isNotesCh==='function'&&isNotesCh(c))return 'Заметки';
    return chapterTitle(c);
  }catch(e){return ''}
}
function aiChText(){
  var t='';
  try{
    var inEditor=(typeof editorOwned!=='undefined')&&editorOwned&&editor&&editor.innerText;
    if(inEditor&&typeof workspace!=='undefined'&&!workspace.hidden){
      t=editor.innerText||'';
    }else{
      var c=currentCh();
      if(c)t=tmp(c.html).textContent||'';
    }
  }catch(e){}
  return String(t).replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').trim();
}
function aiSelection(){
  try{return String(getSelection()||'').replace(/\s+/g,' ').trim()}catch(e){return ''}
}
/* То же выделение, но с сохранением абзацов — для «Испр./Улуч.»: иначе
   модель не видит разбивку и не может её сохранить */
function aiSelectionRaw(){
  try{
    return String(getSelection()||'')
      .replace(/\u00a0/g,' ')
      .replace(/[ \t]+\n/g,'\n')
      .replace(/\n{3,}/g,'\n\n')
      .replace(/^\s+|\s+$/g,'');
  }catch(e){return ''}
}

/* Системный промпт: книга + глава + её текст + опциональное выделение */
function aiSystemPrompt(extra){
  var s='Ты — ассистент в приложении «Черновик» (чтение и правка рукописей).';
  var title=aiBookTitle(), ch=aiChTitle();
  if(title)s+='\nКнига: «'+title+'».'+(ch?'\nТекущая глава: «'+ch+'».':'');
  var txt=aiChText();
  if(txt)s+='\n\nТекущий текст главы (может быть обрезан):\n"""\n'+aiCut(txt,9000)+'\n"""';
  if(extra)s+='\n\n'+extra;
  /* Действия: модель сама создаёт книги/главы — отвечает JSON, лента
     рисует карточку с планом, исполняет пользователь по кнопке */
  s+='\n\nДействия. Если тебя прямо просят создать книгу, написать новую главу или переписать текущую — ответь ТОЛЬКО одним JSON-объектом, без пояснений и без ``` :'+
     '\n{"action":"create_book","title":"Название книги","chapters":[{"title":"Заголовок главы","content":"2–5 абзацев, разделённых пустой строкой, до 800 знаков"}]} — 3–8 глав;'+
     '\n{"action":"create_chapter","title":"Заголовок","content":"текст главы до 6000 знаков, абзацы через пустую строку"};'+
     '\n{"action":"replace_chapter","title":"Заголовок","content":"новый текст главы до 6000 знаков"}.'+
     '\ncontent — простой текст без HTML и markdown; заголовок в content не включай. Если не просят создать или переписать — отвечай обычным текстом.';
  s+='\n\nОтвечай по-русски, по существу, без воды. Если вопрос о конкретном месте — процитируй его.';
  return s;
}

/* ── HTTP ──────────────────────────────────────────────────────────────── */
/* ms<=0 — без таймаута (для потоковых ответов) */
function aiFetch(url,opts,ms){
  var ctrl=new AbortController();
  var timer=ms>0?setTimeout(function(){try{ctrl.abort()}catch(e){}},ms):0;
  opts=opts||{};opts.signal=ctrl.signal;
  return fetch(url,opts).then(function(r){
    if(timer)clearTimeout(timer);
    return r;
  },function(e){
    if(timer)clearTimeout(timer);
    throw e;
  });
}

/* Разбор SSE-потока OpenAI-совместимого ответа; emit(text,isThink) */
function aiReadSSE(body,emit){
  var dec=new TextDecoder(),buf='';
  var reader=body.getReader();
  function handleLine(l){
    l=l.trim();
    if(!l||l.indexOf('data:')!==0)return;
    var payload=l.slice(5).trim();
    if(!payload||payload==='[DONE]')return;
    try{
      var o=JSON.parse(payload);
      var c=o.choices&&o.choices[0];
      if(!c)return;
      var d=c.delta||c.message||{};
      if(typeof d.reasoning_content==='string'&&d.reasoning_content){
        emit(d.reasoning_content,true);return;
      }
      if(typeof d.content==='string'&&d.content)emit(d.content,false);
    }catch(e){}
  }
  function pump(){
    return reader.read().then(function(r){
      if(r.done){
        if(buf.trim())handleLine(buf.trim());
        return;
      }
      buf+=dec.decode(r.value,{stream:true});
      var lines=buf.split(/\r?\n/);
      buf=lines.pop();
      lines.forEach(handleLine);
      return pump();
    });
  }
  return pump();
}

/* Стрим-запрос в чат. onDelta(text,isThink), onDone(full), onErr(err) */
function aiRequest(messages,onDelta,onDone,onErr){
  var ctrl=new AbortController();
  aiAbort=ctrl;
  var full='';
  aiFetch(aiUrl('chat'),{
    method:'POST',headers:aiHeaders(),
    body:JSON.stringify({model:aiCfg.model,messages:messages,stream:true})
  },0).then(function(res){
    if(!res.ok){
      return res.text().then(function(t){
        var e=new Error('HTTP '+res.status+': '+aiCut(t.replace(/\s+/g,' '),240));
        e.status=res.status;               /* фронт различает «ИИ лёг» и прочее */
        throw e;
      });
    }
    if(!res.body)throw new Error('Браузер не поддерживает потоковый ответ');
    return aiReadSSE(res.body,function(t,isThink){
      full+=t;
      onDelta(t,isThink);
    });
  }).then(function(){
    aiAbort=null;
    onDone(full);
  }).catch(function(e){
    aiAbort=null;
    onErr(e);                                /* AbortError обрабатывает вызывающий */
  });
}

/* Обычный (не-стрим) запрос → очищенный текст ответа */
function aiComplete(messages){
  return aiFetch(aiUrl('chat'),{
    method:'POST',headers:aiHeaders(),
    body:JSON.stringify({model:aiCfg.model,messages:messages,stream:false})
  },150000).then(function(res){
    if(!res.ok){
      return res.text().then(function(t){
        var e=new Error('HTTP '+res.status+': '+aiCut(t.replace(/\s+/g,' '),240));
        e.status=res.status;               /* фронт различает «ИИ лёг» и прочее */
        throw e;
      });
    }
    return res.json();
  }).then(function(j){
    var m=j&&j.choices&&j.choices[0]&&j.choices[0].message;
    return aiCleanOut(m?m.content:'');
  }).catch(function(e){
    /* таймаут aiFetch рвёт запрос через AbortError — говорим человечески */
    if(e&&e.name==='AbortError')throw new Error('модель не ответила за 150 с — попробуйте ещё раз');
    throw e;
  });
}

/* Модель иногда заворачивает результат в ``` или кавычки — снимаем */
function aiCleanOut(t){
  t=String(t==null?'':t).trim();
  t=t.replace(/^```[a-z]*\s*/i,'').replace(/\s*```$/,'').trim();
  if(t.length>2){
    var pairs=[['«','»'],['"','"'],['“','”']];
    for(var i=0;i<pairs.length;i++){
      if(t.charAt(0)===pairs[i][0]&&t.charAt(t.length-1)===pairs[i][1]){
        t=t.slice(1,-1).trim();break;
      }
    }
  }
  return t;
}

/* ── Индикаторы в шапке панели ─────────────────────────────────────────── */
function aiPing(){
  var st=aiEl('aiStatus');
  if(!st)return Promise.resolve(false);
  var txt=st.querySelector('.txt');
  if(txt)txt.textContent='Проверяю связь с ИИ…';
  st.classList.remove('err');
  return aiFetch(aiUrl('models'),{headers:aiHeaders(),method:'GET'},6000)
    .then(function(r){return {ok:r.ok,status:r.status}})
    .catch(function(){return {ok:false,status:0}})
    .then(function(s){
      var el=aiEl('aiStatus');
      if(el){
        var t=el.querySelector('.txt');
        var msg;
        if(s.ok)msg='DeepSeek на связи'+(aiOwnProxy()?' (свой прокси)':' (через сайт)');
        else if(s.status===401||s.status===403)msg=aiOwnProxy()?'Нужен API-ключ — настройки ⚙':'Доступ к ИИ запрещён';
        else if(s.status===404)msg='Эндпоинт ИИ не найден — обновите сайт';
        else if(s.status===429)msg='Слишком много запросов — минуту и снова';
        else if(s.status>=500)msg='DeepSeek временно недоступен — проверим через минуту';
        else if(s.status)msg='Запрос отклонён (HTTP '+s.status+')';
        else msg='Сервер не отвечает';
        if(t)t.textContent=msg;
        el.classList.toggle('err',!s.ok);
      }
      aiRenderCtx();
      /* индикатор связи на кнопках открытия (.ai-open) */
      aiFabs().forEach(function(f){f.classList.toggle('ok',!!s.ok);f.classList.toggle('err',!s.ok)});
      if(s.ok){
        if(aiPingTimer){clearTimeout(aiPingTimer);aiPingTimer=0}
      }else if(!aiPingTimer){
        aiPingTimer=setTimeout(function(){aiPingTimer=0;aiPing()},60000); /* ИИ лёг — перепроверим сами */
      }
      return s.ok;
    });
}

/* Строка контекста: глава + выделение (живое, по selectionchange) */
function aiRenderCtx(){
  var el=aiEl('aiCtx');
  if(!el)return;
  var ch=aiChTitle(), sel=aiSelection(), parts=[];
  if(ch)parts.push('глава «'+aiCut(ch,26)+'»');
  if(sel)parts.push('выделено '+sel.length+' зн.');
  el.textContent=parts.length?('Контекст: '+parts.join(' · ')):'Контекст: вся глава';
}

/* ── Панель чата ───────────────────────────────────────────────────────── */
function aiOpenPanel(){
  var p=aiEl('aiPanel');
  if(!p)return;
  p.classList.add('on');
  aiFabs().forEach(function(f){f.setAttribute('aria-expanded','true')});
  aiRender();aiRenderCtx();aiSyncLink();aiPing();
  setTimeout(function(){var i=aiEl('aiInput');if(i&&!aiBusy)i.focus()},60);
}
function aiClosePanel(){
  var p=aiEl('aiPanel');
  if(p)p.classList.remove('on');
  aiFabs().forEach(function(f){f.setAttribute('aria-expanded','false')});
}
/* ссылка «Панель прокси ↗» есть только у своего прокси (на сервере её нет) */
function aiSyncLink(){
  var a=aiEl('aiPanelLink');
  if(!a)return;
  if(!aiOwnProxy()){a.hidden=true;return}
  a.hidden=false;
  a.href=aiBase()+'/webui/';
}
function aiTogglePanel(){
  var p=aiEl('aiPanel');
  if(!p)return;
  if(p.classList.contains('on'))aiClosePanel();else aiOpenPanel();
}
function aiToggleSettings(){
  var s=aiEl('aiSet');
  if(!s)return;
  s.hidden=!s.hidden;
  var g=aiEl('aiGear');
  if(g)g.setAttribute('aria-expanded',String(!s.hidden));
  if(!s.hidden){
    aiEl('aiBase').value=aiCfg.base;
    aiEl('aiKey').value=aiCfg.key;
    aiEl('aiModel').value=aiCfg.model;
    aiEl('aiBase').focus();
  }
}
function aiSaveSettings(){
  var b=String(aiEl('aiBase').value||'').trim().replace(/\/+$/,'');
  if(b&&!/^https?:\/\//i.test(b))b='http://'+b;   /* пусто = релей сайта */
  aiCfg.base=b;
  aiCfg.key=String(aiEl('aiKey').value||'').trim();
  aiCfg.model=String(aiEl('aiModel').value||'deepseek-chat');
  aiSaveCfg();
  aiEl('aiSet').hidden=true;
  aiSyncLink();
  aiPing();
}

/* Рендер ленты (innerHTML + esc — как в остальных модулях) */
function aiRender(){
  var box=aiEl('aiMsgs');
  if(!box)return;
  var pinned=(box.scrollHeight-box.scrollTop-box.clientHeight)<48;
  var h='';
  if(!aiHist.length){
    h+='<div class="ai-empty"><b>ИИ-ассистент</b>Спросите что угодно по текущей книге — '+
       'контекст главы подхватится сам. Выделенный фрагмент тоже попадёт в запрос.</div>';
  }else{
    aiHist.forEach(function(m,i){
      if(m.think){
        h+='<div class="ai-think"><b>Рассуждение</b>'+esc(aiCut(m.think,1200))+'</div>';
      }
      if(m.role==='user'){
        h+='<div class="ai-msg user">'+esc(m.content)+'</div>';
      }else{
        /* модель в потоке пишет JSON-действие — прячем его за статусом */
        var pend=!m.action&&aiBusy&&aiLooksAction(m.content);
        var txt=m.content||(aiBusy?'…':'(пустой ответ)');
        if(pend)txt='ИИ готовит структуру…';
        h+='<div class="ai-msg bot'+(!m.content||pend?' empty':'')+'">'+esc(txt)+'</div>';
        if(m.action)h+=aiActCard(m.action,i);
      }
    });
  }
  if(aiErrMsg)h+='<div class="ai-err"><span>'+esc(aiErrMsg)+'</span>'+
    (aiRetryPending?'<button class="retry" type="button" data-airetry="1">ПОВТОРИТЬ</button>':'')+'</div>';
  box.innerHTML=h;
  if(pinned)box.scrollTop=box.scrollHeight;
}
function aiShowErr(e){
  aiErrMsg='Не получилось: '+(e&&e.message?e.message:String(e));
  aiRetryPending=false;
  aiRender();
}

/* ── Отправка сообщения ────────────────────────────────────────────────── */
function aiSendMsg(){
  if(aiBusy){aiStop();return}
  var inp=aiEl('aiInput');
  var q=String(inp&&inp.value||'').trim();
  if(!q)return;
  aiAsk(q,false);
}

/* isRetry=true — повтор после недоступности ИИ: вопрос уже в истории,
   не дублируем его и не трогаем поле ввода */
function aiAsk(q,isRetry){
  if(aiOwnProxy()&&!aiCfg.key){
    if(aiEl('aiSet')&&aiEl('aiSet').hidden)aiToggleSettings();
    aiShowErr(new Error('укажите API-ключ прокси (⚙ настройки)'));
    return;
  }
  aiErrMsg='';aiRetryPending=false;
  if(!isRetry){
    aiRetried=false;
    if(aiRetryTimer){clearTimeout(aiRetryTimer);aiRetryTimer=0}
  }
  var sel=isRetry?'':aiSelection();   /* выделение к моменту повтора могло сняться */
  var sys=aiSystemPrompt(sel?('\nВыделенный фрагмент (учти в ответе):\n«'+aiCut(sel,4000)+'»'):'' );

  var last=aiHist[aiHist.length-1];
  var inHist=isRetry&&last&&last.role==='user'&&last.content===q;
  var hist=aiHist.slice();
  if(inHist)hist.pop();               /* последний user-q добавим сами ниже */

  var apiMsgs=[{role:'system',content:sys}];
  hist.slice(-12).forEach(function(m){     /* think в API не отправляем */
    apiMsgs.push({role:m.role,content:m.content});
  });
  apiMsgs.push({role:'user',content:q});

  if(!inHist)aiHist.push({role:'user',content:q});
  var ass={role:'assistant',content:'',think:''};
  aiHist.push(ass);
  aiBusy=true;
  var inp=aiEl('aiInput');
  if(inp&&!isRetry){inp.value='';inp.style.height='auto'}
  aiSetBusy(true);
  aiRender();

  aiRequest(apiMsgs,
    function(t,isThink){
      if(isThink)ass.think+=t;else ass.content+=t;
      aiRender();
    },
    function(){
      aiBusy=false;aiSetBusy(false);
      if(!ass.content)ass.content=ass.think?'(без текста — см. рассуждение выше)':'(пустой ответ)';
      aiTryAction(ass);                     /* вдруг модель прислала действие */
      aiRetried=false;aiRetryPending=false;
      aiRender();
    },
    function(e){
      aiBusy=false;aiSetBusy(false);
      if(e&&e.name==='AbortError'){           /* «Стоп» — не ошибка */
        if(!ass.content)ass.content='(остановлено)';
        aiRender();return;
      }
      aiHist.pop();                           /* убираем пустого ассистента */
      aiShowErr(e);
      aiMaybeRetry(q,e);
    });
}
function aiSetBusy(b){
  var btn=aiEl('aiSend');
  if(btn){
    btn.classList.toggle('busy',!!b);
    btn.title=b?'Остановить генерацию':'Отправить (Enter)';
  }
}
function aiStop(){if(aiAbort){try{aiAbort.abort()}catch(e){}}}
function aiClearHist(){
  aiStop();
  aiHist=[];aiBusy=false;aiErrMsg='';aiSetBusy(false);
  aiRetryPending=false;aiRetried=false;
  if(aiRetryTimer){clearTimeout(aiRetryTimer);aiRetryTimer=0}
  aiRender();
}

/* ── Недоступность ИИ: «Повторить» + автоповтор через минуту ───────────── */
function aiRetryable(e){
  var st=e&&e.status;
  if(!st)return true;                 /* сеть/релей не ответил — стоит повторить */
  return st===429||st>=500;
}
function aiMaybeRetry(q,e){
  if(!aiRetryable(e))return;
  aiErrMsg='DeepSeek временно недоступен — повторим через минуту';
  aiRetryPending=true;
  aiRender();
  if(aiRetried)return;                /* только одна автопопытка подряд */
  aiRetried=true;
  if(aiRetryTimer)clearTimeout(aiRetryTimer);
  aiRetryTimer=setTimeout(function(){
    aiRetryTimer=0;
    if(aiBusy)return;
    var last=aiHist[aiHist.length-1];
    if(last&&last.role==='user'&&last.content===q)aiAsk(q,true);
  },60000);
}
function aiRetryNow(){
  if(aiBusy)return;
  if(aiRetryTimer){clearTimeout(aiRetryTimer);aiRetryTimer=0}
  var last=aiHist[aiHist.length-1];
  if(last&&last.role==='user')aiAsk(last.content,true);
}

/* ── Действия ИИ: модель создаёт книги и главы по JSON-плану ───────────── */
/* Модель отвечает JSON-объектом (см. блок «Действия» в aiSystemPrompt);
   в ленте рисуется карточка с планом, а книга/глава создаётся по кнопке —
   пользователь всегда видит, что именно будет создано. */

function aiLooksAction(s){
  s=String(s==null?'':s);
  if(!/^\s*(\{|```)/.test(s))return false;
  return s.indexOf('"action"')>=0;
}
/* Поиск парной скобки с учётом строк — JSON может быть длинным и содержать } */
function aiMatchBrace(s,i){
  var depth=0,inStr=false,escd=false;
  for(var k=i;k<s.length;k++){
    var c=s.charAt(k);
    if(inStr){
      if(escd)escd=false;
      else if(c==='\\')escd=true;
      else if(c==='"')inStr=false;
      continue;
    }
    if(c==='"')inStr=true;
    else if(c==='{')depth++;
    else if(c==='}'){depth--;if(depth===0)return k}
  }
  return -1;
}
function aiStr(v,n){
  var s=String(v==null?'':v).replace(/^\s+/,'').replace(/\s+$/,'');
  return s.length>n?s.slice(0,n):s;
}
function aiValidateAction(o){
  if(!o||typeof o!=='object'||typeof o.action!=='string')return null;
  if(o.action==='create_book'){
    var title=aiStr(o.title,200);
    if(!title||!Array.isArray(o.chapters))return null;
    var chs=[];
    for(var i=0;i<o.chapters.length&&chs.length<40;i++){
      var c=o.chapters[i];
      if(!c||typeof c!=='object')continue;
      var ct=aiStr(c.title,200);
      if(!ct)continue;
      chs.push({title:ct,content:aiStr(c.content,40000)});
    }
    if(!chs.length)return null;
    return {action:'create_book',title:title,chapters:chs};
  }
  if(o.action==='create_chapter'||o.action==='replace_chapter'){
    var content=aiStr(o.content,40000);
    if(!content)return null;
    return {action:o.action,title:aiStr(o.title,200),content:content};
  }
  return null;
}
/* JSON из ответа: ```json-фенсы и текст вокруг — не помеха */
function aiExtractAction(text){
  var t=String(text==null?'':text);
  var fence=t.match(/```(?:json)?\s*([\s\S]*?)```/);
  if(fence)t=fence[1];
  else{
    var i=t.indexOf('{');
    if(i<0)return null;
    var j=aiMatchBrace(t,i);
    if(j<0)return null;
    t=t.slice(i,j+1);
  }
  t=t.replace(/^\s+|\s+$/g,'');
  var o;
  try{o=JSON.parse(t)}
  catch(e){
    /* модели бывают ленивы и вставляют «сырой» перевод строки внутрь
       JSON-строки — чиним управляющие символы только внутри кавычек */
    try{o=JSON.parse(aiJsonFix(t))}catch(e2){return null}
  }
  return aiValidateAction(o);
}
function aiJsonFix(t){
  var out='',inStr=false,escd=false;
  for(var i=0;i<t.length;i++){
    var c=t.charAt(i);
    if(inStr){
      if(escd)escd=false;
      else if(c==='\\')escd=true;
      else if(c==='"')inStr=false;
      else if(c==='\n'){out+='\\n';continue}
      else if(c==='\r'){out+='\\r';continue}
      else if(c==='\t'){out+='\\t';continue}
    }else if(c==='"')inStr=true;
    out+=c;
  }
  return out;
}
function aiActionSummary(p){
  if(p.action==='create_book'){
    /* названия глав уходят в историю API — иначе в следующем вопросе
       модель придумывает их заново */
    var names=p.chapters.slice(0,10).map(function(c){
      return '«'+aiCut(c.title,40)+'»';
    }).join(', ');
    if(p.chapters.length>10)names+='…';
    return 'Структура книги «'+aiCut(p.title,70)+'» готова — '+
      p.chapters.length+' '+plural(p.chapters.length,'глава','главы','глав')+
      ': '+names+'. Нажмите «Создать книгу», чтобы добавить её в библиотеку.';
  }
  if(p.action==='create_chapter'){
    return 'Новая глава «'+aiCut(p.title||'Без названия',70)+'» готова — '+
      fmt(countWords(p.content))+' слов. Нажмите «Добавить главу».';
  }
  return 'Новый вариант главы «'+aiCut(p.title||'Без названия',70)+'» готов — '+
    fmt(countWords(p.content))+' слов. Нажмите «Заменить главу», чтобы применить.';
}
function aiActCard(a,i){
  if(!a||!a.plan)return '';
  if(a.done)return '<div class="ai-act done">✓ '+esc(a.done)+'</div>';
  var p=a.plan;
  var head=p.action==='create_book'?'Новая книга'
    :p.action==='create_chapter'?'Новая глава':'Переписанная глава';
  var h='<div class="ai-act"><div class="ai-act-h">'+esc(head)+'</div>';
  var note='';
  if(p.action==='create_book'){
    h+='<ol class="ai-act-list">';
    p.chapters.forEach(function(c){h+='<li>'+esc(c.title)+'</li>'});
    h+='</ol>';
    note=p.chapters.length+' · '+
      fmt(countWords(p.chapters.map(function(c){return c.content}).join(' ')))+' слов';
  }else{
    h+='<div class="ai-act-prev">'+esc(aiCut(p.content,500))+'</div>';
    note=fmt(countWords(p.content))+' слов';
  }
  var go=p.action==='create_book'?'Создать книгу'
    :p.action==='create_chapter'?'Добавить главу':'Заменить главу';
  h+='<div class="ai-act-foot"><span class="note">'+esc(note)+'</span>'+
     '<button class="go" type="button" data-aiact="'+i+'">'+esc(go)+'</button></div></div>';
  return h;
}
/* Завершённый ответ: распознаём действие и подменяем текст резюме */
function aiTryAction(m){
  if(!m||m.role!=='assistant'||!m.content||m.action)return;
  var looks=aiLooksAction(m.content);
  if(!looks&&m.content.indexOf('{')<0)return;
  var plan=aiExtractAction(m.content);
  if(plan){
    m.action={plan:plan,done:''};
    m.content=aiActionSummary(plan);
  }else if(looks){
    m.content=aiCut(m.content,600)+'\n\n(структура не разобралась — попросите ещё раз)';
  }
}

/* Markdown-обвязка — на случай если модель всё же её прислала */
function aiStripMd(s){
  return String(s==null?'':s)
    .replace(/^\s{0,3}#{1,6}[ \t]+/,'')
    .replace(/\*\*([^*]+)\*\*/g,'$1')
    .replace(/__([^_]+)__/g,'$1')
    .replace(/^\s*[-*][ \t]+/,'')
    .replace(/^\s+/,'').replace(/\s+$/,'');
}
/* Разбивка текста на абзацы: пустая строка, иначе перевод строки */
function aiSplitParas(t,sep){
  return String(t==null?'':t).replace(/\r/g,'').split(sep)
    .map(function(s){
      return s.replace(/[ \t]*\n[ \t]*/g,' ').replace(/[ \t]{2,}/g,' ')
              .replace(/^\s+/,'').replace(/\s+$/,'');
    })
    .filter(function(s){return s.length>0});
}
function aiParasAny(t){
  var a=aiSplitParas(t,/\n{2,}/);
  return a.length>1?a:aiSplitParas(t,/\n/);
}
/* Абзацы ровно n — иначе null (вызывающий решает, что делать) */
function aiParasFor(out,n){
  var a=aiSplitParas(out,/\n{2,}/);
  if(a.length===n)return a;
  var b=aiSplitParas(out,/\n/);
  if(b.length===n)return b;
  if(n===1)return [String(out==null?'':out).replace(/\s+/g,' ').replace(/^\s+|\s+$/g,'')];
  return null;
}
/* Глава в формате приложения: <h1>заголовок</h1> + <p>абзацы</p> */
function aiChapterHtml(title,content){
  var ps=aiParasAny(content);
  var h='<h1>'+esc(aiStripMd(title||'Без названия'))+'</h1>';
  if(!ps.length)h+='<p></p>';
  ps.forEach(function(p){h+='<p>'+esc(aiStripMd(p))+'</p>'});
  return h;
}

function aiCreateBook(p){
  if(typeof state==='undefined'||!state)throw new Error('сначала войдите в профиль');
  if(isReadOnly())throw new Error('сейчас открыт чужой файл — действие недоступно');
  var chapters=p.chapters.map(function(c){
    return {id:uid(),html:aiChapterHtml(c.title,c.content),pos:0,marks:[]};
  });
  if(!chapters.length)chapters.push({id:uid(),html:aiChapterHtml(p.title,''),pos:0,marks:[]});
  var first=chapters[0];
  /* служебные главы — как в обычной книге (createBook в 15-editor) */
  chapters.push({id:uid(),html:pamatkaHtml(),pos:0,marks:[]});
  chapters.push({id:uid(),kind:'notes',html:notesChapterHtml(),pos:0,marks:[]});
  var b={
    id:uid(),title:p.title,
    color:COLORS[state.books.length%COLORS.length],
    updated:Date.now(),
    chapters:chapters,current:first.id,customTypes:[],wiki:[]
  };
  state.books.push(b);state.activeBookId=b.id;persist();invalidateCo();
  enterEditor(first.id);
  return 'Книга «'+aiCut(p.title,60)+'» создана — '+
    p.chapters.length+' '+plural(p.chapters.length,'глава','главы','глав');
}
function aiCreateChapter(p){
  if(typeof state==='undefined'||!state)throw new Error('сначала войдите в профиль');
  if(isReadOnly())throw new Error('нельзя менять чужую книгу');
  var b=book();if(!b)throw new Error('сначала откройте книгу');
  var title=p.title||'Без названия';
  var n={id:uid(),html:aiChapterHtml(title,p.content),pos:0,marks:[]};
  b.chapters.push(n);
  b.updated=Date.now();                 /* структурная правка должна уехать на сервер */
  persist();
  enterEditor(n.id);
  return 'Глава «'+aiCut(title,60)+'» добавлена в книгу «'+aiCut(b.title||'Без названия',40)+'»';
}
function aiReplaceChapter(p){
  if(typeof state==='undefined'||!state)throw new Error('сначала войдите в профиль');
  if(isReadOnly())throw new Error('нельзя менять чужую книгу');
  var b=book();if(!b)throw new Error('сначала откройте книгу');
  var ch=currentCh();if(!ch)throw new Error('нет текущей главы');
  if(isNotesCh(ch))throw new Error('глава «Заметки» — служебная, заменять нельзя');
  if(typeof isPamatka==='function'&&isPamatka(ch))throw new Error('глава «Памятка» — заменять нельзя');
  var title=p.title||chapterTitle(ch);
  ch.html=aiChapterHtml(title,p.content);
  ch.pos=0;
  b.updated=Date.now();
  /* та же глава: DOM просто перечитывается из ch.html (без save поверх) */
  loadChapter(ch);
  renderList(false);updateCrumb();updateStats();
  if(typeof selbar!=='undefined'&&selbar)selbar.classList.remove('on');
  if(typeof hideSynbar==='function')hideSynbar();
  persist();
  return 'Глава «'+aiCut(title,60)+'» заменена';
}
function aiRunAction(idx){
  var m=aiHist[idx];
  if(!m||!m.action||m.action.done)return;
  if(aiBusy){toast('Дождитесь ответа ИИ');return}
  var p=m.action.plan,done='',err='';
  try{
    if(p.action==='create_book')done=aiCreateBook(p);
    else if(p.action==='create_chapter')done=aiCreateChapter(p);
    else if(p.action==='replace_chapter')done=aiReplaceChapter(p);
    else err='неизвестное действие';
  }catch(ex){err=String(ex&&ex.message?ex.message:ex)}
  if(err){toast(err);return}
  m.action.done=done;
  aiRender();
  toast(done);
}

/* ── Исправить / улучшить выделение ────────────────────────────────────── */
function aiTransform(kind,btn){
  if(aiBusy)return;
  /* с абзацами — иначе модель не видит разбивку и не может её сохранить */
  var src=aiSelectionRaw()||aiSelection();
  if(!src){toast('Сначала выделите текст');return}
  if(aiOwnProxy()&&!aiCfg.key){
    aiOpenPanel();
    if(aiEl('aiSet')&&aiEl('aiSet').hidden)aiToggleSettings();
    toast('Укажите API-ключ прокси');
    return;
  }
  if(btn)btn.classList.add('busy');

  /* фиксируем Range ДО ухода фокуса в модалку — replaceSelectionWith
     использует сохранённый activeSelRange из 15-editor */
  aiResult.apply=captureSelectionRange();
  aiResult.src=src;
  aiResult.out='';
  aiResult.token=(aiResult.token||0)+1;   /* ответ устаревшей правки не примем */
  aiLastKind=kind;aiLastBtn=btn;
  aiShowRes(kind);
  aiTransformRun(kind);
}

/* Общий прогон запроса — его же дёргает «ПОВТОРИТЬ» в модалке после сбоя */
function aiTransformRun(kind){
  var btn=aiLastBtn;
  var tok=aiResult.token;
  var src=aiResult.src;
  /* общее требование: структура входа = структура выхода */
  var keep='Разбивку на абзацы и заголовки сохрани ровно как во входе (то же число абзацев, тот же порядок); символы-разделители (✦, ✎), цитаты и кавычки-«ёлочки» не трогай; никакого markdown, списков и эмодзи.';
  var prompt=kind==='fix'
    ? 'Ты — вычитчик русского текста. Исправь только орфографические, пунктуационные и грамматические ошибки. Ничего не переписывай: сохраняй формулировки, стиль, объём, язык, имена, цифры и разбивку на абзацы. Фрагмент может начинаться с середины предложения — не меняй регистр первой буквы (не делай её заглавной, если в оригинале строчная) и не добавляй его в кавычки. Не добавляй пояснений и заголовков. Ответь только исправленным текстом. Если ошибок нет — верни фрагмент дословно, без единого изменения. '+keep
    : 'Ты — редактор русского текста. Улучши текст, сохранив смысл, объём (±10%), язык и авторский голос: сделай фразы яснее, убери повторы и канцелярит, оживи стиль — но не добавляй новых фактов, цифр, эмодзи и штампов («играет важную роль», «стоит отметить», «в мире» и подобных). Не превращай разговорный текст в официальный и не выравнивай его в «красивый» шаблон. Не добавляй пояснений и заголовков. Фрагмент может начинаться с середины предложения — не меняй регистр первой буквы и не добавляй финальную точку, если её не было. Ответь только готовым текстом. '+keep;

  aiComplete([
    {role:'system',content:prompt},
    {role:'user',content:src}
  ]).then(function(out){
    if(tok!==aiResult.token){            /* пользователь уже начал новую правку */
      if(btn&&btn!==aiLastBtn)btn.classList.remove('busy');
      return;
    }
    if(btn)btn.classList.remove('busy');
    if(!out)throw new Error('пустой ответ модели');
    aiResult.out=out;
    aiFillRes();
  }).catch(function(e){
    if(tok!==aiResult.token){
      if(btn&&btn!==aiLastBtn)btn.classList.remove('busy');
      return;
    }
    if(btn)btn.classList.remove('busy');
    aiResFail(e);
  });
}

function aiShowRes(kind){
  var m=aiEl('aiResModal');
  if(!m)return;
  aiEl('aiResTitle').textContent=kind==='fix'?'Исправлено ИИ':'Улучшено ИИ';
  var out=aiEl('aiResOut');
  out.style.color='';                         /* сброс после прошлой ошибки */
  out.classList.add('loading');
  out.innerHTML='<span class="ai-res-spin"></span>Модель обрабатывает текст…';
  aiEl('aiResApply').hidden=!aiResult.apply;
  aiEl('aiResNote').textContent=aiResult.apply
    ? '«Применить» заменит выделенный фрагмент'
    : 'Текст вне редактора — доступно только копирование';
  aiEl('aiResCopy').disabled=true;
  aiEl('aiResApply').disabled=true;
  aiEl('aiResRetry').hidden=true;
  aiEl('aiResSrc').textContent=aiResult.src;
  m.classList.add('on');
}
function aiFillRes(){
  var out=aiEl('aiResOut');
  if(!out)return;
  out.classList.remove('loading');
  out.textContent=aiResult.out;
  aiEl('aiResCopy').disabled=false;
  aiEl('aiResApply').disabled=!aiResult.apply;
  aiEl('aiResRetry').hidden=true;
}
function aiResFail(e){
  var out=aiEl('aiResOut');
  if(!out)return;
  out.classList.remove('loading');
  out.style.color='var(--accent)';
  var retry=aiEl('aiResRetry');
  var again=aiRetryable(e);
  if(retry)retry.hidden=!again;
  out.textContent=again
    ? 'DeepSeek временно недоступен — попробуйте ещё раз'
    : 'Не получилось: '+(e&&e.message?e.message:String(e));
}
function aiCloseRes(){
  var m=aiEl('aiResModal');
  if(m)m.classList.remove('on');
}
function aiCopyRes(){
  if(!aiResult.out)return;
  if(navigator.clipboard&&navigator.clipboard.writeText){
    navigator.clipboard.writeText(aiResult.out).then(
      function(){toast('Скопировано')},
      function(){toast('Не удалось скопировать')}
    );
  }else toast('Браузер не даёт скопировать');
}
/* ── Применение результата: сохраняем абзацы, заголовки и форматирование ─ */
/* Стратегия: модель отдаёт текст с той же разбивкой, что и вход. Мы
   сопоставляем абзацы с блоками выделения и подменяем текст ПО МЕСТУ —
   теги <h1>/<b>/<i> и не тронутая часть абзаца остаются на месте. Любая
   нестыковка → запасной путь replaceSelectionWith (как раньше). */

function aiCaretAt(el){                            /* каретка в конец блока */
  try{
    var r=document.createRange();
    r.selectNodeContents(el);r.collapse(false);
    var s=getSelection();s.removeAllRanges();s.addRange(r);
  }catch(e){}
}
function aiCaretPos(node,pos){                     /* каретка в позицию узла */
  try{
    var r=document.createRange();
    r.setStart(node,Math.min(pos,node.data.length));r.collapse(true);
    var s=getSelection();s.removeAllRanges();s.addRange(r);
  }catch(e){}
}
function aiNodeWords(node,from,to){                /* слова куска узла [from,to) */
  var re=/\S+/g,s=node.data.slice(from,to),m,spans=[];
  while((m=re.exec(s)))spans.push({node:node,from:from+m.index,to:from+m.index+m[0].length});
  return spans;
}
function aiTextNodeWords(el){
  var spans=[],w,n;
  try{w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null)}catch(e){return spans}
  while((n=w.nextNode()))spans=spans.concat(aiNodeWords(n,0,n.data.length));
  return spans;
}
/* Подмена слов по месту: теги и форматирование остаются как были.
   false — слов поровну нет; иначе {node,pos} — конец последнего слова */
function aiPatchSpans(spans,words){
  if(!words||!spans.length||spans.length!==words.length)return false;
  var last=null;
  for(var i=spans.length-1;i>=0;i--){             /* с конца — сдвиги не мешают */
    var sp=spans[i],w=words[i],d=sp.node.data;
    if(d.slice(sp.from,sp.to)!==w)sp.node.data=d.slice(0,sp.from)+w+d.slice(sp.to);
    if(!last)last={node:sp.node,pos:sp.from+w.length};
  }
  return last;
}
function aiRangeTextNodes(range){                 /* текстовые узлы внутри Range */
  var root=range.commonAncestorContainer;
  if(root.nodeType===3)root=root.parentNode;
  var res=[],w,n;
  if(!root)return res;
  try{w=document.createTreeWalker(root,NodeFilter.SHOW_TEXT,null)}catch(e){return res}
  while((n=w.nextNode())){
    var inside=true;
    try{if(range.intersectsNode)inside=range.intersectsNode(n)}catch(e){}
    if(!inside)continue;
    var from=(n===range.startContainer)?range.startOffset:0;
    var to=(n===range.endContainer)?range.endOffset:n.data.length;
    if(to>from)res.push({node:n,from:from,to:to});
  }
  return res;
}
function aiPatchRangeWords(range,out){
  var words=String(out==null?'':out).match(/\S+/g);
  var nodes=aiRangeTextNodes(range);
  if(!words||!nodes.length)return false;
  var spans=[];
  nodes.forEach(function(x){spans=spans.concat(aiNodeWords(x.node,x.from,x.to))});
  return aiPatchSpans(spans,words);
}
function aiInterBlocks(range){                    /* блоки editor, пересекающие Range */
  var res=[],kids;
  try{kids=Array.prototype.slice.call(editor.children||[])}catch(e){return res}
  kids.forEach(function(el){
    var ok=false;
    try{if(range.intersectsNode)ok=range.intersectsNode(el)}catch(e){}
    if(ok)res.push(el);
  });
  return res;
}
function aiEdgeAligned(range,el,which){           /* совпадает ли край Range с краем блока */
  try{
    var r=document.createRange();
    r.selectNodeContents(el);
    return range.compareBoundaryPoints(
      which==='start'?Range.START_TO_START:Range.END_TO_END,r)===0;
  }catch(e){return false}
}
function aiSetText(el,text){                      /* замена содержимого блока */
  text=String(text==null?'':text);
  if(el.textContent===text)return;
  var old=el.textContent.match(/\S+/g)||[];
  var neo=text.match(/\S+/g)||[];
  if(old.length&&old.length===neo.length&&aiPatchSpans(aiTextNodeWords(el),neo))return;
  el.textContent=text;
}
function aiRebuildBlocks(blocks,paras){           /* когда абзацев не хватает/лишние */
  if(!paras.length)return false;
  var i;
  if(paras.length<blocks.length){
    for(i=0;i<paras.length;i++)aiSetText(blocks[i],paras[i]);
    for(i=paras.length;i<blocks.length;i++){
      var b=blocks[i];
      if(b.parentNode)b.parentNode.removeChild(b);
    }
    aiCaretAt(blocks[paras.length-1]);
    return true;
  }
  for(i=0;i<blocks.length;i++)aiSetText(blocks[i],paras[i]);
  var last=blocks[blocks.length-1];
  for(i=blocks.length;i<paras.length;i++){
    var p=mk('p');
    p.textContent=paras[i];
    last.parentNode.insertBefore(p,last.nextSibling);
    last=p;
  }
  aiCaretAt(last);
  return true;
}
/* Выделение начато/кончено внутри крайнего абзаца: режем только выбранную
   часть, заголовки и не тронутый хвост соседа остаются на месте */
function aiSpliceBlocks(range,inter,paras){
  var f=inter[0],l=inter[inter.length-1],last=inter.length-1,i;
  for(i=1;i<last;i++)aiSetText(inter[i],paras[i]);       /* середина — целиком */
  if(aiEdgeAligned(range,f,'start'))aiSetText(f,paras[0]);
  else{
    var s1=document.createRange();
    s1.setStart(range.startContainer,range.startOffset);
    s1.setEnd(f,f.childNodes.length);
    s1.deleteContents();
    f.appendChild(document.createTextNode(paras[0]));
  }
  if(aiEdgeAligned(range,l,'end')){
    aiSetText(l,paras[last]);
    aiCaretAt(l);
  }else{
    var s2=document.createRange();
    s2.setStart(l,0);
    s2.setEnd(range.endContainer,range.endOffset);
    s2.deleteContents();
    var t1=document.createTextNode(paras[last]);
    l.insertBefore(t1,l.firstChild);
    aiCaretPos(t1,t1.data.length);
  }
  return true;
}

function aiApplyRes(){
  var ok=aiResult.apply&&aiResult.out
    &&typeof activeSelRange!=='undefined'&&activeSelRange
    &&activeSelRange.startContainer&&document.contains(activeSelRange.startContainer)
    &&!isReadOnly();
  if(!ok){toast('Выделение устарело — скопируйте текст вручную');return}
  var out=String(aiResult.out).replace(/^\s+/,'').replace(/\s+$/,'');
  if(!out){toast('ИИ вернул пустой текст');return}
  var range=activeSelRange,applied=false;
  try{
    var inter=aiInterBlocks(range);
    if(inter.length>=2){
      var f=inter[0],l=inter[inter.length-1];
      var aligned=aiEdgeAligned(range,f,'start')&&aiEdgeAligned(range,l,'end');
      var paras=aiParasFor(out,inter.length);
      if(aligned&&paras){
        paras.forEach(function(p,i){aiSetText(inter[i],p)});
        aiCaretAt(l);
        applied=true;
      }else if(paras
        &&(aiEdgeAligned(range,f,'start')||f.contains(range.startContainer))
        &&(aiEdgeAligned(range,l,'end')||l.contains(range.endContainer))){
        applied=aiSpliceBlocks(range,inter,paras);
      }else if(aligned){
        applied=aiRebuildBlocks(inter,aiParasAny(out));
      }
    }else{
      /* один блок/внутри абзаца: сначала подмена слов (теги живут)… */
      var patched=aiPatchRangeWords(range,out);
      if(patched){aiCaretPos(patched.node,patched.pos);applied=true}
      else if(inter.length===1
        &&aiEdgeAligned(range,inter[0],'start')&&aiEdgeAligned(range,inter[0],'end')){
        /* …иначе весь блок, если выделен целиком (текст останется в нём) */
        aiSetText(inter[0],(aiParasFor(out,1)||[out])[0]);
        aiCaretAt(inter[0]);
        applied=true;
      }
    }
  }catch(e){applied=false}
  if(applied)activeSelRange=null;
  else replaceSelectionWith(out);                 /* запасной путь — как раньше */
  try{updateStats();scheduleSave();refreshFloats()}catch(e){}
  aiCloseRes();
  toast('Текст заменён');
}

/* ── Инициализация ─────────────────────────────────────────────────────── */
/* Старый index.html в кэше: JS/CSS берутся свежие (адреса те же), а разметка
   — прошлая версия: пилюли/панели может не быть вовсе, и ИИ «просто не
   появляется» без единой ошибки в консоли. Говорим об этом явно. */
function aiCheckHtmlVer(){
  try{
    var m=String(AI_SRC).match(/[?&]v=([\w.-]+)/);
    var v=m?m[1]:'';
    if(v===AI_HTML_V||aiEl('aiStaleBar'))return;
    if(!document.body)return;
    var bar=document.createElement('div');
    bar.id='aiStaleBar';
    bar.setAttribute('role','status');
    bar.style.cssText='position:fixed;top:10px;left:50%;transform:translateX(-50%);z-index:99999;'+
      'display:flex;gap:12px;align-items:center;background:#22242c;color:#f5f5f7;'+
      'border:1px solid #3c3f4b;border-radius:12px;padding:10px 14px;'+
      'font:14px/1.4 -apple-system,system-ui,sans-serif;box-shadow:0 10px 34px rgba(0,0,0,.4)';
    var txt=document.createElement('span');
    txt.textContent='Сайт обновился, а страница в кэше устарела'+
      (v?' (v'+v+' → v'+AI_HTML_V+')':'')+' — обновите её, пожалуйста.';
    var btn=document.createElement('button');
    btn.type='button';
    btn.textContent='Обновить';
    btn.style.cssText='background:#6c8cff;color:#fff;border:0;border-radius:8px;'+
      'padding:7px 14px;font:600 13px -apple-system,system-ui,sans-serif;cursor:pointer';
    btn.addEventListener('click',function(){location.reload()});
    var x=document.createElement('button');
    x.type='button';
    x.textContent='×';
    x.setAttribute('aria-label','Закрыть');
    x.style.cssText='background:none;border:0;color:#9a9daa;font:20px/1 system-ui,sans-serif;'+
      'cursor:pointer;padding:0 2px';
    x.addEventListener('click',function(){if(bar.parentNode)bar.parentNode.removeChild(bar)});
    bar.appendChild(txt);bar.appendChild(btn);bar.appendChild(x);
    document.body.appendChild(bar);
  }catch(e){}
}

function aiInit(){
  aiCheckHtmlVer();
  var fabs=aiFabs();
  if(!fabs.length)return;
  aiLoadCfg();
  aiSyncLink();

  /* .ai-open — общий класс для стилей (индикатор связи); у устаревшей
     разметки (плавающая пилюля) его нет — добавляем сами */
  fabs.forEach(function(f){
    f.classList.add('ai-open');
    f.addEventListener('click',aiTogglePanel);
  });
  aiEl('aiClose').addEventListener('click',aiClosePanel);
  aiEl('aiGear').addEventListener('click',aiToggleSettings);
  aiEl('aiClear').addEventListener('click',aiClearHist);
  aiEl('aiSend').addEventListener('click',aiSendMsg);
  aiEl('aiSave').addEventListener('click',aiSaveSettings);
  /* «Повторить» и кнопки действий (карточки) — делегирование, их рисует aiRender */
  aiEl('aiMsgs').addEventListener('click',function(e){
    if(!e.target||!e.target.closest)return;
    var a=e.target.closest('[data-aiact]');
    if(a){aiRunAction(+a.getAttribute('data-aiact')||0);return}
    if(e.target.closest('[data-airetry]'))aiRetryNow();
  });

  var inp=aiEl('aiInput');
  inp.addEventListener('keydown',function(e){
    /* isComposable/229 — Enter во время ввода через IME не должен отправлять */
    if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){
      e.preventDefault();aiSendMsg();
    }
  });
  inp.addEventListener('input',function(){
    inp.style.height='auto';
    inp.style.height=Math.min(inp.scrollHeight,110)+'px';
  });

  /* быстрые вопросы под лентой */
  Array.prototype.forEach.call(document.querySelectorAll('[data-aiq]'),function(b){
    b.addEventListener('click',function(){
      var i=aiEl('aiInput');
      i.value=b.getAttribute('data-aiq');
      i.dispatchEvent(new Event('input'));
      i.focus();
    });
  });

  /* кнопки ИИ в панели выделения (вне .sb-row — их не трогает 15-editor) */
  Array.prototype.forEach.call(document.querySelectorAll('.sb-ai button'),function(b){
    b.addEventListener('mousedown',function(e){e.preventDefault()});
    b.addEventListener('click',function(){aiTransform(b.getAttribute('data-ai'),b)});
  });

  /* модальный результат */
  aiEl('aiResClose').addEventListener('click',aiCloseRes);
  aiEl('aiResCancel').addEventListener('click',aiCloseRes);
  aiEl('aiResCopy').addEventListener('click',aiCopyRes);
  aiEl('aiResApply').addEventListener('click',aiApplyRes);
  aiEl('aiResRetry').addEventListener('click',function(){   /* после сбоя ИИ */
    if(!aiLastKind)return;
    aiShowRes(aiLastKind);
    aiTransformRun(aiLastKind);
  });
  aiEl('aiResModal').addEventListener('click',function(e){
    if(e.target===this)aiCloseRes();
  });

  /* Esc в фазе захвата: закрываем верхний слой и глушим общую цепочку
     обработчиков 15-editor/14-search (они всплывают по document) */
  document.addEventListener('keydown',function(e){
    if(e.key!=='Escape')return;
    var res=aiEl('aiResModal');
    if(res&&res.classList.contains('on')){
      e.preventDefault();e.stopPropagation();aiCloseRes();return;
    }
    var p=aiEl('aiPanel');
    if(p&&p.classList.contains('on')){
      e.preventDefault();e.stopPropagation();
      if(document.activeElement===aiEl('aiInput'))aiEl('aiInput').blur();
      else aiClosePanel();
    }
  },true);

  /* живой контекст в шапке панели */
  document.addEventListener('selectionchange',function(){
    if(aiCtxTimer)return;
    aiCtxTimer=setTimeout(function(){
      aiCtxTimer=0;
      var p=aiEl('aiPanel');
      if(p&&p.classList.contains('on'))aiRenderCtx();
    },250);
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',aiInit);
else aiInit();
