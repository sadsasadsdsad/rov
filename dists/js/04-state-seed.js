/* ==========================================================================
 * 04-state-seed.js — СОСТОЯНИЕ — seed, load/persist
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 18 JS-скриптов, подключаются строго по номеру.
 * Раздел оригинала: src/index.html, строки 1975–2153 (раздел 4 из 18).
 * Что делает: стартовые данные книги (seed), служебные главы «Памятка» и «Заметки», загрузка/миграция/сохранение состояния, доступчики книги и глав.
 * Ключевое: seed, load, persist, initState, normalizeState, book, currentCh, visibleChapters, bookWords, pamatkaHtml, ensureNotesChapter.
 * Зависимости: 01-core, 03-snapshots; читается всеми файлами с 05 по 17.
 * ========================================================================== */
"use strict";
/* ===== памятка / заметки-глава / seed / load ===== */
function pamatkaHtml(){
  return '<!--pamatka-v32--><h1>Памятка</h1>'+
  '<p>Это ваша рукопись: всё, что вы пишете, <strong>сохраняется автоматически</strong>. Кнопка с полкой возвращает к списку книг, стрелка вниз скачивает книгу, <strong>Ctrl&nbsp;+&nbsp;P</strong> печатает её целиком.</p>'+
  '<h2>Заметки</h2>'+
  '<p>Заметки бывают трёх видов. <strong>Врезка</strong> — блок «Заметка» прямо в тексте главы: виден только вам и <strong>никогда не попадает в печать и экспорт</strong>. Панель заметок собирает все врезки книги. И наконец, <strong>глава «Заметки»</strong> — отдельная глава для свободных записей, тоже исключена из печати и подсчёта слов.</p>'+
  '<p>Врез: <strong>Ctrl&nbsp;+&nbsp;Alt&nbsp;+&nbsp;N</strong>, либо <strong>/</strong> и пункт «Заметка». Переключение разделов — плавающие вкладки в верхней части панели: <strong>Мир · Заметки · Карта</strong>.</p>'+
  '<h2>Карта книги</h2>'+
  '<p>Вкладка «Карта» показывает <strong>структуру книги</strong>: главный герой в центре, вокруг — его прямые связи. Три режима: <strong>Радиальная</strong> (кольца по уровням), <strong>Круг</strong> и <strong>Силы</strong> (живая симуляция). Ползунки регулируют <strong>глубину</strong> (число шагов от главного узла) и <strong>порог силы связи</strong>.</p>'+
  '<p>Двойной клик по любому персонажу — <strong>фокус</strong> на нём: покажет только его связи. Перетащите узел — он <strong>закрепится</strong>; повторный перетаск закрепит заново, снять — кнопка «Вписать и сбросить фокус».</p>'+
  '<p><strong>Колесо мыши</strong> — зум, <strong>перетаскивание по пустому месту</strong> — сдвиг карты, кнопки зума — в правом нижнем углу.</p>'+
  '<h2>История и откат</h2>'+
  '<p>В библиотеке под графиком — <strong>полоса дней</strong>. Клик по дню открывает страницу: по каждой книге и главе видно прирост и убыль слов, там же кнопка «Откатить». Хранятся последние 30 дней.</p>'+
  '<h2>Метки в тексте</h2>'+
  '<p>Поставьте курсор и нажмите кнопку с флажком или <strong>Ctrl&nbsp;+&nbsp;Alt&nbsp;+&nbsp;M</strong>. Метка появится под главой в боковой панели.</p>'+
  '<h2>Энциклопедия</h2>'+
  '<p>Вкладка «Мир» — статьи о персонажах, городах, предметах. У каждой статьи можно задать <strong>другие имена</strong> (прозвища, титулы) — тогда поиск упоминаний и связи будут точнее.</p>'+
  '<h2>Поиск</h2>'+
  '<p>Поле поиска в шапке ищет одновременно <strong>по тексту глав</strong>, <strong>по энциклопедии</strong> и <strong>по заметкам</strong> — три колонки результатов.</p>'+
  '<h2>Горячие клавиши</h2>'+
  '<p><strong>Ctrl&nbsp;+&nbsp;B</strong> — жирный, <strong>Ctrl&nbsp;+&nbsp;I</strong> — курсив, <strong>Ctrl&nbsp;+&nbsp;F</strong> — поиск, <strong>Ctrl&nbsp;+&nbsp;Alt&nbsp;+&nbsp;M</strong> — метка, <strong>Ctrl&nbsp;+&nbsp;Alt&nbsp;+&nbsp;N</strong> — заметка.</p>'+
  '<p><strong>Ctrl&nbsp;+&nbsp;Alt&nbsp;+&nbsp;1</strong> — заголовок главы, <strong>2</strong> — подзаголовок, <strong>3</strong> — цитата, <strong>4</strong> — заметка, <strong>0</strong> — текст.</p>'+
  '<h2>Быстрый ввод</h2>'+
  '<p><strong>/</strong> в начале строки — меню блоков. <strong>#</strong> или <strong>##</strong> + пробел — заголовок. Три дефиса <strong>---</strong> — разделитель.</p>'+
  '<h2>Режим фокуса</h2>'+
  '<p>Кнопка с мишенью: интерфейс гаснет. Выход — <strong>Esc</strong>.</p>'+
  '<h2>Где хранятся данные</h2>'+
  '<p>Всё лежит в <strong>localStorage</strong> этого браузера. Книги — <code>chernovik.v2</code>, снапшоты — <code>chernovik.snapshots.v1</code>. Резервные копии — кнопки со стрелками в шапке библиотеки.</p>';
}
function notesChapterHtml(){
  return '<h1>Заметки</h1>'+
    '<p>Свободное поле для записей: планы, сцены, вопросы к самому себе. Эта глава <strong>не попадает в печать, экспорт и подсчёт слов</strong> — она существует только внутри «Черновика».</p>'+
    '<p>Если нужна заметка привязанная к конкретному месту в тексте — поставьте курсор в главе и нажмите <strong>Ctrl&nbsp;+&nbsp;Alt&nbsp;+&nbsp;N</strong>. Такая врезка появится и в панели «Заметки», и её видно только вам.</p>';
}
function refreshPamatka(b){
  var ch=null;
  for(var i=0;i<b.chapters.length;i++){
    var h=tmp(b.chapters[i].html).querySelector('h1');
    if(h&&h.textContent.trim()==='Памятка'){ch=b.chapters[i];break}
  }
  if(!ch)b.chapters.push({id:uid(),html:pamatkaHtml(),marks:[]});
  else if(ch.html.indexOf('pamatka-v32')<0)ch.html=pamatkaHtml();
}
function ensureNotesChapter(b){
  b.chapters=Array.isArray(b.chapters)?b.chapters:[];
  var ch=b.chapters.filter(function(c){return c.kind==='notes'})[0];
  if(!ch){
    ch={id:uid(),kind:'notes',html:notesChapterHtml(),pos:0,marks:[]};
    b.chapters.push(ch);
  }else if(!ch.html||!ch.html.trim()){
    ch.html=notesChapterHtml();
  }
  return ch;
}
function isPamatka(ch){
  if(!ch)return false;
  var h=tmp(ch.html).querySelector('h1');
  return !!(h&&/^\s*памятка\s*$/i.test(h.textContent));
}
function isNotesCh(ch){return !!(ch&&ch.kind==='notes')}
function visibleChapters(b){
  return (b.chapters||[]).filter(function(c){return !isPamatka(c)&&!isNotesCh(c)});
}

function seed(){
  var c1={id:uid(),marks:[],html:'<h1>Дом над туманом</h1><h2>I · Прибытие</h2><p>Поезд остановился ровно в полночь, и Анна первой шагнула на мокрый перрон. Воздух пах <em>дымом, хвоей и чем-то ещё</em> — так пахнет место, где тебя давно ждут.</p><div class="nb" data-nid="'+uid()+'">Проверить: поезд приходит в полночь во всех черновиках? Возможно, лучше вечер.</div><p><strong>Дом стоял на холме.</strong> Ниже, под туманом, спала деревня; выше — только небо и гулкий ветер в проводах.</p><div class="sep" contenteditable="false"><span><i></i><i></i><i></i></span></div><p>— Вы, верно, к смотрителю, — сказал старик у вокзала. Он не спрашивал. Он <em>знал</em>.</p><p>Анна кивнула и крепче сжала ручку чемодана. Где-то в глубине дома, на самом его дне, тихо скрипнула дверь.</p>'};
  var c2={id:uid(),marks:[],html:pamatkaHtml()};
  var c3={id:uid(),kind:'notes',marks:[],html:notesChapterHtml()};
  return {v:2,theme:'light',zen:false,spell:false,activeBookId:null,heroes:[],ui:{},stats:{},books:[{id:uid(),title:'Дом над туманом',color:COLORS[0],updated:Date.now(),current:c1.id,chapters:[c1,c2,c3],customTypes:[],wiki:[
    {id:uid(),type:'person',name:'Анна',aliases:['Аня'],desc:'Приезжает в дом над туманом. Сдержанная, наблюдательная.'},
    {id:uid(),type:'other',name:'Туман',aliases:[],desc:'Живая пелена, которая по ночам укрывает деревню под холмом.'}
  ]}]};
}
function load(){
  try{var s=JSON.parse(localStorage.getItem(LS));if(s&&Array.isArray(s.books))return s}catch(e){}
  try{
    var o=JSON.parse(localStorage.getItem('chernovik.v1'));
    if(o&&o.chapters&&o.chapters.length){
      return {v:2,theme:o.theme||'light',zen:false,spell:false,activeBookId:null,heroes:[],ui:{},stats:{},books:[{id:uid(),title:o.book||'Без названия',color:COLORS[0],updated:Date.now(),current:o.current,chapters:o.chapters,customTypes:[],wiki:[]}]};
    }
  }catch(e){}
  return seed();
}
function persist(){try{localStorage.setItem(LS,JSON.stringify(state))}catch(e){}if(typeof Sync!=='undefined'&&Sync.markDirty)Sync.markDirty()}

function initState(){
  state=load();
  state.spell=false;
  state.ui=(state.ui&&typeof state.ui==='object')?state.ui:{};
  state.stats=(state.stats&&typeof state.stats==='object')?state.stats:{};

  var changed=false;
  Object.keys(state.stats).forEach(function(k){
    if(typeof state.stats[k]==='number'){state.stats[k]={__all:state.stats[k]};changed=true}
  });
  if(changed)persist();

  migrateHeroes(state);
  ensureMarksOnChapters(state);
  state.books.forEach(refreshPamatka);
  state.books.forEach(function(b){
    b.wiki=Array.isArray(b.wiki)?b.wiki:[];
    b.customTypes=Array.isArray(b.customTypes)?b.customTypes:[];
    b.wiki.forEach(function(w){w.aliases=Array.isArray(w.aliases)?w.aliases.filter(Boolean):[]});
    ensureNotesChapter(b);
  });
  persist();
}

function migrateHeroes(st){
  if(!st||!Array.isArray(st.heroes)||!st.heroes.length)return st;
  st.books.forEach(function(b){
    b.wiki=Array.isArray(b.wiki)?b.wiki:[];
    st.heroes.forEach(function(h){
      if(!h||!h.name)return;
      var exists=b.wiki.some(function(w){return (w.name||'').toLowerCase()===h.name.toLowerCase()});
      if(!exists)b.wiki.push({id:uid(),type:'person',name:h.name,desc:h.desc||'',aliases:[]});
    });
  });
  st.heroes=[];return st;
}
function ensureMarksOnChapters(st){
  if(!st||!Array.isArray(st.books))return st;
  st.books.forEach(function(b){
    (b.chapters||[]).forEach(function(ch){
      if(!Array.isArray(ch.marks))ch.marks=[];
      ch.marks=ch.marks.filter(function(m){return m&&typeof m==='object'&&m.label});
    });
  });
  return st;
}

function normalizeState(s){
  if(!s||!Array.isArray(s.books))return null;
  return {
    v:2,theme:(s.theme==='dark'||s.theme==='sepia')?s.theme:'light',zen:false,spell:false,
    activeBookId:null,heroes:Array.isArray(s.heroes)?s.heroes:[],
    ui:(s.ui&&typeof s.ui==='object')?s.ui:{},
    stats:(s.stats&&typeof s.stats==='object')?s.stats:{},
    books:s.books.map(function(b){
      return {
        id:(typeof b.id==='string'&&b.id)?b.id:uid(),
        title:(typeof b.title==='string')?b.title:'Без названия',
        color:(COLORS.indexOf(b.color)>=0)?b.color:COLORS[0],
        updated:(typeof b.updated==='number')?b.updated:Date.now(),
        current:(typeof b.current==='string')?b.current:null,
        customTypes:Array.isArray(b.customTypes)?b.customTypes.filter(function(t){return t&&t.k&&t.s}):[],
        wiki:Array.isArray(b.wiki)?b.wiki.map(function(w){
          return {id:(w&&w.id)?w.id:uid(),type:(w&&typeof w.type==='string')?w.type:'other',name:(w&&typeof w.name==='string')?w.name:'',desc:(w&&typeof w.desc==='string')?w.desc:'',aliases:Array.isArray(w&&w.aliases)?w.aliases.filter(Boolean):[]};
        }).filter(function(w){return w.name}):[],
        chapters:Array.isArray(b.chapters)?b.chapters.map(function(c){
          var marks=Array.isArray(c&&c.marks)?c.marks.map(function(m){
            return {id:(m&&m.id)?m.id:uid(),label:(m&&typeof m.label==='string')?m.label:'',pos:(m&&typeof m.pos==='number')?m.pos:0,snippet:(m&&typeof m.snippet==='string')?m.snippet:''};
          }).filter(function(m){return m.label}):[];
          return {id:(c&&typeof c.id==='string')?c.id:uid(),html:(c&&typeof c.html==='string')?c.html:'',pos:(c&&typeof c.pos==='number')?c.pos:0,marks:marks,kind:(c&&typeof c.kind==='string')?c.kind:''};
        }):[]
      };
    })
  };
}

/* foreignDoc — чужая книга ВНЕ state.books: не попадает в persist/экспорт/бэкап */
var foreignDoc=null,foreignMeta={};
function book(){if(foreignDoc)return foreignDoc;return state.books.find(function(b){return b.id===state.activeBookId})}
function currentCh(){var b=book();if(!b||!b.chapters.length)return null;return b.chapters.find(function(c){return c.id===b.current})||b.chapters[0]}
function chapterTitle(ch){var h=tmp(ch.html).querySelector('h1');var t=h?h.textContent.trim():'';return t||(isNotesCh(ch)?'Заметки':'Без названия')}
function chapterWords(ch){return countWords(tmp(ch.html).textContent)}
function bookWords(b){return visibleChapters(b).reduce(function(a,c){return a+chapterWords(c)},0)}
function totalWordsAll(){return state.books.reduce(function(s,b){return s+bookWords(b)},0)}

function snapshotStats(){
  var today=todayKey();
  var entry=state.stats[today];
  if(typeof entry==='number'){entry={__all:entry};state.stats[today]=entry}
  if(!entry||typeof entry!=='object')entry=state.stats[today]={};
  state.books.forEach(function(b){entry[b.id]=bookWords(b)});
  entry.__all=totalWordsAll();
  takeSnapshot();
  return entry.__all;
}

