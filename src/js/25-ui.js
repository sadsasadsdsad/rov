/* ==========================================================================
 * 25-ui.js — UI-ПРИМИТИВЫ — плавающая подсказка и переключатель темы
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 25 JS-скриптов, подключаются строго по номеру.
 * Что делает: (1) плавающая подсказка по [data-ftip] — пузырь идёт за курсором
 *   с пружиной, от скорости тянется и наклоняется (по образцу unlumen-ui
 *   Floating Tooltip); (2) переключатель темы (Theme Switch) — setTheme из
 *   15-editor.js заворачивается в круговое раскрытие новой темы из точки
 *   клика (View Transition API) с пружинным свопом иконки .ui-twist;
 *   (3) нижний таббар разделов — setLibTab заворачивается в плавное
 *   переключение без задержек: пружина ширины пилюли + въезд нового
 *   раздела (.tb-in-r/.tb-in-l, смотрите 13-ui.css).
 * Ключевое: uiTip, data-ftip/data-ftip-sub, window.setTheme, window.setLibTab,
 *   --vt-x/--vt-y.
 * Порядок: последний — setTheme и THEME_NEXT берутся из 15-editor.js.
 * ========================================================================== */
'use strict';

/* ─── Плавающая подсказка ────────────────────────────────────────────────
 * Над элементом с data-ftip нативный title гасится (две подсказки не спорят)
 * и возвращается на место при уходе. Пузырь догоняет курсор пружиной: за
 * счёт скорости он слегка наклоняется и растягивается, у краёв окна
 * переворачивается на другую сторону. На сенсорных экранах не включается. */
var uiTip=(function(){
  var box=null,cur=null,save=null;
  var px=0,py=0,tx=0,ty=0,ox=16,oy=18,raf=0,on=false;

  function fine(){
    return !!(window.matchMedia&&window.matchMedia('(hover:hover) and (pointer:fine)').matches);
  }
  function node(){
    if(box)return box;
    box=document.createElement('div');
    box.className='ui-tip';
    box.setAttribute('role','tooltip');
    box.innerHTML='<b class="ut-t"></b><span class="ut-sub"></span>';
    document.body.appendChild(box);
    return box;
  }
  function host(t){
    while(t&&t!==document.body){
      if(t.nodeType===1&&t.hasAttribute('data-ftip'))return t;
      t=t.parentNode;
    }
    return null;
  }
  function aim(e){
    var w=box.offsetWidth,h=box.offsetHeight;
    ox=16;oy=18;
    if(e.clientX+ox+w+12>window.innerWidth)ox=-(w+16);
    if(e.clientY+oy+h+12>window.innerHeight)oy=-(h+16);
    tx=e.clientX+ox;ty=e.clientY+oy;
  }
  function show(t,e){
    /* меню настроек (26-settings.js) z-порядком ниже подсказки — пока оно
       открыто, тултип молчит: он нависал над пунктами «Профиль»/«Настройки» */
    var sm=document.getElementById('slideMenu');
    if(sm&&sm.classList.contains('on'))return;
    cur=t;
    save=t.getAttribute('title');
    if(save!==null)t.setAttribute('title','');        /* нативная — не мешает */
    var b=node();
    b.querySelector('.ut-t').textContent=t.getAttribute('data-ftip')||save||'';
    var sub=t.getAttribute('data-ftip-sub'),se=b.querySelector('.ut-sub');
    se.textContent=sub||'';
    if(sub)se.removeAttribute('hidden');else se.setAttribute('hidden','');
    aim(e);
    if(!on){px=tx;py=ty}
    on=true;
    b.classList.add('on');
    if(!raf)raf=requestAnimationFrame(step);
  }
  function hide(){
    if(!on)return;
    on=false;
    if(box)box.classList.remove('on');
    if(cur){
      if(save!==null&&!cur.getAttribute('title'))cur.setAttribute('title',save);
      cur=null;save=null;
    }
    if(raf){cancelAnimationFrame(raf);raf=0}
  }
  function step(){
    if(!cur||!document.documentElement.contains(cur)){hide();return}
    var kx=(tx-px)*0.16,ky=(ty-py)*0.16;
    px+=kx;py+=ky;
    var sk=Math.max(-7,Math.min(7,kx*1.1));            /* наклон от скорости */
    var sc=1+Math.min((Math.abs(kx)+Math.abs(ky))*0.05,0.05);
    box.style.transform='translate3d('+px.toFixed(1)+'px,'+py.toFixed(1)+'px,0)'+
      ' skewX('+sk.toFixed(2)+'deg) scale('+sc.toFixed(3)+')';
    raf=requestAnimationFrame(step);
  }

  document.addEventListener('mouseover',function(e){
    if(!fine())return;
    var t=host(e.target);
    if(t&&t===cur){aim(e);return}
    hide();
    if(t)show(t,e);
  },true);
  document.addEventListener('mousemove',function(e){
    if(cur)aim(e);
  },true);
  document.addEventListener('mouseout',function(e){
    if(!cur)return;
    var t=e.relatedTarget;
    if(t&&cur.contains(t))return;
    hide();
  },true);
  document.addEventListener('scroll',hide,true);        /* уехали — подсказка не висит */
  document.addEventListener('keydown',function(e){if(e.keyCode===27)hide()},true);
  window.addEventListener('blur',hide);
  return {hide:hide};
})();

/* ─── Переключатель темы (Theme Switch) ──────────────────────────────────
 * setTheme из 15-editor.js заменяется на обёртку: новая тема раскрывается
 * кругом из точки последнего клика (View Transition), иконка (солнце /
 * книга / луна) после этого подпружинивает классом .ui-twist. Сам порядок
 * тем, persist() и все побочные эффекты остаются прежними — делает orig(). */
(function(){
  var root=document.documentElement;
  if(typeof window.setTheme!=='function')return;
  var orig=window.setTheme;
  var cx=0,cy=0;

  function twist(){
    root.classList.add('ui-twist');
    setTimeout(function(){root.classList.remove('ui-twist')},700);
  }
  function reduced(){
    return !!(window.matchMedia&&window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }
  document.addEventListener('click',function(e){
    cx=e.clientX||0;cy=e.clientY||0;
  },true);

  window.setTheme=function(t){
    var changed=(root.getAttribute('data-theme')||'light')!==t;
    var vt=document.startViewTransition;
    if(changed&&vt&&!reduced()){
      root.style.setProperty('--vt-x',(cx||window.innerWidth/2)+'px');
      root.style.setProperty('--vt-y',(cy||window.innerHeight/2)+'px');
      try{
        /* иконка крутится внутри update-колбэка: круг раскрывает страницу,
           где своп уже идёт — одна связная анимация вместо «тема, потом
           отдельная анимация клика» */
        var tr=vt.call(document,function(){orig(t);twist()});
        if(tr&&tr.finished&&tr.finished.catch)tr.finished.catch(function(){});
        return;
      }catch(err){/* без View Transition — просто переключаем */}
    }
    orig(t);
    twist();
  };
})();

/* ══ Motion Tab Menu — плавающий таббар разделов библиотеки ══════════════
   Пилюля внизу экрана с иконками «Мои книги»/«Общие книги»: панель
   разворачивается в подпись активной вкладки. Переключение разделов —
   БЕЗ ЗАДЕРЖЕК и всегда с анимацией: setLibTab (21-shared.js)
   оборачивается — кнопки, подложка и контент обновляются сразу по
   клику; подпись пилюли меняется мгновенно, но её ширина доезжает
   пружиной от старого значения к новому (своп — transition width,
   разворот/сворачивание — max-width от нуля, 13-ui.css), а новый раздел въезжает длинной пружиной в сторону
   переключения (.tb-in-r/.tb-in-l). При prefers-reduced-motion —
   мгновенный своп. View Transition не используется: снимок старой
   пилюли совпадал с новой и морф не запускался — анимация пропадала.
   mousedown мимо — сворачивает обратно в иконки. */
(function(){
  var bar=document.getElementById('libTabs');
  if(!bar)return;
  var lbl=document.getElementById('tabbarLbl');
  var cur=(bar.getAttribute('data-tab')==='shared')?'shared':'mine';
  var reduced=window.matchMedia&&window.matchMedia('(prefers-reduced-motion:reduce)').matches;
  /* «точка»-выделение .tabbar-ind: плавно перекатывается на активную
     кнопку (просьба «точка плавно до туда двигается»). left/top — те же
     координаты, что и у кнопки (offsetParent — сама пилюля); пока
     пилюля скрыта (книга/редактор), замерить нечего — молча пропускаем.
     fin=true — «как будет, когда подпись свернётся»: кнопка «Журнал»
     стоит ПОСЛЕ подписи в DOM, и её сдвиг зависит от ширины подписи.
     Сейчас вклад подписи в позицию = width + marginLeft + 2*gap, после
     сворачивания = 4px (width 0, margin -4 из класса) — вычитаю разницу;
     при уже свёрнутой подписи вычет ровно ноль. Работает в любой момент
     анимации: значение текущее, «финал» при этом неизменен */
  var ind=bar.querySelector('.tabbar-ind');
  function indTo(btn,fin){
    if(!ind||!btn||!bar.offsetWidth)return;
    var x=btn.offsetLeft;
    if(fin&&lbl){
      var w=parseFloat(getComputedStyle(lbl).width)||0;
      var ml=parseFloat(getComputedStyle(lbl).marginLeft)||0;
      x=x-(w+ml+4);
    }
    ind.style.left=x+'px';
    ind.style.top=btn.offsetTop+'px';
  }
  function titleOf(t){return t==='shared'?'Общие книги':'Мои книги'}
  function expand(on,t){
    if(!lbl)return;
    if(on){
      lbl.style.maxWidth='none';             /* хомут снят — мерим по тексту */
      lbl.style.width='auto';
      lbl.textContent=titleOf(t);
      var w=lbl.offsetWidth;
      if(bar.classList.contains('on')){
        /* уже открыта — плавно подстраиваем ширину, без сброса в ноль */
        lbl.style.width=w+'px';
        return;
      }
      lbl.style.width='0px';
      void lbl.offsetWidth;                    /* рефлоу — старт из нуля */
      lbl.style.width=w+'px';
      bar.classList.add('on');
    }else{
      /* сворачиваемся пружиной: ширина у всех открытых состояний явная
         (px), поэтому width→0px доезжает плавно, а не прыгает */
      lbl.style.width='0px';
      bar.classList.remove('on');
      /* страховка: если точка стоит на «Журнал» (его кнопка — после
         подписи, её двигает ширина) — пересаживаем её на финальную
         позицию тем же кадром и тем же пружинным ходом, что и подпись */
      var nj=bar.querySelector('button[data-news]');
      if(nj&&nj.classList.contains('on'))indTo(nj,true);
    }
  }
  function setActive(t){
    /* подсветка кнопок и подложки — сразу по клику, не дожидаясь обмена */
    bar.setAttribute('data-tab',t);
    var btns=bar.querySelectorAll('button[data-t]'),act=null;
    for(var i=0;i<btns.length;i++){
      var on=(btns[i].getAttribute('data-t')||'')===t;
      btns[i].classList.toggle('on',on);
      btns[i].setAttribute('aria-pressed',on?'true':'false');
      if(on)act=btns[i];
    }
    /* подпись — встаёт сразу за активной иконкой (просьба: «надпись должна
       появляться справа от иконки»): DOM переставляется здесь, ширина
       замеряется после переезда — порядок: [активная][подпись][остальные] */
    if(lbl&&act&&lbl.previousElementSibling!==act)bar.insertBefore(lbl,act.nextSibling);
    indTo(act);                                   /* точка перекатывается к кнопке */
  }
  function panelOf(t){
    return document.querySelector(t==='shared'?'#sharedBox':'#shelf');
  }
  function slideIn(el,dir){
    if(!el||reduced)return;
    el.classList.remove('tb-in-r','tb-in-l');
    void el.offsetWidth;                         /* рефлоу — анимация с нуля */
    el.classList.add(dir>=0?'tb-in-r':'tb-in-l');
  }
  /* setLibTab (21-shared.js) оборачиваем: кнопки и контент — сразу по
     клику, без пауз; пилюля «перетекает» пружиной: подпись меняется
     мгновенно, а её ширина доезжает от старой к новой (width +
     overflow:hidden), новый раздел въезжает (.tb-in-r/.tb-in-l).
     Всё стартует одновременно. */
  var orig=window.setLibTab;
  if(typeof orig==='function'){
    window.setLibTab=function(t){
      t=(t==='shared')?'shared':'mine';
      setActive(t);                              /* кнопки — без задержки */
      if(t===cur){
        orig(t);
        /* тап по активной иконке при свёрнутой пилюле — разворачивает её */
        if(!bar.classList.contains('on'))expand(true,t);
        return;
      }
      var fwd=(t==='shared')?1:-1;
      cur=t;
      if(lbl){
        /* пружина ширины: max-width только сжимает — при более коротком
           новом тексте коробка прыгнула бы сразу, поэтому своп идёт по
           width (overflow:hidden): старая ширина → новый текст →
           width от старой к новой. Разворот/сворачивание — по-прежнему
           max-width от нуля. */
        var w0=lbl.offsetWidth;
        lbl.style.maxWidth='none';
        lbl.style.width='auto';
        lbl.textContent=titleOf(t);
        var w1=lbl.offsetWidth;
        if(reduced){
          lbl.style.width=w1+'px';
        }else{
          lbl.style.width=w0+'px';
          void lbl.offsetWidth;                /* рефлоу — старт из w0 */
          lbl.style.width=w1+'px';
        }
      }
      if(!bar.classList.contains('on'))bar.classList.add('on');
      orig(t);                                   /* контент — сразу */
      slideIn(panelOf(t),fwd);                   /* новый раздел въезжает */
    };
  }
  document.addEventListener('mousedown',function(e){
    if(!bar.classList.contains('on'))return;
    if(bar.contains(e.target))return;
    expand(false);
  },false);
  /* наружу — для 27-news.js: при открытом журнале точка встаёт на
     «Журнал» и возвращается на раздел библиотеки при закрытии.
     tabbarNewsInd — вход в журнал: подпись сворачивается в тот же кадр,
     что и перелёт точки (у обеих .55s и одна пружина — движутся врозь
     только при старте на ~кадр раньше, «финал» у точки уже выверен) */
  window.tabbarIndTo=indTo;
  window.tabbarNewsInd=function(){
    if(bar.classList.contains('on'))expand(false);
    indTo(bar.querySelector('button[data-news]'),true);
  };
  indTo(bar.querySelector('button[data-t].on')||bar.querySelector('button[data-t]'));
})();
