/* ==========================================================================
 * 22-assistant.js — ИИ-ассистент — чат по книге + исправление/улучшение
 *   выделенного текста. Проект: «Черновик» — веб-редактор рукописей.
 * Что делает: кнопки «Спросить ИИ» (.ai-open — #aiFab в #topbar редактора
 *   на месте «Все заметки» и #aiFabLib в шапке библиотеки; обычные
 *   ibtn-иконки-искры без подложки и точки связи) открывают панель
 *   чата (#aiPanel — раздел «Чат» Энциклопедии) с селектором
 *   контекста .ai-scope (текущая глава / глава и соседние / только
 *   выделение / вся книга — см. aiBuildCtx); кнопки .sb-ai в
 *   #selbar («Испр.»/«Улуч.») прогоняют выделение через модель и показывают
 *   результат в #aiResModal («Применить» подменяет выделение с сохранением
 *   абзацев, заголовков и инлайн-форматирования).
 *   Ссылки на места в тексте: модель оборачивает точную цитату в [[…]]
 *   (правило в промпте), чат рисует её чипом .ai-cite, клик находит цитату
 *   в главе и подсвечивает фрагмент в #editor оверлеем .ai-flash — DOM
 *   редактора не мутируется, сохранение не задевается (см. aiCiteGo).
 *   Размышление (reasoning_content) показывается карточкой details.ai-think:
 *   в стриме — живой индикатор с таймером, после — свёрнуто с длительностью.
 *   Функций создания книги/глав (create_book / create_chapter /
 *   replace_chapter) больше нет: ИИ только анализирует текст и отвечает.
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
var aiCfg={base:'',key:'',model:'deepseek-chat',scope:'ch'}; /* base='' → релей /api/ai.php; scope — селектор контекста */
var aiThreads=[];               /* [{id,title,ctx,hist,ts}] — диалоги (история в LS) */
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
var aiThinkTimer=0;            /* тикер секунд для живого «Размышления» */

/* Версия разметки, под которую написан этот файл (см. ?v=.. в index.html) и
   адрес, с которого файл загрузился. Нужно, чтобы заметить устаревший
   index.html в кэше браузера (без Cache-Control браузер держит его по
   эвристике): ассеты подгружаются свежие, а разметка — прошлая, и панель ИИ
   в ней просто отсутствует. document.currentScript живёт только во время
   выполнения скрипта, поэтому значение фиксируем здесь, сразу. */
var AI_HTML_V='27'; /* = ?v= в index.html: при каждом бампе версии менять вместе с ним */
var AI_SRC=(typeof document!=='undefined'&&document.currentScript&&document.currentScript.src)||'';

function aiEl(id){return document.getElementById(id)}
/* Привязка с проверкой: устаревшая разметка в кэше может не содержать
   элемента — без guard один отсутствующий id обрывал бы весь aiInit */
function aiOn(id,ev,fn){var el=aiEl(id);if(el)el.addEventListener(ev,fn)}
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
    if(typeof j.scope==='string'&&/^(ch|around|sel|book)$/.test(j.scope))aiCfg.scope=j.scope;
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

/* ── Охват контекста: селектор .ai-scope ──────────────────────────────── */
var AI_SCOPE_OPTS=[['ch','Текущая глава'],['around','Глава и соседние'],['sel','Только выделение'],['book','Вся книга']];
function aiScope(){
  return /^(ch|around|sel|book)$/.test(aiCfg.scope)?aiCfg.scope:'ch';
}
function aiScopeLabel(v){
  for(var i=0;i<AI_SCOPE_OPTS.length;i++)if(AI_SCOPE_OPTS[i][0]===v)return AI_SCOPE_OPTS[i][1];
  return 'Текущая глава';
}
function aiScopePaint(){
  var el=aiEl('aiScope');if(!el)return;
  var sp=el.querySelector('.ai-scope-t'),t=aiScopeLabel(aiScope());
  if(sp&&sp.textContent!==t)sp.textContent=t;
}
function aiScopeSet(v){
  if(!/^(ch|around|sel|book)$/.test(v))v='ch';
  if(aiCfg.scope!==v){aiCfg.scope=v;aiSaveCfg()}
  aiScopePaint();
  aiRenderCtx();
}
function aiCloseScopeMenu(){
  var m=aiEl('aiScopeMenu');if(m)m.classList.remove('on');
  document.querySelectorAll('.ai-scope').forEach(function(b){b.setAttribute('aria-expanded','false')});
}
function aiScopeMenuOpen(btn){
  var m=aiEl('aiScopeMenu');if(!m||!btn)return;
  var cur=aiScope();
  m.innerHTML='';
  AI_SCOPE_OPTS.forEach(function(o){
    var b=document.createElement('button');
    b.type='button';b.className='bm-item'+(o[0]===cur?' act':'');
    b.setAttribute('role','menuitemradio');
    b.setAttribute('aria-checked',o[0]===cur?'true':'false');
    b.innerHTML='<span class="t"></span>'+(o[0]===cur?'<span class="h">✓</span>':'');
    b.querySelector('.t').textContent=o[1];
    b.addEventListener('click',function(){aiScopeSet(o[0]);aiCloseScopeMenu()});
    m.appendChild(b);
  });
  var r=btn.getBoundingClientRect();
  m.style.top=(r.bottom+6)+'px';
  m.style.left=Math.max(8,Math.min(r.left,innerWidth-260))+'px';
  m.classList.add('on');
  btn.setAttribute('aria-expanded','true');
}
/* Блоки текущей главы: живой DOM (для подсветки цитат нужны узлы), либо
   сохранённый HTML, когда редактор не открыт (el:null — подсветим после
   открытия главы, поиск цитат тогда идёт заново по живому DOM) */
function aiChBlocks(){
  var out=[];
  try{
    var live=(typeof editorOwned!=='undefined')&&editorOwned&&editor&&editor.children&&editor.children.length&&
             typeof workspace!=='undefined'&&!workspace.hidden;
    if(live){
      Array.prototype.forEach.call(editor.children,function(el){
        out.push({el:el,text:String(el.textContent||'')});
      });
    }else{
      var c=currentCh();
      if(c&&typeof c.html==='string'){
        Array.prototype.forEach.call(tmp(c.html).children,function(el){
          out.push({el:null,text:String(el.textContent||'')});
        });
      }
    }
  }catch(e){}
  return out;
}
function aiChapterText(c){
  var t='';
  try{if(c&&typeof c.html==='string')t=tmp(c.html).textContent||''}catch(e){}
  return String(t).replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/^\s+|\s+$/g,'');
}
/* Пронумерованные абзацы: модель отвечает «[7] …» и цитирует вслепую —
   номера дают ей ориентир, а нам — быструю проверку */
function aiNumbered(blocks){
  var out=[];
  for(var i=0;i<blocks.length;i++){
    var t=blocks[i].text.replace(/\u00a0/g,' ').replace(/[ \t]+/g,' ').replace(/^\s+|\s+$/g,'');
    out.push('['+(i+1)+'] '+t);
  }
  return out.join('\n\n');
}
/* Оглавление книги без служебных глав (заметки/памятка) */
function aiBookChapters(){
  var out=[];
  try{
    var b=book();
    if(b)visibleChapters(b).forEach(function(c){
      out.push({id:c.id,ch:c,title:chapterTitle(c)});
    });
  }catch(e){}
  return out;
}
/* Текст главы в охвате — для «соседних» глав и «вся книга» */
function aiCtxScopeText(sc){
  var parts=[],i,chs;
  if(sc==='sel'){
    var sel=aiSelectionRaw();
    if(sel)return 'Выделенный фрагмент:\n'+sel;
    sc='ch';                            /* выделения нет — берём главу, а не пустоту */
  }
  if(sc==='book'){
    chs=aiBookChapters();
    for(i=0;i<chs.length;i++)parts.push('«'+chs[i].title+'»:\n'+aiCut(aiChapterText(chs[i].ch),3500));
    return aiCut(parts.join('\n\n'),30000);
  }
  var blocks=aiChBlocks();
  if(sc==='around'){
    chs=aiBookChapters();
    var curId='';
    try{var cc=currentCh();curId=cc?cc.id:''}catch(e){}
    var idx=-1;
    for(i=0;i<chs.length;i++)if(chs[i].id===curId)idx=i;
    if(idx>0)parts.push('Предыдущая глава «'+chs[idx-1].title+'» (выдержка):\n'+aiCut(aiChapterText(chs[idx-1].ch),1500));
    if(blocks.length)parts.push(aiNumbered(blocks));
    if(idx>=0&&idx<chs.length-1)parts.push('Следующая глава «'+chs[idx+1].title+'» (выдержка):\n'+aiCut(aiChapterText(chs[idx+1].ch),1500));
    return parts.join('\n\n');
  }
  return blocks.length?aiNumbered(blocks):'';
}
/* Нормализация с картой позиций: цитата из ответа и текст главы сравниваются
   одинаково (регистр, ё/е, тире, кавычки-пробелы), а map[i] хранит индекс
   исходного символа — дальше строим Range без вмешательства в DOM */
function aiNormMap(s){
  var t='',map=[],raw=String(s==null?'':s),i,c,prevSp=true;
  for(i=0;i<raw.length;i++){
    c=raw.charAt(i).toLowerCase();
    if(c==='ё')c='е';
    else if(c==='—'||c==='–'||c==='−')c='-';
    if(/\s/.test(c)){
      if(prevSp)continue;
      c=' ';prevSp=true;
    }else prevSp=false;
    t+=c;map.push(i);
  }
  if(t.charAt(0)===' '){t=t.slice(1);map.shift()}
  if(t.charAt(t.length-1)===' '){t=t.slice(0,-1);map.pop()}
  return {t:t,map:map};
}

/* ── Диалоги: история в localStorage (активный диалог панели) ──────────── */
/* Активный диалог один: aiHist — алиас его hist. ctx снимается при
   создании диалога (книга/глава/текст), чтобы вопросы шли с тем же
   контекстом, с каким диалог начат. */
function aiCtxSnap(){
  var b=null;try{b=book()}catch(e){}
  var t=aiBookTitle(),ch=aiChTitle(),txt=aiChText(),chId='';
  try{var c=currentCh();chId=c&&c.id?c.id:''}catch(e){}
  /* книга не открыта (страница без редактора) — берём контекст активного
     диалога, если он есть (быстрый чат продолжается) */
  if(!t&&aiCur&&aiCur.ctx){t=aiCur.ctx.book;ch=aiCur.ctx.ch;txt=aiCur.ctx.chText;chId=aiCur.ctx.chId||''}
  return {bookId:b&&b.id?b.id:'',book:t,ch:ch,chId:chId,chText:aiCut(txt||'',9000)};
}
/* Контекст для промпта: живая книга — собираем текст по выбранному охвату
   (.ai-scope: глава / соседние / выделение / вся книга); чужая книга —
   снимок из диалога (не подмешиваем) */
function aiCtxNow(){
  var c=(aiCur&&aiCur.ctx)||{};
  var live=aiCtxSnap();
  var sameBook=!c.bookId?true:(!!live.bookId&&c.bookId===live.bookId);
  if(!sameBook)return {title:c.book,ch:c.ch,chId:c.chId||'',text:c.chText||''};
  return {title:live.book||c.book,ch:live.ch||c.ch,chId:live.chId||c.chId||'',
          text:aiCtxScopeText(aiScope())};
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
  aiRenderCtx();
}
function aiNewThread(){
  var th={id:uid()+'-'+Date.now().toString(36),title:'',ctx:aiCtxSnap(),hist:[],ts:Date.now()};
  aiThreads.unshift(th);
  aiCur=th;aiHist=th.hist;aiThinkOpen=-1;
  aiTrimThreads();aiSaveThreads();
  aiRenderCtx();aiRender();
  return th;
}
function aiTrimThreads(){while(aiThreads.length>20)aiThreads.pop()}
/* Сериализация: режем поля по размеру — история живёт в localStorage.
   ctx сообщения {b,c} — книга/глава, к которым относится ответ: по ним
   чип цитаты .ai-cite находит нужную главу (см. aiCiteGo) */
function aiThreadSave(t){
  return {id:t.id,title:t.title,ts:t.ts,ctx:t.ctx,
    hist:t.hist.slice(-40).map(function(m){
      /* во время уточнения (repairing) m.content занят стримом — в сохранение
         уходит исходный ответ m.orig, иначе перезагрузка посреди уточнения
         оставила бы «(пустой ответ)» */
      var c=(m.repairing&&m.orig!=null)?m.orig:m.content;
      var o={role:m.role,content:aiCut(String(c==null?'':c),4000),
             think:m.think?aiCut(m.think,1200):'',noFmt:m.noFmt?1:0};
      if(m.ctx&&(m.ctx.b||m.ctx.c))o.ctx={b:String(m.ctx.b||''),c:String(m.ctx.c||'')};
      return o;
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
      }catch(e2){}
    }
  },400);
}
/* Немедленная запись при уходе со страницы: отложенный save (400 мс) иначе
   теряется — закрытие вкладки/перезагрузка в первые 400 мс после действия
   стирали бы последнее изменение истории диалогов */
function aiFlushThreads(){
  if(!aiSaveTimer)return;
  clearTimeout(aiSaveTimer);aiSaveTimer=0;
  try{
    if(aiThreads.length)localStorage.setItem(AI_TH_LS,JSON.stringify(aiThreads.map(aiThreadSave)));
  }catch(e){}
}
addEventListener('beforeunload',aiFlushThreads);
addEventListener('pagehide',aiFlushThreads);
document.addEventListener('visibilitychange',function(){if(document.hidden)aiFlushThreads()});
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
             ch:String(t.ctx&&t.ctx.ch||''),chId:String(t.ctx&&t.ctx.chId||''),
             chText:String(t.ctx&&t.ctx.chText||'')},
        hist:t.hist.filter(function(m){return m&&(m.role==='user'||m.role==='assistant')})
          .map(function(m){
            /* старые записи с action (создание книг/глав) читаем без него:
               их content — обычный текст, он и отображается */
            var o={role:m.role,content:String(m.content||''),think:String(m.think||''),
                   noFmt:!!m.noFmt,ctx:null};
            if(m.ctx&&(m.ctx.b||m.ctx.c))
              o.ctx={b:String(m.ctx.b||''),c:String(m.ctx.c||'')};
            return o;
          })
      });
    });
  }catch(e){}
  aiThreads.sort(function(a,b){return b.ts-a.ts});
  aiTrimThreads();
  /* пусто — диалог НЕ создаём: пустой ключ не должен появляться в
     localStorage, пока ИИ не пользовались (создаст первый вопрос —
     см. aiNewThread) */
  if(aiThreads.length){aiCur=aiThreads[0];aiHist=aiCur.hist}
  else{aiCur=null;aiHist=[]}
}
/* Системный промпт: оглавление книги + контекст по охвату .ai-scope
   (пронумерованные абзацы главы / выдержки соседних / вся книга) +
   опциональное выделение + правила ссылок на места [[цитата]] */
function aiSystemPrompt(extra){
  var s='Ты — ассистент в приложении «Черновик» (чтение и правка рукописей). Помогаешь автору разобрать текст: отвечаешь по книге, находишь ошибки и слабые места и объясняешь, ГДЕ именно в тексте что не так.';
  var cx=aiCtxNow(),title=cx.title,ch=cx.ch;
  if(title)s+='\nКнига: «'+title+'».'+(ch?'\nТекущая глава: «'+ch+'» (её абзацы пронумерованы [n] — так модель ориентируется в тексте).':'');
  /* оглавление: модель должна понимать устройство рукописи целиком */
  var list=aiBookChapters(),i,names=[],cur=-1;
  if(list.length>1){
    for(i=0;i<list.length;i++){
      if(cx.chId&&list[i].id===cx.chId)cur=i;
      names.push((i+1)+'. '+aiCut(list[i].title,40));
    }
    s+='\nГлавы: '+names.join('; ')+'.'+(cur>=0?' Работаешь с главой '+(cur+1)+'.':'');
  }
  if(cx.text)s+='\n\nКонтекст (текущая глава — с номерами абзацев, соседние главы — выдержки; может быть обрезан):\n"""\n'+aiCut(cx.text,12000)+'\n"""';
  if(extra)s+='\n\n'+extra;
  /* Ссылки на места: цитата в [[…]] — чип в чате, по клику подсветит
     фрагмент в редакторе (см. aiCiteGo) */
  s+='\n\nСсылки на места в тексте. Когда говоришь о конкретном месте (ошибка, спорный момент, повтор, сильная или слабая строчка) — после пояснения ставь точную цитату из этого места в двойных квадратных скобках: [[…]]. Требования: 3–15 слов подряд ДОСЛОВНО из контекста, без сокращений и пропусков внутри, цитата встречается в контексте один-в-один — по ней приложение найдёт и подсветит место в редакторе. Таких ссылок может быть несколько.';
  s+='\n\nЧего не делать: не создавай книги и главы и не переписывай текст за автора — только анализ и ответы на вопросы. Не выдумывай фактов, которых нет в контексте: если данных не хватает — прямо скажи и уточни, что нужно.';
  s+='\n\nОтвечай по-русски, по существу, без воды; без markdown-заголовков и жирного выделения.';
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
      /* размышление: DeepSeek шлёт reasoning_content, часть релеев —
         reasoning / thinking; ловим все три, иначе «размышление не видно» */
      var rc=(typeof d.reasoning_content==='string')?d.reasoning_content:
             ((typeof d.reasoning==='string')?d.reasoning:
             ((typeof d.thinking==='string')?d.thinking:''));
      if(rc){emit(rc,true);return}
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
  var full='',stalled=false;
  /* Простой: сервер молчит дольше 60 с (обрыв связи без FIN) — рвём запрос,
     иначе busy зависнет до ручного «Стоп». beat() сбрасывается каждым куском
     потока и при ожидании заголовков; stall уходит как ретраебельная ошибка */
  var idle=0;
  function beat(){
    if(idle)clearTimeout(idle);
    idle=setTimeout(function(){stalled=true;try{ctrl.abort()}catch(e){}},60000);
  }
  beat();
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
      beat();
      full+=t;
      onDelta(t,isThink);
    });
  }).then(function(){
    if(idle)clearTimeout(idle);
    if(aiAbort===ctrl)aiAbort=null;
    onDone(full);
  }).catch(function(e){
    if(idle)clearTimeout(idle);
    if(aiAbort===ctrl)aiAbort=null;
    if(stalled&&e&&e.name==='AbortError'){
      var er=new Error('модель не отдавала данные 60 секунд');
      er.status=0;                         /* 0 → ретраебельно → автоповтор */
      onErr(er);
    }else onErr(e);                        /* AbortError обрабатывает вызывающий */
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
        /* статус не только цветом: у точки есть текст для скринридера */
        var lbl=s.ok?'Связь с ИИ есть':'ИИ временно недоступен';
        d.setAttribute('aria-label',lbl);
        d.setAttribute('title',lbl);
      });
      if(s.ok){
        if(aiPingTimer){clearTimeout(aiPingTimer);aiPingTimer=0}
      }else if(!aiPingTimer){
        aiPingTimer=setTimeout(function(){aiPingTimer=0;aiPing()},60000); /* ИИ лёг — перепроверим сами */
      }
      return s.ok;
    });
}

/* Строка контекста: книга/глава + охват (.ai-scope) + размер. Выделение
   показываем всегда, когда оно есть — в запрос оно попадает отдельным
   блоком независимо от охвата (см. aiAsk). Сознательно не дёргаем
   aiCtxNow(): он собирает текст для промпта целиком, а label пересчитывается
   на каждый selectionchange (см. debounce в aiInit) */
function aiCtxLabel(){
  var c=(aiCur&&aiCur.ctx)||{}, parts=[];
  var live=aiCtxSnap();
  var sameBook=!c.bookId?true:(!!live.bookId&&c.bookId===live.bookId);
  var bt=sameBook?(live.book||c.book):c.book;
  var ch=sameBook?(live.ch||c.ch):c.ch;
  if(bt)parts.push('«'+aiCut(bt,22)+'»');
  var sc=aiScope();
  if(sc==='book')parts.push('вся книга');
  else if(ch)parts.push('глава «'+aiCut(ch,18)+'»');
  if(sc==='around')parts.push('и соседние');
  var sel=aiSelection();
  if(sel)parts.push('выделено '+fmt(sel.length)+' зн.');
  else if(sc==='sel')parts.push('выделение пусто');
  else if(sc==='ch'||sc==='around'){
    var n=aiChText().length;                     /* дешёвая оценка размера */
    if(n)parts.push('→ '+fmt(n)+' зн.');
  }
  return parts.length?parts.join(' · '):'без контекста книги';
}
function aiRenderCtx(){
  var a=aiEl('aiPanelCtx');if(a)a.textContent=aiCtxLabel();
}

/* ── Панель чата ───────────────────────────────────────────────────────── */
function aiOpenPanel(){
  /* ИИ открывается ТОЛЬКО на странице книги (просьба) — на полке
     библиотеки кнопок для него больше нет, а программные пути глушим */
  if(typeof inBookPage==='function'&&!inBookPage()){
    if(typeof toast==='function')toast('ИИ открывается на странице книги');
    return;
  }
  var p=aiEl('aiPanel');
  if(!p)return;
  p.classList.add('on');
  /* чат — раздел Энциклопедии: открываем панель вики на вкладке «Чат» */
  if(typeof toggleWikiPanel==='function')toggleWikiPanel(true,'ai');
  aiFabs().forEach(function(f){f.setAttribute('aria-expanded','true')});
  aiRender();aiRenderCtx();aiSyncLink();aiPing();
  setTimeout(function(){var i=aiEl('aiInput');if(i&&!aiBusy)i.focus()},60);
}
function aiClosePanel(){
  var p=aiEl('aiPanel');
  if(p)p.classList.remove('on');
  aiFabs().forEach(function(f){f.setAttribute('aria-expanded','false')});
  /* раздел закрыли — закрывается и панель Энциклопедии */
  var w=document.getElementById('wikiPanel');
  if(typeof toggleWikiPanel==='function'&&w&&w.classList.contains('on')
     &&typeof panelTab!=='undefined'&&panelTab==='ai')toggleWikiPanel(false);
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
/* Цитаты [[…]] из ответа модели — по ним чип ведёт к месту в тексте */
var AI_CITE_RE='\\[\\[([\\s\\S]{6,240}?)\\]\\]';
function aiCites(t){
  var out=[],m,re=new RegExp(AI_CITE_RE,'g');
  while((m=re.exec(String(t==null?'':t)))){
    out.push(m[1].replace(/\s+/g,' ').replace(/^\s+|\s+$/g,''));
  }
  return out;
}
/* HTML ответа: текст вокруг цитат форматируем (aiChatFmt), сами цитаты —
   чипами .ai-cite дословно: форматирование меняет тире/кавычки, и цитата
   перестала бы находиться в тексте главы */
function aiBotHtml(m){
  var txt=String(m.content==null?'':m.content);
  if(m.noFmt)return esc(txt);
  /* недописанная [[цитата — при стриме прячем хвост, не мусорим маркером */
  var open=txt.lastIndexOf('[[');
  if(open>=0&&txt.indexOf(']]',open)<0)txt=txt.slice(0,open);
  var out='',last=0,n=0,mm,re=new RegExp(AI_CITE_RE,'g');
  while((mm=re.exec(txt))){
    var quote=mm[1].replace(/\s+/g,' ').replace(/^\s+|\s+$/g,'');
    out+=esc(aiChatFmt(txt.slice(last,mm.index)));
    out+='<button class="ai-cite" type="button" data-aicit="'+n+'" title="Показать это место в тексте">«'+esc(quote)+'»</button>';
    last=mm.index+mm[0].length;n++;
  }
  out+=esc(aiChatFmt(txt.slice(last)));
  return out;
}
/* Рендер ленты (innerHTML + esc — как в остальных модулях).
   Ленты две (панель + страница, data-aimsgs) — собираем html один раз.
   rAF-троттлинг: при стриминге на каждый чанк не пересобираем DOM
   (иначе ~70 rebuild/сек); кеш строки — рендер без изменений не трогает
   DOM вовсе, фокус/каретка внутри ленты живут дольше */
var aiRenderRaf=0;
function aiRender(){
  if(aiRenderRaf)return;
  aiRenderRaf=requestAnimationFrame(function(){
    aiRenderRaf=0;
    var boxes=document.querySelectorAll('[data-aimsgs]');
    if(!boxes.length)return;
    var h=aiRenderHtml();
    Array.prototype.forEach.call(boxes,function(box){
      if(box._aih===h)return;                 /* без изменений — DOM не трогаем */
      var pinned=(box.scrollHeight-box.scrollTop-box.clientHeight)<48;
      box.innerHTML=h;
      box._aih=h;
      if(pinned)box.scrollTop=box.scrollHeight;
      aiJumpSync(box);
    });
  });
}
/* Кнопка «к последнему сообщению»: видна, когда ушли вверх от конца */
function aiJumpSync(box){
  var feed=box&&box.parentNode;
  if(!feed||!feed.querySelector)return;
  var jb=feed.querySelector('.ai-jump');
  if(!jb)return;
  var far=box.scrollHeight-box.scrollTop-box.clientHeight>60;
  jb.classList.toggle('on',!!far);
}
function aiRenderHtml(){
  var h='',prevRole='';
  if(!aiHist.length){
    h+='<div class="ai-empty"><span class="ai-spark">'+AI_SPARK+'</span><b>ИИ-ассистент</b>'+
       'Спросите что угодно по книге — контекст подхватится сам (охват выбирается в шапке). '+
       'Где ИИ находит ошибку, он цитирует место — по цитате перейдёте прямо в текст.</div>';
  }else{
    aiHist.forEach(function(m,i){
      if(m.think){
        /* живое «Размышляет…» — пока модель не начала писать ответ;
           после — свёрнутая карточка с длительностью */
        var live=aiBusy&&i===aiHist.length-1&&!m.content&&!m.repairing;
        var dur=(m.thinkMs>0)?Math.max(1,Math.round(m.thinkMs/1000)):0;
        var el=(live&&m.thinkT0)?Math.max(0,Math.round((Date.now()-m.thinkT0)/1000)):0;
        h+='<details class="ai-think'+(live?' live':'')+'"'+
           (((live&&aiThinkOpen!==-2)||i===aiThinkOpen)?' open':'')+' data-i="'+i+'">'+
           '<summary>'+
           (live?'<span class="ai-th-dot" aria-hidden="true"></span>Размышляет':'Рассуждение')+
           '<span class="ai-th-t">'+(live?(el+' с'):(dur?(dur+' с'):''))+'</span>'+
           '</summary>'+
           '<span class="ai-think-b">'+esc(aiChatFmt(aiCut(m.think,1600)))+'</span></details>';
      }
      if(m.role==='user'){
        h+='<div class="ai-msg user'+(prevRole==='user'?' tight':'')+'">'+esc(m.content)+'</div>';
        prevRole='user';
      }else{
        if(!m.content&&m.think&&!aiBusy){
          prevRole='';                   /* остановили во время рассуждения —
                                            текста нет, think показан выше */
        }else{
          var body;
          if(m.repairing)body=esc('Уточняю структуру…');
          else if(m.content)body=aiBotHtml(m);
          else if(aiBusy)body='<span class="ai-typing" role="img" aria-label="ИИ печатает ответ"><i></i><i></i><i></i></span>';
          else body=esc('(пустой ответ)');
          var empty=!m.content||m.repairing;
          h+='<div class="ai-msg bot'+(empty?' empty':'')+(prevRole==='bot'&&!empty?' tight':'')+'" data-i="'+i+'">'+body+'</div>';
          prevRole='bot';
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

/* ── Переход к месту: цитата [[…]] → подсветка фрагмента в #editor ────── */
/* Range внутри блока по смещениям в его textContent: текстовые узлы
   блока складываем в порядке обхода (aiChBlocks отдаёт те же блоки,
   что ушли модели в промпт — смещения совпадают с её видом текста) */
function aiRangeInBlock(el,from,to){
  var w,r=document.createRange(),acc=0,started=false,n;
  try{w=document.createTreeWalker(el,NodeFilter.SHOW_TEXT,null)}catch(e){return null}
  while((n=w.nextNode())){
    var len=n.data.length;
    if(!started&&acc+len>from){r.setStart(n,from-acc);started=true}
    if(started&&acc+len>=to){r.setEnd(n,to-acc);return r}
    acc+=len;
  }
  return null;
}
/* Подсветка — оверлей поверх редактора: DOM #editor НЕ мутируется,
   иначе scheduleSave мог бы записать временный <span> в главу */
function aiFlash(range){
  var rects=range.getClientRects(),host=document.createElement('div'),any=null,i;
  host.className='ai-flash-host';
  for(i=0;i<rects.length;i++){
    var r=rects[i];
    if(r.width<1||r.height<1)continue;
    var d=document.createElement('i');
    d.className='ai-flash';
    d.style.left=Math.round(r.left)+'px';
    d.style.top=Math.round(r.top)+'px';
    d.style.width=Math.round(r.width)+'px';
    d.style.height=Math.round(r.height)+'px';
    host.appendChild(d);
    if(!any)any=r;
  }
  document.body.appendChild(host);
  setTimeout(function(){if(host.parentNode)host.parentNode.removeChild(host)},2500);
  return any;
}
function aiScrollToRect(rect){
  var sc=aiEl('scroller');
  if(!rect||!sc)return;
  var box=sc.getBoundingClientRect();
  var top=sc.scrollTop+(rect.top-box.top)-(sc.clientHeight/2)+(rect.height/2);
  try{sc.scrollTo({top:top,behavior:'smooth'})}catch(e){sc.scrollTop=top}
}
/* Поиск цитаты в блоках главы: дословно, затем по первым четырём словам
   (цитата могла «склеиться» при форматировании ответа) */
function aiCiteFind(quote){
  var blocks=aiChBlocks();
  if(!blocks.length){toast('Откройте главу — по ней цитата не найдётся');return}
  var full=aiNormMap(quote).t;
  var heads=full.split(' ').slice(0,4).join(' ');
  var needles=heads&&heads!==full?[full,heads]:[full];
  for(var k=0;k<needles.length;k++){
    var needle=needles[k];
    if(!needle)continue;
    for(var i=0;i<blocks.length;i++){
      var nm=aiNormMap(blocks[i].text);
      var at=nm.t.indexOf(needle);
      if(at<0)continue;
      var last=Math.min(at+needle.length,nm.map.length)-1;
      if(last<at||!blocks[i].el)continue;
      var r=aiRangeInBlock(blocks[i].el,nm.map[at],nm.map[last]+1);
      if(!r)continue;
      aiScrollToRect(aiFlash(r));
      return;
    }
  }
  toast('Фрагмент не найден — текст главы изменился');
}
/* Клик по чипу цитаты: сверяем книгу/главу сообщения с открытой — чужая
   книга просит открыть её, чужая глава открывается сама (с задержкой,
   пока enterEditor перечитает DOM), потом подсвечиваем */
function aiCiteGo(msgIdx,citeIdx){
  var m=aiHist[msgIdx];
  if(!m)return;
  var cites=aiCites(m.content||'');
  var quote=cites[citeIdx];
  if(!quote){toast('Цитата не найдена');return}
  var ctx=m.ctx||{},live=aiCtxSnap();
  if(ctx.b&&live.bookId&&ctx.b!==live.bookId){
    toast('Цитата из другой книги — откройте её из библиотеки');return;
  }
  if(!live.bookId&&!ctx.c){aiCiteFind(quote);return}
  if(ctx.c&&live.chId!==ctx.c){
    if(typeof enterEditor!=='function'){toast('Откройте главу с этим фрагментом');return}
    try{enterEditor(ctx.c)}catch(e){toast('Глава недоступна');return}
    setTimeout(function(){aiCiteFind(quote)},260);
    return;
  }
  aiCiteFind(quote);
}

/* ── Отправка сообщения ────────────────────────────────────────────────── */
function aiField(){
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
  if(!aiCur)aiNewThread();               /* первый вопрос — создаём диалог */
  aiErrMsg='';aiRetryPending=false;
  if(!isRetry){
    aiRetried=false;
    if(aiRetryTimer){clearTimeout(aiRetryTimer);aiRetryTimer=0}
    aiThreadTouch(q);                        /* имя диалога + наверх списка */
    if(aiCur&&!aiCur.ctx.bookId)aiCur.ctx=aiCtxSnap(); /* пустой контекст — подхватываем книгу */
  }
  var sel=isRetry?'':aiSelection();   /* выделение к моменту повтора могло сняться */
  /* при охвате «только выделение» фрагмент уже ушёл главным блоком контекста
     (aiCtxScopeText) — дублировать его отдельным куском не нужно */
  var sys=aiSystemPrompt(sel&&aiScope()!=='sel'?('\nВыделенный фрагмент (учти в ответе; при ссылках на него цитируй его через [[…]]):\n«'+aiCut(sel,4000)+'»'):'');

  var feed=aiHist;                /* история ЭТОГО диалога: во время потока её можно
                                     сменить — колбэки работают с feed, не с aiHist */
  var my=++aiSeq;
  var last=feed[feed.length-1];
  var inHist=isRetry&&last&&last.role==='user'&&last.content===q;
  var hist=feed.slice();
  if(inHist)hist.pop();               /* последний user-q добавим сами ниже */

  var apiMsgs=[{role:'system',content:sys}];
  hist.slice(-12).forEach(function(m){     /* think в API не отправляем */
    apiMsgs.push({role:m.role,content:String(m.content==null?'':m.content)});
  });
  apiMsgs.push({role:'user',content:q});

  if(!inHist)feed.push({role:'user',content:q});
  /* к какой книге/главе относится ответ — по этим id чип цитаты откроет
     нужную главу, даже если пользователь уже переключился (см. aiCiteGo) */
  var snap=aiCtxSnap();
  var ass={role:'assistant',content:'',think:'',ctx:{b:snap.bookId||'',c:snap.chId||''}};
  feed.push(ass);
  aiBusy=true;
  Array.prototype.forEach.call(document.querySelectorAll('.ai-foot textarea'),function(t){
    if(!isRetry){t.value='';t.style.height='auto';t.style.overflowY='hidden'}
  });
  aiSetBusy(true);
  aiRender();

  aiRequest(apiMsgs,
    function(t,isThink){
      if(isThink){
        if(!ass.thinkT0)ass.thinkT0=Date.now();  /* таймер живого «Размышляет…» */
        ass.think+=t;
      }else{
        if(ass.thinkT0&&!ass.thinkMs)ass.thinkMs=Date.now()-ass.thinkT0;
        ass.content+=t;
      }
      aiRender();
    },
    function(){
      if(my===aiSeq){aiBusy=false;aiSetBusy(false)}
      if(ass.thinkT0&&!ass.thinkMs)ass.thinkMs=Date.now()-ass.thinkT0;
      if(!ass.content)ass.content=ass.think?'(без текста — см. рассуждение выше)':'(пустой ответ)';
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
  /* живой таймер «Размышляет…»: пока модель думает, секунды тикают сами
     (aiRender кеширует html — раз в секунду пересборка только при changes) */
  if(b&&!aiThinkTimer)aiThinkTimer=setInterval(function(){if(aiBusy)aiRender()},1000);
  if(!b&&aiThinkTimer){clearInterval(aiThinkTimer);aiThinkTimer=0}
  Array.prototype.forEach.call(document.querySelectorAll('.ai-send'),function(btn){
    btn.classList.toggle('busy',!!b);
    btn.title=b?'Остановить генерацию':'Отправить (Enter)';
    /* состояние — не только цветом: скринридер узнаёт «Стоп» и busy */
    btn.setAttribute('aria-label',b?'Стоп генерацию':'Отправить запрос');
    btn.setAttribute('aria-busy',b?'true':'false');
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
  aiRenderCtx();
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

/* ── Исправить / улучшить выделение ────────────────────────────────────── */
function aiTransform(kind,btn){
  if(aiBusy){toast('Дождитесь ответа ИИ');return}
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
  /* фокус внутрь диалога: Tab не уходит в затемнённый фон */
  setTimeout(function(){var c=aiEl('aiResClose');if(c)c.focus()},0);
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
      'display:flex;gap:12px;align-items:center;background:var(--panel,#22242c);color:var(--ink,#f5f5f7);'+
      'border:1px solid var(--line,#3c3f4b);border-radius:var(--r-md,12px);padding:10px 14px;'+
      'font:14px/1.4 var(--f-ui,-apple-system,system-ui,sans-serif);box-shadow:var(--shadow,0 10px 34px rgba(0,0,0,.4))';
    var txt=document.createElement('span');
    txt.textContent='Сайт обновился, а страница в кэше устарела'+
      (v?' (v'+v+' → v'+AI_HTML_V+')':'')+' — обновите её, пожалуйста.';
    var btn=document.createElement('button');
    btn.type='button';
    btn.textContent='Обновить';
    btn.style.cssText='background:var(--accent,#6c8cff);color:var(--bg,#161411);border:0;border-radius:var(--r-sm,8px);'+
      'padding:7px 14px;font:600 13px/1 var(--f-ui,-apple-system,system-ui,sans-serif);letter-spacing:.04em;cursor:pointer';
    btn.addEventListener('click',function(){location.reload()});
    var x=document.createElement('button');
    x.type='button';
    x.textContent='×';
    x.setAttribute('aria-label','Закрыть');
    x.style.cssText='background:none;border:0;color:var(--ink3,#9a9daa);font:20px/1 var(--f-ui,-apple-system,system-ui,sans-serif);'+
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
  aiOn('aiGear','click',aiToggleSettings);
  aiOn('aiClear','click',aiClearHist);
  aiOn('aiSend','click',aiSendMsg);
  aiOn('aiSave','click',aiSaveSettings);

  /* история диалогов: активный диалог восстанавливаем из localStorage —
     список-сайдбар ушёл вместе со старым режимом (#aiPage) */
  aiLoadThreads();

  /* настройки — общая модалка (⚙ панели);
     guard: старая разметка в кэше может не содержать #aiSetModal */
  var setClose=aiEl('aiSetClose');
  if(setClose)setClose.addEventListener('click',aiCloseSettings);
  var setModal=aiEl('aiSetModal');
  if(setModal)setModal.addEventListener('click',function(e){
    if(e.target===this)aiCloseSettings();
  });

  /* «Повторить» и чипы цитат (.ai-cite) — делегирование, их рисует aiRender */
  Array.prototype.forEach.call(document.querySelectorAll('[data-aimsgs]'),function(box){
    box.addEventListener('click',function(e){
      if(!e.target||!e.target.closest)return;
      var ct=e.target.closest('[data-aicit]');
      if(ct){
        /* чип лежит внутри .ai-msg.bot[data-i] — индекс сообщения берём оттуда */
        var msg=e.target.closest('[data-i]');
        aiCiteGo(msg?+msg.getAttribute('data-i'):0,+ct.getAttribute('data-aicit')||0);
        return;
      }
      if(e.target.closest('[data-airetry]'))aiRetryNow();
    });
    /* раскрытая «Рассуждением» деталь не должна схлопываться при каждом
       рендере (стриминг пересобирает ленту целиком): запоминаем её индекс,
       aiRender возвращает open по data-i. toggle не всплывает — фаза capture.
       -2 — пользователь сам закрыл (во время стрима это значит «не
       раскрывать автоматически», см. условие live в aiRenderHtml) */
    box.addEventListener('toggle',function(e){
      var d=e.target;
      if(!d||!d.classList||!d.classList.contains('ai-think'))return;
      aiThinkOpen=d.open?(+d.getAttribute('data-i')||0):-2;
    },true);
    /* «к последнему сообщению»: кнопка лежит в обёртке .ai-feed */
    box.addEventListener('scroll',function(){aiJumpSync(box)});
    var feed=box.parentNode,jb=feed&&feed.querySelector?feed.querySelector('.ai-jump'):null;
    if(jb)jb.addEventListener('click',function(){
      box.scrollTop=box.scrollHeight;
      aiJumpSync(box);
    });
  });

  aiBindInput(aiEl('aiInput'));

  /* селектор контекста (.ai-scope) */
  var scopeBtn=aiEl('aiScope');
  if(scopeBtn)scopeBtn.addEventListener('click',function(e){
    e.stopPropagation();
    if(scopeBtn.getAttribute('aria-expanded')==='true')aiCloseScopeMenu();
    else aiScopeMenuOpen(scopeBtn);
  });
  document.addEventListener('click',function(e){
    if(!e.target.closest||(!e.target.closest('#aiScopeMenu')&&!e.target.closest('.ai-scope')))aiCloseScopeMenu();
  });
  aiScopePaint();

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
  aiOn('aiResClose','click',aiCloseRes);
  aiOn('aiResCancel','click',aiCloseRes);
  aiOn('aiResCopy','click',aiCopyRes);
  aiOn('aiResApply','click',aiApplyRes);
  aiOn('aiResRetry','click',function(){   /* после сбоя ИИ */
    if(!aiLastKind)return;
    aiShowRes(aiLastKind);
    aiTransformRun(aiLastKind);
  });
  aiOn('aiResModal','click',function(e){
    if(e.target===this)aiCloseRes();
  });

  /* Esc в фазе захвата: закрываем верхний слой и глушим общую цепочку
     обработчиков 15-editor/14-search (они всплывают по document) */
  document.addEventListener('keydown',function(e){
    if(e.key!=='Escape')return;
    var sm=aiEl('aiScopeMenu');
    if(sm&&sm.classList.contains('on')){aiCloseScopeMenu();return}
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
