/* ============================================================================
 * 24-import.js — умный импорт книги из файла
 * FB2 · EPUB · PDF · MOBI · HTML · RTF · TXT → новая книга на полке
 *
 * Всё работает прямо в браузере, без сервера: файл читается через FileReader,
 * EPUB распаковывается своим читалом ZIP (DecompressionStream), PDF разбирает
 * pdf.js, который подключается только при первом PDF (файл в js/vendor).
 * Формат узнаём сначала по сигнатуре файла (%PDF, PK, {\rtf, MOBI, FictionBook),
 * потом по расширению; текст кодируем сами: BOM, строгий UTF-8, UTF-16 и
 * windows-1251 (русские файлы часто в ней).
 *
 * Главы: FB2/EPUB/MOBI/HTML режутся по своим заголовкам (section, spine, h1-h3);
 * TXT/RTF — по умным правилам («Глава 4», «Часть II», «Пролог», «1. Название»,
 * КО РО ТЫ М, в RTF ещё и по целиком жирным строкам). PDF: заголовки ловим по
 * кеглю и по тем же словам, шапки/подвалы страниц выкидываем по повторам.
 * Импортированная книга попадает в библиотеку с главами, памяткой и заметками
 * и сразу открывается.
 * ========================================================================== */

/* --- Кодировки ------------------------------------------------------------ */
/* байты 0x80–0xBF в windows-1251 (таблица WHATWG encodings) */
var IMP_C1251_HI=[0x0402,0x0403,0x201A,0x0453,0x201E,0x2026,0x2020,0x2021,0x20AC,0x2030,0x0409,0x2039,0x040A,0x040C,0x040B,0x040F,
  0x0452,0x2018,0x2019,0x201C,0x201D,0x2022,0x2013,0x2014,0x0098,0x2122,0x0459,0x203A,0x045A,0x045C,0x045B,0x045F,
  0x00A0,0x040E,0x045E,0x0408,0x00A4,0x0490,0x00A6,0x00A7,0x0401,0x00A9,0x0404,0x00AB,0x00AC,0x00AD,0x00AE,0x0407,
  0x00B0,0x00B1,0x0406,0x0456,0x0491,0x00B5,0x00B6,0x00B7,0x0451,0x2116,0x0454,0x00BB,0x0458,0x0405,0x0455,0x0457];

function impCp1251Char(b){
  if(b<0x80)return String.fromCharCode(b);
  if(b<0xC0)return String.fromCharCode(IMP_C1251_HI[b-0x80]);
  if(b<0xE0)return String.fromCharCode(0x0410+(b-0xC0));   /* А…Я */
  return String.fromCharCode(0x0430+(b-0xE0));             /* а…я */
}

function impU8(buf){return (buf instanceof Uint8Array)?buf:new Uint8Array(buf)}

/* байты → строка по кодовой странице: 65001 utf-8, 1252 латиница, 1251 своя таблица */
function impCpStr(bytes,cp){
  var label=null;
  if(cp===65001||cp==='utf-8')label='utf-8';
  else if(cp===1252||cp==='windows-1252')label='windows-1252';
  else if(cp==='koi8-r'||cp==='koi8')label='koi8-r';
  else if(cp===866||cp==='cp866')label='ibm866';
  if(label){try{return new TextDecoder(label).decode(bytes)}catch(e){}}
  if(label==='windows-1252'){var s='';for(var i=0;i<bytes.length;i++)s+=String.fromCharCode(bytes[i]);return s}
  var t='';for(var j=0;j<bytes.length;j++)t+=impCp1251Char(bytes[j]);return t;
}

function impUtf16(b,le){
  var s='',i;
  for(i=0;i+1<b.length;i+=2)s+=String.fromCharCode(le?(b[i]|(b[i+1]<<8)):((b[i]<<8)|b[i+1]));
  return s;
}

/* байты файла → строка: BOM, UTF-16 без BOM (нули через один), строгий UTF-8,
 * иначе windows-1251 — так читаются старые русские файлы */
function impDec(buf){
  var b=impU8(buf);
  if(b.length>=3&&b[0]===0xEF&&b[1]===0xBB&&b[2]===0xBF){try{return new TextDecoder('utf-8').decode(b.subarray(3))}catch(e){}}
  if(b.length>=2&&b[0]===0xFF&&b[1]===0xFE)return impUtf16(b.subarray(2),true);
  if(b.length>=2&&b[0]===0xFE&&b[1]===0xFF)return impUtf16(b.subarray(2),false);
  var n=Math.min(b.length,6000),e=0,o=0,i;
  for(i=0;i+1<n;i+=2){if(b[i]===0)e++;if(b[i+1]===0)o++}
  if(e>0||o>0){
    if(e>n*0.15&&o<=Math.max(1,e*0.1))return impUtf16(b,true);
    if(o>n*0.15&&e<=Math.max(1,o*0.1))return impUtf16(b,false);
  }
  try{return new TextDecoder('utf-8',{fatal:true}).decode(b)}catch(e){}
  return impCpStr(b,1251);
}

/* как impDec, но уважаем encoding="…" из заголовка XML (FB2 в cp1251) */
function impDecDecl(buf){
  var m=/encoding=["']([\w.-]+)["']/i.exec(impLatin(impU8(buf),400));
  var label=m?m[1].toLowerCase():'';
  if(label&&!/utf/i.test(label)){
    try{return new TextDecoder(label).decode(impU8(buf))}catch(e){}
    if(label==='windows-1251'||label==='1251'||label==='cp1251')return impCpStr(impU8(buf),1251);
  }
  return impDec(buf);
}

function impLatin(b,n){
  var s='',i,e=Math.min(b.length,n||b.length);
  for(i=0;i<e;i++)s+=String.fromCharCode(b[i]);
  return s;
}

function impBi16(b,p){return (b[p]|(b[p+1]<<8))>>>0}
function impBi32(b,p){return ((b[p]|(b[p+1]<<8)|(b[p+2]<<16)|(b[p+3]<<24))>>>0)}

/* --- Умная нарезка текста на главы ---------------------------------------- */

/* строка-заголовок? «Глава 4», «Часть II», «Пролог», «1. Название», КО РО ТЫ М */
function impIsHead(s){
  s=String(s||'').replace(/\s+/g,' ').trim();
  if(!s||s.length>90)return false;
  /* «Пролог», «Часть I», «Глава 4» — только если это и есть вся строка */
  if(/^(глава|часть|раздел|том|книга|поглавье|тетрадь|пролог|эпилог|предисловие|послесловие)\s*([0-9]{1,3}|[ivxlcdm]{1,8}|[а-яё]{1,15})?[\.:)?!]*$/i.test(s))return true;
  if(/^(chapter|part|section|book|canto|prologue|epilogue|preface|afterword)\s*([0-9]{1,3}|[ivxlcdm]{1,8})?[\.:)?!]*$/i.test(s))return true;
  /* «Глава первая. Как всё началось» — слово-заголовок плюс подзаголовок */
  if(!/[.!?…]$/.test(s)&&/^(глава|часть|раздел|том|книга|поглавье)\s+([0-9]{1,3}|[ivxlcdm]{1,8}|[а-яё]{1,15}|[A-Z][a-z]+)([\s.:)\-–—].{0,70})?$/i.test(s))return true;
  /* «1. Название», «II. Название» */
  if(/^\d{1,2}[.)]\s+\S/.test(s))return true;
  if(/^[IVXLC]{1,8}[.)]\s+\S/.test(s))return true;
  /* короткая строка целиком капслоком */
  if(s.length<=60&&s===s.toUpperCase()&&/[А-ЯЁA-Z]{3}/.test(s)&&!/[.,;:!?]\s/.test(s))return true;
  return false;
}

/* чистка входного текста: переносы строк, невидимые и управляющие
   символы — всё, что мешает ставить абзацы («лишнее» уходит на входе).
   Переносы-дефисы внутри строк разбираются при склейке — см. impParas */
function impCleanText(text){
  return String(text||'')
    .replace(/\r\n?/g,'\n')
    .replace(/\uFEFF/g,'')
    .replace(/\f/g,'\n\n')                                 /* разрыв страницы — как пустая строка */
    .replace(/[\u00AD\u200B\u200C\u200D\u2060\u180E]/g,'') /* мягкие и нулевые переносы */
    .replace(/[\u200E\u200F\u202A-\u202E\u202C]/g,'')      /* метки направления письма */
    .replace(/[\x00-\x08\x0B\x0E-\x1F]/g,'')               /* управляющие (перевод строки оставили) */
    .replace(/\t/g,' ')
    .replace(/\u00A0/g,' ');
}

/* мусор страниц и разделители: «- 15 -», «15», «15/16», «стр. 15», «***» */
function impJunk(s){
  s=String(s||'').replace(/\s+/g,' ').trim();
  if(!s)return true;
  if(/^[-–—]?\s*\d{1,4}\s*[-–—]?$/.test(s))return true;             /* номер страницы */
  if(/^\d{1,4}\s*[/\\.,;:]\s*\d{1,4}$/.test(s))return true;         /* «15/16» */
  if(/^(стр|страница|страницы|страницу|с|page|p|pp)\.?\s*\d{1,4}(\s*[-–—]\s*\d{1,4})?$/i.test(s))return true;
  if(/^№\s*\d{1,4}$/.test(s))return true;
  return !/[0-9A-Za-zА-Яа-яЁё]/.test(s);                            /* без букв: «---», «***», «...» */
}

/* текст → абзацы: ставятся сами, лишнее удаляется (правила — внутри impParas):
   пустая строка = граница абзаца; строки-мусор (номера страниц, «стр. 15»,
   «***») выпадают до разбора; блок без пустых строк, где почти каждая строка —
   готовое предложение, разбирается построчно («строка = абзац»); иначе строки
   склеиваются — это переносы строк внутри абзаца, дефис-перенос в конце строки
   склеивается; реплика с тире начинает новый абзац; стихи и пьесы — строка = абзац */
function impParas(text){
  text=impCleanText(text);
  var raw=text.split('\n'),blocks=[],cur=[],i,j;
  for(i=0;i<raw.length;i++){
    var t=raw[i].replace(/ {2,}/g,' ').trim();
    if(!t){if(cur.length){blocks.push(cur);cur=[]}continue}
    if(impJunk(t))continue;
    cur.push(t);
  }
  if(cur.length)blocks.push(cur);
  /* стихи и пьесы: много коротких строк без точек — строка = абзац */
  var n=0,nShort=0,nPunct=0;
  for(i=0;i<blocks.length;i++)for(j=0;j<blocks[i].length;j++){
    var sm=blocks[i][j];
    n++;
    if(sm.length<=45)nShort++;
    if(/[.!?…]$/.test(sm))nPunct++;
  }
  var lineMode=n>=12&&nShort>n*0.75&&nPunct<n*0.4;

  var out=[],buf=[];
  function flush(){
    if(!buf.length)return;
    var s='',k;
    for(k=0;k<buf.length;k++){
      var l=buf[k];
      if(!s)s=l;
      else if(/[-\u2010]$/.test(s)&&/^[а-яёa-z]/.test(l))s=s.replace(/[-\u2010]$/,'')+l;  /* перенос слова */
      else s+=' '+l;
    }
    s=s.replace(/ {2,}/g,' ').replace(/\s+([,.;:!?…])/g,'$1').trim();
    if(/[0-9A-Za-zА-Яа-яЁё]/.test(s))out.push({text:s});
    buf=[];
  }
  for(i=0;i<blocks.length;i++){
    var b=blocks[i],heads=0,ends=0;
    for(j=0;j<b.length;j++){
      if(impIsHead(b[j]))heads++;
      else if(/[.!?…»"”’]$/.test(b[j]))ends++;
    }
    /* каждая строка блока — готовый абзац? (в файле не было пустых строк) */
    var asPara=b.length>=2&&ends>=Math.ceil((b.length-heads)*0.6);
    for(j=0;j<b.length;j++){
      var l=b[j];
      if(impIsHead(l)||lineMode||asPara){flush();out.push({text:l});continue}
      if(/^[—–-]\s*\S/.test(l))flush();                 /* реплика — новый абзац */
      buf.push(l);
    }
    flush();
  }
  return out;
}

/* главы из массива абзацев {text,bold,html} */
function impChaptersParas(paras,useBold){
  var heads=[],i;
  for(i=0;i<paras.length;i++){
    var t=paras[i].text;
    if(impIsHead(t))heads.push(i);
    else if(useBold&&paras[i].bold&&t.length<=70&&i>0)heads.push(i);
  }
  if(!heads.length)return impFlatChapters(paras);
  var raw=[],k;
  if(heads[0]>0)raw.push({title:'Начало',items:paras.slice(0,heads[0])});
  for(i=0;i<heads.length;i++){
    raw.push({title:paras[heads[i]].text,items:paras.slice(heads[i]+1,(i+1<heads.length)?heads[i+1]:paras.length)});
  }
  /* главы без текста не держим (заголовок-строчка книги попадал бы пустой главой) */
  var out=[],has=0;
  for(k=0;k<raw.length;k++)if(raw[k].items.length){has=1;break}
  if(has){for(k=0;k<raw.length;k++)if(raw[k].items.length)out.push(raw[k])}
  else out=raw;
  return out;
}

/* глав нет — одна глава, а большая книга дробится по размеру */
function impFlatChapters(paras){
  var total=0,i;
  for(i=0;i<paras.length;i++)total+=paras[i].text.length;
  if(total<=60000){
    var title='Начало';
    if(paras.length&&paras[0].text.length<=60&&paras[0].text===paras[0].text.toUpperCase()&&/[А-ЯЁA-Z]{3}/.test(paras[0].text)){
      title=paras[0].text;paras=paras.slice(1);
    }
    return [{title:title,items:paras}];
  }
  var out=[],cur=[],size=0,n=1;
  for(i=0;i<paras.length;i++){
    cur.push(paras[i]);size+=paras[i].text.length;
    if(size>=40000){out.push({title:'Часть '+n,items:cur});cur=[];size=0;n++}
  }
  if(cur.length)out.push({title:'Часть '+n,items:cur});
  return out;
}

/* абзацы → html тела главы */
function impParasHtml(items){
  var h='',i;
  for(i=0;i<items.length;i++){
    var p=items[i];
    if(p.block){h+=p.html;continue}   /* готовый блок (цитата) — без обёртки */
    if(!p.text||impJunk(p.text))continue;   /* лишнее (номера страниц) не печатаем */
    var x=p.html?p.html:esc(p.text);
    h+='<p>'+x.replace(/\n/g,'<br>')+'</p>';
  }
  return h;
}

/* --- HTML-документ → главы ------------------------------------------------ */

/* чистим документ: выкидываем мусор, снимаем все атрибуты (кроме ссылок) */
function impPrep(root){
  var DROP={SCRIPT:1,STYLE:1,NOSCRIPT:1,IFRAME:1,SVG:1,MATH:1,CANVAS:1,OBJECT:1,EMBED:1,FORM:1,INPUT:1,BUTTON:1,SELECT:1,TEXTAREA:1,NAV:1,ASIDE:1,HEADER:1,FOOTER:1,APPLET:1,BASE:1,LINK:1,META:1,TEMPLATE:1,VIDEO:1,AUDIO:1,PICTURE:1,IMG:1};
  (function walk(n){
    var kids=Array.prototype.slice.call(n.childNodes),i;
    for(i=0;i<kids.length;i++){
      var e=kids[i];
      if(e.nodeType!==1){if(e.nodeType!==3)n.removeChild(e);continue}
      if(DROP[e.tagName]){n.removeChild(e);continue}
      var attrs=Array.prototype.slice.call(e.attributes||[]),a;
      for(a=0;a<attrs.length;a++){
        if(e.tagName==='A'&&attrs[a].name==='href'&&/^(https?:|mailto:|#)/i.test(attrs[a].value))continue;
        e.removeAttribute(attrs[a].name);
      }
      walk(e);
    }
  })(root);
}

/* дерево → плоский список блоков: заголовки и абзацы */
function impBlocks(root){
  var ok={H1:1,H2:1,H3:1,H4:1,H5:1,H6:1,P:1,PRE:1,LI:1,TABLE:1,Q:1,FIGCAPTION:1,DD:1,DT:1};
  var out=[];
  var w=document.createTreeWalker(root,1,null,false),n;   /* 1 = SHOW_ELEMENT */
  while((n=w.nextNode())){
    var tag=n.tagName;
    if(!ok[tag])continue;
    /* блок с вложенными блоками пропускаем — возьмутся вложенные */
    if(tag==='LI'||tag==='Q'){
      var inner=n.querySelector('p,h1,h2,h3,h4,h5,h6,li,pre,blockquote');
      if(inner)continue;
    }
    if((tag==='P'||tag==='PRE')&&n.querySelector('p,h1,h2,h3,h4,h5,h6'))continue;
    var text=(n.textContent||'').replace(/\s+/g,' ').trim();
    if(tag==='TABLE'){
      var rows=[];
      var trs=n.getElementsByTagName('tr'),t;
      for(t=0;t<trs.length;t++)rows.push((trs[t].textContent||'').replace(/\s+/g,' ').trim());
      text=rows.join('\n');
    }
    if(!text)continue;
    var b={tag:tag,text:text,html:null};
    if(tag==='P'||tag==='PRE'||tag==='LI'||tag==='Q'||tag==='FIGCAPTION'||tag==='DD'||tag==='DT'){
      var h=n.innerHTML;
      if(/<[a-z]/i.test(h))b.html=h;
    }
    out.push(b);
    if(tag==='TABLE')w.currentNode=n;   /* содержимое таблицы не размножаем */
  }
  return out;
}

/* html-документ → {title,chapters}; title — подсказка из заголовка страницы */
function impDocChapters(text,hint){
  var doc=new DOMParser().parseFromString(text,'text/html');
  var root=doc.body||doc.documentElement;
  if(!root)throw new Error('пустой документ');
  impPrep(root);
  var blocks=impBlocks(root);
  /* уровень разреза: h1 (≥2), h2 (≥3), h3 (≥3); иначе режем по тексту */
  var n1=0,n2=0,n3=0,i;
  for(i=0;i<blocks.length;i++){
    if(blocks[i].tag==='H1')n1++;
    else if(blocks[i].tag==='H2')n2++;
    else if(blocks[i].tag==='H3')n3++;
  }
  var level=null;
  if(n1>=2)level='H1';
  else if(n2>=3)level='H2';
  else if(n3>=3)level='H3';
  var pars=0;
  for(i=0;i<blocks.length;i++)if(blocks[i].tag!=='H1'&&blocks[i].tag!=='H2'&&blocks[i].tag!=='H3')pars++;
  if(!level||pars===0){
    /* заголовков нет — делим как обычный текст */
    var plain='';
    for(i=0;i<blocks.length;i++)plain+=blocks[i].text+'\n';
    if(!plain.trim()&&root.textContent)plain=root.textContent;
    return impChapList(impChaptersParas(impParas(plain)));
  }
  var out=[],cur={title:'',items:[]};
  for(i=0;i<blocks.length;i++){
    var b=blocks[i];
    if(b.tag===level){
      if(cur.items.length)out.push(cur);
      cur={title:b.text,items:[]};
      continue;
    }
    cur.items.push(b);
  }
  if(cur.items.length)out.push(cur);
  var res=[];
  for(i=0;i<out.length;i++){
    var t=out[i].title||('Глава '+(i+1));
    res.push({title:t,html:impBlocksHtml(out[i].items,level)});
  }
  if(!res.length){
    var plain2='';
    for(i=0;i<blocks.length;i++)plain2+=blocks[i].text+'\n';
    return impChapList(impChaptersParas(impParas(plain2)));
  }
  return res;
}

/* блоки → html тела главы; level — уровень, из которого сделаны заголовки глав */
function impBlocksHtml(items,level){
  var h='',i;
  for(i=0;i<items.length;i++){
    var b=items[i],tag=b.tag;
    if(tag.charAt(0)==='H'){
      var n=+tag.charAt(1);
      var lvl=(tag==='H1'&&level!=='H1')?2:n;
      if(lvl<2)lvl=2;
      if(lvl>6)lvl=6;
      h+='<h'+lvl+'>'+esc(b.text)+'</h'+lvl+'>';
    }else{
      if(impJunk(b.text))continue;   /* номера страниц из источника */
      /* пустая строка внутри блока источника («<br><br>», «\n\n») — новый абзац */
      var segs=b.html?b.html.split(/(?:<br\s*\/?>\s*|\s*\n\s*\n\s*){2,}/i):[b.html||esc(b.text)];
      var q;
      for(q=0;q<segs.length;q++){
        var x=segs[q].replace(/\r/g,'').replace(/^\s+|\s+$/g,'').replace(/\n/g,'<br>');
        if(x)h+='<p>'+x+'</p>';
      }
    }
  }
  return h;
}

/* --- Определение формата -------------------------------------------------- */

function impKind(name,buf){
  var b=impU8(buf),h=impLatin(b,Math.min(b.length,4096));
  if(b.length>=5&&h.indexOf('%PDF-')===0)return 'pdf';
  if(b.length>=4&&b[0]===0x50&&b[1]===0x4B&&(b[2]===0x03||b[2]===0x05||b[2]===0x07))return 'epub';
  if(h.replace(/^\s+/,'').indexOf('{\\rtf')===0)return 'rtf';
  if(b.length>120){
    var off=impBi32(b,78);
    if(b.length>off+24&&impLatin(b.subarray(60,68))==='BOOKMOBI')return 'mobi';
  }
  if(/<FictionBook[\s>]/i.test(h))return 'fb2';
  if(/<!doctype\s+html/i.test(h)||/<html[\s>]/i.test(h))return 'html';
  if(/^\s*<\?xml/i.test(h))return 'fb2';
  var ext=/\.([a-z0-9]+)$/.exec(String(name||'').toLowerCase());
  var map={fb2:'fb2',epub:'epub',pdf:'pdf',mobi:'mobi',azw:'mobi',azw3:'mobi',prc:'mobi',pdb:'mobi',
    htm:'html',html:'html',rtf:'rtf',txt:'txt',text:'txt'};
  if(ext&&map[ext[1]])return map[ext[1]];
  /* неизвестное расширение: похоже на текст — читаем как текст */
  var sample=b.subarray(0,Math.min(b.length,2048)),ok=0,i;
  for(i=0;i<sample.length;i++)if(sample[i]===9||sample[i]===10||sample[i]===13||(sample[i]>=32&&sample[i]<127)||sample[i]>=0xC0)ok++;
  if(ok>sample.length*0.85)return 'txt';
  return null;
}

/* --- TXT ------------------------------------------------------------------- */

function impNameTitle(name){
  var t=String(name||'').replace(/^.*[\\\/]/,'').replace(/\.[^.]+$/,'');
  t=t.replace(/[_]+/g,' ').replace(/\s+/g,' ').trim();
  return t.slice(0,200)||'Без названия';
}

/* главы с абзацами → главы с готовым html */
function impChapList(chs){
  var out=[],i;
  for(i=0;i<chs.length;i++)out.push({title:chs[i].title,html:impParasHtml(chs[i].items||[])});
  return out;
}

function impTxt(name,text){
  var paras=impParas(text);
  if(!paras.length)throw new Error('В файле не нашлось текста');
  var title=impNameTitle(name);
  if(paras.length>1){
    /* первая строка — название книги капслоком (не «Часть первая») */
    var t0=paras[0].text;
    if(t0.length<=60&&!/[.!?…]$/.test(t0)&&t0===t0.toUpperCase()&&/[А-ЯЁA-Z]{3}/.test(t0)&&!/^(часть|глава|том|книга|раздел|пролог|эпилог)/i.test(t0)){
      title=t0;paras=paras.slice(1);
    }
  }
  return {title:title.slice(0,200),author:'',chapters:impChapList(impChaptersParas(paras,false))};
}

function impHtml(text){
  var doc=new DOMParser().parseFromString(text,'text/html');
  var tEl=doc.querySelector('meta[property="og:title"]');
  var title=(tEl&&tEl.getAttribute('content'))||'';
  if(!title&&doc.title)title=doc.title;
  var chapters=impDocChapters(text,'');
  return {title:String(title||'').replace(/\s+/g,' ').trim().slice(0,200)||'Без названия',author:'',chapters:chapters};
}

/* --- FB2 ------------------------------------------------------------------- */

function impFb2(text){
  var doc=new DOMParser().parseFromString(text,'application/xml');
  if(doc.getElementsByTagName('parsererror').length)throw new Error('FB2 не разобрался — файл повреждён');
  var root=doc.documentElement;
  if(!root||!/FictionBook/i.test(root.nodeName))throw new Error('Это не FB2 — нет FictionBook');
  var title=(root.getElementsByTagName('book-title')[0]||{}).textContent||'';
  var author='';
  var aNode=root.getElementsByTagName('author')[0];
  if(aNode){
    var parts=[];
    var fn=(aNode.getElementsByTagName('first-name')[0]||{}).textContent||'';
    var mn=(aNode.getElementsByTagName('middle-name')[0]||{}).textContent||'';
    var ln=(aNode.getElementsByTagName('last-name')[0]||{}).textContent||'';
    if(fn)parts.push(fn);
    if(mn)parts.push(mn);
    if(ln)parts.push(ln);
    author=parts.join(' ');
  }
  var chapters=[];
  var annotation=root.getElementsByTagName('annotation')[0];
  if(annotation){
    var anItems=impFb2Paras(annotation);
    if(anItems.length)chapters.push({title:'Аннотация',html:impParasHtml(anItems)});
  }
  var bodies=root.getElementsByTagName('body'),i;
  for(i=0;i<bodies.length;i++){
    var body=bodies[i];
    var nm=(body.getAttribute('name')||'').toLowerCase();
    var def=nm==='notes'?'Примечания':(nm==='comments'?'Комментарии':(nm==='footnotes'?'Сноски':'Дополнения'));
    var secs=impFb2Sections(body);
    if(!secs.length&&i>0)continue;
    for(var s=0;s<secs.length;s++){
      var sec=secs[s];
      if(!sec.items.length&&!sec.title)continue;
      chapters.push({title:sec.title||(i===0?('Глава '+(s+1)):def),html:impParasHtml(sec.items)});
    }
  }
  if(!chapters.length)throw new Error('В FB2 не нашлось глав');
  return {title:title.slice(0,200)||'Без названия',author:author,chapters:chapters};
}

/* прямые дети секции с текстом: p, subtitle, epigraph, cite, poem, table */
function impFb2Paras(node){
  var items=[],kids=node.childNodes,i;
  for(i=0;i<kids.length;i++){
    var e=kids[i];
    if(e.nodeType!==1)continue;
    var nm=e.nodeName.toLowerCase();
    if(nm==='title'||nm==='section')continue;
    if(nm==='p'){
      var t=(e.textContent||'').replace(/\s+/g,' ').trim();
      if(t&&!impJunk(t))items.push({text:t});
    }else if(nm==='subtitle'){
      var st=(e.textContent||'').replace(/\s+/g,' ').trim();
      if(st&&!impJunk(st))items.push({text:st,html:'<strong>'+esc(st)+'</strong>'});
    }else if(nm==='epigraph'||nm==='cite'){
      var ps=e.getElementsByTagName('p'),j,qs=[];
      for(j=0;j<ps.length;j++){
        var qt=(ps[j].textContent||'').replace(/\s+/g,' ').trim();
        if(qt)qs.push(qt);
      }
      if(qs.length)items.push({text:qs.join(' '),block:true,html:'<blockquote><p>'+esc(qs.join(' '))+'</p></blockquote>'});
    }else if(nm==='poem'){
      var stanzas=e.getElementsByTagName('stanza'),k;
      for(k=0;k<stanzas.length;k++){
        var vs=stanzas[k].getElementsByTagName('v'),v,lines=[];
        for(v=0;v<vs.length;v++){
          var vt=(vs[v].textContent||'').replace(/\s+/g,' ').trim();
          if(vt)lines.push(vt);
        }
        if(lines.length)items.push({text:lines.join('\n'),html:'<p>'+esc(lines.join('\n')).replace(/\n/g,'<br>')+'</p>'});
      }
    }else if(nm==='table'){
      var tt=(e.textContent||'').replace(/\s+/g,' ').trim();
      if(tt&&!impJunk(tt))items.push({text:tt});
    }
  }
  return items;
}

function impFb2Title(sec){
  var tNode=null,kids=sec.childNodes,i;
  for(i=0;i<kids.length;i++)if(kids[i].nodeType===1&&kids[i].nodeName.toLowerCase()==='title'){tNode=kids[i];break}
  if(!tNode)return '';
  var ps=tNode.getElementsByTagName('p'),parts=[],j;
  for(j=0;j<ps.length;j++){
    var t=(ps[j].textContent||'').replace(/\s+/g,' ').trim();
    if(t)parts.push(t);
  }
  return parts.join(' ').slice(0,120);
}

function impFb2Sections(body){
  var out=[];
  (function walk(sec){
    var subs=[],kids=sec.childNodes,i;
    for(i=0;i<kids.length;i++)if(kids[i].nodeType===1&&kids[i].nodeName.toLowerCase()==='section')subs.push(kids[i]);
    if(subs.length){
      var own=impFb2Paras(sec);
      if(own.length)out.push({title:impFb2Title(sec),items:own});
      for(i=0;i<subs.length;i++)walk(subs[i]);
    }else{
      out.push({title:impFb2Title(sec),items:impFb2Paras(sec)});
    }
  })(body);
  return out;
}

/* --- RTF ------------------------------------------------------------------- */

var IMP_RTF_SKIP={fonttbl:1,colortbl:1,stylesheet:1,info:1,generator:1,pict:1,object:1,
  listtable:1,listoverridetable:1,revtbl:1,themedata:1,colorschememapping:1,latentstyles:1,
  datastore:1,xmlnstbl:1,math:1,mmath:1,nonshppict:1,shpinst:1,shppict:1,fltnorms:1,
  header:1,footer:1,headerl:1,headerr:1,headerf:1,footerl:1,footerr:1,footerf:1,
  footnote:1,ftnsepc:1,endnote:1,evenheader:1,evenfooter:1};

function impRtf(text){
  text=String(text||'');
  var i=0,n=text.length;
  var paras=[],buf='',bufText='',sB=false,sI=false,sU=false,wOpen='',uc=1,cp=1252;
  var skip=0,run=[],pend=0,paraBold=true,paraHas=false;
  var stack=[];

  function wClose(w){
    var m=w.match(/<\/[a-z]+>/gi)||[],s='',k;
    for(k=m.length-1;k>=0;k--)s+=m[k];
    return s;
  }
  function sync(){
    var want='';
    if(sB)want+='<strong>';
    if(sI)want+='<em>';
    if(sU)want+='<u>';
    if(want===wOpen)return;
    buf+=wClose(wOpen)+want;
    wOpen=want;
  }
  function flushRun(){
    if(!run.length)return;
    var s=impCpStr(new Uint8Array(run),cp);
    run=[];
    if(skip){skip=Math.max(0,skip-s.length);return}
    if(pend){
      /* забег \'hh после \uN — это фолбэк Unicode, его съедаем */
      if(pend>=s.length){pend-=s.length;return}
      s=s.slice(pend);pend=0;
    }
    if(!s)return;
    sync();
    buf+=esc(s);
    bufText+=s;
    if(s.replace(/\s/g,''))paraHas=true;
    if(paraBold&&!sB&&/\S/.test(s))paraBold=false;
  }
  function flushPara(){
    flushRun();
    if(paraHas){
      var p={text:bufText.replace(/\s+/g,' ').trim(),bold:paraBold,html:''};
      buf=buf.replace(/[ \t\r\n]+$/,'');   /* хвостовые переводы строк — не <br> */
      p.html=(buf+wClose(wOpen)).replace(/\n/g,'<br>');
      if(p.text&&!impJunk(p.text))paras.push(p);
    }
    buf='';bufText='';wOpen='';paraBold=true;paraHas=false;pend=0;
  }

  while(i<n&&paras.length<400000){
    var ch=text.charAt(i);
    if(ch==='{'){
      flushRun();
      stack.push({b:sB,i:sI,u:sU,uc:uc,cp:cp,skip:skip});
      i++;continue;
    }
    if(ch==='}'){
      flushRun();
      var st=stack.pop();
      if(st){sB=st.b;sI=st.i;sU=st.u;uc=st.uc;cp=st.cp;skip=st.skip}
      i++;continue;
    }
    if(ch==='\\'){
      i++;
      if(i>=n)break;
      var c2=text.charAt(i);
      if(c2==='\\'||c2==='{'||c2==='}'){
        flushRun();
        if(skip===0){sync();buf+=esc(c2);bufText+=c2;paraHas=true;if(paraBold&&!sB&&/\S/.test(c2))paraBold=false}
        i++;continue;
      }
      if(c2==='\''){
        var hx=text.substr(i+1,2);
        i+=3;
        var bt=parseInt(hx,16);
        if(!isNaN(bt)){
          if(skip===0)run.push(bt);
          if(paraBold&&!sB)paraBold=false;
        }
        continue;
      }
      if(c2==='*'){flushRun();skip=1;i++;continue}
      if(c2==='~'||c2==='-'||c2==='_'){
        flushRun();
        if(skip===0){sync();buf+=(c2==='~'?'\u00A0':'-');bufText+=' ';paraHas=true}
        i++;continue;
      }
      if(c2==='bin'){
        var mbin=/^(\d+)/.exec(text.substr(i+1,10));
        flushRun();
        if(mbin){i+=1+mbin[1].length;skip=1}
        continue;
      }
      var mword=/^([a-zA-Z]+)(-?\d+)?/.exec(text.substr(i));
      if(!mword){i++;continue}
      var w=mword[1].toLowerCase(),arg=mword[2]?parseInt(mword[2],10):null;
      i+=mword[0].length;
      if(text.charAt(i)===' ')i++;
      if(skip){if(IMP_RTF_SKIP[w])skip=1;continue}
      flushRun();
      if(w==='par'){flushPara();continue}
      if(w==='sect'||w==='row'){flushPara();continue}
      if(w==='line'){sync();buf+='\n';bufText+='\n';continue}
      if(w==='tab'){sync();buf+=' ';bufText+=' ';paraHas=true;continue}
      if(w==='u'&&arg!==null){
        flushRun();
        var uch=String.fromCharCode(arg<0?arg+65536:arg);
        sync();buf+=esc(uch);bufText+=uch;
        paraHas=true;if(paraBold&&!sB&&/\S/.test(uch))paraBold=false;
        pend=uc;
        continue;
      }
      if(w==='uc'&&arg!==null){uc=Math.max(0,arg);continue}
      if(w==='ansicpg'&&arg!==null){cp=arg;continue}
      /* \b и \b0 — один глагол, нулевой аргумент выключает */
      if(w==='b'){sB=(arg!==0);continue}
      if(w==='i'){sI=(arg!==0);continue}
      if(w==='ul'){sU=true;continue}
      if(w==='ulnone'||w==='ul0'){sU=false;continue}
      if(IMP_RTF_SKIP[w]){skip=1;continue}
      continue;
    }
    /* обычный символ */
    i++;
    if(skip===0){
      flushRun();
      if(pend>0){pend--;continue}
      if(!bufText&&ch!=='\u00A0'&&/\s/.test(ch))continue;   /* ведущие переводы строк — не <br> */
      sync();buf+=esc(ch);bufText+=ch;
      paraHas=true;
      if(paraBold&&!sB&&/\S/.test(ch))paraBold=false;
    }
  }
  flushPara();
  if(!paras.length)throw new Error('В RTF не нашлось текста');
  var chapters=impChaptersParas(paras,true);
  /* первая строка-название (капслок без точки) — заголовок книги */
  var title='Без названия';
  if(paras.length){
    var t0=paras[0].text;
    if(t0.length<=60&&!/[.!?…]$/.test(t0)&&t0===t0.toUpperCase()&&/[А-ЯЁA-Z]{3}/.test(t0))title=t0;
  }
  return {title:title,author:'',chapters:impChapList(chapters)};
}

/* --- EPUB (ZIP + XML) ----------------------------------------------------- */

function impJoin(base,rel){
  rel=String(rel||'');
  try{rel=decodeURIComponent(rel)}catch(e){}
  var parts;
  if(rel.charAt(0)==='/')parts=rel.split('/');
  else parts=(base?base.split('/'):[]).concat(rel.split('/'));
  var out=[],i;
  for(i=0;i<parts.length;i++){
    if(!parts[i]||parts[i]==='.')continue;
    if(parts[i]==='..'){out.pop();continue}
    out.push(parts[i]);
  }
  return out.join('/');
}

function impZip(buf){
  var b=impU8(buf);
  var eocd=-1,min=Math.max(0,b.length-66000),i;
  for(i=b.length-22;i>=min;i--){
    if(b[i]===0x50&&b[i+1]===0x4B&&b[i+2]===0x05&&b[i+3]===0x06){eocd=i;break}
  }
  if(eocd<0)throw new Error('Это не ZIP/EPUB — каталог не найден');
  var total=impBi16(b,eocd+10),cdOff=impBi32(b,eocd+16);
  var files={},names=[],p=cdOff;
  for(i=0;i<total;i++){
    if(p+46>b.length||impBi32(b,p)!==0x02014B50)break;
    var method=impBi16(b,p+10),csize=impBi32(b,p+20),
        nlen=impBi16(b,p+28),elen=impBi16(b,p+30),clen=impBi16(b,p+32),lho=impBi32(b,p+42);
    var name=impLatin(b.subarray(p+46,p+46+nlen));
    if(name.charAt(name.length-1)!=='/'){files[name]={method:method,csize:csize,lho:lho,data:null};names.push(name)}
    p+=46+nlen+elen+clen;
  }
  function raw(name){
    var f=files[name];
    if(!f)return null;
    var ln=impBi16(b,f.lho+26),le=impBi16(b,f.lho+28);
    var st=f.lho+30+ln+le;
    return b.subarray(st,st+f.csize);
  }
  function inflate(bytes){
    if(typeof DecompressionStream==='undefined')return Promise.reject(new Error('Браузер не умеет распаковывать EPUB (нет DecompressionStream)'));
    try{
      var ds=new DecompressionStream('deflate-raw');
      var stream=new Blob([bytes]).stream().pipeThrough(ds);
      return new Response(stream).arrayBuffer().then(function(ab){return new Uint8Array(ab)});
    }catch(e){return Promise.reject(e)}
  }
  return {
    names:names,
    has:function(name){return !!files[name]},
    get:function(name){
      var f=files[name];
      if(!f)return Promise.resolve(null);
      if(f.data)return Promise.resolve(f.data);
      var src=raw(name);
      if(!src)return Promise.resolve(null);
      if(f.method===0){f.data=src;return Promise.resolve(f.data)}
      if(f.method===8){
        return inflate(src).then(function(d){f.data=d;return f.data});
      }
      return Promise.reject(new Error('EPUB: неподдерживаемое сжатие в '+name));
    },
    text:function(name){
      return this.get(name).then(function(d){return d?impDec(d):''});
    }
  };
}

function impEpub(buf){
  var z=impZip(buf);
  return z.text('META-INF/container.xml').then(function(cx){
    if(!cx)throw new Error('EPUB без META-INF/container.xml');
    var cd=new DOMParser().parseFromString(cx,'application/xml');
    var rf=cd.getElementsByTagName('rootfile')[0];
    var opfPath=rf&&rf.getAttribute('full-path');
    if(!opfPath)throw new Error('EPUB: в container.xml нет пути к книге');
    return z.text(opfPath).then(function(opfRaw){
      var opf=new DOMParser().parseFromString(opfRaw,'application/xml');
      var base=opfPath.indexOf('/')>=0?opfPath.slice(0,opfPath.lastIndexOf('/')):'';
      /* dc:title/dc:creator — в XML это qualified name, ищем и так и так */
      function opfText(tag){
        var l=opf.getElementsByTagName(tag);
        if(!l.length)l=opf.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/',tag);
        return l.length?(l[0].textContent||'').replace(/\s+/g,' ').trim():'';
      }
      var title=opfText('title'),author=opfText('creator');
      var manifest={},items=opf.getElementsByTagName('item'),i;
      for(i=0;i<items.length;i++){
        var it=items[i];
        manifest[it.getAttribute('id')]={
          href:impJoin(base,it.getAttribute('href')),
          media:(it.getAttribute('media-type')||'').toLowerCase(),
          props:(it.getAttribute('properties')||'').toLowerCase()
        };
      }
      var spine=[],refs=opf.getElementsByTagName('itemref');
      for(i=0;i<refs.length;i++)spine.push(refs[i].getAttribute('idref'));
      /* оглавление: nav.xhtml, потом ncx */
      var toc={};
      function readNavDoc(path,done){
        z.text(path).then(function(t){
          if(!t){done();return}
          var d=new DOMParser().parseFromString(t,'text/html');
          var navs=d.getElementsByTagName('nav'),k,l;
          for(k=0;k<navs.length;k++){
            if((navs[k].getAttribute('epub:type')||navs[k].getAttribute('type')||'')!=='toc'&&k>0)continue;
            var as=navs[k].getElementsByTagName('a');
            for(l=0;l<as.length;l++){
              var href=as[l].getAttribute('href')||'';
              var f=impJoin(path.indexOf('/')>=0?path.slice(0,path.lastIndexOf('/')):'',href.split('#')[0]);
              var tx=(as[l].textContent||'').replace(/\s+/g,' ').trim();
              if(f&&tx&&!toc[f])toc[f]=tx.slice(0,120);
            }
          }
          done();
        }).catch(function(){done()});
      }
      var navId=null,ncxPath='';
      for(var id in manifest)if(manifest.hasOwnProperty(id)){
        if(manifest[id].props.indexOf('nav')>=0)navId=id;
      }
      if(navId)ncxPath=manifest[navId].href;
      else{
        var sp=opf.getElementsByTagName('spine')[0];
        var tocId=sp&&sp.getAttribute('toc');
        if(tocId&&manifest[tocId])ncxPath=manifest[tocId].href;
        if(!ncxPath)for(var id2 in manifest)if(manifest.hasOwnProperty(id2)&&/x-dtbncx/.test(manifest[id2].media))ncxPath=manifest[id2].href;
      }
      return new Promise(function(res){
        if(!ncxPath){res();return}
        readNavDoc(ncxPath,function(){
          /* NCX: navPoint */
          z.text(ncxPath).then(function(t){
            if(!t||/\.xhtml|\.html/i.test(ncxPath)){res();return}
            var d=new DOMParser().parseFromString(t,'application/xml');
            var pts=d.getElementsByTagName('navPoint'),k,l;
            for(k=0;k<pts.length;k++){
              var lab=pts[k].getElementsByTagName('text')[0];
              var con=pts[k].getElementsByTagName('content')[0];
              if(!lab||!con)continue;
              var src=con.getAttribute('src')||'';
              var f=impJoin(ncxPath.indexOf('/')>=0?ncxPath.slice(0,ncxPath.lastIndexOf('/')):'',src.split('#')[0]);
              var tx=(lab.textContent||'').replace(/\s+/g,' ').trim();
              if(f&&tx&&!toc[f])toc[f]=tx.slice(0,120);
            }
            res();
          }).catch(function(){res()});
        });
      }).then(function(){
        /* главы по спине (порядок чтения) */
        var chapters=[],seq=Promise.resolve();
        spine.forEach(function(idref){
          seq=seq.then(function(){
            var mi=manifest[idref];
            if(!mi||mi.props.indexOf('nav')>=0)return;
            if(!/html/.test(mi.media)&&!/\.x?html?$/i.test(mi.href))return;
            return z.text(mi.href).then(function(t){
              if(!t)return;
              var subs;
              try{subs=impDocChapters(t,toc[mi.href]||'')}catch(e){subs=[]}
              var k;
              if(!subs.length)return;
              for(k=0;k<subs.length;k++){
                var tt=subs[k].title;
                if(k===0&&!tt||k===0&&tt==='Начало')tt=toc[mi.href]||tt;
                var body=subs[k].html||'';
                if(!body.replace(/<[^>]+>/g,'').trim())continue;
                chapters.push({title:(tt||('Глава '+(chapters.length+1))).slice(0,150),html:body});
              }
            }).catch(function(){});
          });
        });
        return seq.then(function(){
          if(!chapters.length)throw new Error('В EPUB не нашлось текста глав');
          return {title:title||'Без названия',author:author,chapters:chapters};
        });
      });
    });
  });
}

/* --- MOBI / AZW (PalmDB + PalmDOC) ---------------------------------------- */

function impPalmdoc(src){
  var out=[],i=0,n=src.length;
  while(i<n){
    var c=src[i++];
    if(c===0){out.push(0)}
    else if(c<=0x08){
      var k=c;
      while(k-->0&&i<n)out.push(src[i++]);
    }
    else if(c<=0x7F){out.push(c)}
    else if(c<=0xBF){
      if(i>=n)break;
      var c2=src[i++];
      var dist=((c&0x3F)<<5)|(c2>>3);
      var len=(c2&7)+3;
      if(dist===0||dist>out.length){out.push(c,c2);continue}
      var st=out.length-dist;
      var j2;
      for(j2=0;j2<len;j2++)out.push(out[st+(j2%dist)]);
    }
    else{out.push(0x20,(c^0x80))}
  }
  return new Uint8Array(out);
}

function impMobi(buf){
  var b=impU8(buf);
  if(b.length<120)throw new Error('Файл слишком мал для MOBI');
  var nrec=impBi16(b,76);
  if(nrec<1||78+nrec*8>b.length)throw new Error('Это не MOBI — нет таблицы записей');
  var offs=[],i;
  for(i=0;i<nrec;i++)offs.push(impBi32(b,78+8*i));
  function rec(k){
    var st=offs[k],en=(k+1<nrec)?offs[k+1]:b.length;
    if(st>=en||en>b.length)return b.subarray(0,0);
    return b.subarray(st,en);
  }
  var r0=rec(0);
  if(r0.length<24||impLatin(r0.subarray(16,20))!=='MOBI')throw new Error('Это не MOBI — нет метки MOBI');
  var compression=impBi16(r0,0),textLen=impBi32(r0,4),ntext=impBi16(r0,8),recSize=impBi16(r0,10)||4096;
  var encryption=impBi16(r0,12);
  var enc=impBi32(r0,28)||1252;
  var hdrLen=impBi32(r0,20);
  var author='',boundary=-1;
  var exthAt=16+hdrLen;
  if(exthAt+12<r0.length&&impLatin(r0.subarray(exthAt,exthAt+4))==='EXTH'){
    var ecount=impBi32(r0,exthAt+8),ep=exthAt+12,e;
    for(e=0;e<ecount;e++){
      if(ep+8>r0.length)break;
      var tag=impBi32(r0,ep),len=impBi32(r0,ep+4);
      if(len<8||ep+len>r0.length)break;
      var val=impLatin(r0.subarray(ep+8,ep+len));
      if(tag===100&&!author)author=impDec(r0.subarray(ep+8,ep+len)).replace(/\u0000/g,'').trim();
      if(tag===129)boundary=impBi32(r0,ep+8);
      ep+=len;
    }
  }
  if(encryption)throw new Error('Книга защищена — MOBI с шифрованием не читается');
  if(compression!==1&&compression!==2)throw new Error('Редкое сжатие MOBI (HUFF/CDIC) не поддерживается');
  var count=Math.min(ntext||nrec-1,nrec-1);
  if(count<1)count=nrec-1;
  var parts=[],total=0,k;
  for(k=1;k<=count;k++){
    var rk=rec(k);
    if(!rk.length)continue;
    var data;
    if(compression===2)data=impPalmdoc(rk);
    else data=rk;
    if(data.length>recSize)data=data.subarray(0,recSize);
    parts.push(data);total+=data.length;
  }
  var all=new Uint8Array(total),pos=0;
  for(k=0;k<parts.length;k++){all.set(parts[k],pos);pos+=parts[k].length}
  var text=impCpStr(all,enc===65001?65001:(enc===1251?1251:1252));
  /* KF8 (azw3): старый текст пуст — ищем html после граничной записи */
  if(boundary>0&&(text.replace(/<[^>]+>/g,'').replace(/\s/g,'').length<200||!/[а-яёa-z]{4}/i.test(text.replace(/<[^>]+>/g,'')))){
    var acc=[],bpos=0,ki;
    var acc=[];
    for(ki=Math.max(1,boundary);ki<nrec;ki++){
      var rk2=rec(ki);
      if(rk2.length){acc.push(rk2);bpos+=rk2.length}
    }
    if(acc.length){
      var kf2=new Uint8Array(bpos),p2=0;
      for(ki=0;ki<acc.length;ki++){kf2.set(acc[ki],p2);p2+=acc[ki].length}
      var latin=impLatin(kf2,kf2.length);
      var st2=latin.toLowerCase().indexOf('<html');
      var en2=latin.toLowerCase().lastIndexOf('</html>');
      if(st2>=0&&en2>st2){
        text=impCpStr(kf2.subarray(st2,en2+7),enc===65001?65001:(enc===1251?1251:1252));
      }
    }
  }
  var chapters=impDocChapters(text,'');
  var title=impDec(b.subarray(0,32)).replace(/\u0000/g,'').trim().replace(/_/g,' ').slice(0,200);
  return {title:title||'Без названия',author:author,chapters:chapters};
}

/* --- PDF (pdf.js подключается лениво) ------------------------------------- */

var impPdfP=null;
function impPdfLoad(){
  if(window.pdfjsLib)return Promise.resolve(window.pdfjsLib);
  if(impPdfP)return impPdfP;
  impPdfP=new Promise(function(res,rej){
    var s=document.createElement('script');
    s.src='js/vendor/pdf.min.js?v=27';
    s.onload=function(){
      if(!window.pdfjsLib){rej(new Error('pdf.js не загрузился'));return}
      try{window.pdfjsLib.GlobalWorkerOptions.workerSrc='js/vendor/pdf.worker.min.js?v=27'}catch(e){}
      res(window.pdfjsLib);
    };
    s.onerror=function(){rej(new Error('Не удалось загрузить модуль PDF'))};
    document.head.appendChild(s);
  });
  return impPdfP;
}

function impPdf(buf){
  return impPdfLoad().then(function(lib){
    return lib.getDocument({data:impU8(buf).slice(0)}).promise;
  }).then(function(pdf){
    var meta='';
    return pdf.getMetadata().then(function(md){
      meta=md&&md.info?(md.info.Title||md.info.Author||''):'';
      var pages=[],i,seq=Promise.resolve();
      for(i=1;i<=pdf.numPages;i++)(function(n){
        seq=seq.then(function(){
          return pdf.getPage(n).then(function(page){
            return page.getTextContent({normalizeWhitespace:true,disableCombineTextItems:false}).then(function(tc){
              pages.push({num:n,items:tc.items});
            });
          }).catch(function(){pages.push({num:n,items:[]})});
        });
      })(i);
      return seq.then(function(){return pages}).then(function(pages){return impPdfText(pages,meta)});
    });
  });
}

function impPdfText(pages,meta){
  /* строки: по y и hasEOL */
  var rawPages=[],p,i;
  for(p=0;p<pages.length;p++){
    var items=pages[p].items,lines=[],cur=null;
    for(i=0;i<items.length;i++){
      var it=items[i];
      if(typeof it.str!=='string')continue;
      var y=it.transform?it.transform[5]:0,x=it.transform?it.transform[4]:0;
      var sz=it.height||0;
      if(!cur){cur={text:'',y:y,x0:x,x1:x,sz:sz}}
      if(cur.text&&Math.abs(y-cur.y)>Math.max(2,(cur.sz||sz||10)*0.6)){
        lines.push(cur);cur={text:'',y:y,x0:x,x1:x,sz:sz};
      }else if(!cur.text){cur.y=y;cur.x0=x;cur.x1=x;cur.sz=sz}
      cur.text+=it.str;
      cur.x1=x+(it.width||0);
      if(sz>cur.sz)cur.sz=sz;
      if(it.hasEOL){lines.push(cur);cur=null}
    }
    if(cur&&cur.text)lines.push(cur);
    rawPages.push({num:pages[p].num,lines:lines});
  }
  /* медианный кегль = основной текст */
  var sizes=[],p2,i2;
  for(p2=0;p2<rawPages.length;p2++)for(i2=0;i2<rawPages[p2].lines.length;i2++){
    var t0=rawPages[p2].lines[i2].text.trim();
    if(t0.length>2)sizes.push(rawPages[p2].lines[i2].sz||10);
  }
  sizes.sort(function(a,b){return a-b});
  var med=sizes.length?sizes[Math.floor(sizes.length/2)]:10;
  if(!med)med=10;
  /* шапки/подвалы: строки, повторяющиеся на многих страницах */
  var tally={},total=rawPages.length;
  for(p=0;p<rawPages.length;p++){
    var pl=rawPages[p].lines;
    var edge=[pl.length?pl[0]:null,pl.length>1?pl[pl.length-1]:null];
    for(i=0;i<edge.length;i++){
      if(!edge[i])continue;
      var et=edge[i].text.replace(/\s+/g,' ').trim();
      if(et.length>2&&et.length<120)tally[et]=(tally[et]||0)+1;
    }
  }
  function isEdge(line,pl){
    var et=line.text.replace(/\s+/g,' ').trim();
    if(tally[et]>=Math.max(3,total*0.35))return true;
    if(/^[-–—]?\s*\d{1,4}\s*[-–—]?$/.test(et)&&(pl[0]===line||pl[pl.length-1]===line))return true;
    return false;
  }
  /* абзацы и главы */
  var chapters=[],curCh={title:'',paras:[]},pre={paras:[]},target=pre;
  function flushPara(){
    if(!bufLines.length)return;
    var txt=bufLines.join('');
    txt=txt.replace(/-\s*([а-яёa-z])/g,'$1');
    txt=txt.replace(/\s+/g,' ').trim();
    if(txt)bufOut.push(txt);
    bufLines=[];
  }
  var bufLines=[],bufOut=[];
  function flushChapter(){
    flushPara();
    if(!bufOut.length)return;
    if(target===pre&&!curCh.title&&bufOut.join(' ').length<400&&chapters.length===0){
      /* титульный лист перед первой главой — не делаем из него главу */
    }else if(target===pre&&bufOut.length){
      chapters.push({title:'Начало',paras:bufOut.slice(0)});
    }else if(bufOut.length){
      chapters.push({title:curCh.title||('Глава '+(chapters.length+1)),paras:bufOut.slice(0)});
    }
    bufOut=[];
  }
  for(p=0;p<rawPages.length;p++){
    var pl=rawPages[p].lines,pageChars=0,ii;
    for(ii=0;ii<pl.length;ii++)pageChars+=pl[ii].text.trim().length;
    if(pageChars<10){flushPara();continue}   /* пустая страница/обложка */
    var left=1e9;
    for(ii=0;ii<pl.length;ii++)if(pl[ii].text.trim()&&pl[ii].x0<left)left=pl[ii].x0;
    var prevY=null;
    for(ii=0;ii<pl.length;ii++){
      var ln=pl[ii],tx=ln.text.replace(/\s+/g,' ').trim();
      if(!tx)continue;
      if(isEdge(ln,pl))continue;
      var head=tx.length<=100&&((ln.sz||0)>=med*1.18||impIsHead(tx));
      if(head){
        flushChapter();
        target=curCh={title:tx.slice(0,150),paras:[]};
        continue;
      }
      if(!bufLines.length){
        bufLines.push(tx);prevY=ln.y;continue;
      }
      var gap=prevY===null?0:Math.abs(prevY-ln.y);
      var indent=ln.x0>left+((ln.sz||med)*0.8);
      var lineH=(ln.sz||med)||med;
      if(gap>lineH*1.7||indent){
        flushPara();
        bufLines.push(tx);
      }else{
        var last=bufLines[bufLines.length-1];
        if(/-$/.test(last)&&/^[а-яёa-z]/.test(tx))bufLines[bufLines.length-1]=last.replace(/-$/,'')+tx;
        else bufLines[bufLines.length-1]=last+' '+tx;
      }
      prevY=ln.y;
    }
    flushPara();
    if(bufOut.length>0&&curCh.title&&bufOut.join(' ').length>60){/* глава продолжается */}
  }
  flushChapter();
  if(!chapters.length)throw new Error('PDF без извлекаемого текста (возможно, скан или картинки)');
  var title=String(meta||'').replace(/\s+/g,' ').trim().slice(0,200)||'Без названия';
  return {title:title,author:'',chapters:chapters.map(function(c){
    return {title:c.title,html:impParasHtml(c.paras.map(function(x){return {text:x}}))};
  })};
}

/* --- Сборка книги и полка ------------------------------------------------- */

/* Лимитов на размер книги больше нет: «Война и мир» и любые другие тома
   импортируются целиком — ни по числу знаков, ни по размеру файла. */

function impParse(name,buf){
  var kind=impKind(name,buf);
  return new Promise(function(res,rej){
    if(kind==='pdf'){impPdf(buf).then(res,rej);return}
    if(kind==='epub'){impEpub(buf).then(res,rej);return}
    try{
      var d=null;
      if(kind==='fb2')d=impFb2(impDecDecl(buf));
      else if(kind==='mobi')d=impMobi(buf);
      else if(kind==='rtf')d=impRtf(impDec(buf));
      else if(kind==='html')d=impHtml(impDec(buf));
      else if(kind==='txt')d=impTxt(name,impDec(buf));
      else rej(new Error('Формат файла не распознан — поддерживаются FB2, EPUB, PDF, MOBI, HTML, RTF, TXT'));
      if(d)res(d);
    }catch(e){rej(e)}
  });
}

function impChapterHtml(c){
  var h='<h1>'+esc(c.title||'')+'</h1>'+(c.html||'');
  if(typeof sanitizeChapterHtml==='function')h=sanitizeChapterHtml(h);
  return h;
}

function impAddBook(data){
  var chapters=[],first=null,i;
  for(i=0;i<data.chapters.length;i++){
    var c=data.chapters[i];
    var ch={id:uid(),html:impChapterHtml(c),pos:0,marks:[]};
    chapters.push(ch);
    if(!first)first=ch;
  }
  chapters.push({id:uid(),html:pamatkaHtml(),pos:0,marks:[]});
  chapters.push({id:uid(),kind:'notes',html:notesChapterHtml(),pos:0,marks:[]});
  var b={id:uid(),
    title:String(data.title||'Без названия').slice(0,200),
    author:String(data.author||'').slice(0,200),
    color:COLORS[state.books.length%COLORS.length],
    updated:Date.now(),chapters:chapters,current:first.id,customTypes:[],wiki:[]};
  /* дописать главу книги, открытой до импорта — она ещё «текущая» */
  if(typeof cleanHtml==='function'&&!isReadOnly()&&!workspace.hidden&&editorOwned){
    clearTimeout(saveTimer);
    var cur=currentCh();
    if(cur){
      var oldH=cur.html;
      cur.html=cleanHtml();
      if(cur.html!==oldH)book().updated=Date.now();
      cur.pos=scroller.scrollTop;
    }
  }
  state.books.push(b);
  state.activeBookId=b.id;
  persist();invalidateCo();
  /* иначе enterEditor дописал бы текст прежней главы (он ещё в DOM) в первую
     главу новой книги; loadChapter внутри вернёт editorOwned само */
  if(typeof editorOwned!=='undefined')editorOwned=false;
  enterEditor(first.id);
  toast('Книга «'+b.title+'» импортирована: '+fmt(data.chapters.length)+' '+plural(data.chapters.length,'глава','главы','глав'));
}

function impFile(file){
  var name=file.name||'';
  toast('Читаю «'+name+'»…');
  var r=new FileReader();
  r.onerror=function(){toast('Не удалось прочитать файл')};
  r.onload=function(){
    var p;
    try{p=impParse(name,r.result)}catch(e){p=Promise.reject(e)}
    p.then(function(data){
      if(!data||!data.chapters||!data.chapters.length)throw new Error('В файле не нашлось текста');
      impAddBook(data);
    }).catch(function(e){
      toast(e&&e.message?('Импорт не удался: '+e.message):'Импорт не удался');
    });
  };
  r.readAsArrayBuffer(file);
}

function impInput(){
  var i=document.getElementById('impInput');
  if(i)return i;
  i=mk('input');
  i.type='file';
  i.id='impInput';
  i.accept='.fb2,.epub,.pdf,.mobi,.azw,.azw3,.prc,.html,.htm,.rtf,.txt';
  i.setAttribute('aria-label','Файл книги для импорта');
  i.style.display='none';
  i.addEventListener('change',function(){
    var f=this.files&&this.files[0];
    this.value='';
    if(f)impFile(f);
  });
  document.body.appendChild(i);
  return i;
}

function impPick(){impInput().click()}

function impShelfCard(shelf,delay){
  var b=mk('button');
  b.type='button';
  b.className='cover new imp';
  if(typeof delay==='number')b.style.animationDelay=delay+'ms';
  b.innerHTML='<span class="nc-dia"></span><span class="nc-t">Импорт книги</span>'+
    '<span class="nc-h">fb2 · epub · pdf · mobi · html · rtf · txt</span>';
  b.addEventListener('click',impPick);
  shelf.appendChild(b);
}
