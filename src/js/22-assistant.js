/* ==========================================================================
 * 22-assistant.js — ИИ-ассистент — чат по книге + исправление/улучшение
 *   выделенного текста. Проект: «Черновик» — веб-редактор рукописей.
 * Что делает: #aiFab открывает панель чата (#aiPanel) с контекстом текущей
 *   книги/главы и живого выделения; кнопки .sb-ai в #selbar («Испр.»/«Улуч.»)
 *   прогоняют выделение через модель и показывают результат в #aiResModal
 *   («Применить» подменяет выделение через replaceSelectionWith).
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

function aiEl(id){return document.getElementById(id)}
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

/* Системный промпт: книга + глава + её текст + опциональное выделение */
function aiSystemPrompt(extra){
  var s='Ты — ассистент в приложении «Черновик» (чтение и правка рукописей).';
  var title=aiBookTitle(), ch=aiChTitle();
  if(title)s+='\nКнига: «'+title+'».'+(ch?'\nТекущая глава: «'+ch+'».':'');
  var txt=aiChText();
  if(txt)s+='\n\nТекущий текст главы (может быть обрезан):\n"""\n'+aiCut(txt,9000)+'\n"""';
  if(extra)s+='\n\n'+extra;
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
  var fab=aiEl('aiFab');
  if(fab)fab.setAttribute('aria-expanded','true');
  aiRender();aiRenderCtx();aiSyncLink();aiPing();
  setTimeout(function(){var i=aiEl('aiInput');if(i&&!aiBusy)i.focus()},60);
}
function aiClosePanel(){
  var p=aiEl('aiPanel');
  if(p)p.classList.remove('on');
  var fab=aiEl('aiFab');
  if(fab)fab.setAttribute('aria-expanded','false');
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
    aiHist.forEach(function(m){
      if(m.think){
        h+='<div class="ai-think"><b>Рассуждение</b>'+esc(aiCut(m.think,1200))+'</div>';
      }
      if(m.role==='user'){
        h+='<div class="ai-msg user">'+esc(m.content)+'</div>';
      }else{
        h+='<div class="ai-msg bot'+(m.content?'':' empty')+'">'+
           esc(m.content||(aiBusy?'…':'(пустой ответ)'))+'</div>';
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

/* ── Исправить / улучшить выделение ────────────────────────────────────── */
function aiTransform(kind,btn){
  if(aiBusy)return;
  var src=aiSelection();
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
  aiLastKind=kind;aiLastBtn=btn;
  aiShowRes(kind);
  aiTransformRun(kind);
}

/* Общий прогон запроса — его же дёргает «ПОВТОРИТЬ» в модалке после сбоя */
function aiTransformRun(kind){
  var btn=aiLastBtn;
  var src=aiResult.src;
  var prompt=kind==='fix'
    ? 'Ты — вычитчик русского текста. Исправь только орфографические, пунктуационные и грамматические ошибки. Ничего не переписывай: сохраняй формулировки, стиль, объём, язык и разбивку на абзацы. Фрагмент может начинаться с середины предложения — не меняй регистр первой буквы (не делай её заглавной, если в оригинале строчная) и не добавляй его в кавычки. Не добавляй пояснений и заголовков. Ответь только исправленным текстом. Если ошибок нет — верни фрагмент дословно, без единого изменения.'
    : 'Ты — редактор русского текста. Улучши текст: сделай его яснее и живее, сохранив смысл, объём, язык и авторский голос. Не меняй факты, имена и разбивку на абзацы. Фрагмент может начинаться с середины предложения — не меняй регистр первой буквы. Не добавляй пояснений и заголовков. Ответь только готовым текстом.';

  aiComplete([
    {role:'system',content:prompt},
    {role:'user',content:src}
  ]).then(function(out){
    if(btn)btn.classList.remove('busy');
    if(!out)throw new Error('пустой ответ модели');
    aiResult.out=out;
    aiFillRes();
  }).catch(function(e){
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
function aiApplyRes(){
  var ok=aiResult.apply&&aiResult.out
    &&typeof activeSelRange!=='undefined'&&activeSelRange
    &&activeSelRange.startContainer&&document.contains(activeSelRange.startContainer)
    &&!isReadOnly();
  if(!ok){toast('Выделение устарело — скопируйте текст вручную');return}
  replaceSelectionWith(aiResult.out);
  try{updateStats();scheduleSave();refreshFloats()}catch(e){}
  aiCloseRes();
  toast('Текст заменён');
}

/* ── Инициализация ─────────────────────────────────────────────────────── */
function aiInit(){
  if(!aiEl('aiFab'))return;
  aiLoadCfg();
  aiSyncLink();

  aiEl('aiFab').addEventListener('click',aiTogglePanel);
  aiEl('aiClose').addEventListener('click',aiClosePanel);
  aiEl('aiGear').addEventListener('click',aiToggleSettings);
  aiEl('aiClear').addEventListener('click',aiClearHist);
  aiEl('aiSend').addEventListener('click',aiSendMsg);
  aiEl('aiSave').addEventListener('click',aiSaveSettings);
  /* «Повторить» в ленте — делегирование, кнопку рисует aiRender */
  aiEl('aiMsgs').addEventListener('click',function(e){
    var b=e.target&&e.target.closest?e.target.closest('[data-airetry]'):null;
    if(b)aiRetryNow();
  });

  var inp=aiEl('aiInput');
  inp.addEventListener('keydown',function(e){
    if(e.key==='Enter'&&!e.shiftKey){e.preventDefault();aiSendMsg()}
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
