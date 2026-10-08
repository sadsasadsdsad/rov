/* ==========================================================================
 * 22-assistant.js — ИИ-ассистент — чат по книге + исправление/улучшение
 *   выделенного текста. Проект: «Черновик» — веб-редактор рукописей.
 * Что делает: кнопки «Спросить ИИ» (.ai-open — #aiFab в #topbar редактора
 *   на месте «Все заметки» и #aiFabLib в шапке библиотеки; обычные
 *   ibtn-иконки-искры без подложки и точки связи) открывают панель
 *   чата (#aiPanel)
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
var AI_TH_LS='chernovik.ai.threads.v1'; /* история диалогов (localStorage) */
var aiCfg={base:'',key:'',model:'deepseek-chat'}; /* base='' → релей /api/ai.php */
var aiThreads=[];               /* [{id,title,ctx,hist,ts}] — диалоги (страница) */
var aiCur=null;                 /* активный диалог */
var aiHist=[];                  /* hist активного диалога (алиас — код ниже не менялся) */
var aiSeq=0;                    /* номер запроса: старый колбэк не гасит busy нового */
var aiSaveTimer=0;              /* отложенный save истории */
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
var aiThinkOpen=-1;            /* индекс сообщения с раскрытым «Рассуждением» */

/* Версия разметки, под которую написан этот файл (см. ?v=.. в index.html) и
   адрес, с которого файл загрузился. Нужно, чтобы заметить устаревший
   index.html в кэше браузера (без Cache-Control браузер держит его по
   эвристике): ассеты подгружаются свежие, а разметка — прошлая, и панель ИИ
   в ней просто отсутствует. document.currentScript живёт только во время
   выполнения скрипта, поэтому значение фиксируем здесь, сразу. */
var AI_HTML_V='10';
var AI_SRC=(typeof document!=='undefined'&&document.currentScript&&document.currentScript.src)||'';

function aiEl(id){return document.getElementById(id)}
/* Искра — единая иконка ИИ: кнопки в шапках, шапка панели, пустое
   состояние, карточка действия. Минималистичная 4-лучевая звезда
   с вогнутыми гранями (quadri-кривые), заливка currentColor */
var AI_SPARK='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 3Q13.4 10.6 21 12Q13.4 13.4 12 21Q10.6 13.4 3 12Q10.6 10.6 12 3Z"/></svg>';
/* Иконки кнопки отправки: стрелка — «Отправить», квадрат — «Стоп»
   (подмена в aiSetBusy, чтобы клик во время генерации читался правильно) */
var AI_SEND_SVG='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 19V5M5 12l7-7 7 7"/></svg>';
var AI_STOP_SVG='<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="1.5"/></svg>';
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

/* ── Диалоги: история в localStorage (страница #aiPage + панель) ───────── */
/* Активный диалог один на обе ленты (data-aimsgs): aiHist — алиас его hist.
   ctx снимается при создании диалога (книга/глава/текст), чтобы вопросы
   с страницы шли с тем же контекстом, с каким диалог начат. */
function aiCtxSnap(){
  var b=null;try{b=book()}catch(e){}
  var t=aiBookTitle(),ch=aiChTitle(),txt=aiChText();
  /* книга не открыта (страница без редактора) — берём контекст активного
     диалога, если он есть (быстрый чат продолжается) */
  if(!t&&aiCur&&aiCur.ctx){t=aiCur.ctx.book;ch=aiCur.ctx.ch;txt=aiCur.ctx.chText}
  return {bookId:b&&b.id?b.id:'',book:t,ch:ch,chText:aiCut(txt||'',9000)};
}
/* Контекст для промпта: живой текст — если открыта та же книга, о которой
   диалог; иначе снимок из диалога (не подмешиваем чужую книгу) */
function aiCtxNow(){
  var c=(aiCur&&aiCur.ctx)||{};
  var live=aiCtxSnap();
  if(c.bookId&&live.bookId&&c.bookId!==live.bookId)
    return {title:c.book,ch:c.ch,text:c.chText};
  if(c.bookId)
    return {title:live.bookId===c.bookId?live.book:c.book,
            ch:live.bookId===c.bookId?live.ch:c.ch,
            text:live.bookId===c.bookId?(live.chText||c.chText):c.chText};
  return {title:live.book,ch:live.ch,text:live.chText};
}
/* Массив истории, которому принадлежит сообщение m (на время потока
   активный диалог может смениться — работаем с найденным массивом) */
function aiFeedOf(m){
  if(!m)return aiHist;
  if(aiHist.indexOf(m)>=0)return aiHist;
  for(var i=0;i<aiThreads.length;i++)
    if(aiThreads[i].hist.indexOf(m)>=0)return aiThreads[i].hist;
  return aiHist;
}
function aiThreadTouch(q){
  if(!aiCur)return;
  if(!aiCur.title&&q)aiCur.title=aiCut(q,42);   /* имя диалога = первый вопрос */
  aiCur.ts=Date.now();
  var i=aiThreads.indexOf(aiCur);
  if(i>0){aiThreads.splice(i,1);aiThreads.unshift(aiCur)} /* активный — наверх */
  aiSaveThreads();
}
function aiNewThread(){
  var th={id:uid()+'-'+Date.now().toString(36),title:'',ctx:aiCtxSnap(),hist:[],ts:Date.now()};
  aiThreads.unshift(th);
  aiCur=th;aiHist=th.hist;aiThinkOpen=-1;
  aiTrimThreads();aiSaveThreads();
  aiRenderThreads();aiRenderCtx();aiRender();
  return th;
}
function aiSwitchThread(id){
  var th=null;
  for(var i=0;i<aiThreads.length;i++)if(aiThreads[i].id===id)th=aiThreads[i];
  if(!th||th===aiCur)return;
  aiStop();aiBusy=false;aiErrMsg='';aiRetryPending=false;
  if(aiRetryTimer){clearTimeout(aiRetryTimer);aiRetryTimer=0}
  aiCur=th;aiHist=th.hist;aiThinkOpen=-1;
  aiSetBusy(false);aiSaveThreads();
  aiRenderThreads();aiRenderCtx();aiRender();
}
function aiDelThread(id){
  var i,th=null;
  for(i=0;i<aiThreads.length;i++)if(aiThreads[i].id===id){th=aiThreads[i];break}
  if(!th)return;
  if(th===aiCur){aiStop();aiBusy=false;aiSetBusy(false)}
  aiThreads.splice(i,1);
  if(th===aiCur){
    if(aiThreads.length)aiSwitchThread(aiThreads[0].id);
    else aiNewThread();
    return;
  }
  aiSaveThreads();aiRenderThreads();
}
function aiTrimThreads(){while(aiThreads.length>20)aiThreads.pop()}
/* Сериализация: режем поля по размеру — история живёт в localStorage.
   Форма action — такая же, как в памяти: {plan:{…}, done} (раньше здесь
   была плоская форма, и загрузчик отбрасывал карточку — баг) */
function aiThreadSave(t){
  return {id:t.id,title:t.title,ts:t.ts,ctx:t.ctx,
    hist:t.hist.slice(-40).map(function(m){
      var a=null;
      if(m.action&&m.action.plan){
        var p=m.action.plan;
        a={done:m.action.done||'',
           plan:{action:p.action,title:p.title,
                 content:p.content?aiCut(p.content,2000):''}};
        if(p.chapters)a.plan.chapters=p.chapters.slice(0,10).map(function(c){
          return {title:c.title,content:aiCut(c.content,1500)};
        });
      }
      return {role:m.role,content:aiCut(String(m.content==null?'':m.content),4000),
              think:m.think?aiCut(m.think,1200):'',action:a,noFmt:m.noFmt?1:0};
    })};
}
function aiSaveThreads(){
  if(aiSaveTimer)return;
  aiSaveTimer=setTimeout(function(){
    aiSaveTimer=0;
    if(!aiThreads.length)return;
    try{
      localStorage.setItem(AI_TH_LS,JSON.stringify(aiThreads.map(aiThreadSave)));
    }catch(e){                                   /* квота — отсекаем старое */
      try{
        aiThreads=aiThreads.slice(0,6);
        localStorage.setItem(AI_TH_LS,JSON.stringify(aiThreads.map(aiThreadSave)));
        if(aiThreads.indexOf(aiCur)<0){aiCur=aiThreads[0];aiHist=aiCur.hist}
        aiRenderThreads();
      }catch(e2){}
    }
  },400);
}
function aiLoadThreads(){
  aiThreads=[];
  try{
    var raw=localStorage.getItem(AI_TH_LS);
    var arr=raw?JSON.parse(raw):[];
    if(Array.isArray(arr))arr.forEach(function(t){
      if(!t||typeof t!=='object'||!Array.isArray(t.hist)||!t.hist.length)return;
      aiThreads.push({
        id:String(t.id||uid()),title:String(t.title||''),ts:+t.ts||Date.now(),
        ctx:{bookId:String(t.ctx&&t.ctx.bookId||''),book:String(t.ctx&&t.ctx.book||''),
             ch:String(t.ctx&&t.ctx.ch||''),chText:String(t.ctx&&t.ctx.chText||'')},
        hist:t.hist.filter(function(m){return m&&(m.role==='user'||m.role==='assistant')})
          .map(function(m){
            /* принимаем обе формы: {plan:{…},done} и плоскую (старые записи) */
            var a=(m.action&&(m.action.plan||m.action.action))?m.action:null;
            var plan=a?(a.plan||a):null;
            return {role:m.role,content:String(m.content||''),think:String(m.think||''),
                    noFmt:!!m.noFmt,
                    action:(plan&&(plan.action||plan.title))?
                      {plan:plan,done:String(a.done||plan.done||'')}:null};
          })
      });
    });
  }catch(e){}
  aiThreads.sort(function(a,b){return b.ts-a.ts});
  aiTrimThreads();
  if(aiThreads.length){aiCur=aiThreads[0];aiHist=aiCur.hist}
  else aiNewThread();
}
function aiFmtTs(ts){
  var d=new Date(ts),n=new Date();
  function p2(x){return('0'+x).slice(-2)}
  if(d.toDateString()===n.toDateString())return p2(d.getHours())+':'+p2(d.getMinutes());
  var y=new Date(n.getTime()-86400000);
  if(d.toDateString()===y.toDateString())return 'вчера';
  return p2(d.getDate())+'.'+p2(d.getMonth()+1);
}
function aiRenderThreads(){
  var box=aiEl('aiThreads');
  if(!box)return;
  var h='';
  aiThreads.forEach(function(t){
    var meta=(t.ctx&&t.ctx.book?'«'+aiCut(t.ctx.book,18)+'» · ':'')+aiFmtTs(t.ts);
    h+='<div class="ai-thread'+(t===aiCur?' on':'')+'" role="listitem" data-aith="'+esc(t.id)+'" title="'+esc(t.title||'Новый чат')+'">'+
       '<span class="t">'+esc(t.title||'Новый чат')+'</span>'+
       '<span class="m">'+esc(meta)+'</span>'+
       '<button class="del" type="button" data-aithdel="'+esc(t.id)+'" title="Удалить диалог" aria-label="Удалить диалог">×</button></div>';
  });
  box.innerHTML=h;
}

/* Системный промпт: книга + глава + её текст + опциональное выделение */
function aiSystemPrompt(extra){
  var s='Ты — ассистент в приложении «Черновик» (чтение и правка рукописей).';
  var cx=aiCtxNow(), title=cx.title, ch=cx.ch;
  if(title)s+='\nКнига: «'+title+'».'+(ch?'\nТекущая глава: «'+ch+'».':'');
  if(cx.text)s+='\n\nТекущий текст главы (может быть обрезан):\n"""\n'+aiCut(cx.text,9000)+'\n"""';
  if(extra)s+='\n\n'+extra;
  /* Действия: модель сама создаёт книги/главы — отвечает JSON, лента
     рисует карточку с планом, исполняет пользователь по кнопке.
     Формулировка жёсткая: модель часто отвечала текстом «нажмите
     "Создать книгу"» — а кнопка появляется только из JSON (см. aiTryAction) */
  s+='\n\nДействия. Если тебя прямо просят создать книгу, написать новую главу или переписать текущую — ответь ТОЛЬКО одним JSON-объектом: первый символ {, последний }, вокруг ровно ничего. Без ``` , без пояснений, без списков и без фразы «нажмите кнопку» — кнопку пользователь увидит сам после твоего ответа:'+
     '\n{"action":"create_book","title":"Название книги","chapters":[{"title":"Заголовок главы","content":"текст главы"}]} — 3–8 глав. Пиши связную книгу, а не конспект: продумай сюжетную дугу от завязки до финала, главы продолжают друг друга и не повторяют экспозицию; каждая глава — цельный эпизод, 3–7 абзацев через пустую строку (600–2000 знаков): живая проза с событиями, деталями и репликами героев вместо пересказа «как будто»; не подводи главу моралью и не заканчивай выводом; держи единый стиль и голос, заданные запросом;'+
     '\n{"action":"create_chapter","title":"Заголовок","content":"текст главы до 8000 знаков, абзацы через пустую строку"};'+
     '\n{"action":"replace_chapter","title":"Заголовок","content":"новый текст главы до 8000 знаков"}.'+
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
    if(aiAbort===ctrl)aiAbort=null;
    onDone(full);
  }).catch(function(e){
    if(aiAbort===ctrl)aiAbort=null;
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

/* ── Индикатор связи: крохотная точка в шапках (без надписей) ─────────── */
function aiPing(){
  return aiFetch(aiUrl('models'),{headers:aiHeaders(),method:'GET'},6000)
    .then(function(r){return {ok:r.ok,status:r.status}})
    .catch(function(){return {ok:false,status:0}})
    .then(function(s){
      Array.prototype.forEach.call(document.querySelectorAll('[data-aidot]'),function(d){
        d.classList.toggle('ok',!!s.ok);
        d.classList.toggle('err',!s.ok);
      });
      if(s.ok){
        if(aiPingTimer){clearTimeout(aiPingTimer);aiPingTimer=0}
      }else if(!aiPingTimer){
        aiPingTimer=setTimeout(function(){aiPingTimer=0;aiPing()},60000); /* ИИ лёг — перепроверим сами */
      }
      return s.ok;
    });
}

/* Строка контекста: книга/глава диалога + живое выделение (selectionchange) */
function aiCtxLabel(){
  var c=(aiCur&&aiCur.ctx)||{}, parts=[];
  var cx=aiCtxNow();
  var bt=cx.title||c.book;
  if(bt)parts.push('«'+aiCut(bt,22)+'»');
  if(cx.ch||c.ch)parts.push('глава «'+aiCut(cx.ch||c.ch,18)+'»');
  var sel=aiSelection();
  if(sel)parts.push('выделено '+sel.length+' зн.');
  return parts.length?parts.join(' · '):'без контекста книги';
}
function aiRenderCtx(){
  var t=aiCtxLabel();
  var a=aiEl('aiPanelCtx');if(a)a.textContent=t;
  var b=aiEl('aiPgCtx');if(b)b.textContent=t;
  var ti=aiEl('aiPgTitle');
  if(ti)ti.textContent=(aiCur&&aiCur.title)?aiCur.title:'Новый чат';
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

/* ── Полностраничный чат (#aiPage): поверх всех видов, «Назад» = закрыть ─ */
var aiPgFromPanel=false;         /* открыта из панели — по «Назад» вернуть её */
function aiShowPage(){
  var pg=aiEl('aiPage');
  if(!pg)return;
  if(!aiCur)aiNewThread();
  var panel=aiEl('aiPanel');
  aiPgFromPanel=!!(panel&&panel.classList.contains('on'));
  pg.hidden=false;
  viewIn(pg);
  aiClosePanel();
  aiRenderThreads();aiRenderCtx();aiRender();
  aiPing();
  var side=aiEl('aiSide');if(side)side.classList.remove('open');
  setTimeout(function(){var i=aiEl('aiPgInput');if(i&&!aiBusy)i.focus()},60);
}
function aiHidePage(){
  var pg=aiEl('aiPage');
  if(!pg||pg.hidden)return;
  pg.hidden=true;
  var side=aiEl('aiSide');if(side)side.classList.remove('open');
  if(aiPgFromPanel){aiPgFromPanel=false;aiOpenPanel()}
}

function aiToggleSettings(){
  var m=aiEl('aiSetModal');
  if(!m)return;
  var open=!m.classList.contains('on');
  m.classList.toggle('on',open);
  var g=aiEl('aiGear');
  if(g)g.setAttribute('aria-expanded',String(open));
  if(open){
    aiEl('aiBase').value=aiCfg.base;
    aiEl('aiKey').value=aiCfg.key;
    aiEl('aiModel').value=aiCfg.model;
    aiEl('aiBase').focus();
  }
}
function aiCloseSettings(){
  var m=aiEl('aiSetModal');
  if(m)m.classList.remove('on');
  var g=aiEl('aiGear');
  if(g)g.setAttribute('aria-expanded','false');
}
function aiSaveSettings(){
  var b=String(aiEl('aiBase').value||'').trim().replace(/\/+$/,'');
  if(b&&!/^https?:\/\//i.test(b))b='http://'+b;   /* пусто = релей сайта */
  aiCfg.base=b;
  aiCfg.key=String(aiEl('aiKey').value||'').trim();
  aiCfg.model=String(aiEl('aiModel').value||'deepseek-chat');
  aiSaveCfg();
  aiCloseSettings();
  aiSyncLink();
  aiPing();
}

/* Пунктуация ответа в ленте: русские кавычки, тире, троеточие,
   списки, markdown-шум. Экранирование (esc) — ПОСЛЕ этой функции */
function aiChatFmt(s){
  var t=String(s==null?'':s).replace(/\r/g,'');
  /* markdown-шум: заголовки, жирный, подчёркнутый, инлайн-код */
  t=t.replace(/^[ \t]{0,3}#{1,6}[ \t]+/gm,'')
     .replace(/\*\*([^*\n]+)\*\*/g,'$1')
     .replace(/__([^_\n]+)__/g,'$1')
     .replace(/`([^`\n]+)`/g,'$1');
  /* маркеры списков → единое тире */
  t=t.replace(/^[ \t]*[-*•][ \t]+/gm,'— ');
  /* троеточие; диапазоны 5–10 (соединительное); тире между словами.
     Дефис внутри слова (какой-то, северо-запад) не трогаем */
  t=t.replace(/\.\.\./g,'…')
     .replace(/(\d)\s*-\s*(?=\d)/g,'$1–')
     .replace(/(\s)-(\s)/g,'$1—$2');
  /* заграничные прямые кавычки → обычные, затем пары → «ёлочки» */
  t=t.replace(/[\u201c\u201d\u201e]/g,'"')
     .replace(/"[^"\n]*"/g,function(m){return '«'+m.slice(1,-1)+'»'});
  /* пробелы перед знаками и внутри кавычек */
  t=t.replace(/[ \t]+([,.;:!?…])/g,'$1')
     .replace(/«[ \t]+/g,'«').replace(/[ \t]+»/g,'»');
  /* схлопываем лишние пробелы, переводы строк сохраняем */
  t=t.replace(/[ \t]{2,}/g,' ').replace(/[ \t]+\n/g,'\n').replace(/\n[ \t]+/g,'\n');
  return t;
}
/* Рендер ленты (innerHTML + esc — как в остальных модулях).
   Ленты две (панель + страница, data-aimsgs) — собираем html один раз */
function aiRender(){
  var boxes=document.querySelectorAll('[data-aimsgs]');
  if(!boxes.length)return;
  var h=aiRenderHtml();
  Array.prototype.forEach.call(boxes,function(box){
    var pinned=(box.scrollHeight-box.scrollTop-box.clientHeight)<48;
    box.innerHTML=h;
    if(pinned)box.scrollTop=box.scrollHeight;
  });
}
function aiRenderHtml(){
  var h='',prevRole='';
  if(!aiHist.length){
    h+='<div class="ai-empty"><span class="ai-spark">'+AI_SPARK+'</span><b>ИИ-ассистент</b>'+
       'Спросите что угодно по текущей книге — контекст главы подхватится сам. '+
       'Выделенный фрагмент тоже попадёт в запрос.</div>';
  }else{
    aiHist.forEach(function(m,i){
      if(m.think){
        h+='<details class="ai-think"'+(i===aiThinkOpen?' open':'')+' data-i="'+i+'">'+
           '<summary>Рассуждение</summary>'+
           '<span class="ai-think-b">'+esc(aiChatFmt(aiCut(m.think,1200)))+'</span></details>';
      }
      if(m.role==='user'){
        h+='<div class="ai-msg user'+(prevRole==='user'?' tight':'')+'">'+esc(m.content)+'</div>';
        prevRole='user';
      }else{
        /* модель в потоке пишет JSON-действие — прячем его за статусом */
        var pend=!m.action&&aiBusy&&aiLooksAction(m.content);
        if(!m.content&&m.think&&!aiBusy&&!m.repairing){
          prevRole='';                   /* остановили во время рассуждения —
                                            текста нет, think показан выше */
        }else{
          var txt=m.content?aiChatFmt(m.content):(aiBusy?'…':'(пустой ответ)');
          if(m.noFmt)txt=m.content;
          if(m.repairing)txt='Уточняю структуру…';
          if(pend)txt='ИИ готовит структуру…';
          var empty=!m.content||pend||m.repairing;
          h+='<div class="ai-msg bot'+(empty?' empty':'')+(prevRole==='bot'&&!empty?' tight':'')+'">'+esc(txt)+'</div>';
          if(m.action)h+=aiActCard(m.action,i);
          prevRole=m.action?'':'bot';
        }
      }
    });
  }
  if(aiErrMsg)h+='<div class="ai-err"><span>'+esc(aiErrMsg)+'</span>'+
    (aiRetryPending?'<button class="retry" type="button" data-airetry="1">ПОВТОРИТЬ</button>':'')+'</div>';
  return h;
}
function aiShowErr(e){
  aiErrMsg='Не получилось: '+(e&&e.message?e.message:String(e));
  aiRetryPending=false;
  aiRender();
}

/* ── Отправка сообщения ────────────────────────────────────────────────── */
/* Активное поле ввода: страница открыта — её поле, иначе панельное */
function aiField(){
  var pg=aiEl('aiPage');
  if(pg&&!pg.hidden)return aiEl('aiPgInput');
  return aiEl('aiInput');
}
function aiAutosize(el){
  el.style.height='auto';
  var h=Math.min(el.scrollHeight,110);
  el.style.height=h+'px';
  /* полоса прокрутки — только когда текст реально не влезает (баг:
     полоса мигала на одной строке из-за округления scrollHeight) */
  el.style.overflowY=el.scrollHeight>h?'auto':'hidden';
}
function aiBindInput(el){
  if(!el)return;
  el.addEventListener('keydown',function(e){
    /* isComposable/229 — Enter во время ввода через IME не должен отправлять */
    if(e.key==='Enter'&&!e.shiftKey&&!e.isComposing&&e.keyCode!==229){
      e.preventDefault();aiSendMsg();
    }
  });
  el.addEventListener('input',function(){aiAutosize(el)});
}
function aiSendMsg(){
  if(aiBusy){aiStop();return}
  /* первым делом — поле той поверхности, где пользователь (страница или
     панель): брать «первое непустое» было неверно — текст из свёрнутой
     панели уезжал вместо набранного на странице */
  var primary=aiField();
  var q='',used=null;
  if(primary&&String(primary.value||'').trim()){
    q=String(primary.value).trim();used=primary;
  }else{
    Array.prototype.forEach.call(document.querySelectorAll('.ai-foot textarea'),function(t){
      var v=String(t.value||'').trim();
      if(v&&!q){q=v;used=t}
    });
  }
  if(!q)return;
  if(used){used.value='';used.style.height='auto';used.style.overflowY='hidden'}
  aiAsk(q,false);
}

/* isRetry=true — повтор после недоступности ИИ: вопрос уже в истории,
   не дублируем его и не трогаем поле ввода */
function aiAsk(q,isRetry){
  if(aiOwnProxy()&&!aiCfg.key){
    if(aiEl('aiSetModal')&&!aiEl('aiSetModal').classList.contains('on'))aiToggleSettings();
    aiShowErr(new Error('укажите API-ключ прокси (⚙ настройки)'));
    return;
  }
  aiErrMsg='';aiRetryPending=false;
  if(!isRetry){
    aiRetried=false;
    if(aiRetryTimer){clearTimeout(aiRetryTimer);aiRetryTimer=0}
    aiThreadTouch(q);                        /* имя диалога + наверх списка */
    if(aiCur&&!aiCur.ctx.bookId)aiCur.ctx=aiCtxSnap(); /* пустой контекст — подхватываем книгу */
  }
  var sel=isRetry?'':aiSelection();   /* выделение к моменту повтора могло сняться */
  var sys=aiSystemPrompt(sel?('\nВыделенный фрагмент (учти в ответе):\n«'+aiCut(sel,4000)+'»'):'' );

  var feed=aiHist;                /* история ЭТОГО диалога: во время потока её можно
                                     сменить — колбэки работают с feed, не с aiHist */
  var my=++aiSeq;
  var last=feed[feed.length-1];
  var inHist=isRetry&&last&&last.role==='user'&&last.content===q;
  var hist=feed.slice();
  if(inHist)hist.pop();               /* последний user-q добавим сами ниже */

  var apiMsgs=[{role:'system',content:sys}];
  hist.slice(-12).forEach(function(m){     /* think в API не отправляем */
    apiMsgs.push({role:m.role,content:aiActionMsg(m)});
  });
  apiMsgs.push({role:'user',content:q});

  if(!inHist)feed.push({role:'user',content:q});
  var ass={role:'assistant',content:'',think:''};
  feed.push(ass);
  aiBusy=true;
  Array.prototype.forEach.call(document.querySelectorAll('.ai-foot textarea'),function(t){
    if(!isRetry){t.value='';t.style.height='auto';t.style.overflowY='hidden'}
  });
  aiSetBusy(true);
  aiRender();

  aiRequest(apiMsgs,
    function(t,isThink){
      if(isThink)ass.think+=t;else ass.content+=t;
      aiRender();
    },
    function(){
      if(my===aiSeq){aiBusy=false;aiSetBusy(false)}
      if(!ass.content)ass.content=ass.think?'(без текста — см. рассуждение выше)':'(пустой ответ)';
      aiTryAction(ass,q);                   /* вдруг модель прислала действие */
      if(my===aiSeq){aiRetried=false;aiRetryPending=false}
      aiSaveThreads();
      aiRender();
    },
    function(e){
      var same=my===aiSeq&&feed===aiHist;   /* тот же диалог и запрос — показываем ошибку */
      if(same){aiBusy=false;aiSetBusy(false)}
      if(e&&e.name==='AbortError'){           /* «Стоп» — не ошибка */
        if(!ass.content)ass.content='(остановлено)';
        aiSaveThreads();aiRender();return;
      }
      feed.pop();                           /* убираем пустого ассистента */
      aiSaveThreads();
      if(same){aiShowErr(e);aiMaybeRetry(q,e)}
      else aiRender();
    });
}
function aiSetBusy(b){
  Array.prototype.forEach.call(document.querySelectorAll('.ai-send'),function(btn){
    btn.classList.toggle('busy',!!b);
    btn.title=b?'Остановить генерацию':'Отправить (Enter)';
    /* во время генерации кнопка — «Стоп» (квадрат), а не стрелка:
       иначе клик «остановить» выглядит как повторная отправка */
    btn.innerHTML=b?AI_STOP_SVG:AI_SEND_SVG;
  });
}
function aiStop(){if(aiAbort){try{aiAbort.abort()}catch(e){}}}
function aiClearHist(){
  aiStop();
  if(aiCur){                          /* aiHist — алиас hist активного диалога */
    aiCur.hist.length=0;aiHist=aiCur.hist;
    aiCur.title='';aiCur.ts=Date.now();aiSaveThreads();
  }else aiHist=[];
  aiBusy=false;aiErrMsg='';aiSetBusy(false);
  aiRetryPending=false;aiRetried=false;aiThinkOpen=-1;
  if(aiRetryTimer){clearTimeout(aiRetryTimer);aiRetryTimer=0}
  aiRenderThreads();aiRenderCtx();
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
  /* достаточно «{"action":… где угодно в ответе» — так во время потока
     уже видно, что модель пишет JSON, даже если начала с пары слов */
  if(s.indexOf('{')<0)return false;
  return /"action"\s*:/.test(s);
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
  if(!o||typeof o!=='object')return null;
  var act=(typeof o.action==='string'&&o.action)||
          (typeof o.type==='string'&&o.type)||(typeof o.name==='string'&&o.name);
  if(!act)return null;
  if(act==='create_book'){
    var title=aiStr(o.title,200);
    if(!title||!Array.isArray(o.chapters))return null;
    var chs=[];
    for(var i=0;i<o.chapters.length&&chs.length<40;i++){
      var c=o.chapters[i];
      var ct='';
      if(typeof c==='string')ct=aiStr(c,200);   /* модель отдавала список строк */
      else if(c&&typeof c==='object')ct=aiStr(c.title,200);
      if(!ct)continue;
      chs.push({title:ct,content:(c&&typeof c==='object')?aiStr(c.content,40000):''});
    }
    if(!chs.length)return null;
    return {action:'create_book',title:title,chapters:chs};
  }
  if(act==='create_chapter'||act==='replace_chapter'){
    var raw=(o.content!=null?o.content:(o.text!=null?o.text:o.body));
    var content=aiStr(raw,40000);
    if(!content)return null;
    return {action:act,title:aiStr(o.title,200),content:content};
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
  var h='<div class="ai-act"><div class="ai-act-h"><span class="ai-spark">'+AI_SPARK+'</span>'+esc(head)+'</div>';
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
/* Текст обещает кнопку («Нажмите "Создать книгу"»), но JSON не пришёл:
   чаще всего модель подхватила наше саммити из истории и повторила его */
function aiPromisedAction(s){
  s=String(s==null?'':s);
  if(!/(Создать книгу|Добавить главу|Заменить главу)/.test(s))return false;
  return /(Нажмите|нажмите|нажми|по кнопке|кнопку|кнопка)/.test(s);
}
/* Честная замена: вместо вводящего в заблуждение «нажмите кнопку»
   (кнопки-то не из чего построить) — прямой ответ. Вызывается, когда
   и исходный ответ, и автопочинка закончились без JSON */
function aiActionFailed(m){
  var s=String(m.content==null?'':m.content);
  if(!aiPromisedAction(s))return;         /* обычный текст — не трогаем */
  m.content='Модель не прислала данные для создания — кнопка не появилась. '+
            'Попробуйте спросить ещё раз.';
}
/* Для истории API: у сообщений с действием отдаём компактный JSON —
   модель видит свой «формат ответа», а не саммити «нажмите кнопку»
   (иначе она начинает повторять саммити текстом без JSON) */
function aiActionMsg(m){
  var p=m&&m.action&&m.action.plan;
  if(!p)return m?m.content:'';
  try{
    if(p.action==='create_book'){
      return JSON.stringify({action:'create_book',title:p.title,
        chapters:p.chapters.slice(0,10).map(function(c){
          return {title:c.title,content:aiCut(c.content,240)};
        })});
    }
    return JSON.stringify({action:p.action,title:p.title,content:aiCut(p.content,700)});
  }catch(e){return m.content}
}
/* Одна автопопытка: модель ответила текстом вместо JSON-действия —
   уточняем прямо в этом же диалоге (без записи в историю) */
function aiFixAction(m,q){
  m.actFix=true;m.repairing=true;
  var saved=m.content;
  m.content='';
  var msgs=[{role:'system',content:aiSystemPrompt('')+
    '\n\nВАЖНО: твой предыдущий ответ был обычным текстом, а нужен ответ-действие — РОВНО один JSON-объект из инструкции выше: первый символ {, последний }. Без пояснений, без списков и без фразы «нажмите кнопку».'}];
  var feed=aiFeedOf(m);               /* m может жить не в активном диалоге */
  var idx=feed.indexOf(m);
  feed.slice(0,idx<0?feed.length:idx).slice(-10).forEach(function(x){
    msgs.push({role:x.role,content:aiActionMsg(x)});
  });
  aiBusy=true;aiSetBusy(true);aiRender();
  aiRequest(msgs,
    function(t,isThink){if(!isThink)m.content+=t;aiRender()},
    function(){
      aiBusy=false;aiSetBusy(false);m.repairing=false;
      var plan=aiExtractAction(m.content);
      if(plan){
        m.action={plan:plan,done:''};
        m.content=aiActionSummary(plan);
      }else{
        m.content=saved;               /* не вышло — оставляем исходный ответ */
        aiActionFailed(m);             /* …но честно, если там «нажмите кнопку» */
      }
      aiSaveThreads();aiRender();
    },
    function(){
      aiBusy=false;aiSetBusy(false);m.repairing=false;
      m.content=saved;aiActionFailed(m);
      aiSaveThreads();aiRender(); /* сбой уточнения — не трогаем ответ */
    });
}
/* Завершённый ответ: распознаём действие и подменяем текст резюме */
function aiTryAction(m,q){
  if(!m||m.role!=='assistant'||!m.content||m.action)return;
  var looks=aiLooksAction(m.content);
  if(!looks&&m.content.indexOf('{')<0&&!aiPromisedAction(m.content))return;
  var plan=aiExtractAction(m.content);
  if(plan){
    m.action={plan:plan,done:''};
    m.content=aiActionSummary(plan);
  }else if(aiPromisedAction(m.content)&&q!=null&&!m.actFix){
    aiFixAction(m,q);                  /* пообещала кнопку без JSON — уточняем */
  }else if(aiPromisedAction(m.content)){
    /* уточнение уже было и не помогло — говорим честно (без «нажмите кнопку») */
    aiActionFailed(m);
  }else if(looks){
    m.content=aiCut(m.content,600)+'\n\n(структура не разобралась — попросите ещё раз)';
    m.noFmt=true;                     /* это остаток JSON — не трогаем кавычки */
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
  aiSaveThreads();                       /* «выполнено» переживёт перезагрузку */
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
    if(aiEl('aiSetModal')&&!aiEl('aiSetModal').classList.contains('on'))aiToggleSettings();
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
    ? 'Ты — вычитчик русского текста. Исправь только орфографические, пунктуационные и грамматические ошибки: опечатки, ошибки в падежах и согласовании, слитные/раздельные написания («не смотря на то что» — «несмотря на то что»), расстановку запятых. Ничего не переписывай: сохраняй формулировки, стиль, объём, язык, имена, цифры и разбивку на абзацы. Фрагмент может начинаться с середины предложения — не меняй регистр первой буквы (не делай её заглавной, если в оригинале строчная) и не добавляй его в кавычки. Не добавляй пояснений и заголовков. Ответь только исправленным текстом. Если ошибок нет — верни фрагмент дословно, без единого изменения. '+keep
    : 'Ты — редактор художественного русского текста. Улучши фрагмент, сохранив смысл, объём (±10%), язык, время действия, лица и авторский голос. Работай только над тем, КАК текст написан:'+
      '\n— делай фразы яснее: точный глагол лучше описательного оборота, конкретная деталь лучше отвлечённого приговора; но не обедняй стиль автора и не упрощай ради простоты;'+
      '\n— убирай повторы слов и однотипных конструкций, канцелярит («осуществлять», «производить выполнение»), пустые слова («довольно», «весьма», «в определённой степени», «таким образом») и штампы («играет важную роль», «стоит отметить», «в мире», «несомненно»);'+
      '\n— следи за ритмом: чередуй короткие и длинные предложения, не ставь подряд несколько однотипных по структуре.'+
      '\nСтрого запрещено: менять сюжет, факты, имена, цифры, реалии и порядок событий; добавлять эмодзи, заголовки, списки и пояснения; превращать разговорный текст в официальный или выравнивать его в шаблон «красивой» прозы; смягчать или усиливать авторские оценки; добавлять выводы и мораль. Если фрагмент и так хорош и улучшить его без потери смысла нельзя — верни его без изменений. Фрагмент может начинаться с середины предложения — не меняй регистр первой буквы и не добавляй финальную точку, если её не было. Ответь только готовым текстом. '+keep;

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

  /* ── Полностраничный чат: страница #aiPage (история диалогов слева) ── */
  aiLoadThreads();
  aiRenderThreads();
  var expand=aiEl('aiExpand');
  if(expand)expand.addEventListener('click',aiShowPage);   /* панель → полный чат */
  var back=aiEl('aiPgBack');
  if(back)back.addEventListener('click',aiHidePage);
  var pgSend=aiEl('aiPgSend');
  if(pgSend)pgSend.addEventListener('click',aiSendMsg);
  var pgGear=aiEl('aiPgGear');
  if(pgGear)pgGear.addEventListener('click',aiToggleSettings);
  var sideBtn=aiEl('aiPgSide'),side=aiEl('aiSide'),sideX=aiEl('aiSideClose');
  if(sideBtn&&side)sideBtn.addEventListener('click',function(){side.classList.toggle('open')});
  if(sideX&&side)sideX.addEventListener('click',function(){side.classList.remove('open')});
  var newChat=aiEl('aiNewChat');
  if(newChat)newChat.addEventListener('click',function(){
    aiNewThread();
    var i=aiEl('aiPgInput');if(i)i.focus();
  });
  var thBox=aiEl('aiThreads');                       /* переключение/удаление диалогов */
  if(thBox)thBox.addEventListener('click',function(e){
    if(!e.target||!e.target.closest)return;
    var del=e.target.closest('[data-aithdel]');
    if(del){
      var id=del.getAttribute('data-aithdel'),t=null;
      aiThreads.forEach(function(x){if(x.id===id)t=x});
      if(t&&(t.title||t.hist.length)&&!confirm('Удалить диалог «'+(t.title||'Без названия')+'»?'))return;
      aiDelThread(id);return;
    }
    var row=e.target.closest('[data-aith]');
    if(row)aiSwitchThread(row.getAttribute('data-aith'));
  });

  /* настройки — общая модалка (⚙ панели и страницы);
     guard: старая разметка в кэше может не содержать #aiSetModal */
  var setClose=aiEl('aiSetClose');
  if(setClose)setClose.addEventListener('click',aiCloseSettings);
  var setModal=aiEl('aiSetModal');
  if(setModal)setModal.addEventListener('click',function(e){
    if(e.target===this)aiCloseSettings();
  });

  /* «Повторить» и кнопки действий (карточки) — делегирование, их рисует aiRender;
     ленты обе (панель + страница) */
  Array.prototype.forEach.call(document.querySelectorAll('[data-aimsgs]'),function(box){
    box.addEventListener('click',function(e){
      if(!e.target||!e.target.closest)return;
      var a=e.target.closest('[data-aiact]');
      if(a){aiRunAction(+a.getAttribute('data-aiact')||0);return}
      if(e.target.closest('[data-airetry]'))aiRetryNow();
    });
    /* раскрытая «Рассуждением» деталь не должна схлопываться при каждом
       рендере (стриминг пересобирает ленту целиком): запоминаем её индекс,
       aiRender возвращает open по data-i. toggle не всплывает — фаза capture */
    box.addEventListener('toggle',function(e){
      var d=e.target;
      if(!d||!d.classList||!d.classList.contains('ai-think'))return;
      aiThinkOpen=d.open?(+d.getAttribute('data-i')||0):-1;
    },true);
  });

  aiBindInput(aiEl('aiInput'));
  aiBindInput(aiEl('aiPgInput'));

  /* быстрые вопросы под лентой — в активное поле ввода */
  Array.prototype.forEach.call(document.querySelectorAll('[data-aiq]'),function(b){
    b.addEventListener('click',function(){
      var i=aiField();
      if(!i)return;
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
    var set=aiEl('aiSetModal');
    if(set&&set.classList.contains('on')){
      e.preventDefault();e.stopPropagation();aiCloseSettings();return;
    }
    var p=aiEl('aiPanel');
    if(p&&p.classList.contains('on')){
      e.preventDefault();e.stopPropagation();
      if(document.activeElement===aiEl('aiInput'))aiEl('aiInput').blur();
      else aiClosePanel();
      return;
    }
    var pg=aiEl('aiPage');
    if(pg&&!pg.hidden){
      e.preventDefault();e.stopPropagation();aiHidePage();
    }
  },true);

  /* живой контекст в шапках (панель и страница) */
  document.addEventListener('selectionchange',function(){
    if(aiCtxTimer)return;
    aiCtxTimer=setTimeout(function(){
      aiCtxTimer=0;
      var p=aiEl('aiPanel'),pg=aiEl('aiPage');
      if((p&&p.classList.contains('on'))||(pg&&!pg.hidden))aiRenderCtx();
    },250);
  });
}
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',aiInit);
else aiInit();
