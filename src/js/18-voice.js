/* ==========================================================================
 * 18-voice.js — ДИКТОВКА (голосовой ввод текста)
 * Проект: «Черновик» — веб-редактор рукописей. Папка tests/ — разобранная
 *   копия src/index.html (порядок подключения скриптов = порядок разделов
 *   оригинала). Строгое правило: var/function, без модулей.
 * Роль: кнопка #btnVoice в топбаре + всплывашка #micPill («Слушаю…»),
 *   распознавание речи через Web Speech API (SpeechRecognition, ru-RU),
 *   вставка распознанного текста в #editor в позицию каретки.
 * Возможности:
 *   — непрерывное распознавание с автоперезапуском (пока включено);
 *   — АВТО-ПУНКТУАЦИЯ ПО ПАУЗАМ: пауза ≥0,7с между фразами → запятая,
 *     пауза ≥2,6с → точка + заглавная следующего слова;
 *   — ГОЛОСОВЫЕ КОМАНДЫ: «запятая», «запятую», «запятые», «точка»,
 *     «точка с запятой», «двоеточие», «тире», «многоточие»,
 *     «восклицательный знак», «вопросительный знак», «открой/закрой скобку»,
 *     «открой/закрой кавычку», «новый абзац» / «новая строка»;
 *   — заглавная буква после конца фразы и в начале абзаца, автоматические
 *     пробелы вокруг знаков препинания;
 *   — вставка без воровства фокуса на телефоне (ручной insert + input),
 *     на десктопе — через execCommand (дружит с отменой Ctrl+Z);
 *   — состояния: ошибка доступа к микрофону / сети / языка → тост + стоп,
 *     «тишина» >30 перезапусков → автостоп; видимость вкладки скрыта → стоп;
 *   — хоткей Ctrl+Alt+R (вкл/выкл), Escape — стоп; тап по #micPill — стоп.
 * Зависимости: 01-core.js ($, mk, editor/workspace-ссылки), 15-editor.js
 *   (toast), разметки #btnVoice/#micPill из index.html.
 * Подключается: последним (18-й, сразу после 17-start.js).
 * ========================================================================== */
"use strict";
var SRClass=window.SpeechRecognition||window.webkitSpeechRecognition;
var btnVoice=$('#btnVoice'), micPill=$('#micPill');
var micRec=null, micOn=false, micWanted=false, micRange=null, micRestarts=0;
var micLastFinalAt=0;
var micLang='ru-RU', MIC_RESTART_MAX=30, MIC_PAUSE_COMMA=700, MIC_PAUSE_END=2600;

function micSetUI(on,interim){
  micOn=on;
  btnVoice.classList.toggle('on',on);
  btnVoice.setAttribute('aria-pressed',on?'true':'false');
  micPill.classList.toggle('on',on);
  var t=micPill.querySelector('.mp-txt');
  if(t)t.textContent=on?(interim||'Слушаю…'):'';
}
function micPlaceCaret(){
  var s=getSelection();
  if(s.rangeCount&&editor.contains(s.anchorNode)){
    micRange=s.getRangeAt(0).cloneRange();
    if(!micRange.collapsed)micRange.collapse(false);
    return;
  }
  var r=document.createRange();
  r.selectNodeContents(editor);
  r.collapse(false);
  micRange=r;
}
function micBlockOf(){
  if(!micRange||!editor.contains(micRange.commonAncestorContainer))return null;
  var n=micRange.endContainer;
  if(n.nodeType===3)n=n.parentNode;
  while(n&&n.parentNode!==editor)n=n.parentNode;
  return (n&&n!==editor)?n:null;
}
function micTextInBlock(){
  var b=micBlockOf();
  if(!b)return null;
  try{
    var r=document.createRange();
    r.selectNodeContents(b);
    r.setEnd(micRange.endContainer,micRange.endOffset);
    return r.toString();
  }catch(e){return null}
}
function micPrevBlockTail(){
  var b=micBlockOf();
  if(!b||!b.previousElementSibling)return '';
  return (b.previousElementSibling.textContent||'').replace(/\s+$/,'').slice(-60);
}
function micCommands(t){
  var map=[
    ['восклицательный знак','!'],
    ['вопросительный знак','?'],
    ['точка с запятой',';'],
    ['новый абзац','\n'],
    ['новая строка','\n'],
    ['открой скобку','('],
    ['закрой скобку',')'],
    ['открой кавычку','«'],
    ['закрой кавычку','»'],
    ['многоточие','…'],
    ['двоеточие',':'],
    ['запятая',','],
    ['запятую',','],
    ['запятые',','],
    ['тире','—'],
    ['точка','.']
  ];
  var s=' '+(t||'')+' ';
  for(var i=0;i<map.length;i++){
    var pat='[\\s]'+map[i][0].split(' ').map(escRe).join('[\\s]+')+'[\\s]';
    s=s.replace(new RegExp(pat,'gi'),' '+map[i][1]+' ');
  }
  return s;
}
function micChunk(t){
  t=(t||'').replace(/\s+/g,' ').trim();
  if(!t)return '';
  t=t.replace(/\s*—\s*/g,' — ');
  t=t.replace(/\s+([,.;:!?…)»])/g,'$1');
  t=t.replace(/([,;:])(?=[а-яёa-z])/g,'$1 ');
  t=t.replace(/([.!?…])(?=[а-яёa-z])/g,'$1 ');
  t=t.replace(/([.!?…»])\s+([а-яёa-z])/g,function(m,p,w){return p+' '+w.toUpperCase()});
  return t;
}
function micCap(s){
  if(!s)return s;
  var m=s.match(/^(\s*[.!?…»]*\s*)([а-яёa-z])/);
  if(m)return s.replace(/^(\s*[.!?…»]*\s*)([а-яёa-z])/g,function(all,pre,w){return pre+w.toUpperCase()});
  if(/^[а-яёa-z]/.test(s))return s.charAt(0).toUpperCase()+s.slice(1);
  return s;
}
function micAttach(head){
  if(!head)return head;
  var pre=micTextInBlock();
  if(pre===null){micPlaceCaret();pre=micTextInBlock()||''}
  if(pre===''){
    var pv=micPrevBlockTail();
    if(!pv||!/[,;:—(«"”’-]\s*$/.test(pv))head=micCap(head);
  } else if(/[.!?…»]\s*$/.test(pre)){
    head=micCap(head);
    if(!/\s$/.test(pre))head=' '+head;
  } else if(!/\s$/.test(pre)&&!(/[(«]$/.test(pre))&&!/^[,.;:!?…)»]/.test(head)){
    head=' '+head;
  }
  return head;
}
function micFormat(t){
  if(document.activeElement===editor){
    var ls=getSelection();
    if(ls.rangeCount&&editor.contains(ls.anchorNode)){
      micRange=ls.getRangeAt(0).cloneRange();
      if(!micRange.collapsed)micRange.collapse(false);
    }
  }
  t=micCommands(t||'');
  var paras=t.split('\n');
  for(var i=0;i<paras.length;i++)paras[i]=micChunk(paras[i]);
  var pre=micTextInBlock();
  if(pre===null){micPlaceCaret();pre=micTextInBlock()||''}
  var prefix='';
  if(pre!==''&&!/[.!?…»]\s*$/.test(pre)&&!/\s$/.test(pre)&&micLastFinalAt){
    var gap=Date.now()-micLastFinalAt;
    if(gap>=MIC_PAUSE_END)prefix='. ';
    else if(gap>=MIC_PAUSE_COMMA)prefix=', ';
  }
  micLastFinalAt=Date.now();
  var head=(prefix+paras[0]).replace(/\s+/g,' ').trim();
  if(prefix)head=micCap(head);
  paras[0]=micAttach(head);
  return paras.join('\n');
}
function micScrollIntoView(node){
  try{
    var el=node.nodeType===3?node.parentElement:node;
    if(el&&el.scrollIntoView)el.scrollIntoView({block:'nearest'});
  }catch(e){}
}
function micNewParagraph(){
  var b=micBlockOf();
  if(!b)return false;
  if(b.tagName==='P'&&!b.textContent){return true}
  var np=mk('p');
  b.after(np);
  var r=document.createRange();
  r.selectNodeContents(np);
  r.collapse(true);
  micRange=r;
  try{
    var s=getSelection();
    s.removeAllRanges();
    s.addRange(r);
  }catch(e){}
  if(np.scrollIntoView)np.scrollIntoView({block:'nearest'});
  return true;
}
function micInsertOne(text){
  if(!text)return;
  if(!micRange||!editor.contains(micRange.commonAncestorContainer))micPlaceCaret();
  var focused=(document.activeElement===editor);
  var s=getSelection();
  try{s.removeAllRanges();s.addRange(micRange)}catch(e){}
  var ok=false;
  if(focused){try{ok=document.execCommand('insertText',false,text)}catch(e){ok=false}}
  if(!ok){
    try{
      var r=s.rangeCount?s.getRangeAt(0):micRange;
      r.deleteContents();
      var node=document.createTextNode(text);
      r.insertNode(node);
      var after=document.createRange();
      after.setStartAfter(node);after.collapse(true);
      s.removeAllRanges();s.addRange(after);
      micScrollIntoView(node);
    }catch(e2){return false}
  }
  var sel=getSelection();
  if(sel.rangeCount){
    micRange=sel.getRangeAt(0).cloneRange();
    if(!micRange.collapsed)micRange.collapse(false);
  }
  return true;
}
function micInsert(text){
  if(!text||workspace.hidden)return;
  var paras=text.split('\n');
  var changed=false;
  for(var i=0;i<paras.length;i++){
    if(i>0){if(!micNewParagraph())break;changed=true;paras[i]=micAttach(paras[i])}
    if(paras[i]&&micInsertOne(paras[i]))changed=true;
  }
  if(changed)editor.dispatchEvent(new Event('input',{bubbles:true}));
}
function micHalt(){
  micWanted=false;
  var rec=micRec;micRec=null;
  if(rec){try{rec.onend=null;rec.onerror=null;rec.stop()}catch(e){}}
}
function micFatal(msg){
  micHalt();
  micSetUI(false);
  if(msg)toast(msg);
}
function micStart(){
  if(micOn||micWanted)return;
  if(!SRClass){toast('Голосовой ввод не поддерживается этим браузером');return}
  if(workspace.hidden)return;
  micPlaceCaret();
  micRestarts=0;
  micLastFinalAt=0;
  micWanted=true;
  var rec=new SRClass();
  micRec=rec;
  rec.lang=micLang;
  rec.continuous=true;
  rec.interimResults=true;
  rec.maxAlternatives=1;
  rec.onresult=function(ev){
    var interim='',fin='';
    for(var i=ev.resultIndex;i<ev.results.length;i++){
      var r=ev.results[i];
      if(r.isFinal)fin+=r[0].transcript;
      else interim+=r[0].transcript;
    }
    if(interim)micSetUI(true,interim.replace(/\s+/g,' ').trim());
    if(fin){micRestarts=0;micInsert(micFormat(fin));micSetUI(true)}
  };
  rec.onerror=function(ev){
    var e=ev&&ev.error;
    if(e==='no-speech'||e==='aborted')return;
    var msgs={
      'not-allowed':'Нет доступа к микрофону — разрешите доступ для сайта',
      'service-not-allowed':'Сервис распознавания речи недоступен',
      'network':'Нет сети: распознавание речи работает через интернет',
      'language-not-supported':'Язык распознавания не поддерживается',
      'audio-capture':'Микрофон не найден'
    };
    micFatal(msgs[e]||('Диктовка: ошибка «'+e+'»'));
  };
  rec.onend=function(){
    if(!micWanted){if(micOn)micSetUI(false);micRec=null;return}
    micRestarts++;
    if(micRestarts>MIC_RESTART_MAX){micFatal('Диктовка остановлена — долгая тишина');return}
    setTimeout(function(){
      if(!micWanted||!micRec)return;
      try{micRec.start()}catch(e){micFatal('Не удалось возобновить диктовку')}
    },250);
  };
  try{rec.start()}catch(e){micFatal('Не удалось начать диктовку');return}
  micSetUI(true);
}
function micStop(){
  if(!micOn&&!micWanted)return;
  var wasOn=micOn;
  micHalt();
  micSetUI(false);
  if(wasOn)toast('Диктовка остановлена');
}
function micToggle(){(micOn||micWanted)?micStop():micStart()}

btnVoice.addEventListener('mousedown',function(e){e.preventDefault()});
btnVoice.addEventListener('click',micToggle);
micPill.addEventListener('click',micStop);
document.addEventListener('keydown',function(e){
  if((e.ctrlKey||e.metaKey)&&e.altKey&&(e.key==='r'||e.key==='R')){if(isReader())return;e.preventDefault();micToggle();return}
  if(e.key==='Escape'&&micOn)micStop();
});
document.addEventListener('visibilitychange',function(){if(document.hidden&&micOn)micFatal('')});
addEventListener('pagehide',function(){if(micOn)micFatal('')});
if(!SRClass){
  btnVoice.title='Диктовка голосом — не поддерживается этим браузером';
  btnVoice.classList.add('unsup');
}
