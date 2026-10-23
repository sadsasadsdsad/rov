/* ==========================================================================
 * 12-graph.js — СХЕМА КНИГИ — граф связей
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 18 JS-скриптов, подключаются строго по номеру.
 * Раздел оригинала: src/index.html, строки 3245–4038 (раздел 12 из 18).
 * Что делает: данные графа из wiki-связей; четыре раскладки (ноды-Blender / радиальные кольца / круг / силы); отрисовка SVG карточками-нодами с цветной шапкой, телом и гнёздами, нити-кривые от гнезда к гнезду, точечная сетка; плавная камера (зум «доезжает», пан с инерцией), плавный переезд узлов при пересборке, одноразовые анимации появления и фокуса; тулбар с фильтрами и слайдерами, зум, перетаскивание узлов.
 * Ключевое: buildAndRenderGraph, scheduleGraph, layoutTree, layoutForce, layoutCircle, layoutRadial, paintGraph, renderGraphTypeBar, zoomBy, graphFitTarget, graphView, nodeBox, graphState.
 * Зависимости: 01-core, 04-state-seed, 09-cooccurrence; стили — 06-graph.css.
 * ========================================================================== */
"use strict";
/* =========================================================================
   СХЕМА КНИГИ — УЛУЧШЕННАЯ ВЕРСИЯ
   ========================================================================= */
var graphState={
  mode:'tree',             /* tree | radial | circle | force */
  people:false,
  labels:true,
  showOrphans:true,        /* одиночки без связей — отдельной колонкой/кольцом */
  rankOpen:false,          /* выдвижная «Структура книги» поверх карты */
  depth:2,
  minWeight:1,
  hiddenTypes:{},          /* map type->true => скрыт */
  data:null,
  W:0,H:0,
  mainId:null,
  zoom:1,panX:0,panY:0,
  focusId:null,
  selectedId:null,
  hoverId:null,
  pinned:{},               /* id -> true */
  rings:null,              /* реальные радиусы колец от layoutRadial */
  posCache:{},             /* id -> {x,y,w,h} закреплённых узлов */
  lastClickId:null,
  lastClickTime:0,
  lastPainted:0,
  needFit:true,            /* первый показ — сразу вписать схему в окно */
  enter:false,             /* одноразовая анимация появления (paintGraph её съедает) */
  dimAnim:false,           /* одноразовая анимация «приглушения» при смене фокуса */
  tweenRaf:null
};
var graphTimer=null;
var graphRafId=null;
var graphOpenTimer=null;
var graphTipHide=null;      /* гасит подсказку узла — функцию ставит блок событий */

/* ---------- Плавный вид: камера «доезжает» до цели, а не прыгает ----------
   Ноды Blender живут с плавным зумом-паном: колесо/кнопки задают цель,
   кадровый цикл мягко ведёт текущий вид к ней, а после броска фон ещё
   скользит по инерции. При «уменьшении движения» в системе — мгновенно. */
var graphView={tZoom:1,tPanX:0,tPanY:0,vx:0,vy:0,raf:0,last:0};
function graphReduced(){
  try{return window.matchMedia('(prefers-reduced-motion: reduce)').matches}catch(e){return false}
}
function graphViewSync(){
  graphView.tZoom=graphState.zoom;
  graphView.tPanX=graphState.panX;
  graphView.tPanY=graphState.panY;
  graphView.vx=0;graphView.vy=0;
}
function graphViewKick(){
  if(graphReduced()){
    graphState.zoom=graphView.tZoom;
    graphState.panX=graphView.tPanX;
    graphState.panY=graphView.tPanY;
    graphView.vx=0;graphView.vy=0;
    applyGraphTransform();
    return;
  }
  if(graphView.raf)return;
  graphView.last=0;
  graphView.raf=requestAnimationFrame(graphViewTick);
}
function graphViewTick(ts){
  graphView.raf=0;
  var dt=graphView.last?Math.min(64,ts-graphView.last):16.7;
  graphView.last=ts;
  var k=1-Math.exp(-dt/72);      /* «доезд» ~70 мс — быстро, но без рывка */
  /* инерция живёт в цели: текущий вид догоняет её и плавно тормозит */
  graphView.tPanX+=graphView.vx*dt;
  graphView.tPanY+=graphView.vy*dt;
  var dec=Math.exp(-dt/230);
  graphView.vx*=dec;graphView.vy*=dec;
  if(Math.abs(graphView.vx)<0.006)graphView.vx=0;
  if(Math.abs(graphView.vy)<0.006)graphView.vy=0;
  graphState.zoom+=(graphView.tZoom-graphState.zoom)*k;
  graphState.panX+=(graphView.tPanX-graphState.panX)*k;
  graphState.panY+=(graphView.tPanY-graphState.panY)*k;
  var done=!graphView.vx&&!graphView.vy&&
    Math.abs(graphView.tZoom-graphState.zoom)<0.0008&&
    Math.abs(graphView.tPanX-graphState.panX)<0.35&&
    Math.abs(graphView.tPanY-graphState.panY)<0.35;
  if(done){
    graphState.zoom=graphView.tZoom;
    graphState.panX=graphView.tPanX;
    graphState.panY=graphView.tPanY;
  }
  applyGraphTransform();
  if(!done)graphView.raf=requestAnimationFrame(graphViewTick);
}
/* зум колесом к точке под курсором — цель считается от цели, чтобы
   быстрые прокрутки не «теряли» масштаб */
function graphWheelZoom(mx,my,factor){
  var z0=graphView.tZoom;
  var z1=Math.max(0.3,Math.min(3.4,z0*factor));
  if(z1===z0)return;
  if(graphReduced()){
    var kk0=z1/z0;
    graphState.panX=mx-kk0*(mx-graphState.panX);
    graphState.panY=my-kk0*(my-graphState.panY);
    graphState.zoom=z1;
    graphViewSync();
    applyGraphTransform();
    return;
  }
  var kk=z1/z0;
  graphView.tPanX=mx-kk*(mx-graphView.tPanX);
  graphView.tPanY=my-kk*(my-graphView.tPanY);
  graphView.tZoom=z1;
  graphView.vx=0;graphView.vy=0;
  graphViewKick();
}
/* вписать схему в окно (как «Home» в нодах Blender) */
function graphFitTarget(){
  var d=graphState.data;if(!d||!d.nodes.length)return;
  var W=graphState.W,H=graphState.H;
  var minX=1e9,minY=1e9,maxX=-1e9,maxY=-1e9;
  d.nodes.forEach(function(n){
    var b=nodeBox(n,n.id===d.mainId);
    /* если идёт переезд — вписываем по цели, а не по «старому» месту */
    var px=n._fx?n._tx:n.x,py=n._fx?n._ty:n.y;
    minX=Math.min(minX,px-b.w/2);maxX=Math.max(maxX,px+b.w/2);
    minY=Math.min(minY,py-b.h/2);maxY=Math.max(maxY,py+b.h/2);
  });
  var bw=Math.max(1,maxX-minX),bh=Math.max(1,maxY-minY);
  var m=54;
  var z=Math.min((W-m*2)/bw,(H-m*2)/bh);
  z=Math.max(0.3,Math.min(1.35,z));
  graphView.tZoom=z;
  graphView.tPanX=(W-bw*z)/2-minX*z;
  graphView.tPanY=(H-bh*z)/2-minY*z;
  graphView.vx=0;graphView.vy=0;
  graphViewKick();
}
/* перерисовка не чаще кадра — при быстром перетаскивании узлов */
function scheduleGraphPaint(){
  if(graphRafId)return;
  graphRafId=requestAnimationFrame(function(){graphRafId=null;paintGraph()});
}
/* только transform — без перестройки SVG (пан и зум).
   Сетка «миллиметровки» едет вместе с камерой: ей правим patternTransform,
   а шаг кратно удваиваем, чтобы точки не сливались и не редели. */
function graphGridStep(){
  var z=graphState.zoom||1,step=26;
  while(step*z<15)step*=2;
  while(step*z>60)step/=2;
  return step;
}
function graphGridDotR(){
  return Math.max(0.45,Math.min(2.6,1.15/(graphState.zoom||1)));
}
function applyGraphTransform(){
  var g=document.getElementById('graphTransform');
  if(!g){paintGraph();return}
  g.setAttribute('transform','translate('+graphState.panX.toFixed(1)+','+graphState.panY.toFixed(1)+') scale('+graphState.zoom.toFixed(3)+')');
  var pat=document.getElementById('gpGrid');
  if(pat){
    pat.setAttribute('patternTransform','translate('+graphState.panX.toFixed(1)+','+graphState.panY.toFixed(1)+') scale('+graphState.zoom.toFixed(3)+')');
    var step=graphGridStep();
    if(pat.getAttribute('data-step')!==String(step)){
      pat.setAttribute('data-step',String(step));
      pat.setAttribute('width',step);pat.setAttribute('height',step);
      var dot=pat.querySelector('circle');
      if(dot){dot.setAttribute('cx',step/2);dot.setAttribute('cy',step/2)}
    }
    var r=graphGridDotR();
    var dotR=pat.querySelector('circle');
    if(dotR){
      var have=+dotR.getAttribute('r');
      if(!have||Math.abs(have-r)>0.06)dotR.setAttribute('r',r.toFixed(2));
    }
  }
}

function scheduleGraph(){
  if(!$('#wikiPanel').classList.contains('on')||panelTab!=='graph')return;
  clearTimeout(graphTimer);
  graphTimer=setTimeout(function(){buildAndRenderGraph(true)},120);
}

function buildGraphData(){
  var b=book();
  if(!b)return {nodes:[],links:[],dropped:0,isolated:0};
  var co=buildCoOccurrence();
  var all=(b.wiki||[]).filter(function(e){return e.name});
  var nodes=[];
  all.forEach(function(e){
    if(graphState.people && e.type!=='person')return;
    if(graphState.hiddenTypes[e.type])return;
    nodes.push({
      id:e.id,
      en:e,
      name:e.name,
      type:e.type,
      mentions:co.counts[e.id]||0,
      degree:0,score:0,x:0,y:0,
      pinned:!!graphState.pinned[e.id]
    });
  });
  var byId={}; nodes.forEach(function(n){byId[n.id]=n});
  var links=[];
  Object.keys(co.matrix).forEach(function(k){
    var p=k.split('|');
    if(!byId[p[0]]||!byId[p[1]])return;
    var w=co.matrix[k];
    if(w<graphState.minWeight)return;
    links.push({s:byId[p[0]],t:byId[p[1]],w:w});
  });
  /* Степень только по видимым связям */
  nodes.forEach(function(n){n.degree=0});
  links.forEach(function(l){l.s.degree+=l.w;l.t.degree+=l.w});
  nodes.forEach(function(n){n.score=n.degree*0.7+n.mentions*1.3});

  /* отсекаем недостижимые на глубине depth от главного */
  var sorted=nodes.slice().sort(function(a,b){return b.score-a.score});
  var mainId=sorted[0]?sorted[0].id:null;
  if(!mainId)return {nodes:[],links:[],dropped:0,isolated:0};
  var maxDepth=graphState.depth|0;
  var adj={};nodes.forEach(function(n){adj[n.id]=[]});
  links.forEach(function(l){adj[l.s.id].push(l.t.id);adj[l.t.id].push(l.s.id)});
  /* ВАЖНО: ключи кладём ПО id главного узла. Раньше здесь стояло
     seen={mainId:1},lvl={mainId:0} — это буквальный ключ «mainId», а не
     идентификатор узла: lvl[cur] у всех был undefined, проверка глубины
     (lvl[cur]>=maxDepth) никогда не срабатывала, и ползунок «Глубина»
     ничего не резал — показывались все связи без исключений (просьба).
     Теперь обход честный: узлы дальше глубины отсекаются. */
  var reach={},q=[mainId],seen={},lvl={};
  seen[mainId]=1;lvl[mainId]=0;reach[mainId]=1;
  while(q.length){
    var cur=q.shift();
    if(lvl[cur]>=maxDepth)continue;
    (adj[cur]||[]).forEach(function(nb){
      if(seen[nb])return;
      seen[nb]=1;lvl[nb]=lvl[cur]+1;reach[nb]=1;q.push(nb);
    });
  }
  /* Одиночки без связей («материки», «места» и прочие статьи, которые в
     тексте ни с кем рядом не встречались) раньше тихо пропадали с карты.
     Теперь они остаются и помечаются iso: раскладка выносит их отдельной
     колонкой (в дереве) или внешним кольцом (в радиальной), чтобы паутина
     связей не выглядела полной без них */
  var kept=[],dropped=0,isolated=[];
  nodes.forEach(function(n){
    if(reach[n.id]){kept.push(n);return}
    if(!n.degree){
      if(graphState.showOrphans){n.iso=true;isolated.push(n)}
      return;
    }
    dropped++;
  });
  nodes=kept.concat(isolated);
  var byId2={};nodes.forEach(function(n){byId2[n.id]=n});
  links=links.filter(function(l){return byId2[l.s.id]&&byId2[l.t.id]});
  return {nodes:nodes,links:links,dropped:dropped,isolated:isolated.length,mainId:mainId};
}

/* Карточка узла — бокс как в нодах Blender: шапка с именем, тело со
   сводкой и гнёзда связей по краям. Ширина зависит от длины имени. */
function nodeBox(n,isMain){
  var raw=n.name||'';
  var name=raw.length>26?(raw.slice(0,25)+'…'):raw;
  var w=Math.round(Math.max(128,Math.min(230,name.length*7+46)))+(isMain?10:0);
  return {w:w,h:isMain?56:52,head:24,name:name};
}
/* у шапки скруглены только верхние углы — путь вместо rect */
function headPath(x,y,w,hh,r){
  return 'M '+x.toFixed(1)+','+(y+r).toFixed(1)+
    ' a'+r+','+r+' 0 0 1 '+r+','+(-r)+
    ' h'+(w-2*r).toFixed(1)+
    ' a'+r+','+r+' 0 0 1 '+r+','+r+
    ' v'+(hh-r).toFixed(1)+
    ' h'+(-w).toFixed(1)+' z';
}
/* разведение боксов: пересечения гасим по оси меньшего наложения,
   главный узел и закреплённые остаются на месте */
function separateBoxes(nodes,iters,mainId){
  var n=nodes.length;
  for(var it=0;it<iters;it++){
    var moved=false;
    for(var i=0;i<n;i++){
      var a=nodes[i];
      for(var j=i+1;j<n;j++){
        var b=nodes[j];
        var pa=(a.id===mainId)||graphState.pinned[a.id];
        var pb=(b.id===mainId)||graphState.pinned[b.id];
        if(pa&&pb)continue;
        var ba=nodeBox(a),bb=nodeBox(b);
        var minX=(ba.w+bb.w)/2+24,minY=(ba.h+bb.h)/2+14;
        var dx=b.x-a.x,dy=b.y-a.y;
        if(Math.abs(dx)>=minX||Math.abs(dy)>=minY)continue;
        var ox=minX-Math.abs(dx),oy=minY-Math.abs(dy);
        var pushX=ox<=oy;
        var amt=pushX?ox:oy;
        var d=pushX?dx:dy;
        var dir=d>=0?1:-1;
        var fa=pa?0:(pb?1:0.5),fb=pb?0:(pa?1:0.5);
        if(pushX){a.x-=dir*amt*fa;b.x+=dir*amt*fb}
        else{a.y-=dir*amt*fa;b.y+=dir*amt*fb}
        moved=true;
      }
    }
    if(!moved)break;
  }
}
/* плавный переезд узлов на новые места после пересборки раскладки.
   stopTween(true) просто останавливает цикл (позиции не трогает —
   новый переезд стартует с текущих); stopTween() доводит узлы до цели */
function cancelGraphTween(keepPositions){
  if(graphState.tweenRaf){cancelAnimationFrame(graphState.tweenRaf);graphState.tweenRaf=null}
  if(keepPositions)return;
  var d=graphState.data;
  if(d)d.nodes.forEach(function(nd){
    if(nd._fx){nd.x=nd._tx;nd.y=nd._ty;nd._fx=0}
  });
}
function startGraphTween(){
  cancelGraphTween(true);
  var d=graphState.data;if(!d)return;
  var nodes=d.nodes,t0=0,dur=620;
  function frame(ts){
    if(!t0)t0=ts;
    var t=Math.min(1,(ts-t0)/dur);
    var e=t<0.5?4*t*t*t:1-Math.pow(-2*t+2,3)/2;   /* easeInOutCubic */
    nodes.forEach(function(nd){
      if(!nd._fx)return;
      nd.x=nd._sx+(nd._tx-nd._sx)*e;
      nd.y=nd._sy+(nd._ty-nd._sy)*e;
      if(t>=1)nd._fx=0;
    });
    paintGraph();
    if(t<1)graphState.tweenRaf=requestAnimationFrame(frame);
    else graphState.tweenRaf=null;
  }
  graphState.tweenRaf=requestAnimationFrame(frame);
}

/* ---------- Раскладка: радиальная (BFS-кольца) ---------- */
function layoutRadial(nodes,links,W,H,mainId){
  var n=nodes.length;if(!n)return;
  var byId={};nodes.forEach(function(x){byId[x.id]=x});
  if(!mainId||!byId[mainId]){
    var best=nodes.slice().sort(function(a,b){return b.score-a.score});
    mainId=best[0]?best[0].id:null;
  }
  if(!mainId)return;
  var main=byId[mainId];
  var adj={};nodes.forEach(function(x){adj[x.id]=[]});
  links.forEach(function(l){
    if(adj[l.s.id])adj[l.s.id].push({id:l.t.id,w:l.w});
    if(adj[l.t.id])adj[l.t.id].push({id:l.s.id,w:l.w});
  });
  var seen={},parent={},level={},order=[mainId],qi=0;
  seen[mainId]=1;parent[mainId]=null;level[mainId]=0;
  while(qi<order.length){
    var cur=order[qi++];
    var nbrs=(adj[cur]||[]).slice().sort(function(a,b){return b.w-a.w});
    for(var i=0;i<nbrs.length;i++){
      var x=nbrs[i];
      if(seen[x.id])continue;
      seen[x.id]=1;parent[x.id]=cur;level[x.id]=level[cur]+1;order.push(x.id);
    }
  }
  /* одиночки без связей — внешним кольцом, после всех уровней сети */
  var maxSeen=0;
  nodes.forEach(function(x){if(seen[x.id]&&level[x.id]>maxSeen)maxSeen=level[x.id]});
  nodes.forEach(function(x){
    if(!seen[x.id]){seen[x.id]=1;parent[x.id]=mainId;level[x.id]=maxSeen+1;order.push(x.id)}
  });
  var byLevel={},maxLevel=0;
  nodes.forEach(function(x){
    var L=level[x.id];
    if(!byLevel[L])byLevel[L]=[];
    byLevel[L].push(x);
    if(L>maxLevel)maxLevel=L;
  });
  var cx=W/2,cy=H/2;
  /* Кольца растут по вместимости: длине окружности под карточки уровня.
     Потолка радиуса нет — если колец/карточек много, схема станет шире
     окна, но камера впишет её целиком (graphFitTarget), зато карточки
     не сбиваются в кучу, как раньше при жёстком ограничении. */
  var levelRadius=[0],prevR=100;
  for(var L=1;L<=maxLevel;L++){
    var ring0=byLevel[L]||[];
    var cnt=ring0.length;
    var maxW=0;ring0.forEach(function(x){var b=nodeBox(x);if(b.w>maxW)maxW=b.w});
    var minR=cnt>0?((cnt*(maxW+50))/(2*Math.PI)):prevR+90;
    var r=Math.max(prevR+60,minR);
    levelRadius.push(r);
    prevR=r;
  }
  /* реальные радиусы колец — paintGraph рисует направляющие по ним,
     а не по приблизительной формуле от depth */
  graphState.rings=levelRadius;
  main.x=cx;main.y=cy;
  for(var L=1;L<=maxLevel;L++){
    var ring=byLevel[L];
    if(!ring||!ring.length)continue;
    var r2=levelRadius[L];
    var sorted=ring.slice().sort(function(a,b){
      var pa=byId[parent[a.id]],pb=byId[parent[b.id]];
      var aa=pa?Math.atan2(pa.y-cy,pa.x-cx):0;
      var ab=pb?Math.atan2(pb.y-cy,pb.x-cx):0;
      if(aa!==ab)return aa-ab;
      return b.score-a.score;
    });
    var step=(Math.PI*2)/sorted.length;
    var phase=-Math.PI/2+step/2;
    sorted.forEach(function(nd,i){
      var angle=phase+step*i;
      nd.x=cx+Math.cos(angle)*r2;
      nd.y=cy+Math.sin(angle)*r2;
    });
  }
  /* закреплённые узлы возвращаем на сохранённую позицию */
  var pc=graphState.posCache;
  nodes.forEach(function(nd){
    if(graphState.pinned[nd.id]&&pc[nd.id]){nd.x=pc[nd.id].x;nd.y=pc[nd.id].y}
  });
  /* разведение наложений — число итераций ограничено размером графа,
     чтобы раскладка сотен узлов не подвешивала интерфейс */
  var sepIter=n>200?8:(n>100?20:50);
  separateBoxes(nodes,sepIter,mainId);
  /* без зажима по краям: разведённые карточки не заталкиваем обратно
     в окно (это снова сбивало их в стопку), всю картину впишет камера */
}

/* ---------- Раскладка: круг ---------- */
function layoutCircle(nodes,links,W,H,mainId){
  var n=nodes.length;if(!n)return;
  var sorted=nodes.slice().sort(function(a,b){
    if(a.id===mainId)return -1;
    if(b.id===mainId)return 1;
    return b.score-a.score;
  });
  var cx=W/2,cy=H/2;
  /* кольцо — эллипс по форме окна: карточкам нужна длина обхода
     (периметр по Рамануджану), иначе на круглом кольце они налезают */
  var need=0;
  sorted.forEach(function(nd){need+=nodeBox(nd,nd.id===mainId).w+44});
  var rx=Math.max(140,W/2-90),ry=Math.max(100,H/2-80);
  var per=Math.PI*(3*(rx+ry)-Math.sqrt((3*rx+ry)*(rx+3*ry)));
  if(per<need){var kk=need/per;rx*=kk;ry*=kk}
  var step=(Math.PI*2)/n;
  sorted.forEach(function(nd,i){
    var ang=-Math.PI/2+step*i;
    nd.x=cx+Math.cos(ang)*rx;
    nd.y=cy+Math.sin(ang)*ry;
  });
  /* закреплённые узлы остаются на своих местах */
  var pc=graphState.posCache;
  nodes.forEach(function(nd){
    if(graphState.pinned[nd.id]&&pc[nd.id]){nd.x=pc[nd.id].x;nd.y=pc[nd.id].y}
  });
  var pad=44;
  nodes.forEach(function(nd){
    nd.x=Math.max(pad,Math.min(W-pad,nd.x));
    nd.y=Math.max(pad,Math.min(H-pad,nd.y));
  });
}

/* ---------- Раскладка: силы (force-directed, Фрюхтерман–Рейнгольд) ---------- */
function layoutForce(nodes,links,W,H,mainId){
  var n=nodes.length;if(!n)return;
  var byId={};nodes.forEach(function(x){byId[x.id]=x});
  var cx=W/2,cy=H/2;
  var area=W*H;
  var k=Math.sqrt(area/Math.max(1,n))*0.55;
  var temp=Math.min(W,H)*0.12;
  var maxW=1;links.forEach(function(l){if(l.w>maxW)maxW=l.w});

  /* начальные позиции, если их нет */
  nodes.forEach(function(nd,i){
    if(!nd._placed && (nd.x===0&&nd.y===0)){
      var ang=(i/n)*Math.PI*2;
      var r0=Math.min(W,H)*0.3;
      nd.x=cx+Math.cos(ang)*r0;
      nd.y=cy+Math.sin(ang)*r0;
    }
    nd._dx=0; nd._dy=0;
  });

  /* O(n²) на итерацию — масштабируем итерации по размеру графа */
  var ITER=n>250?60:(n>120?120:400);
  for(var it=0;it<ITER;it++){
    for(var i=0;i<n;i++){nodes[i]._dx=0;nodes[i]._dy=0;}

    /* отталкивание всех от всех */
    for(var i=0;i<n;i++){
      var a=nodes[i];
      for(var j=i+1;j<n;j++){
        var b=nodes[j];
        var dx=a.x-b.x,dy=a.y-b.y;
        var d2=dx*dx+dy*dy;
        if(d2<0.01){dx=Math.random()-0.5;dy=Math.random()-0.5;d2=dx*dx+dy*dy+0.01}
        var f=(k*k)/d2;
        var d=Math.sqrt(d2);
        var ux=dx/d,uy=dy/d;
        a._dx+=ux*f; a._dy+=uy*f;
        b._dx-=ux*f; b._dy-=uy*f;
      }
    }
    /* притяжение по рёбрам */
    for(var li=0;li<links.length;li++){
      var l=links[li];
      var dx2=l.t.x-l.s.x,dy2=l.t.y-l.s.y;
      var dd=Math.sqrt(dx2*dx2+dy2*dy2)||0.01;
      var strength=0.5+0.9*(l.w/maxW);
      var f2=(dd*dd)/k*strength*0.06;
      var ux2=dx2/dd,uy2=dy2/dd;
      l.s._dx+=ux2*f2; l.s._dy+=uy2*f2;
      l.t._dx-=ux2*f2; l.t._dy-=uy2*f2;
    }
    /* лёгкая гравитация к центру */
    for(var i=0;i<n;i++){
      var a=nodes[i];
      a._dx+=(cx-a.x)*0.015;
      a._dy+=(cy-a.y)*0.015;
    }
    /* применяем смещение, закреплённые не двигаем */
    for(var i=0;i<n;i++){
      var a=nodes[i];
      if(graphState.pinned[a.id]){continue}
      var mag=Math.sqrt(a._dx*a._dx+a._dy*a._dy)||1;
      var scale=Math.min(mag,temp)/mag;
      a.x+=a._dx*scale;
      a.y+=a._dy*scale;
    }
    temp*=0.978;
    if(temp<0.5)break;
  }
  /* финальная уборка границ и наложений */
  var forceSep=n>200?6:(n>100?14:30);
  separateBoxes(nodes,forceSep,mainId);
  var padX=64,padY=44;
  nodes.forEach(function(nd){
    if(graphState.pinned[nd.id])return;
    nd.x=Math.max(padX,Math.min(W-padX,nd.x));
    nd.y=Math.max(padY,Math.min(H-padY,nd.y));
  });
}

/* ---------- Раскладка: ноды Blender (колонки слева-вправо) ----------
   Главный узел — исток; каждый шаг от него — новая колонка. Внутри
   колонки порядок по «центру тяжести» родителей, поэтому нити почти не
   пересекаются. Именно так выглядит граф шейдеров в Blender. */
function layoutTree(nodes,links,W,H,mainId){
  var n=nodes.length;if(!n)return;
  var byId={};nodes.forEach(function(x){byId[x.id]=x});
  if(!mainId||!byId[mainId]){
    var best=nodes.slice().sort(function(a,b){return b.score-a.score});
    mainId=best[0]?best[0].id:null;
  }
  if(!mainId)return;
  var adj={};nodes.forEach(function(x){adj[x.id]=[]});
  links.forEach(function(l){
    if(adj[l.s.id])adj[l.s.id].push({id:l.t.id,w:l.w});
    if(adj[l.t.id])adj[l.t.id].push({id:l.s.id,w:l.w});
  });
  var seen={},level={},parent={},order=[mainId],qi=0;
  seen[mainId]=1;parent[mainId]=null;level[mainId]=0;
  while(qi<order.length){
    var cur=order[qi++];
    var nbrs=(adj[cur]||[]).slice().sort(function(a,b){return b.w-a.w});
    for(var i=0;i<nbrs.length;i++){
      var x=nbrs[i];
      if(seen[x.id])continue;
      seen[x.id]=1;parent[x.id]=cur;level[x.id]=level[cur]+1;order.push(x.id);
    }
  }
  /* узлы вне паутины связей (одиночки) — отдельная колонка справа, после
     всех уровней сети: в первой колонке они смешивались бы с шагом 1 */
  var maxLevel=0;
  nodes.forEach(function(x){if(level[x.id]>maxLevel)maxLevel=level[x.id]});
  nodes.forEach(function(x){
    if(!seen[x.id]){seen[x.id]=1;parent[x.id]=mainId;level[x.id]=maxLevel+1;order.push(x.id)}
  });
  maxLevel=0;
  nodes.forEach(function(x){if(level[x.id]>maxLevel)maxLevel=level[x.id]});
  var byLevel=[];
  nodes.forEach(function(x){
    var L=level[x.id];
    if(!byLevel[L])byLevel[L]=[];
    byLevel[L].push(x);
  });
  /* ширина колонки — самая широкая карточка + проход для нитей */
  var colW=0;
  nodes.forEach(function(x){var b=nodeBox(x);if(b.w>colW)colW=b.w});
  colW+=120;
  var padX=70,padY=46;
  var availW=W-padX*2;
  if((maxLevel+1)*colW>availW&&maxLevel>0)colW=Math.max(180,availW/(maxLevel+1));
  var totalW=(maxLevel+1)*colW;
  var x0=Math.max(padX+colW/2-40,(W-totalW)/2+colW/2);
  var L0;
  for(L0=0;L0<=maxLevel;L0++){
    (byLevel[L0]||[]).forEach(function(nd){nd.x=x0+L0*colW});
  }
  /* вертикаль: внутри колонки — по родителям, затем равномерно, по центру */
  for(L0=0;L0<=maxLevel;L0++){
    var col=byLevel[L0]||[];
    if(!col.length)continue;
    if(L0>0){
      col.sort(function(a,b){
        var pa=byId[parent[a.id]],pb=byId[parent[b.id]];
        var ya=pa?(pa._ord||0):999,yb=pb?(pb._ord||0):999;
        if(ya!==yb)return ya-yb;
        return b.score-a.score;
      });
    }else{
      col.sort(function(a,b){return b.score-a.score});
    }
    var totalH=0;
    col.forEach(function(nd){totalH+=nodeBox(nd).h});
    var gap=30;
    if(col.length>1){
      var free=(H-padY*2)-totalH;
      gap=Math.max(10,Math.min(46,free/(col.length-1)));
    }
    var blockH=totalH+gap*Math.max(0,col.length-1);
    var y=Math.max(padY,(H-blockH)/2);
    col.forEach(function(nd,i){
      nd._ord=i;
      var bh=nodeBox(nd).h;
      nd.y=y+bh/2;
      y+=bh+gap;
    });
  }
  /* закреплённые узлы возвращаем на сохранённую позицию */
  var pc=graphState.posCache;
  nodes.forEach(function(nd){
    if(graphState.pinned[nd.id]&&pc[nd.id]){nd.x=pc[nd.id].x;nd.y=pc[nd.id].y}
  });
  separateBoxes(nodes,n>200?8:(n>100?18:36),mainId);
  /* НЕ зажимаем колонку в окно: если узлов в шаге много, колонка выше
     холста — её покажет «вписать» (graphFitTarget), а камера отъедет;
     зажим по краю раньше сбивал карточки в стопку у нижней границы */
}

function svgVars(){
  var cs=getComputedStyle(document.documentElement);
  return {
    accent:(cs.getPropertyValue('--accent')||'#c93a2b').trim(),
    card:(cs.getPropertyValue('--card')||'#fff').trim(),
    line:(cs.getPropertyValue('--line')||'#ccc').trim(),
    line2:(cs.getPropertyValue('--line2')||'#ddd').trim(),
    ink:(cs.getPropertyValue('--ink')||'#111').trim(),
    ink2:(cs.getPropertyValue('--ink2')||'#555').trim(),
    ink3:(cs.getPropertyValue('--ink3')||'#888').trim(),
    bg:(cs.getPropertyValue('--bg')||'#f4f2ec').trim()
  };
}

/* ---------- Отрисовка графа ---------- */
function paintGraph(){
  var svg=$('#graphSvg'),d=graphState.data;
  if(!svg||!d)return;
  var W=graphState.W,H=graphState.H;
  if(!W||!H)return;
    svg.setAttribute('viewBox','0 0 '+W+' '+H);
    svg.setAttribute('width',W);svg.setAttribute('height',H);
  /* focusId объявляем до aria-label: var поднимается наверх функции,
     но значение присваивалось ПОЗЖЕ — подпись «фокус на выбранном» не
     появлялась, пока фокус есть */
  var focusId=graphState.focusId;
    /* схема — изображение: текстовый эквивалент списка рангов (.gp-row) ниже */
    svg.setAttribute('role','img');
    svg.setAttribute('aria-label','Схема книги: '+d.nodes.length+' '+plural(d.nodes.length,'узел','узла','узлов')+
      ', '+d.links.length+' '+plural(d.links.length,'связь','связи','связей')+
      (focusId?' · фокус на выбранном элементе':''));

  var V=svgVars();
  var cx=W/2,cy=H/2;
  var maxW=1;d.links.forEach(function(l){if(l.w>maxW)maxW=l.w});
  var mainId=d.mainId;
  var activeId=focusId||mainId;

  /* связи: при фокусе — только окружение фокусного узла; в режиме нод
     без фокуса видна вся паутина (иначе колонки выглядят разрозненными),
     в остальных режимах — лучи от главного */
  var showAll=(graphState.mode==='tree')&&!focusId;
  var visibleLinks=showAll?d.links:d.links.filter(function(l){
    return (l.s.id===activeId || l.t.id===activeId);
  });

  var rel={};
  if(focusId){
    rel[focusId]=1;
    visibleLinks.forEach(function(l){
      if(l.s.id===focusId)rel[l.t.id]=1;
      if(l.t.id===focusId)rel[l.s.id]=1;
    });
  }
  svg.classList.toggle('focused',!!focusId);
  /* одноразовые анимации: появление после пересборки и «приглушение»
     окружения при смене фокуса — paintGraph их съедает (иначе они
     перезапускались бы на каждой перерисовке при перетаскивании) */
  var enter=graphState.enter;graphState.enter=false;
  var dimAnim=graphState.dimAnim;graphState.dimAnim=false;
  svg.classList.toggle('enter',enter);
  var boxOf={};
  d.nodes.forEach(function(nd){boxOf[nd.id]=nodeBox(nd,nd.id===mainId)});

  /* одиночки без связей: в дереве — отдельная колонка справа, в
     радиальной — внешнее кольцо; подписи к ним рисуются ниже */
  var isoNodes=[];
  d.nodes.forEach(function(nd){if(nd.iso)isoNodes.push(nd)});
  var isoCount=isoNodes.length;

  var tip=$('#gpTip');
  if(tip){
    if(focusId){
      var fname='';
      for(var i=0;i<d.nodes.length;i++)if(d.nodes[i].id===focusId){fname=d.nodes[i].name;break}
      tip.innerHTML='<b>фокус</b> · '+esc(fname)+' · двойной клик — сбросить';
      tip.classList.add('on');
    }else{
      tip.classList.remove('on');
    }
  }

  var legendHint=$('#gpLegend');

  /* СЕТКА: точки «миллиметровки» живут вместе с камерой — шаг кратно
     меняется от масштаба (graphGridStep), поэтому точки не сливаются
     и не сереют; при пане и зуме её двигает applyGraphTransform */
  var gstep=graphGridStep();
  var s='<defs><pattern id="gpGrid" data-step="'+gstep+'" width="'+gstep+'" height="'+gstep+'" patternUnits="userSpaceOnUse" patternTransform="translate('+graphState.panX.toFixed(1)+','+graphState.panY.toFixed(1)+') scale('+graphState.zoom.toFixed(3)+')"><circle cx="'+(gstep/2)+'" cy="'+(gstep/2)+'" r="'+graphGridDotR().toFixed(2)+'" fill="'+V.line2+'"/></pattern></defs>';
  s+='<rect class="gp-grid" x="0" y="0" width="'+W+'" height="'+H+'" fill="url(#gpGrid)" pointer-events="none"/>';
  s+='<g id="graphTransform" transform="translate('+graphState.panX.toFixed(1)+','+graphState.panY.toFixed(1)+') scale('+graphState.zoom.toFixed(3)+')">';

  /* Концентрические направляющие для радиального режима — по реальным
     радиусам из layoutRadial (graphState.rings), а не по формуле от depth.
     Прячем их при фокусе на узле — чтобы не путали выделенное окружение. */
  if(graphState.mode==='radial' && !focusId && graphState.rings){
    var rings=graphState.rings;
    for(var L=1;L<rings.length;L++){
      var rLevel=rings[L];
      s+='<circle class="gp-ring" cx="'+cx.toFixed(1)+'" cy="'+cy.toFixed(1)+'" r="'+rLevel.toFixed(1)+'"/>';
      var ringName=(isoCount&&L===rings.length-1)?'без связей':(''+L);
      s+='<text class="gp-ring-label" x="'+(cx+rLevel+4).toFixed(1)+'" y="'+(cy-4).toFixed(1)+'">'+ringName+'</text>';
    }
  }

  /* Нити связей — кубические кривые от гнезда к гнезду, как нудлы в
     нодах Blender: выходят горизонтально вправо, входят в левое гнездо,
     поэтому стрелки не нужны. При появлении схемы нити «прорисовываются»
     (pathLength=1 + stroke-dashoffset в CSS) */
  visibleLinks.forEach(function(l){
    var isRel=focusId&&(l.s.id===focusId||l.t.id===focusId);
    var ratio=l.w/maxW;
    var o,sw,color;
    if(focusId){
      o=isRel?(0.6+0.32*ratio):0.2;
      sw=isRel?(1.5+2.1*ratio):0.8;
      color=isRel?V.accent:V.ink3;
    }else if(showAll){
      /* вес виден сразу: сильные нити плотнее и темнее (ink2),
         слабые — тише, но не пропадают: пол по прозрачности и толщине,
         иначе на тёмной теме паутина выглядит пустой */
      o=(ratio>0.55?0.34:0.2)+0.3*ratio;
      sw=0.85+1.5*ratio;
      color=ratio>0.55?V.ink2:V.ink3;
      if(l.s.id===mainId||l.t.id===mainId){o+=0.12;sw+=0.25}
    }else{
      o=(ratio>0.55?0.38:0.26)+0.3*ratio;
      sw=0.9+1.6*ratio;
      color=ratio>0.55?V.ink2:V.ink3;
    }
    var cls='glink'+(isRel?' grel':'')+(dimAnim&&focusId&&!isRel?' gdim':'')+(enter?' gdraw':'');
    var a=l.s,b=l.t;
    if(a.x>b.x){a=l.t;b=l.s}
    var ba=boxOf[a.id],bb=boxOf[b.id];
    var x1=a.x+ba.w/2,y1=a.y,x2=b.x-bb.w/2,y2=b.y;
    var dxb=Math.max(26,Math.abs(x2-x1)*0.46);
    var path='M '+x1.toFixed(1)+' '+y1.toFixed(1)+
      ' C '+(x1+dxb).toFixed(1)+' '+y1.toFixed(1)+' '+(x2-dxb).toFixed(1)+' '+y2.toFixed(1)+' '+x2.toFixed(1)+' '+y2.toFixed(1);
    /* data-s/data-t — концы нити: по ним наведение на карточку подсвечивает
       ровно её связи (класс .gnbr) */
    s+='<path class="'+cls+'" data-s="'+escAttr(l.s.id)+'" data-t="'+escAttr(l.t.id)+'" pathLength="1" d="'+path+'" fill="none" stroke="'+color+'" stroke-width="'+sw.toFixed(2)+'" stroke-linecap="round" opacity="'+o.toFixed(2)+'"/>';
  });

  /* Узлы — карточки как ноды Blender: цветная шапка с именем, тело со
     сводкой («тип · упоминания · связи») и гнёзда по краям. Подписи
     больше не «плавают» вокруг круга — имя живёт в шапке, поэтому
     коллизий подписей не бывает. */
  d.nodes.forEach(function(n,ni){
    var isMain=n.id===mainId;
    var isRel=focusId&&rel[n.id];
    var bx=boxOf[n.id];
    var w=bx.w,h=bx.h,hh=bx.head;
    var x=n.x-w/2,y=n.y-h/2;
    var col=wikiTypeColor(n.type);
    var cls='gnode'+(isMain?' is-main':'')+(isRel?' grel':'')+
      (graphState.pinned[n.id]?' pinned':'')+
      (dimAnim&&focusId&&!isRel?' gdim':'')+
      (dimAnim&&isRel?' glit':'');
    var stl=enter?(' style="animation-delay:'+((ni%14)*22)+'ms"'):'';
    s+='<g class="'+cls+'" data-id="'+escAttr(n.id)+'"'+stl+'>';
    /* ореол активной ноды и рамка закреплённой */
    if(isMain){
      s+='<rect class="gn-halo" x="'+(x-5).toFixed(1)+'" y="'+(y-5).toFixed(1)+'" width="'+(w+10).toFixed(1)+'" height="'+(h+10).toFixed(1)+'" rx="15"/>';
    }
    if(graphState.pinned[n.id]){
      s+='<rect class="gn-halo gn-pinring" x="'+(x-6).toFixed(1)+'" y="'+(y-6).toFixed(1)+'" width="'+(w+12).toFixed(1)+'" height="'+(h+12).toFixed(1)+'" rx="16"/>';
    }
    s+='<rect class="gn-bg" x="'+x.toFixed(1)+'" y="'+y.toFixed(1)+'" width="'+w+'" height="'+h+'" rx="11"/>';
    var hp=headPath(x,y,w,hh,11);
    s+='<path class="gn-head" d="'+hp+'" fill="'+col+'"/>';
    /* пастель: тот же путь под цветом карточки — краска не «кричит» */
    s+='<path class="gn-head gn-head-soft" d="'+hp+'" fill="'+V.card+'" opacity="0.58"/>';
    s+='<line class="gn-sep" x1="'+x.toFixed(1)+'" x2="'+(x+w).toFixed(1)+'" y1="'+(y+hh).toFixed(1)+'" y2="'+(y+hh).toFixed(1)+'"/>';
    if(graphState.labels){
      s+='<text class="gn-name" x="'+(x+13).toFixed(1)+'" y="'+(y+hh-8).toFixed(1)+'">'+esc(bx.name)+'</text>';
      var meta=esc(wikiTypeLabel(n.type))+' · упом. '+fmt(n.mentions)+' · связ. '+fmt(Math.round(n.degree));
      s+='<text class="gn-meta" x="'+(x+13).toFixed(1)+'" y="'+(y+hh+19).toFixed(1)+'">'+meta+'</text>';
    }
    /* гнёзда: вход слева, выход справа — к ним цепляются нити */
    s+='<circle class="gn-sock" cx="'+x.toFixed(1)+'" cy="'+n.y.toFixed(1)+'" r="3.4" stroke="'+col+'"/>';
    s+='<circle class="gn-sock" cx="'+(x+w).toFixed(1)+'" cy="'+n.y.toFixed(1)+'" r="3.4" stroke="'+col+'"/>';
    s+='</g>';
  });

  /* подпись колонки одиночек в дереве: карточки без нитей стоят справа —
     подпись объясняет, что связей у них просто нет */
  if(graphState.mode==='tree'&&!focusId&&isoCount){
    var capTop=1e9;
    isoNodes.forEach(function(nd){var ib=boxOf[nd.id];if(nd.y-ib.h/2<capTop)capTop=nd.y-ib.h/2});
    s+='<text class="gn-cap" x="'+isoNodes[0].x.toFixed(1)+'" y="'+Math.max(12,capTop-14).toFixed(1)+'" text-anchor="middle">без связей · '+isoCount+'</text>';
  }

  s+='</g>';
  svg.innerHTML=s;

  /* Обновляем хинт */
  if(legendHint){
    var oldHint=legendHint.querySelector('.gp-legend-hint');
    if(oldHint)oldHint.remove();
    var hint=mk('span');hint.className='gp-legend-hint';
    if(focusId){
      hint.textContent='фокус на узле · двойной клик — сбросить';
    }else if(showAll){
      hint.textContent='вся паутина: '+visibleLinks.length+' '+(visibleLinks.length===1?'связь':(visibleLinks.length<5?'связи':'связей'))+' · главный — '+((d.nodes.find(function(x){return x.id===mainId})||{}).name||'—')+(isoCount?(' · без связей '+isoCount):'');
    }else{
      hint.textContent=visibleLinks.length+' '+(visibleLinks.length===1?'связь':(visibleLinks.length<5?'связи':'связей'))+' от '+((d.nodes.find(function(x){return x.id===mainId})||{}).name||'главного')+(isoCount?(' · без связей '+isoCount):'');
    }
    legendHint.appendChild(hint);
  }
}

function renderGraphLegend(){
  var box=$('#gpLegend');if(!box)return;
  var d=graphState.data;
  var types={};
  (d?d.nodes:[]).forEach(function(n){types[n.type]=(types[n.type]||0)+1});
  var keys=Object.keys(types);
  if(!keys.length){box.innerHTML='';return}
  box.innerHTML=keys.map(function(k){
    return '<span><i style="background:'+wikiTypeColor(k)+'"></i>'+esc(wikiTypeLabel(k))+' · '+types[k]+'</span>';
  }).join('');
}
function renderGraphRank(){
  var box=$('#gpRank');if(!box)return;
  var d=graphState.data;
  if(!d||!d.nodes.length){
    box.innerHTML='<div class="wp-empty">Пока не из чего строить схему.<br><br>Добавьте во вкладке <b>«Мир»</b> персонажей, города и предметы — и напишите о них в тексте. Схема соберётся сама: узлы — статьи, линии — совместные упоминания.</div>';
    return;
  }
  var nodes=d.nodes.slice().sort(function(a,b){return b.score-a.score});
  var main=nodes[0];
  var maxScore=nodes[0].score||1;
  var focusId=graphState.focusId;
  var html='';
  html+='<div class="gp-h"><span class="lbl lbl-acc">Структура книги</span></div>';
  html+='<div class="gp-main"><span class="gp-star">★</span><b>'+esc(main.name)+'</b>'+
    '<span class="gp-main-l">'+fmt(main.mentions)+' '+plural(main.mentions,'упоминание','упоминания','упоминаний')+' · '+fmt(Math.round(main.degree))+' связей</span></div>';
  html+='<div class="gp-list">';
  nodes.slice(0,12).forEach(function(n,i){
    var pct=Math.max(3,Math.round((n.score/(maxScore||1))*100));
    var isFocus=(focusId===n.id);
    html+='<button type="button" class="gp-row'+(i===0?' is-main':'')+(isFocus?' is-focus':'')+'" data-id="'+escAttr(n.id)+'" aria-pressed="'+(isFocus?'true':'false')+'">'+
      '<span class="gp-i">'+(i+1)+'</span>'+
      '<span class="gp-name" title="'+escAttr(n.name)+'">'+esc(n.name)+'</span>'+
      '<span class="gp-bar"><i style="width:'+pct+'%;background:'+wikiTypeColor(n.type)+'"></i></span>'+
      '<span class="gp-v">'+fmt(n.mentions)+'</span></button>';
  });
  html+='</div>';
  var focusNode=focusId?nodes.find(function(x){return x.id===focusId}):null;
  var anchorNode=focusNode||main;
  var rels=d.links.filter(function(l){return l.s.id===anchorNode.id||l.t.id===anchorNode.id})
    .map(function(l){return {n:(l.s.id===anchorNode.id?l.t:l.s),w:l.w}})
    .sort(function(a,b){return b.w-a.w}).slice(0,10);
  if(rels.length){
    var maxW=rels[0].w||1;
    html+='<div class="gp-h" style="margin-top:18px"><span class="lbl">Ближайшее окружение «'+esc(anchorNode.name)+'»</span></div><div class="gp-list">';
    rels.forEach(function(r){
      var pct=Math.max(4,Math.round((r.w/maxW)*100));
      html+='<button type="button" class="gp-row" data-id="'+escAttr(r.n.id)+'" aria-pressed="'+(focusId===r.n.id?'true':'false')+'"><span class="gp-i">→</span>'+
        '<span class="gp-name" title="'+escAttr(r.n.name)+'">'+esc(r.n.name)+'</span>'+
        '<span class="gp-bar"><i style="width:'+pct+'%;background:var(--accent)"></i></span>'+
        '<span class="gp-v">'+fmt(r.w)+'</span></button>';
    });
    html+='</div>';
  }else{
    html+='<div class="wp-empty" style="margin-top:14px">Связей пока не видно — упомяните героев в одних предложениях.</div>';
  }
  if(d.dropped){
    html+='<div class="wp-empty" style="margin-top:12px">'+fmt(d.dropped)+' '+plural(d.dropped,'статья','статьи','статей')+' вне видимой глубины или порога.</div>';
  }
  if(d.isolated){
    html+='<div class="wp-empty" style="margin-top:12px">'+fmt(d.isolated)+' '+plural(d.isolated,'статья','статьи','статей')+' без связей — показаны отдельно, без нитей.</div>';
  }
  box.innerHTML=html;
  box.querySelectorAll('.gp-row[data-id]').forEach(function(row){
    row.addEventListener('click',function(){
      var id=row.getAttribute('data-id');
      if(!id)return;
      graphState.focusId=(graphState.focusId===id)?null:id;
      graphState.selectedId=id;
      graphState.dimAnim=true;
      paintGraph();renderGraphRank();
    });
  });
}
/* «Структура книги» теперь выдвигается поверх карты (кнопка «структура»
   в тулбаре): карта получает почти всю высоту окна, а список рангов
   открывается по кнопке и не сжимает холст */
function setGraphRankOpen(on){
  graphState.rankOpen=!!on;
  var box=$('#gpRank'),btn=$('#gpRankBtn');
  if(box)box.classList.toggle('on',graphState.rankOpen);
  if(btn){
    btn.classList.toggle('on',graphState.rankOpen);
    btn.setAttribute('aria-pressed',graphState.rankOpen?'true':'false');
  }
}

function renderGraphTypeBar(){
  var box=$('#gpTypes');if(!box)return;
  var b=book();if(!b){box.innerHTML='';return}
  var entries=b.wiki||[];
  var types={};
  entries.forEach(function(e){if(!types[e.type])types[e.type]=0;types[e.type]++});
  box.innerHTML='';
  var all=Object.keys(types);
  if(!all.length){box.innerHTML='';return}
  all.forEach(function(k){
    var cnt=types[k];
    var btn=mk('button');
    btn.type='button';
    btn.className='gp-tchip'+(graphState.hiddenTypes[k]?' off':'');
    btn.style.setProperty('--tc',wikiTypeColor(k));
    btn.textContent=wikiTypeLabel(k)+' · '+cnt;
    btn.title=graphState.hiddenTypes[k]?'Включить':'Скрыть';
    btn.setAttribute('aria-pressed',graphState.hiddenTypes[k]?'false':'true');
    btn.addEventListener('click',function(){
      graphState.hiddenTypes[k]=!graphState.hiddenTypes[k];
      renderGraphTypeBar();
      buildAndRenderGraph(true);
    });
    box.appendChild(btn);
  });
}

function buildAndRenderGraph(rebuild,keepView){
  var pane=$('#paneGraph');
  if(!pane||pane.hidden)return;
  if(graphTipHide)graphTipHide();
  var box=$('#graphCanvas');
  var W=box.clientWidth|0,H=box.clientHeight|0;
  if(W<40||H<40){setTimeout(function(){buildAndRenderGraph(rebuild,keepView)},120);return}
  /* старые позиции — чтобы узлы переехали на новые места плавно */
  var oldPos={};
  if(graphState.data)graphState.data.nodes.forEach(function(n){oldPos[n.id]={x:n.x,y:n.y}});
  var d=buildGraphData();
  graphState.data=d;
  graphState.W=W;graphState.H=H;
  if(graphState.mode!=='radial')graphState.rings=null;
  var svg=$('#graphSvg');
  if(!d.nodes.length){
    cancelGraphTween();
    svg.innerHTML='';
    graphState.mainId=null;
    graphState.posCache={};
    graphState.enter=false;graphState.dimAnim=false;
    renderGraphTypeBar();
    renderGraphLegend();
    renderGraphRank();
    setGraphRankOpen(true);   /* пустая карта — открываем «структуру» с подсказкой */
    return;
  }
  graphState.mainId=d.mainId;
  /* если фокус указывает на несуществующий узел — сбросить */
  if(graphState.focusId && !d.nodes.some(function(n){return n.id===graphState.focusId})){
    graphState.focusId=null;
  }
  var nodes=d.nodes,links=d.links;
  if(rebuild){
    cancelGraphTween();
    if(graphState.mode==='tree')layoutTree(nodes,links,W,H,graphState.mainId);
    else if(graphState.mode==='radial')layoutRadial(nodes,links,W,H,graphState.mainId);
    else if(graphState.mode==='circle')layoutCircle(nodes,links,W,H,graphState.mainId);
    else layoutForce(nodes,links,W,H,graphState.mainId);
    /* запоминаем позиции закреплённых узлов для следующих перестроек */
    var pc={};
    nodes.forEach(function(nd){if(graphState.pinned[nd.id])pc[nd.id]={x:nd.x,y:nd.y}});
    graphState.posCache=pc;
  }
  /* Плавный переезд: узлы едут из старых позиций в новые (как переезд
     рамок нод при смене раскладки), а не телепортируются */
  var tweening=false;
  if(rebuild&&!graphReduced()){
    nodes.forEach(function(nd){
      var o=oldPos[nd.id];
      if(o&&!graphState.pinned[nd.id]&&(Math.abs(o.x-nd.x)>0.5||Math.abs(o.y-nd.y)>0.5)){
        nd._fx=1;nd._sx=o.x;nd._sy=o.y;
        nd._tx=nd.x;nd._ty=nd.y;
        nd.x=o.x;nd.y=o.y;
        tweening=true;
      }else nd._fx=0;
    });
  }else{
    nodes.forEach(function(nd){nd._fx=0});
  }
  graphState.enter=!!rebuild&&!tweening;
  var wantFit=keepView||graphState.needFit;
  graphState.needFit=false;
  /* Тулбар, легенда и список рангов только что заняли своё место — от них
     высота холста меняется. Если размер уплыл (на первом показе список
     рангов «съедает» пол-панели), раскладываем заново на верную площадь
     и только потом вписываем камеру — иначе вписывание считалось по
     высоте без рангов и схема оказывалась обрезанной снизу. */
  renderGraphTypeBar();
  renderGraphLegend();
  renderGraphRank();
  var W2=box.clientWidth|0,H2=box.clientHeight|0;
  if(W2>=40&&H2>=40&&(Math.abs(W2-W)>2||Math.abs(H2-H)>2)){
    W=W2;H=H2;
    graphState.W=W;graphState.H=H;
    if(graphState.mode==='tree')layoutTree(nodes,links,W,H,graphState.mainId);
    else if(graphState.mode==='radial')layoutRadial(nodes,links,W,H,graphState.mainId);
    else if(graphState.mode==='circle')layoutCircle(nodes,links,W,H,graphState.mainId);
    else layoutForce(nodes,links,W,H,graphState.mainId);
    var pc2={};
    nodes.forEach(function(nd){if(graphState.pinned[nd.id])pc2[nd.id]={x:nd.x,y:nd.y}});
    graphState.posCache=pc2;
    if(tweening){
      /* переезд уже начат — просто перенацеливаем узлы на новые места */
      nodes.forEach(function(nd){
        if(nd._fx){nd._tx=nd.x;nd._ty=nd.y;nd.x=nd._sx;nd.y=nd._sy}
      });
    }
  }
  /* камера: первый показ, кнопка «вписать» и смена режима — вписываем;
     обычные перестройки вид не трогают (вид сохраняется по умолчанию) */
  if(wantFit)graphFitTarget();
  if(tweening)startGraphTween();
  paintGraph();
}
function zoomBy(k){
  if(!graphState.data)return;
  if(graphTipHide)graphTipHide();
  var W=graphState.W,H=graphState.H;
  var cx=W/2,cy=H/2;
  var z0=graphView.tZoom;
  var z1=Math.max(0.3,Math.min(3.4,z0*k));
  if(z1===z0)return;
  var kk=z1/z0;
  graphView.tPanX=cx-kk*(cx-graphView.tPanX);
  graphView.tPanY=cy-kk*(cy-graphView.tPanY);
  graphView.tZoom=z1;
  graphView.vx=0;graphView.vy=0;
  graphViewKick();
}
document.querySelectorAll('.gp-mode').forEach(function(b){
  b.addEventListener('click',function(){
    graphState.mode=b.dataset.mode;
    document.querySelectorAll('.gp-mode').forEach(function(x){
      x.classList.toggle('on',x===b);
      x.setAttribute('aria-pressed',x===b?'true':'false');
    });
    /* при смене режима сбрасываем закрепления, чтобы раскладка не спорила */
    graphState.pinned={};
    graphState.posCache={};
    buildAndRenderGraph(true,true);
  });
});
document.querySelectorAll('.gp-mode').forEach(function(x){
  x.setAttribute('aria-pressed',x.classList.contains('on')?'true':'false');
});
$('#gpPeople').addEventListener('click',function(){
  graphState.people=!graphState.people;
  this.classList.toggle('on',graphState.people);
  this.setAttribute('aria-pressed',graphState.people?'true':'false');
  buildAndRenderGraph(true);
});
/* «без связей» — одиночки на карте (по умолчанию показаны) */
$('#gpOrphans').addEventListener('click',function(){
  graphState.showOrphans=!graphState.showOrphans;
  this.classList.toggle('on',graphState.showOrphans);
  this.setAttribute('aria-pressed',graphState.showOrphans?'true':'false');
  buildAndRenderGraph(true);
});
$('#gpOrphans').classList.add('on');
$('#gpOrphans').setAttribute('aria-pressed','true');
/* кнопка выдвижной «Структуры книги» */
$('#gpRankBtn').addEventListener('click',function(){setGraphRankOpen(!graphState.rankOpen)});
$('#gpLabels').addEventListener('click',function(){
  graphState.labels=!graphState.labels;
  this.classList.toggle('on',graphState.labels);
  this.setAttribute('aria-pressed',graphState.labels?'true':'false');
  paintGraph();
});
$('#gpLabels').classList.add('on');
$('#gpLabels').setAttribute('aria-pressed','true');
$('#gpPeople').setAttribute('aria-pressed','false');
$('#gpRebuild').addEventListener('click',function(){
  invalidateCo();
  graphState.pinned={};
  graphState.posCache={};
  graphState.focusId=null;
  buildAndRenderGraph(true,true);
  toast('Схема пересобрана');
});
$('#gpExport').addEventListener('click',function(){
  var svg=$('#graphSvg');
  if(!svg||!svg.innerHTML){toast('Схема пуста');return}
  var clone=svg.cloneNode(true);
  clone.setAttribute('xmlns','http://www.w3.org/2000/svg');
  var V=svgVars();
  /* внешний файл не видит 06-graph.css — впрыскиваем стили явно */
  var st='<style>'+
    '.gn-bg{fill:'+V.card+';stroke:'+V.line2+';stroke-width:1}'+
    '.gn-name{font-family:Georgia,"Times New Roman",serif;font-size:12px;font-weight:600;fill:'+V.ink+'}'+
    '.gnode.is-main .gn-name{fill:'+V.accent+'}'+
    '.gn-meta{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:8.5px;letter-spacing:.04em;fill:'+V.ink3+'}'+
    '.gn-cap{font-family:system-ui,"Segoe UI",sans-serif;font-size:9px;letter-spacing:.14em;text-transform:uppercase;fill:'+V.ink3+';opacity:.6}'+
    '.gn-sep{stroke:'+V.line2+';stroke-width:1}'+
    '.gn-sock{fill:'+V.card+';stroke-width:1.3}'+
    '.gn-halo{fill:none;stroke:'+V.accent+';stroke-width:1.2;stroke-dasharray:3 4;opacity:.7}'+
    '.gn-pinring{stroke:'+V.ink3+';stroke-dasharray:2 3;opacity:.55}'+
    '.glink{fill:none}'+
    '.gp-ring{fill:none;stroke:'+V.line+';stroke-dasharray:2 5;opacity:.5}'+
    '.gp-ring-label{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:8px;fill:'+V.ink3+';opacity:.6}'+
    '</style>';
  clone.insertAdjacentHTML('afterbegin',st);
  /* фон-прямоугольник — style="background" часть вьюеры SVG игнорируют */
  var w=svg.getAttribute('width')||graphState.W,h=svg.getAttribute('height')||graphState.H;
  clone.insertAdjacentHTML('afterbegin','<rect width="'+w+'" height="'+h+'" fill="'+V.bg+'"/>');
  var blob=new Blob([clone.outerHTML],{type:'image/svg+xml;charset=utf-8'});
  var a=mk('a');
  a.href=URL.createObjectURL(blob);
  a.download='chernovik-map.svg';
  a.click();
  setTimeout(function(){URL.revokeObjectURL(a.href)},1000);
  toast('Схема сохранена');
});
$('#gpDepth').addEventListener('input',function(){
  graphState.depth=+this.value;
  $('#gpDepthVal').textContent=this.value;
});
$('#gpDepth').addEventListener('change',function(){
  buildAndRenderGraph(true);
});
$('#gpWeight').addEventListener('input',function(){
  graphState.minWeight=+this.value;
  $('#gpWeightVal').textContent=this.value;
});
$('#gpWeight').addEventListener('change',function(){
  buildAndRenderGraph(true);
});

/* ---------- Зум, панорамирование, перетаскивание узлов, фокус ---------- */
(function(){
  var canvas=$('#graphCanvas'),svg=$('#graphSvg');
  if(!canvas||!svg)return;
  var drag=null,moved=false,startX=0,startY=0;
  var panning=false,px=0,py=0,startPanX=0,startPanY=0;
  var panHist=[];               /* след пальца — для инерции после броска */
  var nodeTip=$('#gpNodeTip');
  var pointers={},pinch=null;   /* пинч-зум двумя пальцами */

  function findNode(id){
    var d=graphState.data;if(!d)return null;
    for(var i=0;i<d.nodes.length;i++)if(d.nodes[i].id===id)return d.nodes[i];
    return null;
  }

  var nodeTipTimer=null,nodeTipId=null;
  /* Наведение на карточку подсвечивает ЕЁ нити: по data-s/data-t нити
     находим связанные пути и вешаем класс .gnbr (стили — в 06-graph.css) */
  var hoverLinkId=null;
  function setHoverLinks(id){
    if(hoverLinkId===id||!svg)return;
    hoverLinkId=id;
    var ps=svg.querySelectorAll('path.glink.gnbr');
    for(var i=0;i<ps.length;i++)ps[i].classList.remove('gnbr');
    if(!id)return;
    ps=svg.querySelectorAll('path.glink');
    for(var j=0;j<ps.length;j++){
      if(ps[j].getAttribute('data-s')===id||ps[j].getAttribute('data-t')===id)ps[j].classList.add('gnbr');
    }
  }
  function positionNodeTip(clientX,clientY){
    var r=canvas.getBoundingClientRect();
    var x=clientX-r.left, y=clientY-r.top;
    x=Math.max(80,Math.min(r.width-80,x));
    y=Math.max(40,y);
    nodeTip.style.left=x+'px';
    nodeTip.style.top=(y-12)+'px';
  }
  function renderNodeTip(n,clientX,clientY){
    if(!n||!nodeTip)return;
    var tp=wikiTypeLabel(n.type);
    var col=wikiTypeColor(n.type);
    /* на мелком масштабе карточка крошечная — подсказка в одну строку,
       вблизи показываем полную сводку */
    var compact=graphState.zoom<0.78;
    nodeTip.classList.toggle('compact',compact);
    nodeTip.innerHTML=compact
      ? '<div class="nt-name"><span class="nt-dot" style="background:'+col+'"></span>'+esc(n.name)+'<span class="nt-type">'+esc(tp)+'</span></div>'
      : '<div class="nt-name"><span class="nt-dot" style="background:'+col+'"></span>'+esc(n.name)+'</div>'+
        '<div class="nt-meta"><span>'+esc(tp)+'</span><span>· упом. <b>'+fmt(n.mentions)+'</b></span><span>· связей <b>'+fmt(Math.round(n.degree))+'</b></span></div>';
    positionNodeTip(clientX,clientY);
    nodeTip.classList.add('on');
  }
  function hideNodeTip(){
    if(nodeTipTimer){clearTimeout(nodeTipTimer);nodeTipTimer=null}
    nodeTipId=null;
    setHoverLinks(null);
    if(nodeTip)nodeTip.classList.remove('on');
  }
  graphTipHide=hideNodeTip;
  /* подсказка не «выпрыгивает» при каждом проносе мыши — ждёт паузу */
  function hoverNodeTip(n,clientX,clientY){
    if(!nodeTip)return;
    if(nodeTipId===n.id){
      if(nodeTip.classList.contains('on'))positionNodeTip(clientX,clientY);
      return;
    }
    nodeTipId=n.id;
    setHoverLinks(n.id);
    if(nodeTipTimer)clearTimeout(nodeTipTimer);
    nodeTipTimer=setTimeout(function(){
      nodeTipTimer=null;
      if(nodeTipId===n.id)renderNodeTip(n,clientX,clientY);
    },180);
  }

  svg.addEventListener('pointerdown',function(e){
    /* новый жест — гасим непросроченное отложенное открытие статьи
       и прячем подсказку узла */
    hideNodeTip();
    if(graphOpenTimer){clearTimeout(graphOpenTimer);graphOpenTimer=null}
    pointers[e.pointerId]={x:e.clientX,y:e.clientY};
    var ids=Object.keys(pointers);
    if(ids.length===2){
      /* второй палец — переходим в режим пинч-зума */
      drag=null;panning=false;canvas.classList.remove('panning','dragging');
      var a=pointers[ids[0]],b=pointers[ids[1]];
      pinch={
        d0:Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),
        z0:graphState.zoom,
        mx:(a.x+b.x)/2,my:(a.y+b.y)/2,
        panX0:graphState.panX,panY0:graphState.panY
      };
      hideNodeTip();
      try{svg.setPointerCapture(e.pointerId)}catch(err){}
      e.preventDefault();
      return;
    }
    if(pinch)return;
    var c=e.target.closest?e.target.closest('.gnode'):null;
    if(!c){
      panning=true;px=e.clientX;py=e.clientY;
      startPanX=graphState.panX;startPanY=graphState.panY;
      panHist.length=0;
      graphViewSync();
      canvas.classList.add('panning');
      try{svg.setPointerCapture(e.pointerId)}catch(err){}
      e.preventDefault();
      return;
    }
    var id=c.getAttribute('data-id');
    var n=findNode(id);
    if(!n)return;
    /* узел схвачен — мгновенно доводим камеру и переезд, чтобы не спорили */
    cancelGraphTween();
    graphViewSync();
    drag=n;moved=false;startX=e.clientX;startY=e.clientY;
    canvas.classList.add('dragging');
    try{svg.setPointerCapture(e.pointerId)}catch(err){}
    e.preventDefault();
  });
  svg.addEventListener('pointermove',function(e){
    if(pointers[e.pointerId]){pointers[e.pointerId].x=e.clientX;pointers[e.pointerId].y=e.clientY}
    if(pinch){
      var ids=Object.keys(pointers);
      if(ids.length<2)return;
      var a=pointers[ids[0]],b=pointers[ids[1]];
      var d=Math.max(1,Math.hypot(a.x-b.x,a.y-b.y));
      var rect=svg.getBoundingClientRect();
      var mx=(a.x+b.x)/2,my=(a.y+b.y)/2;
      var newZoom=Math.max(0.35,Math.min(3.2,pinch.z0*(d/pinch.d0)));
      var kk=newZoom/pinch.z0;
      graphState.zoom=newZoom;
      graphState.panX=(mx-rect.left)-kk*((pinch.mx-rect.left)-pinch.panX0);
      graphState.panY=(my-rect.top)-kk*((pinch.my-rect.top)-pinch.panY0);
      graphViewSync();
      applyGraphTransform();
      return;
    }
    if(panning){
      graphState.panX=startPanX+(e.clientX-px);
      graphState.panY=startPanY+(e.clientY-py);
      graphViewSync();
      var nowP=performance.now();
      panHist.push({t:nowP,x:graphState.panX,y:graphState.panY});
      if(panHist.length>5)panHist.shift();
      applyGraphTransform();
      return;
    }
    if(!drag){
      var c=e.target.closest?e.target.closest('.gnode'):null;
      if(c){
        var n=findNode(c.getAttribute('data-id'));
        if(n)hoverNodeTip(n,e.clientX,e.clientY);
      } else hideNodeTip();
      return;
    }
    if(Math.abs(e.clientX-startX)>3||Math.abs(e.clientY-startY)>3)moved=true;
    var r=svg.getBoundingClientRect();
    var z=graphState.zoom||1;
    drag.x=(e.clientX-r.left-graphState.panX)/z;
    drag.y=(e.clientY-r.top-graphState.panY)/z;
    graphState.pinned[drag.id]=true;
    scheduleGraphPaint();
  });
  function endPointer(e){
    delete pointers[e.pointerId];
    if(pinch&&Object.keys(pointers).length<2)pinch=null;
    try{svg.releasePointerCapture(e.pointerId)}catch(err){}
  }
  svg.addEventListener('pointerup',function(e){
    var wasPinch=!!pinch;
    var remain=[];
    Object.keys(pointers).forEach(function(k){
      if(String(k)!==String(e.pointerId))remain.push(k);
    });
    endPointer(e);
    if(wasPinch){
      pinch=null;
      if(remain.length===1&&pointers[remain[0]]){
        /* один палец остался — переходим в обычное панорамирование */
        var p=pointers[remain[0]];
        panning=true;px=p.x;py=p.y;
        startPanX=graphState.panX;startPanY=graphState.panY;
        panHist.length=0;
        canvas.classList.add('panning');
      }
      return;
    }
    if(panning){
      panning=false;
      canvas.classList.remove('panning');
      hideNodeTip();
      /* инерция: отпустили на ходу — камера ещё немного скользит */
      if(panHist.length>1&&!graphReduced()){
        var a0=panHist[0],a1=panHist[panHist.length-1];
        var dt0=Math.max(1,a1.t-a0.t);
        var vx=(a1.x-a0.x)/dt0,vy=(a1.y-a0.y)/dt0;
        var sp=Math.sqrt(vx*vx+vy*vy);
        if(sp>0.25){
          var cap=1.5;
          if(sp>cap){vx*=cap/sp;vy*=cap/sp}
          graphView.vx=vx;graphView.vy=vy;
          graphViewKick();
        }
      }
      panHist.length=0;
      return;
    }
    if(!drag)return;
    var wasMoved=moved;
    var id=drag.id;
    var dpos=wasMoved?{x:drag.x,y:drag.y}:null;
    drag=null;
    canvas.classList.remove('dragging');
    if(!wasMoved){
      /* одиночный клик открывает статью, но с задержкой: второй клик в
         пределах DBL_MS отменяет открытие и переключает фокус.
         Раньше модалка успевала перекрыть второй клик — фокус был недостижим. */
      var now=Date.now();
      var isDbl=(graphState.lastClickId===id)&&(now-graphState.lastClickTime<450);
      clearTimeout(graphOpenTimer);graphOpenTimer=null;
      if(isDbl){
        graphState.lastClickId=null;graphState.lastClickTime=0;
        graphState.focusId=(graphState.focusId===id)?null:id;
        graphState.dimAnim=true;
        paintGraph();renderGraphRank();
      }else{
        graphState.lastClickId=id;graphState.lastClickTime=now;
        graphOpenTimer=setTimeout(function(){
          graphOpenTimer=null;
          if(graphState.lastClickId===id){
            graphState.lastClickId=null;graphState.lastClickTime=0;
            openWikiView(id);
          }
        },450);
      }
    } else {
      if(dpos)graphState.posCache[id]=dpos;
      renderGraphRank();
    }
  });
  svg.addEventListener('pointerleave',function(){hideNodeTip()});
  svg.addEventListener('pointercancel',function(e){
    delete pointers[e.pointerId];
    drag=null;panning=false;pinch=null;canvas.classList.remove('panning','dragging');
    hideNodeTip();
  });

  svg.addEventListener('dblclick',function(e){
    /* фокус по второму клику обрабатывается в pointerup по таймингу —
       здесь только фон: двойной клик по пустому месту сбрасывает фокус */
    if(e.target.closest&&e.target.closest('.gnode'))return;
    clearTimeout(graphOpenTimer);graphOpenTimer=null;
    if(graphState.focusId){graphState.focusId=null;graphState.dimAnim=true;paintGraph();renderGraphRank();}
  });

  canvas.addEventListener('wheel',function(e){
    if(!graphState.data)return;
    e.preventDefault();
    hideNodeTip();
    var dy=e.deltaY;
    if(e.deltaMode===1)dy*=33;             /* строки/страницы → пиксели */
    dy=Math.max(-500,Math.min(500,dy));
    var rect=svg.getBoundingClientRect();
    var mx=e.clientX-rect.left,my=e.clientY-rect.top;
    /* экспонента мягче линейного шага: тачпады и колёса ведут себя ровно */
    graphWheelZoom(mx,my,Math.exp(-dy*0.0017));
  },{passive:false});

  $('#gpZoomIn').addEventListener('click',function(){zoomBy(1.25)});
  $('#gpZoomOut').addEventListener('click',function(){zoomBy(1/1.25)});
  $('#gpFit').addEventListener('click',function(){
    graphState.focusId=null;
    graphState.pinned={};
    graphState.posCache={};
    buildAndRenderGraph(true,true);
  });
})();
if('ResizeObserver' in window){
  var gc=$('#graphCanvas');
  if(gc){
    var gro=new ResizeObserver(function(){
      if(!$('#paneGraph').hidden){clearTimeout(gro._t);gro._t=setTimeout(function(){buildAndRenderGraph(true)},120)}
    });
    gro.observe(gc);
  }
}

