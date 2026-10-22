/* ==========================================================================
 * 05-chart.js — ГРАФИК СТАТИСТИКИ (линейный, удобный)
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 25 JS-скриптов, подключаются строго по номеру.
 * Что делает: линейный график слов по дням (30 дней) — по образцу
 *   unlumen-ui Line Chart: линия и мягкая заливка на каждую книгу,
 *   подписи шкалы (4 линии со значениями), наведение — кроссхейр, точки
 *   на линиях и подсказка с разбивкой по книгам и итогом дня; клик по
 *   графику открывает историю этого дня (openDayModal, если по дню есть
 *   снапшот, иначе подсказка «правок нет»); лучший день отмечен точкой
 *   со значением; под графиком — даты начала, середины и «сегодня»,
 *   ниже — полоска дней (квадрат = один день, заливка по объёму,
 *   клик — история дня, чип книги мгновенно пересчитывает квадратики);
 *   чипы книг внизу мгновенно включают/выключают линии. Контент —
 *   за 30 дней, включая вычеркнутое (уплотнение текста уходит в минус).
 * Ключевое: renderStats, bindChartHover, niceMaxFor, chartSmooth,
 *   chartDayLevel, chartDaysSync, chartState, chartHidden.
 * Зависимости: 01-core, 04-state-seed (state), 03-snapshots (openDayModal,
 *   hasSnapshot); перерисовывается из 07-layout и 15-editor.
 * ========================================================================== */
"use strict";
/* ===== график статистики ===== */
var chartState={days:[],series:[],niceMax:10,dayTotals:[]};
/* скрытые книги-линии переживают перерисовку (легенда пересобирается
   при каждой отрисовке статистики) */
var chartHidden={};
function niceMaxFor(v){
  if(v<=10)return 10;
  if(v<=50)return Math.ceil(v/10)*10;
  if(v<=200)return Math.ceil(v/50)*50;
  if(v<=1000)return Math.ceil(v/100)*100;
  return Math.ceil(v/500)*500;
}
/* мягкая кривая без перелётов: монотонный кубический сплайн (Фритш—
   Карлсон) — линия плавно изгибается, но НИКОГДА не выходит выше пиков
   и не проваливается ниже впадин, поэтому график не врёт про цифры */
function chartSmooth(pts){
  var n=pts.length,i;
  if(n<2)return '';
  if(n===2)return 'M '+pts[0].x.toFixed(2)+' '+pts[0].y.toFixed(2)+
    ' L '+pts[1].x.toFixed(2)+' '+pts[1].y.toFixed(2);
  var dx=[],dy=[],m=[];
  for(i=0;i<n-1;i++){dx[i]=pts[i+1].x-pts[i].x;dy[i]=pts[i+1].y-pts[i].y;m[i]=dy[i]/dx[i]}
  var t=[m[0]];
  for(i=1;i<n-1;i++){
    if(m[i-1]*m[i]<=0)t[i]=0;                       /* разворот наклона — ступенька в покое */
    else{
      var w1=2*dx[i]+dx[i-1],w2=dx[i]+2*dx[i-1];
      t[i]=(w1+w2)/(w1/m[i-1]+w2/m[i]);
    }
  }
  t[n-1]=m[n-2];
  var d='M '+pts[0].x.toFixed(2)+' '+pts[0].y.toFixed(2);
  for(i=0;i<n-1;i++){
    var h=dx[i]/3;
    d+=' C '+(pts[i].x+h).toFixed(2)+' '+(pts[i].y+t[i]*h).toFixed(2)+
       ' '+(pts[i+1].x-h).toFixed(2)+' '+(pts[i+1].y-t[i+1]*h).toFixed(2)+
       ' '+pts[i+1].x.toFixed(2)+' '+pts[i+1].y.toFixed(2);
  }
  return d;
}
/* уровень заливки квадратика дня (1..4) — ярче, чем больше написано */
function chartDayLevel(v,max){
  if(!(v>0))return 0;
  var rel=v/(max||1);
  if(rel<0.15)return 1;
  if(rel<0.4)return 2;
  if(rel<0.7)return 3;
  return 4;
}
/* квадратики дней пересчитываются сразу при чипе книги — без перерисовки */
function chartDaysSync(){
  var box=$('#statsDays');
  if(!box||!chartState.dayTotals||!chartState.dayTotals.length)return;
  var tot=[],i;
  for(i=0;i<chartState.dayTotals.length;i++)tot.push(0);
  chartState.series.forEach(function(s){
    if(s.hidden)return;
    for(var i=0;i<tot.length;i++)tot[i]+=s.rawDeltas[i];
  });
  var kids=box.children;
  for(i=0;i<kids.length;i++){
    var lv=chartDayLevel(tot[i],chartState.niceMax);
    kids[i].className='chart-day'+(lv?(' l'+lv):'');
  }
  chartState.dayTotals=tot;
}
function renderStats(){
  if(!state||!Array.isArray(state.books))return;   /* чистый профиль: до входа state не создан */
  var svg=$('#statsSvg'),plot=$('#statsPlot');
  var svgLines=$('#statsLines'),peakG=$('#statsPeak'),
      grid=$('#statsGrid'),legend=$('#statsLegend'),
      axis=$('#statsAxis'),tip=$('#statsTip'),hit=$('#statsHit');
  if(!svg||!plot)return;
  if(tip)tip.classList.remove('on');
  var W=plot.clientWidth|0,H=plot.clientHeight|0;
  if(W<10||H<10){
    /* M7: при скрытой библиотеке график нулевого размера — не крутим
       самовозобновляющийся таймер (16 вызовов/сек, парсинг всех глав) */
    if(!library||library.hidden)return;
    setTimeout(renderStats,60);return;
  }
  svg.setAttribute('viewBox','0 0 '+W+' '+H);
  svg.setAttribute('width',W);svg.setAttribute('height',H);
  svg.removeAttribute('preserveAspectRatio');
  var padTop=6,padBot=2,plotH=Math.max(1,H-padTop-padBot);
  var days=[];
  var now=new Date();
  for(var i=29;i>=0;i--){
    var d=new Date(now.getFullYear(),now.getMonth(),now.getDate()-i);
    days.push({key:todayKey(d),date:d});
  }
  var N=days.length;
  var allSeries=state.books.map(function(bk){
    var cumul=[];
    for(var i=0;i<N;i++){
      var day=state.stats[days[i].key];
      var val=null;
      if(day && typeof day==='object' && day[bk.id]!==undefined)val=day[bk.id];
      cumul.push(val);
    }
    var firstWithData=-1;
    for(var i=0;i<N;i++)if(cumul[i]!==null&&firstWithData<0)firstWithData=i;
    var deltas=[],rawDeltas=[];
    for(var i=0;i<N;i++){
      if(cumul[i]===null){deltas.push(0);rawDeltas.push(0);continue}
      if(i===firstWithData){deltas.push(Math.max(0,cumul[i]));rawDeltas.push(cumul[i]);continue}
      var j=i-1;
      while(j>=0&&cumul[j]===null)j--;
      if(j<0){deltas.push(Math.max(0,cumul[i]));rawDeltas.push(cumul[i]);continue}
      var d=cumul[i]-cumul[j];
      rawDeltas.push(d);deltas.push(Math.max(0,d));
    }
    var total=rawDeltas.reduce(function(a,b){return a+b},0);
    return {book:bk,deltas:deltas,rawDeltas:rawDeltas,total:total,
            hidden:!!chartHidden[bk.id],color:safeColor(bk.color,COLORS[0])};
  });
  var activeSeries=allSeries.filter(function(s){return s.total!==0 || s.book.id===state.activeBookId});
  activeSeries.sort(function(a,b){return Math.abs(b.total)-Math.abs(a.total)});
  var visSeries=activeSeries.filter(function(s){return !s.hidden});

  /* суммы дня по видимым книгам — для шкалы, метки лучшего дня и тултипа */
  var sums=[];
  for(var i=0;i<N;i++)sums.push(0);
  for(var k=0;k<visSeries.length;k++)
    for(var i=0;i<N;i++)sums[i]+=visSeries[k].rawDeltas[i];

  /* шкала — от максимума и одиночной линии, и дневной суммы */
  var maxDelta=1;
  activeSeries.forEach(function(s){s.deltas.forEach(function(v){if(v>maxDelta)maxDelta=v})});
  sums.forEach(function(v){if(v>maxDelta)maxDelta=v});
  var niceMax=niceMaxFor(maxDelta);
  var todayAll=0,weekAll=0,monthAll=0;
  for(var i=0;i<N;i++){
    var sum=0;
    activeSeries.forEach(function(s){sum+=s.deltas[i]});
    monthAll+=sum;
    if(N-i<=7)weekAll+=sum;
    if(i===N-1)todayAll=sum;
  }
  var avg=Math.round(monthAll/N);
  $('#statsToday').textContent=fmt(todayAll);
  $('#statsTodayUnit').textContent=plural(todayAll,'слово','слова','слов');
  $('#statsWeek').textContent=fmt(weekAll);
  $('#stats30').textContent=fmt(monthAll);
  $('#statsAvg').textContent=fmt(avg);
  if(grid){
    grid.innerHTML='';
    for(var g=0;g<4;g++){
      var sp=mk('span');
      sp.setAttribute('data-v',fmt(Math.round(niceMax*(1-g/3))));
      grid.appendChild(sp);
    }
  }
  /* подписи под графиком: начало, середина, «сегодня» */
  if(axis){
    axis.innerHTML='';
    var fmtD=function(d){return d.toLocaleDateString('ru-RU',{day:'numeric',month:'short'}).replace(/\.$/,'')};
    var a1=mk('span');a1.textContent=fmtD(days[0].date);
    var a2=mk('span');a2.textContent=fmtD(days[Math.floor((N-1)/2)].date);
    var a3=mk('span');a3.className='is-today';a3.textContent='сегодня';
    axis.appendChild(a1);axis.appendChild(a2);axis.appendChild(a3);
  }
  /* полоска дней под графиком: квадрат = один день, заливка по количеству
     написанного, клик — история дня (как на гитхабе); центры квадратов
     совпадают с точками линии (left по i/(N-1)) */
  var daysBox=$('#statsDays');
  if(daysBox){
    daysBox.innerHTML='';
    chartState.dayTotals=sums.slice();
    chartState.niceMax=niceMax;
    var fmtDd=function(d){return d.toLocaleDateString('ru-RU',{day:'numeric',month:'long'})};
    for(var i=0;i<N;i++){
      (function(i){
        var sq=mk('button');
        sq.type='button';
        sq.className='chart-day'+(sums[i]>0?(' l'+chartDayLevel(sums[i],niceMax)):'');
        sq.style.left=((N>1)?(i/(N-1))*100:50)+'%';
        sq.setAttribute('aria-label',fmtDd(days[i].date));
        sq.setAttribute('data-ftip',fmtDd(days[i].date)+' · '+(sums[i]>0?('+'+fmt(sums[i])):'правок нет'));
        sq.addEventListener('click',function(){
          var key=days[i].key;
          if(hasSnapshot(key))openDayModal(key);
          else if(typeof toast==='function')toast('За этот день правок нет');
        });
        daysBox.appendChild(sq);
      })(i);
    }
  }
  svgLines.innerHTML='';
  if(peakG)peakG.innerHTML='';
  var NS='http://www.w3.org/2000/svg';
  var defs=svg.querySelector('defs.chart-defs');
  if(!defs){defs=document.createElementNS(NS,'defs');defs.setAttribute('class','chart-defs');svg.insertBefore(defs,svg.firstChild)}
  defs.innerHTML='';
  var gi=0;
  activeSeries.forEach(function(ser){
    var color=ser.color;                   /* цвет из данных — только литерал CSS */
    var pts=[];
    for(var i=0;i<N;i++){
      var x=(N>1)?(i/(N-1))*W:W/2;
      var y=padTop+(1-ser.deltas[i]/niceMax)*plotH;
      pts.push({x:x,y:y,v:ser.deltas[i]});
    }
    var d=chartSmooth(pts);                /* мягкая монотонная кривая */
    /* заливка под линией — вертикальный градиент цвета книги: цвет мягко
       уходит в прозрачность вниз, панель читается «областями», а не
       плоскими пятнами; у активной книги область глубже */
    var act=ser.book.id===state.activeBookId;
    var gid='sg'+(gi++);
    var grad=document.createElementNS(NS,'linearGradient');
    grad.setAttribute('id',gid);grad.setAttribute('x1','0');grad.setAttribute('y1','0');
    grad.setAttribute('x2','0');grad.setAttribute('y2','1');
    var st1=document.createElementNS(NS,'stop');
    st1.setAttribute('offset','0');st1.setAttribute('stop-color',color);
    st1.setAttribute('stop-opacity',act?'0.32':'0.18');
    var st2=document.createElementNS(NS,'stop');
    st2.setAttribute('offset','0.65');st2.setAttribute('stop-color',color);
    st2.setAttribute('stop-opacity',act?'0.06':'0.03');
    var st3=document.createElementNS(NS,'stop');
    st3.setAttribute('offset','1');st3.setAttribute('stop-color',color);
    st3.setAttribute('stop-opacity','0');
    grad.appendChild(st1);grad.appendChild(st2);grad.appendChild(st3);
    defs.appendChild(grad);
    var baseY=(padTop+plotH).toFixed(2);
    var area=document.createElementNS(NS,'path');
    area.setAttribute('class','ser-area'+(act?' is-active':''));
    area.setAttribute('d',d+' L '+W.toFixed(2)+' '+baseY+' L 0 '+baseY+' Z');
    area.setAttribute('fill','url(#'+gid+')');
    ser.areaEl=area;
    svgLines.appendChild(area);
    var line=document.createElementNS(NS,'path');
    line.setAttribute('class','ser-line'+(act?' is-active':''));
    line.setAttribute('d',d);line.setAttribute('stroke',color);
    ser.lineEl=line;
    svgLines.appendChild(line);
    if(ser.hidden){line.style.display='none';area.style.display='none'}
  });
  /* метка лучшего дня: точка со значением — сразу виден пик без наведения */
  if(peakG){
    var peak=-1;
    for(var i=0;i<N;i++)if(sums[i]>peak)peak=sums[i];
    if(peak>0){
      var pi=sums.indexOf(peak);
      var px=(N>1)?(pi/(N-1))*W:W/2;
      var py=padTop+(1-peak/niceMax)*plotH;
      var halo=document.createElementNS(NS,'circle');
      halo.setAttribute('class','peak-halo');
      halo.setAttribute('cx',px.toFixed(2));halo.setAttribute('cy',py.toFixed(2));
      halo.setAttribute('r','9');
      peakG.appendChild(halo);
      var ring=document.createElementNS(NS,'circle');
      ring.setAttribute('class','peak-dot');
      ring.setAttribute('cx',px.toFixed(2));ring.setAttribute('cy',py.toFixed(2));
      ring.setAttribute('r','3.4');
      peakG.appendChild(ring);
      var lblP=document.createElementNS(NS,'text');
      lblP.setAttribute('class','peak-lbl');
      var right=(px>W-56);
      lblP.setAttribute('x',(px+(right?-9:9)).toFixed(2));
      lblP.setAttribute('y',Math.max(10,py-10).toFixed(2));
      lblP.setAttribute('text-anchor',right?'end':'start');
      lblP.textContent='+'+fmt(peak);
      peakG.appendChild(lblP);
    }
  }
  if(legend){
    legend.innerHTML='';
    if(!activeSeries.length){
      var em=mk('span');em.className='chart-legend-empty';em.textContent='начните писать — здесь появятся книги';legend.appendChild(em);
    }else{
      activeSeries.forEach(function(ser){
        var item=mk('button');item.type='button';
        item.className='chart-legend-item'+(ser.book.id===state.activeBookId?' active':'')+(ser.hidden?' off':'');
        item.setAttribute('aria-pressed',ser.hidden?'false':'true');
        var dot=mk('i');dot.style.background=ser.color;item.appendChild(dot);
        var label=mk('span');label.textContent=ser.book.title||'Без названия';item.appendChild(label);
        var num=mk('b');num.textContent=(ser.total>0?'+':'')+fmt(ser.total);item.appendChild(num);
        item.addEventListener('click',function(){
          ser.hidden=!ser.hidden;
          chartHidden[ser.book.id]=ser.hidden;   /* помним выбор до следующей перерисовки */
          item.classList.toggle('off',ser.hidden);
          item.setAttribute('aria-pressed',ser.hidden?'false':'true');
          if(ser.lineEl)ser.lineEl.style.display=ser.hidden?'none':'';
          if(ser.areaEl)ser.areaEl.style.display=ser.hidden?'none':'';
          chartDaysSync();                       /* и квадратики дней — под видимые книги */
        });
        legend.appendChild(item);
      });
    }
  }
  /* курсор-указание: клик ведёт в историю дня, если по дню есть снапшот */
  if(hit){
    var anySnap=false;
    for(var i=0;i<N;i++)if(hasSnapshot(days[i].key)){anySnap=true;break}
    hit.classList.toggle('has-day',anySnap);
  }
  chartState.days=days;chartState.series=activeSeries;chartState.niceMax=niceMax;
  chartState.W=W;chartState.H=H;chartState.padTop=padTop;chartState.plotH=plotH;
}

function bindChartHover(){
  var hit=$('#statsHit'),tip=$('#statsTip'),dots=$('#statsDots'),crosshair=$('#statsCrosshair');
  if(!hit)return;
  function idxAt(clientX){
    var days=chartState.days;
    if(!days.length)return -1;
    var r=hit.getBoundingClientRect();if(!r.width)return -1;
    var fx=(clientX-r.left)/r.width;fx=Math.max(0,Math.min(1,fx));
    var idx=Math.round(fx*(days.length-1));
    return Math.max(0,Math.min(days.length-1,idx));
  }
  function showAt(clientX){
    var days=chartState.days,ser=chartState.series;
    var idx=idxAt(clientX);
    if(idx<0)return;
    var cxPct=(days.length>1)?(idx/(days.length-1))*100:50;
    crosshair.style.left=cxPct+'%';crosshair.classList.add('on');
    dots.innerHTML='';
    var sumRaw=0;
    ser.forEach(function(s){
      if(s.hidden)return;
      var yPx=chartState.padTop+(1-s.deltas[idx]/chartState.niceMax)*chartState.plotH;
      var yPct=(yPx/(chartState.H||1))*100;
      var dot=mk('div');dot.className='chart-dot on';
      dot.style.left=cxPct+'%';dot.style.top=yPct+'%';dot.style.background=s.color;
      dots.appendChild(dot);
      sumRaw+=s.rawDeltas[idx];
    });
    var dt=days[idx].date;
    var dateStr=dt.toLocaleDateString('ru-RU',{day:'numeric',month:'long'});
    var html='<div class="tt-date">'+esc(dateStr)+'</div>';
    var anyVisible=false;
    ser.forEach(function(s){
      if(s.hidden)return;
      anyVisible=true;
      var raw=s.rawDeltas[idx];
      var isAct=s.book.id===state.activeBookId;
      var sign=raw>0?'+':raw<0?'−':'';
      var cls=raw>0?'pos':raw<0?'negv':'';
      html+='<div class="tt-row'+(isAct?' is-active':'')+'"><i style="background:'+s.color+'"></i><span>'+esc(s.book.title||'Без названия')+'</span><b class="'+cls+'">'+sign+fmt(Math.abs(raw))+'</b></div>';
    });
    if(!anyVisible)html+='<div class="tt-empty">все линии скрыты</div>';
    else{
      var sign=sumRaw>0?'+':sumRaw<0?'−':'';
      var cls=sumRaw>0?'pos':sumRaw<0?'negv':'';
      html+='<div class="tt-sum"><span>итого за день</span><b class="'+cls+'">'+sign+fmt(Math.abs(sumRaw))+'</b></div>';
    }
    if(hasSnapshot(days[idx].key))html+='<div class="tt-open">клик — изменения дня</div>';
    tip.innerHTML=html;
    var px=cxPct,align='center';
    if(px<22)align='left';else if(px>78)align='right';
    tip.style.left=px+'%';
    tip.style.transform=(align==='left')?'translateX(0)':(align==='right')?'translateX(-100%)':'translateX(-50%)';
    tip.classList.add('on');
  }
  hit.addEventListener('mousemove',function(e){showAt(e.clientX)});
  hit.addEventListener('mouseleave',function(){tip.classList.remove('on');crosshair.classList.remove('on');dots.innerHTML=''});
  hit.addEventListener('touchstart',function(e){if(e.touches[0])showAt(e.touches[0].clientX)},{passive:true});
  hit.addEventListener('touchmove',function(e){if(e.touches[0])showAt(e.touches[0].clientX)},{passive:true});
  hit.addEventListener('touchend',function(){tip.classList.remove('on');crosshair.classList.remove('on');dots.innerHTML=''});
  /* клик — история дня; если снапшота нет — честная подсказка */
  hit.addEventListener('click',function(e){
    var idx=idxAt(e.clientX);
    if(idx<0)return;
    var key=chartState.days[idx].key;
    if(hasSnapshot(key)){openDayModal(key);return}
    if(typeof toast==='function')toast('За этот день правок нет');
  });
}
if('ResizeObserver' in window){
  var plotEl=$('#statsPlot');
  if(plotEl){
    var ro=new ResizeObserver(function(){
      if(!library.hidden){clearTimeout(ro._t);ro._t=setTimeout(renderStats,80)}
    });
    ro.observe(plotEl);
  }
}
bindChartHover();
