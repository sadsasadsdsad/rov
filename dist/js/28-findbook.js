/* ==========================================================================
 * Новый поиск в «Общие книги» (#findRow): пишешь название — ищем сразу по
 *   всем доступным источникам: своя полка, каталог общих книг (сервер),
 *   Гутенберг (Gutendex) и Открытая библиотека. Каталоги браузер спрашивает
 *   сам (у них CORS), а полный текст внешней книги тянем через белый прокси
 *   api/proxy.php и отдаём импорт-парсеру impTxt — книга открывается в
 *   читалке только для чтения (foreignDoc), в библиотеку не сохраняется.
 *   Старый поиск каталога (#sharedSearch) работает как раньше.
 * ========================================================================== */
var FB_SRC={own:'мои книги',catalog:'каталог',gutenberg:'гутенберг',openlib:'открытая библиотека'};
var FB_ORDER={own:0,catalog:1,gutenberg:2,openlib:3};
var FB_MAX=8;                /* карточек на источник — выдача читаемая целиком */
var fbReq=0;

/* fetch с таймаутом: внешний каталог мог зависнуть — тогда он просто
   не попадает в выдачу, свои источники всё равно покажутся */
function fbFetch(url,ms,cred){
  var ctrl=(typeof AbortController!=='undefined')?new AbortController():null;
  var tid=setTimeout(function(){if(ctrl)try{ctrl.abort()}catch(e){}},ms||12000);
  var opt={};
  if(cred)opt.credentials='same-origin';
  if(ctrl)opt.signal=ctrl.signal;
  return fetch(url,opt).then(function(r){clearTimeout(tid);return r},function(e){clearTimeout(tid);throw e});
}

/* свои книги — мгновенно, по названию и автору */
function fbOwn(q){
  var lq=q.toLowerCase(),out=[];
  var books=(state&&Array.isArray(state.books))?state.books:[];
  books.forEach(function(b){
    var t=String(b.title||'').toLowerCase(),a=String(b.author||'').toLowerCase();
    if(t.indexOf(lq)>=0||a.indexOf(lq)>=0)out.push({src:'own',id:b.id,title:b.title||'Без названия',author:b.author||''});
  });
  return Promise.resolve(out.slice(0,FB_MAX));
}

/* каталог общих книг на своём же сервере — тем же запросом, что и старый поиск */
function fbCatalog(q){
  return fbFetch('api/discover.php?q='+encodeURIComponent(q),12000,true)
    .then(function(r){return r.json()})
    .then(function(d){
      var out=[];
      ((d&&Array.isArray(d.books))?d.books:[]).forEach(function(it){
        out.push({src:'catalog',id:it.id,title:it.title||'Без названия',author:it.author||''});
      });
      return out.slice(0,FB_MAX);
    })
    .catch(function(){return []});
}

/* Гутенберг: показываем только книги с полным текстом (text/plain) —
   карточка без текста читать нечего */
function fbGutenberg(q){
  return fbFetch('https://gutendex.com/books?search='+encodeURIComponent(q),12000,false)
    .then(function(r){return r.json()})
    .then(function(d){
      var out=[];
      ((d&&Array.isArray(d.results))?d.results:[]).forEach(function(g){
        var txt=(g&&g.formats)?g.formats['text/plain']:'';
        if(!txt||typeof txt!=='string')return;
        txt=txt.replace(/^http:\/\//i,'https://');          /* прокси принимает только https */
        out.push({src:'gutenberg',id:'g'+g.id,title:g.title||'',
                  author:(g.authors&&g.authors[0]&&g.authors[0].name)||'',
                  extra:((g.languages&&g.languages[0])||'')+(g.id?(' · '+g.id):''),text:txt});
      });
      return out.slice(0,FB_MAX);
    })
    .catch(function(){return []});
}

/* Открытая библиотека: текст живёт в Internet Archive — берём книги,
   у которых есть скан (ia); ссылка на djvu.txt уходит в прокси */
function fbOpenLib(q){
  return fbFetch('https://openlibrary.org/search.json?title='+encodeURIComponent(q)+'&limit='+FB_MAX+'&fields=title,author_name,first_publish_year,ia,language',12000,false)
    .then(function(r){return r.json()})
    .then(function(d){
      var out=[];
      ((d&&Array.isArray(d.docs))?d.docs:[]).forEach(function(doc){
        var ia=(Array.isArray(doc.ia)?doc.ia:[]).filter(function(x){return typeof x==='string'&&/^[A-Za-z0-9_\-]+$/.test(x)});
        if(!ia.length)return;                              /* без скана читать нечего */
        var langs=Array.isArray(doc.language)?doc.language:[];
        out.push({src:'openlib',id:'ol'+ia[0],title:doc.title||'',
                  author:(doc.author_name&&doc.author_name[0])||'',
                  extra:(doc.first_publish_year||'')+(langs.indexOf('rus')>=0?' · ru':''),
                  ia:ia[0],text:'https://archive.org/download/'+ia[0]+'/'+ia[0]+'_djvu.txt'});
      });
      return out.slice(0,FB_MAX);
    })
    .catch(function(){return []});
}

/* шапка выдачи: сколько найдено и кнопка «стереть» */
function fbHead(html,clearable){
  var head=mk('div');head.className='find-head';
  var s=mk('span');s.innerHTML=html;head.appendChild(s);
  if(clearable){
    var clr=mk('button');
    clr.type='button';clr.className='find-clear';clr.textContent='стереть';
    clr.addEventListener('click',fbClear);
    head.appendChild(clr);
  }
  return head;
}

function fbRender(items,q){
  var box=document.getElementById('findList');if(!box)return;
  box.hidden=false;
  box.innerHTML='';
  if(!items.length){
    box.appendChild(fbHead('ничего не нашлось по запросу «'+esc(q)+'»',true));
    var em=mk('div');em.className='shared-empty';
    em.textContent='проверьте название или попробуйте часть слова';
    box.appendChild(em);
    return;
  }
  items.sort(function(a,b){return (FB_ORDER[a.src]||0)-(FB_ORDER[b.src]||0)});
  box.appendChild(fbHead('найдено '+items.length+' '+plural(items.length,'книга','книги','книг')+' по запросу «'+esc(q)+'»',true));
  items.forEach(function(it,ix){
    var c=mk('div');
    c.className='shared-card';c.style.setProperty('--i',ix);
    c.setAttribute('role','button');c.tabIndex=0;
    var dia=mk('span');dia.className='cv-dia';
    var st=mk('div');st.className='st';st.textContent=it.title||'Без названия';
    var sa=mk('div');sa.className='sa';sa.textContent=it.author||'';
    var sf=mk('div');sf.className='sf';
    var sd=mk('div');sd.className='sd';
    sd.textContent=FB_SRC[it.src]+(it.extra?(' · '+it.extra):'');
    var so=mk('span');so.className='so';
    so.textContent=(it.src==='own'||it.src==='catalog')?'открыть →':'читать →';
    sf.appendChild(sd);sf.appendChild(so);
    c.appendChild(dia);c.appendChild(st);c.appendChild(sa);c.appendChild(sf);
    var open=function(){fbOpen(it)};
    c.addEventListener('click',open);
    c.addEventListener('keydown',function(e){if(e.key==='Enter'||e.key===' '){e.preventDefault();open()}});
    box.appendChild(c);
  });
}

function fbSearch(q){
  q=String(q||'').trim();
  var box=document.getElementById('findList');if(!box)return;
  if(!q){fbClear();return}
  var n=++fbReq;
  box.hidden=false;box.innerHTML='';
  box.appendChild(fbHead('ищу «'+esc(q)+'» по всем источникам…',false));
  Promise.all([fbOwn(q),fbCatalog(q),fbGutenberg(q),fbOpenLib(q)])
    .then(function(res){
      if(n!==fbReq)return;               /* пользователь уже искал дальше */
      var items=[];
      res.forEach(function(list){if(Array.isArray(list))items=items.concat(list)});
      fbRender(items,q);
    });
}

function fbClear(){
  fbReq++;
  var box=document.getElementById('findList');
  if(box){box.hidden=true;box.innerHTML=''}
  var fi=document.getElementById('findInput');
  if(fi)fi.value='';
}

/* шапка «The Project Gutenberg eBook…» и лицензия в конце — не книга */
function fbGutenbergStrip(t){
  var s=String(t||'');
  var m=/\*\*\*\s*START OF (?:THE|THIS) PROJECT GUTENBERG EBOOK[^\n]*\*\*\*/i.exec(s);
  if(m)s=s.slice(s.indexOf(m[0])+m[0].length);
  var e=/\*\*\*\s*END OF (?:THE|THIS) PROJECT GUTENBERG EBOOK/i.exec(s);
  if(e)s=s.slice(0,s.indexOf(e[0]));
  return s;
}

/* чужая книга из данных импорта — главы с санитайзером, без Памятки/Заметок */
function fbForeignBook(data){
  var chapters=[],first=null,i;
  for(i=0;i<data.chapters.length;i++){
    var ch={id:uid(),html:impChapterHtml(data.chapters[i]),pos:0,marks:[]};
    chapters.push(ch);
    if(!first)first=ch;
  }
  var b={id:'ext'+uid(),title:String(data.title||'Без названия').slice(0,200),
         author:String(data.author||'').slice(0,200),
         updated:Date.now(),chapters:chapters,current:first.id,customTypes:[],wiki:[]};
  return roNormalize(b);
}

function fbOpen(it){
  if(!it)return;
  if(it.src==='own'){openBookOverview(it.id);return}
  if(it.src==='catalog'){openSharedBook(it.id,null);return}
  /* внешняя книга: текст через белый прокси → импорт-парсер → читалка */
  toast('Загружаю «'+(it.title||'книга')+'»…');
  fbFetch('api/proxy.php?u='+encodeURIComponent(it.text),30000,true)
    .then(function(r){
      if(!r.ok){
        /* прокси отвечает JSON {error:…} — покажем причину, а не «не получилось» */
        return r.json().catch(function(){return null}).then(function(e){
          throw new Error((e&&e.error)?e.error:('http '+r.status));
        });
      }
      return r.arrayBuffer();
    })
    .then(function(buf){
      var text=fbGutenbergStrip(impDec(buf));
      var data=impTxt((it.title||'book')+'.txt',text);   /* главы — как при импорте TXT */
      if(!data||!data.chapters||!data.chapters.length)throw new Error('пусто');
      if(!data.title||data.title==='Без названия')data.title=it.title||'Без названия';
      if(!data.author)data.author=it.author||'';
      var b=fbForeignBook(data);
      var line=(data.author?('Автор: '+data.author+' · '):'')+FB_SRC[it.src];
      openForeignBook(b,{line:line,author:data.author||''});
    })
    .catch(function(e){
      var why=(e&&e.message)?String(e.message):'';
      toast('Не удалось получить текст книги'+(why?(' ('+why+')'):''));
    });
}

/* ===== обработчики разметки (скрипт в конце body — DOM готов) ===== */
(function(){
  var fi=document.getElementById('findInput');
  var fb=document.getElementById('findBtn');
  if(fi){
    fi.addEventListener('keydown',function(e){
      if(e.key==='Enter'){e.preventDefault();fbSearch(fi.value)}
    });
  }
  if(fb)fb.addEventListener('click',function(){fbSearch(fi?fi.value:'')});
})();
