/* ==========================================================================
 * 05-chart.js — ГРАФИК СТАТИСТИКИ
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 18 JS-скриптов, подключаются строго по номеру.
 * Раздел оригинала: src/index.html, строки 2154–2368 (раздел 5 из 18).
 * Что делает: столбчатый график слов по дням: расчёт шкалы, отрисовка, hover-подсказки.
 * Ключевое: renderStats, bindChartHover, niceMaxFor, chartState.
 * Зависимости: 01-core, 04-state-seed (state); перерисовывается из 07-layout и 15-editor.
 * ========================================================================== */
"use strict";
/* ===== график статистики ===== */
var chartState={days:[],series:[],niceMax:10};
function niceMaxFor(v){
  if(v<=10)return 10;
  if(v<=50)return Math.ceil(v/10)*10;
  if(v<=200)return Math.ceil(v/50)*50;
  if(v<=1000)return Math.ceil(v/100)*100;
  return Math.ceil(v/500)*500;
}
function renderStats(){
  if(!state||!Array.isArray(state.books))return;   /* чистый профиль: до входа state не создан */
  var svg=$('#statsSvg'),plot=$('#statsPlot');
  var svgLines=$('#statsLines'),
      grid=$('#statsGrid'),legend=$('#statsLegend'),
      heatBox=$('#statsHeat'),tip=$('#statsTip');
  if(!svg||!plot)return;
  tip.classList.remove('on');
  var W=plot.clientWidth|0,H=plot.clientHeight|0;
  if(W<10||H<10){setTimeout(renderStats,60);return}
  svg.setAttribute('viewBox','0 0 '+W+' '+H);
  svg.setAttribute('width',W);svg.setAttribute('height',H);
  svg.removeAttribute('preserveAspectRatio');
  var padTop=2,padBot=2,plotH=Math.max(1,H-padTop-padBot);
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
    return {book:bk,deltas:deltas,rawDeltas:rawDeltas,total:total,hidden:false};
  });
  var activeSeries=allSeries.filter(function(s){return s.total!==0 || s.book.id===state.activeBookId});
  activeSeries.sort(function(a,b){return Math.abs(b.total)-Math.abs(a.total)});
  var maxDelta=1;
  activeSeries.forEach(function(s){s.deltas.forEach(function(v){if(v>maxDelta)maxDelta=v})});
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
  svgLines.innerHTML='';
  activeSeries.forEach(function(ser){
    var color=ser.book.color||COLORS[0];
    var pts=[];
    for(var i=0;i<N;i++){
      var x=(N>1)?(i/(N-1))*W:W/2;
      var y=padTop+(1-ser.deltas[i]/niceMax)*plotH;
      pts.push({x:x,y:y,v:ser.deltas[i]});
    }
    var d='M '+pts[0].x.toFixed(2)+' '+pts[0].y.toFixed(2);
    for(var i=1;i<pts.length;i++)d+=' L '+pts[i].x.toFixed(2)+' '+pts[i].y.toFixed(2);
    var line=document.createElementNS('http://www.w3.org/2000/svg','path');
    line.setAttribute('class','ser-line'+(ser.book.id===state.activeBookId?' is-active':''));
    line.setAttribute('d',d);line.setAttribute('stroke',color);
    ser.lineEl=line;ser.color=color;
    ser.W=W;ser.H=H;ser.padTop=padTop;ser.plotH=plotH;
    svgLines.appendChild(line);
  });
  if(legend){
    legend.innerHTML='';
    if(!activeSeries.length){
      var em=mk('span');em.className='chart-legend-empty';em.textContent='начните писать — здесь появятся книги';legend.appendChild(em);
    }else{
      activeSeries.forEach(function(ser){
        var item=mk('button');item.type='button';
        item.className='chart-legend-item'+(ser.book.id===state.activeBookId?' active':'');
        var dot=mk('i');dot.style.background=ser.color;item.appendChild(dot);
        var label=mk('span');label.textContent=ser.book.title||'Без названия';item.appendChild(label);
        var num=mk('b');num.textContent=(ser.total>0?'+':'')+fmt(ser.total);item.appendChild(num);
        item.addEventListener('click',function(){
          ser.hidden=!ser.hidden;
          item.classList.toggle('off',ser.hidden);
          if(ser.lineEl)ser.lineEl.style.display=ser.hidden?'none':'';
        });
        legend.appendChild(item);
      });
    }
  }
  if(heatBox){
    heatBox.innerHTML='';
    var allDeltas=[];
    for(var i=0;i<N;i++){
      var sum=0;
      activeSeries.forEach(function(s){sum+=s.rawDeltas[i]});
      allDeltas.push(sum);
    }
    var maxAbs=1;
    allDeltas.forEach(function(v){if(Math.abs(v)>maxAbs)maxAbs=Math.abs(v)});
    var todayK=todayKey();
    var restoreCount=0;
    for(var i=0;i<N;i++){
      var v=allDeltas[i],key=days[i].key;
      var canRestore=hasSnapshot(key);
      if(canRestore)restoreCount++;
      var cell=mk('button');cell.type='button';
      cell.className='heat-cell'+(v>0?' pos':v<0?' neg':'')+(key===todayK?' today':'')+(canRestore?' can-restore':'');
      if(v!==0)cell.style.setProperty('--i',Math.min(1,Math.abs(v)/maxAbs).toFixed(2));
      var d=days[i].date;
      var title=d.toLocaleDateString('ru-RU',{day:'numeric',month:'long'})+' · ';
      title+=(v>0?'+':v<0?'−':'')+fmt(Math.abs(v))+' '+plural(Math.abs(v),'слово','слова','слов');
      if(canRestore)title+=' · открыть день';
      cell.title=title;
      if(canRestore)cell.addEventListener('click',(function(k){return function(){openDayModal(k)}})(key));
      else cell.disabled=true;
      heatBox.appendChild(cell);
    }
    var hintEl=$('#gitHint');
    if(hintEl)hintEl.textContent=restoreCount?('дней в истории: '+restoreCount):'';
  }
  chartState.days=days;chartState.series=activeSeries;chartState.niceMax=niceMax;
  chartState.W=W;chartState.H=H;chartState.padTop=padTop;chartState.plotH=plotH;
}

function bindChartHover(){
  var hit=$('#statsHit'),tip=$('#statsTip'),dots=$('#statsDots'),crosshair=$('#statsCrosshair');
  if(!hit)return;
  function showAt(clientX){
    var days=chartState.days,ser=chartState.series;
    if(!days.length)return;
    var r=hit.getBoundingClientRect();if(!r.width)return;
    var fx=(clientX-r.left)/r.width;fx=Math.max(0,Math.min(1,fx));
    var idx=Math.round(fx*(days.length-1));idx=Math.max(0,Math.min(days.length-1,idx));
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

