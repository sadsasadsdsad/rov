/* ==========================================================================
 * 12-graph.js — СХЕМА КНИГИ — граф связей
 * Проект: «Черновик» — веб-редактор рукописей. tests/ — разобранная копия
 *   src/index.html: 18 JS-скриптов, подключаются строго по номеру.
 * Раздел оригинала: src/index.html, строки 3245–4038 (раздел 12 из 18).
 * Что делает: данные графа из wiki-связей, три раскладки (круг / BFS-ряды / силы), отрисовка SVG, тулбар с фильтрами типов и слайдерами, зум и перетаскивание.
 * Ключевое: buildAndRenderGraph, scheduleGraph, layoutForce, layoutCircle, paintGraph, renderGraphTypeBar, zoomBy, graphState.
 * Зависимости: 01-core, 04-state-seed, 09-cooccurrence; тулбар разметки — 06-graph.css.
 * ========================================================================== */
"use strict";
/* =========================================================================
   СХЕМА КНИГИ — УЛУЧШЕННАЯ ВЕРСИЯ
   ========================================================================= */
var graphState={
  mode:'radial',           /* radial | circle | force */
  people:false,
  labels:true,
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
  lastPainted:0
};
var graphTimer=null;
var graphRafId=null;
var graphOpenTimer=null;

/* перерисовка не чаще кадра — при быстром перетаскивании узлов */
function scheduleGraphPaint(){
  if(graphRafId)return;
  graphRafId=requestAnimationFrame(function(){graphRafId=null;paintGraph()});
}
/* только transform — без перестройки SVG (пан и зум) */
function applyGraphTransform(){
  var g=document.getElementById('graphTransform');
  if(!g){paintGraph();return}
  g.setAttribute('transform','translate('+graphState.panX.toFixed(1)+','+graphState.panY.toFixed(1)+') scale('+graphState.zoom.toFixed(3)+')');
}

function scheduleGraph(){
  if(!$('#wikiPanel').classList.contains('on')||panelTab!=='graph')return;
  clearTimeout(graphTimer);
  graphTimer=setTimeout(function(){buildAndRenderGraph(true)},120);
}

function buildGraphData(){
  var b=book();
  if(!b)return {nodes:[],links:[],dropped:0};
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
  if(!mainId)return {nodes:[],links:[],dropped:0};
  var maxDepth=graphState.depth|0;
  var adj={};nodes.forEach(function(n){adj[n.id]=[]});
  links.forEach(function(l){adj[l.s.id].push(l.t.id);adj[l.t.id].push(l.s.id)});
  var reach={},q=[mainId],seen={mainId:1},lvl={mainId:0};
  reach[mainId]=1;
  while(q.length){
    var cur=q.shift();
    if(lvl[cur]>=maxDepth)continue;
    (adj[cur]||[]).forEach(function(nb){
      if(seen[nb])return;
      seen[nb]=1;lvl[nb]=lvl[cur]+1;reach[nb]=1;q.push(nb);
    });
  }
  var kept=[],dropped=0;
  nodes.forEach(function(n){
    if(reach[n.id])kept.push(n);
    else dropped++;
  });
  nodes=kept;
  var byId2={};nodes.forEach(function(n){byId2[n.id]=n});
  links=links.filter(function(l){return byId2[l.s.id]&&byId2[l.t.id]});
  return {nodes:nodes,links:links,dropped:dropped,mainId:mainId};
}

function nodeRadius(n,isMain){
  var base=8+Math.min(14,Math.sqrt(Math.max(1,n.mentions))*3);
  return isMain?base+6:base;
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
  nodes.forEach(function(x){
    if(!seen[x.id]){seen[x.id]=1;parent[x.id]=mainId;level[x.id]=1;order.push(x.id)}
  });
  var byLevel={},maxLevel=0;
  nodes.forEach(function(x){
    var L=level[x.id];
    if(!byLevel[L])byLevel[L]=[];
    byLevel[L].push(x);
    if(L>maxLevel)maxLevel=L;
  });
  var cx=W/2,cy=H/2;
  var maxR=Math.max(80,Math.min(W,H)/2-60);
  var levelRadius=[0],prevR=70;
  for(var L=1;L<=maxLevel;L++){
    var cnt=(byLevel[L]||[]).length;
    var minSpacing=96;
    var minR=cnt>0?((cnt*minSpacing)/(2*Math.PI)):prevR+80;
    var levelR=maxR*(L/maxLevel);
    var r=Math.max(prevR+50,minR,levelR);
    if(r>maxR)r=maxR;
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
  for(var iter=0;iter<sepIter;iter++){
    var moved=false;
    for(var i=0;i<nodes.length;i++){
      var a=nodes[i];if(a.id===mainId)continue;
      if(graphState.pinned[a.id])continue;
      for(var j=i+1;j<nodes.length;j++){
        var b=nodes[j];if(b.id===mainId)continue;
        var dx=b.x-a.x,dy=b.y-a.y;
        var d=Math.sqrt(dx*dx+dy*dy)||0.01;
        var minD=nodeRadius(a,false)+nodeRadius(b,false)+26;
        if(d<minD){
          var push=(minD-d)/2;
          var ux=dx/d,uy=dy/d;
          if(!graphState.pinned[b.id]){b.x+=ux*push;b.y+=uy*push}
          a.x-=ux*push;a.y-=uy*push;
          moved=true;
        }
      }
    }
    if(!moved)break;
  }
  var pad=44;
  nodes.forEach(function(nd){
    nd.x=Math.max(pad,Math.min(W-pad,nd.x));
    nd.y=Math.max(pad,Math.min(H-pad,nd.y));
  });
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
  /* радиус кольца — от вместимости: узлы с крупными радиусами не налезают */
  var need=0;
  sorted.forEach(function(nd){need+=nodeRadius(nd,nd.id===mainId)*2+26});
  var rMax=Math.min(W,H)/2-70;
  var rMin=need/(Math.PI*2);
  var r=Math.max(70,Math.min(rMax,Math.max(rMin,Math.min(W,H)/4)));
  var step=(Math.PI*2)/n;
  sorted.forEach(function(nd,i){
    var ang=-Math.PI/2+step*i;
    nd.x=cx+Math.cos(ang)*r;
    nd.y=cy+Math.sin(ang)*r;
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
      nd.x=cx+Math.cos(ang)*40;
      nd.y=cy+Math.sin(ang)*40;
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
  for(var iter=0;iter<forceSep;iter++){
    var moved=false;
    for(var i=0;i<n;i++){
      var a=nodes[i]; if(graphState.pinned[a.id])continue;
      for(var j=i+1;j<n;j++){
        var b=nodes[j]; if(graphState.pinned[b.id])continue;
        var dx=b.x-a.x,dy=b.y-a.y;
        var d=Math.sqrt(dx*dx+dy*dy)||0.01;
        var minD=nodeRadius(a,false)+nodeRadius(b,false)+22;
        if(d<minD){
          var push=(minD-d)/2;
          var ux=dx/d,uy=dy/d;
          a.x-=ux*push;a.y-=uy*push;
          b.x+=ux*push;b.y+=uy*push;
          moved=true;
        }
      }
    }
    if(!moved)break;
  }
  var pad=44;
  nodes.forEach(function(nd){
    if(graphState.pinned[nd.id])return;
    nd.x=Math.max(pad,Math.min(W-pad,nd.x));
    nd.y=Math.max(pad,Math.min(H-pad,nd.y));
  });
}

function svgVars(){
  var cs=getComputedStyle(document.documentElement);
  return {
    accent:(cs.getPropertyValue('--accent')||'#c93a2b').trim(),
    card:(cs.getPropertyValue('--card')||'#fff').trim(),
    line:(cs.getPropertyValue('--line')||'#ccc').trim(),
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
    /* схема — изображение: текстовый эквивалент списка рангов (.gp-row) ниже */
    svg.setAttribute('role','img');
    svg.setAttribute('aria-label','Схема книги: '+d.nodes.length+' '+plural(d.nodes.length,'узел','узла','узлов')+
      ', '+d.links.length+' '+plural(d.links.length,'связь','связи','связей')+
      (focusId?' · фокус на выбранном элементе':''));

  var V=svgVars();
  var cx=W/2,cy=H/2;
  var maxW=1;d.links.forEach(function(l){if(l.w>maxW)maxW=l.w});
  var mainId=d.mainId;
  var focusId=graphState.focusId;
  var activeId=focusId||mainId;

  /* связи: если есть фокус — от фокусного узла, иначе от главного */
  var visibleLinks=d.links.filter(function(l){
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

  var s='<g id="graphTransform" transform="translate('+graphState.panX.toFixed(1)+','+graphState.panY.toFixed(1)+') scale('+graphState.zoom.toFixed(3)+')">';

  /* Концентрические направляющие для радиального режима — по реальным
     радиусам из layoutRadial (graphState.rings), а не по формуле от depth.
     Прячем их при фокусе на узле — чтобы не путали выделенное окружение. */
  if(graphState.mode==='radial' && !focusId && graphState.rings){
    var rings=graphState.rings;
    for(var L=1;L<rings.length;L++){
      var rLevel=rings[L];
      s+='<circle class="gp-ring" cx="'+cx.toFixed(1)+'" cy="'+cy.toFixed(1)+'" r="'+rLevel.toFixed(1)+'"/>';
      s+='<text class="gp-ring-label" x="'+(cx+rLevel+4).toFixed(1)+'" y="'+(cy-4).toFixed(1)+'">'+L+'</text>';
    }
  }

  /* Рёбра — лёгкие кривые (дуги) между узлами */
  visibleLinks.forEach(function(l){
    var isRel=focusId&&(l.s.id===focusId||l.t.id===focusId);
    var ratio=l.w/maxW;
    var o=isRel?(0.55+0.35*ratio):(0.22+0.36*ratio);
    var sw=isRel?(1.4+2*ratio):(0.7+1.6*ratio);
    var color=isRel?V.accent:V.ink3;
    var cls='glink'+(isRel?' grel':'');

    /* Небольшое искривление — сдвигаем среднюю точку перпендикулярно */
    var x1=l.s.x,y1=l.s.y,x2=l.t.x,y2=l.t.y;
    var dx=x2-x1,dy=y2-y1;
    var len=Math.sqrt(dx*dx+dy*dy)||1;
    var offset=Math.min(28,len*0.12);
    var mx=(x1+x2)/2 - dy/len*offset;
    var my=(y1+y2)/2 + dx/len*offset;
    var path='M '+x1.toFixed(1)+' '+y1.toFixed(1)+' Q '+mx.toFixed(1)+' '+my.toFixed(1)+' '+x2.toFixed(1)+' '+y2.toFixed(1);
    s+='<path class="'+cls+'" d="'+path+'" fill="none" stroke="'+color+'" stroke-width="'+sw.toFixed(2)+'" stroke-linecap="round" opacity="'+o.toFixed(2)+'"/>';
  });

  /* Узлы */
  var labelQueue=[];
  d.nodes.forEach(function(n){
    var isMain=n.id===mainId;
    var isActive=n.id===activeId;
    var isRel=focusId&&rel[n.id];
    var r=nodeRadius(n,isMain);
    var col=wikiTypeColor(n.type);
    var nodeCls='gnode'+(isRel?' grel':'')+(graphState.pinned[n.id]?' pinned':'');

    /* Ореол — тонкий круг цвета фона */
    s+='<circle class="'+nodeCls+'" data-id="'+escAttr(n.id)+'" cx="'+n.x.toFixed(1)+'" cy="'+n.y.toFixed(1)+'" r="'+(r+3).toFixed(1)+'" fill="'+V.card+'" opacity="0.9"/>';
    if(isMain){
      s+='<circle class="'+nodeCls+'" data-id="'+escAttr(n.id)+'" cx="'+n.x.toFixed(1)+'" cy="'+n.y.toFixed(1)+'" r="'+(r+6).toFixed(1)+'" fill="none" stroke="'+V.accent+'" stroke-width="1.2" stroke-dasharray="3 4" opacity="0.7"/>';
    }
    if(graphState.pinned[n.id]){
      s+='<circle class="'+nodeCls+'" data-id="'+escAttr(n.id)+'" cx="'+n.x.toFixed(1)+'" cy="'+n.y.toFixed(1)+'" r="'+(r+9).toFixed(1)+'" fill="none" stroke="'+V.ink3+'" stroke-width="1" stroke-dasharray="2 3" opacity="0.6"/>';
    }
    s+='<circle class="'+nodeCls+'" data-id="'+escAttr(n.id)+'" cx="'+n.x.toFixed(1)+'" cy="'+n.y.toFixed(1)+'" r="'+r.toFixed(1)+'" fill="'+col+'" fill-opacity="'+(n.mentions?0.92:0.5)+'" stroke="'+(isMain?V.accent:V.card)+'" stroke-width="'+(isMain?2:1.4)+'"/>';

    if(graphState.labels){
      var ang=Math.atan2(n.y-cy,n.x-cx);
      var lx,ly,anchor;
      if(Math.abs(Math.cos(ang))>0.55){
        lx=n.x+Math.cos(ang)*(r+11);
        ly=n.y+3.5;
        anchor=Math.cos(ang)>0?'start':'end';
      }else{
        lx=n.x;
        ly=n.y+(Math.sin(ang)>0?(r+16):-(r+11));
        anchor='middle';
      }
      var labelCls='glabel'+(isMain?' gmain':'')+(isRel?' grel':'');
      var label=n.name.length>22?n.name.slice(0,21)+'…':n.name;
      labelQueue.push({x:lx,y:ly,anchor:anchor,cls:labelCls,text:label,
        pri:(isMain?2:(isRel?1:0))});
    }
  });

  /* Размещение подписей без пересечений: сначала приоритетные (главный,
     окружение фокуса), затем остальные. Конфликтующие сдвигаются вверх/вниз,
     без места — скрываются, кроме приоритетных. */
  if(labelQueue.length){
    labelQueue.sort(function(a,b){return b.pri-a.pri});
    var placed=[];
    labelQueue.forEach(function(L){
      var w=L.text.length*5.6+6,h=11;
      var x0=L.anchor==='start'?L.x:(L.anchor==='end'?L.x-w:L.x-w/2);
      var box={x0:x0,y0:L.y-h,x1:x0+w,y1:L.y+3};
      var cand=[[0,0],[0,-12],[0,12],[-w*0.6,0],[w*0.6,0]];
      var ok=null;
      for(var ci=0;ci<cand.length;ci++){
        var b2={x0:box.x0+cand[ci][0],y0:box.y0+cand[ci][1],x1:box.x1+cand[ci][0],y1:box.y1+cand[ci][1]};
        var hit=false;
        for(var pi=0;pi<placed.length;pi++){
          var p=placed[pi];
          if(b2.x0<p.x1&&b2.x1>p.x0&&b2.y0<p.y1&&b2.y1>p.y0){hit=true;break}
        }
        if(!hit){ok=b2;break}
      }
      if(!ok&&L.pri<2)return;
      var px=(ok||box);
      placed.push(px);
      var dx=px.x0-box.x0,dy=px.y0-box.y0;
      if(dx||dy)s+='<g transform="translate('+dx.toFixed(1)+','+dy.toFixed(1)+')">';
      s+='<text class="'+L.cls+'" x="'+L.x.toFixed(1)+'" y="'+L.y.toFixed(1)+'" text-anchor="'+L.anchor+'">'+esc(L.text)+'</text>';
      if(dx||dy)s+='</g>';
    });
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
    }else{
      hint.textContent=visibleLinks.length+' '+(visibleLinks.length===1?'связь':(visibleLinks.length<5?'связи':'связей'))+' от '+((d.nodes.find(function(x){return x.id===mainId})||{}).name||'главного');
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
  box.innerHTML=html;
  box.querySelectorAll('.gp-row[data-id]').forEach(function(row){
    row.addEventListener('click',function(){
      var id=row.getAttribute('data-id');
      if(!id)return;
      graphState.focusId=(graphState.focusId===id)?null:id;
      graphState.selectedId=id;
      paintGraph();renderGraphRank();
    });
  });
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
  var box=$('#graphCanvas');
  var W=box.clientWidth|0,H=box.clientHeight|0;
  if(W<40||H<40){setTimeout(function(){buildAndRenderGraph(rebuild,keepView)},120);return}
  var d=buildGraphData();
  graphState.data=d;
  graphState.W=W;graphState.H=H;
  /* вид (зум/пан) сохраняем по умолчанию — не сбрасываем при рефлоу и
     мелких перестройках; явный сброс — через keepView=true (fit/смена режима) */
  if(keepView){graphState.zoom=1;graphState.panX=0;graphState.panY=0}
  if(graphState.mode!=='radial')graphState.rings=null;
  var svg=$('#graphSvg');
  if(!d.nodes.length){
    svg.innerHTML='';
    graphState.mainId=null;
    graphState.posCache={};
    renderGraphTypeBar();
    renderGraphLegend();
    renderGraphRank();
    return;
  }
  graphState.mainId=d.mainId;
  /* если фокус указывает на несуществующий узел — сбросить */
  if(graphState.focusId && !d.nodes.some(function(n){return n.id===graphState.focusId})){
    graphState.focusId=null;
  }
  var nodes=d.nodes,links=d.links;
  if(rebuild){
    if(graphState.mode==='radial')layoutRadial(nodes,links,W,H,graphState.mainId);
    else if(graphState.mode==='circle')layoutCircle(nodes,links,W,H,graphState.mainId);
    else layoutForce(nodes,links,W,H,graphState.mainId);
    /* запоминаем позиции закреплённых узлов для следующих перестроек */
    var pc={};
    nodes.forEach(function(nd){if(graphState.pinned[nd.id])pc[nd.id]={x:nd.x,y:nd.y}});
    graphState.posCache=pc;
  }
  paintGraph();
  renderGraphTypeBar();
  renderGraphLegend();
  renderGraphRank();
}
function zoomBy(k){
  if(!graphState.data)return;
  var W=graphState.W,H=graphState.H;
  var cx=W/2,cy=H/2;
  var newZoom=Math.max(0.35,Math.min(3.2,graphState.zoom*k));
  var kk=newZoom/graphState.zoom;
  graphState.panX=cx-kk*(cx-graphState.panX);
  graphState.panY=cy-kk*(cy-graphState.panY);
  graphState.zoom=newZoom;
  applyGraphTransform();
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
    'text{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:9.5px;fill:'+V.ink3+';letter-spacing:.01em;paint-order:stroke;stroke:'+V.card+';stroke-width:3px;stroke-linejoin:round}'+
    'text.gmain{fill:'+V.accent+';font-weight:600;font-size:12.5px}'+
    'text.grel{fill:'+V.ink2+';font-weight:500}'+
    '.gp-ring{fill:none;stroke:'+V.line+';stroke-dasharray:2 5;opacity:.5}'+
    '.gp-ring-label{font-size:8px;fill:'+V.ink3+';stroke:none;opacity:.6}'+
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
  var nodeTip=$('#gpNodeTip');
  var pointers={},pinch=null;   /* пинч-зум двумя пальцами */

  function findNode(id){
    var d=graphState.data;if(!d)return null;
    for(var i=0;i<d.nodes.length;i++)if(d.nodes[i].id===id)return d.nodes[i];
    return null;
  }

  function showNodeTip(n,clientX,clientY){
    if(!n||!nodeTip)return;
    var tp=wikiTypeLabel(n.type);
    var col=wikiTypeColor(n.type);
    nodeTip.innerHTML='<div class="nt-name"><span class="nt-dot" style="background:'+col+'"></span>'+esc(n.name)+'</div>'+
      '<div class="nt-meta"><span>'+esc(tp)+'</span><span>· упом. <b>'+fmt(n.mentions)+'</b></span><span>· связей <b>'+fmt(Math.round(n.degree))+'</b></span></div>';
    var r=canvas.getBoundingClientRect();
    var x=clientX-r.left, y=clientY-r.top;
    x=Math.max(80,Math.min(r.width-80,x));
    y=Math.max(40,y);
    nodeTip.style.left=x+'px';
    nodeTip.style.top=(y-12)+'px';
    nodeTip.classList.add('on');
  }
  function hideNodeTip(){if(nodeTip)nodeTip.classList.remove('on')}

  svg.addEventListener('pointerdown',function(e){
    /* новый жест — гасим непросроченное отложенное открытие статьи */
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
    var c=e.target.closest?e.target.closest('circle.gnode'):null;
    if(!c){
      panning=true;px=e.clientX;py=e.clientY;
      startPanX=graphState.panX;startPanY=graphState.panY;
      canvas.classList.add('panning');
      try{svg.setPointerCapture(e.pointerId)}catch(err){}
      e.preventDefault();
      return;
    }
    var id=c.getAttribute('data-id');
    var n=findNode(id);
    if(!n)return;
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
      applyGraphTransform();
      return;
    }
    if(panning){
      graphState.panX=startPanX+(e.clientX-px);
      graphState.panY=startPanY+(e.clientY-py);
      applyGraphTransform();
      return;
    }
    if(!drag){
      var c=e.target.closest?e.target.closest('circle.gnode'):null;
      if(c){
        var n=findNode(c.getAttribute('data-id'));
        if(n)showNodeTip(n,e.clientX,e.clientY);
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
        canvas.classList.add('panning');
      }
      return;
    }
    if(panning){
      panning=false;
      canvas.classList.remove('panning');
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
    if(e.target.closest&&e.target.closest('circle.gnode'))return;
    clearTimeout(graphOpenTimer);graphOpenTimer=null;
    if(graphState.focusId){graphState.focusId=null;paintGraph();renderGraphRank();}
  });

  canvas.addEventListener('wheel',function(e){
    if(!graphState.data)return;
    e.preventDefault();
    var rect=svg.getBoundingClientRect();
    var mx=e.clientX-rect.left,my=e.clientY-rect.top;
    var oldZoom=graphState.zoom;
    var k=e.deltaY<0?1.15:1/1.15;
    var newZoom=Math.max(0.35,Math.min(3.2,oldZoom*k));
    if(newZoom===oldZoom)return;
    var kk=newZoom/oldZoom;
    graphState.panX=mx-kk*(mx-graphState.panX);
    graphState.panY=my-kk*(my-graphState.panY);
    graphState.zoom=newZoom;
    applyGraphTransform();
  },{passive:false});

  $('#gpZoomIn').addEventListener('click',function(){zoomBy(1.25)});
  $('#gpZoomOut').addEventListener('click',function(){zoomBy(1/1.25)});
  $('#gpFit').addEventListener('click',function(){
    graphState.zoom=1;graphState.panX=0;graphState.panY=0;
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

