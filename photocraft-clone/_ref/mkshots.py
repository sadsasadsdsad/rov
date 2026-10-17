# -*- coding: utf-8 -*-
"""Собирает src/_shot.html — копию приложения «Черновик» с засеянным
данными (3 книги, энциклопедия, статистика, диалог ИИ) и драйвером
выбора вида по ?view= для headless-скриншотов.

ВНИМАНИЕ: src/_shot.html — временный файл, после скриншотов удалить.
"""
import json
import datetime
import os

ROOT = r'D:\work\rov'
SRC = os.path.join(ROOT, 'src')
IDX = os.path.join(SRC, 'index.html')
OUT = os.path.join(SRC, '_shot.html')


def ts(*a):
    return int(datetime.datetime(*a).timestamp() * 1000)


# ------------------------------------------------------------------ chapters
c1 = (
    '<h1>I · Прибытие</h1>'
    '<p>Поезд остановился ровно в полночь, и Анна первой шагнула на мокрый перрон. '
    'Воздух пах <em>дымом, хвоей и чем-то ещё</em> — так пахнет место, где тебя давно ждут.</p>'
    '<div class="nb" data-nid="nshot1">Проверить: поезд приходит в полночь во всех черновиках? '
    'Возможно, лучше вечер.</div>'
    '<p><strong>Дом стоял на холме.</strong> Ниже, под туманом, спала деревня; выше — только небо '
    'и гулкий ветер в проводах.</p>'
    '<p>Анна и Марта стояли на перроне, пока Туман поднимался с реки и стелился по рельсам.</p>'
    '<div class="sep" contenteditable="false"><span><i></i><i></i><i></i></span></div>'
    '<p>— Вы, верно, к смотрителю, — сказал старик у вокзала. Он не спрашивал. Он <em>знал</em>.</p>'
    '<p>— Марта, — тихо сказала Анна. — Ты всё-таки дождалась.</p>'
    '<p>Семён не спрашивал — он знал, что Анна придёт в Подхолмье этим поездом.</p>'
    '<p>Часы в прихожей замерли в минуту Прибытия поезда — их никто не заводил.</p>'
    '<p>— Здесь Часы останавливаются сами, — сказал Семён. — Как только Туман ложится на деревню.</p>'
    '<p>Анна кивнула и крепче сжала ручку чемодана. Где-то в глубине дома, на самом его дне, '
    'тихо скрипнула дверь.</p>'
)
c2 = (
    '<h1>II · Крыльцо</h1>'
    '<p>Дом встречал их остывшим камнем. На крыльцу Марта поставила фонарь, и свет ушёл в туман, '
    'не найдя дна.</p>'
    '<p>— Анна, — сказала Марта. — Семён уже внутри. Он не любит, когда Туман застаёт нас на улице.</p>'
    '<p>Подхолмье спало, и только почта горела окошком: Марта не гасила свет, пока не вернутся все.</p>'
    '<p>Анна считала ступени, считала Часы, считала минуты до слов, которые должна была сказать.</p>'
    '<div class="sep" contenteditable="false"><span><i></i><i></i><i></i></span></div>'
    '<p>— Прибытие было ночным, — сказал Семён, поднимаясь по ступеням. — Как и всегда.</p>'
    '<p>Туман обнял дом, и на крыльцу стало так тихо, что слышно было, как в прихожей оживают Часы.</p>'
    '<p>— Завтра пойдём к реке, — сказала Марта. — Пока Туман не поднялся.</p>'
)
c3 = (
    '<h1>III · Погреб</h1>'
    '<p>Лестница в погреб была мокрой, и Анна шла вниз, считая ступени вслух.</p>'
    '<p>— Здесь Часы и остановились, — сказал Семён. — В минуту, когда Туман впервые лёг '
    'на Подхолмье.</p>'
    '<p>Анна провела рукой по полке и нашла те самые Часы — маленькие, с треснутым стеклом.</p>'
    '<p>— Марта не должна это видеть, — сказал Семён. — Она до сих пор ждёт, что Прибытие изменится.</p>'
    '<p>— Ты думаешь, Туман сам? — спросила Анна. Семён не ответил.</p>'
    '<p>Подхолмье наверху уже спало, когда они вернулись: огонь в почте погас, '
    'Туман поднялся до окон.</p>'
)
cn = (
    '<h1>Заметки</h1>'
    '<p>Свободное поле для записей: планы сцен, вопросы к самому себе. Эта глава '
    '<strong>не попадает в печать, экспорт и подсчёт слов</strong> — она существует только '
    'внутри «Черновика».</p>'
    '<p>Врезка в текст — <strong>Ctrl + Alt + N</strong> или «/» и пункт «Заметка»: видна только '
    'автору и никогда не печатается.</p>'
)

s1 = ('<h1>Глава первая. Брод</h1>'
      '<p>Соль возили водой: плот грузили ночью, чтобы вода не уходила из бочки. '
      'Илья запомнил этот запах — мокрое дерево и холодная соль — на всю жизнь.</p>'
      '<p>— Держи левый борт, — кричал бурмистр сквозь туман. — Река помнит всех, кто её переезжал.</p>')
s2 = ('<h1>Глава вторая. Мельница</h1>'
      '<p>Мельница стояла на отмели четвёртого года и не работала с тех пор, как ушёл мельник. '
      'Илья нашёл в ней мешок соли и чужую записку, выгоревшую до последней строки.</p>')
s3 = ('<h1>Глава третья. Соль</h1>'
      '<p>На рынок везли белое и чёрное: белую — к столу, чёрную — в бочки. '
      'Илья продал последний мешок и остался ни с чем — но с картой соляной дороги.</p>')

l1 = ('<h1>I. Письмо первое</h1>'
      '<p>Марта, я пишу это в поезде, который нигде не должен останавливаться. '
      'Если письмо дойдёт — значит, дорога ещё существует.</p>'
      '<p>Ты спрашивала, страшно ли одному. Нет. Страшно другое — что место, куда я еду, '
      'окажется таким же, как все.</p>')
l2 = ('<h1>II. Письмо второе</h1>'
      '<p>Марта, здесь пахнет хвоей и медью. Дом на холме действительно существует, '
      'и в нём действительно горит свет.</p>'
      '<p>Я вернусь зимой. Если не вернусь — ищи меня там, где туман ложится раньше реки.</p>')

# --------------------------------------------------------------------- books
b_dom = {
    'id': 'b_dom', 'title': 'Дом над туманом', 'color': '#c93a2b',
    'updated': ts(2026, 10, 13, 20, 0), 'current': 'c1', 'author': 'А. Ветрова',
    'chapters': [
        {'id': 'c1', 'marks': [], 'pos': 0, 'html': c1},
        {'id': 'c2', 'marks': [], 'pos': 0, 'html': c2},
        {'id': 'c3', 'marks': [], 'pos': 0, 'html': c3},
        {'id': 'cn', 'kind': 'notes', 'marks': [], 'pos': 0, 'html': cn},
    ],
    'customTypes': [],
    'wiki': [
        {'id': 'e_anna', 'type': 'person', 'name': 'Анна', 'aliases': ['Аня'],
         'desc': 'Приезжает в дом над туманом. Сдержанная, наблюдательная.'},
        {'id': 'e_marta', 'type': 'person', 'name': 'Марта', 'aliases': [],
         'desc': 'Подруга Анны, держит почтовое окошко в Подхолмье.'},
        {'id': 'e_semyon', 'type': 'person', 'name': 'Семён', 'aliases': ['смотритель', 'старик'],
         'desc': 'Старик с ключами от дома; встречает ночные поезда.'},
        {'id': 'e_village', 'type': 'city', 'name': 'Подхолмье', 'aliases': ['деревня'],
         'desc': 'Деревня под холмом; в тумане её не видно с дороги.'},
        {'id': 'e_fog', 'type': 'other', 'name': 'Туман', 'aliases': ['пелена'],
         'desc': 'Живая пелена, которая по ночам укрывает деревню под холмом.'},
        {'id': 'e_clock', 'type': 'item', 'name': 'Часы', 'aliases': ['часов', 'часах'],
         'desc': 'Остановившиеся часы в прихожей дома.'},
        {'id': 'e_arrival', 'type': 'event', 'name': 'Прибытие',
         'aliases': ['приезд', 'прибытия'],
         'desc': 'Ночной приход поезда — с него начинается книга.'},
    ],
}
b_salt = {
    'id': 'b_salt', 'title': 'Соляной путь', 'color': '#2e6f5e',
    'updated': ts(2026, 10, 11, 19, 0), 'current': 's1', 'author': 'А. Ветрова',
    'chapters': [
        {'id': 's1', 'marks': [], 'pos': 0, 'html': s1},
        {'id': 's2', 'marks': [], 'pos': 0, 'html': s2},
        {'id': 's3', 'marks': [], 'pos': 0, 'html': s3},
    ],
    'customTypes': [], 'wiki': [],
}
b_letters = {
    'id': 'b_letters', 'title': 'Письма к Марте', 'color': '#39618f',
    'updated': ts(2026, 10, 8, 22, 30), 'current': 'l1', 'author': 'А. Ветрова',
    'chapters': [
        {'id': 'l1', 'marks': [], 'pos': 0, 'html': l1},
        {'id': 'l2', 'marks': [], 'pos': 0, 'html': l2},
    ],
    'customTypes': [], 'wiki': [],
}

# --------------------------------------------------------------------- stats
raw = {
    '2026-09-23': (120, 0, 0), '2026-09-24': (340, 0, 0), '2026-09-25': (280, 0, 0),
    '2026-09-26': (150, 0, 150), '2026-09-27': (510, 0, 0), '2026-09-28': (430, 0, 0),
    '2026-09-29': (190, 0, 0), '2026-09-30': (240, 210, 0), '2026-10-01': (620, 0, 0),
    '2026-10-02': (450, 0, 220), '2026-10-03': (380, 0, 0), '2026-10-04': (210, 330, 0),
    '2026-10-05': (700, 0, 0), '2026-10-06': (520, 0, 140), '2026-10-07': (260, 0, 0),
    '2026-10-08': (310, 0, 0), '2026-10-09': (175, 180, 0), '2026-10-10': (640, 0, 0),
    '2026-10-11': (580, 240, 0), '2026-10-12': (720, 0, 0), '2026-10-13': (890, 0, 0),
}
stats = {}
for d, (a, b_, c_) in raw.items():
    e = {}
    if a:
        e['b_dom'] = a
    if b_:
        e['b_salt'] = b_
    if c_:
        e['b_letters'] = c_
    e['__all'] = a + b_ + c_
    stats[d] = e

state = {
    'v': 2, 'theme': 'light', 'zen': False, 'spell': False,
    'activeBookId': 'b_dom', 'heroes': [], 'ui': {}, 'stats': stats,
    'books': [b_dom, b_salt, b_letters],
}

accounts = {
    'v': 1,
    'users': [{'id': 'u1', 'login': 'author', 'name': 'Автор', 'salt': '', 'hash': '',
               'created': ts(2026, 9, 20, 18, 0), 'lastLogin': ts(2026, 10, 13, 19, 55)}],
    'session': 'u1',
}

threads = [{
    'id': 'th1', 'title': 'Кто такой Семён?', 'ts': ts(2026, 10, 13, 19, 40),
    'ctx': {'bookId': 'b_dom', 'book': 'Дом над туманом', 'ch': 'I · Прибытие',
            'chId': 'c1', 'chText': ''},
    'hist': [
        {'role': 'user', 'content': 'Кто такой Семён и где он впервые появляется?',
         'think': '', 'noFmt': False, 'ctx': None},
        {'role': 'assistant',
         'content': (
             'Семён — старик-смотритель: встречает ночные поезда и держит ключи от дома.\n\n'
             'Впервые появляется в главе «I · Прибытие»: '
             '[[— Вы, верно, к смотрителю, — сказал старик у вокзала.]]\n\n'
             'В карте книги у него три связи — Анна, Подхолмье и Часы: держатель ключей '
             'оказывается центром маленького треугольника.'),
         'think': ('Нужно найти первое упоминание Семёна в главах, сверить с карточкой '
                   'энциклопедии и проверить, какие связи видит карта книги.'),
         'thinkMs': 6, 'noFmt': False,
         'ctx': {'b': 'Дом над туманом', 'c': 'I · Прибытие'}},
    ],
}]

ai_cfg = {'base': '', 'key': '', 'model': 'deepseek-chat', 'scope': 'ch'}

# ------------------------------------------------------------------ seed js
def kv(key, obj):
    return "localStorage.setItem(%s,%s);" % (
        json.dumps(key, ensure_ascii=False),
        json.dumps(json.dumps(obj, ensure_ascii=False), ensure_ascii=False))


seed_js = (
    "(function(){\n"
    "try{localStorage.clear();\n"
    + kv('chernovik.accounts.v1', accounts)
    + kv('chernovik.v2.u:u1', state)
    + kv('chernovik.ai.threads.v1', threads)
    + kv('chernovik.ai.v1', ai_cfg)
    + "}catch(e){}\n"
    "var _f=window.fetch;\n"
    "window.fetch=function(url){\n"
    "  var u=String(url);\n"
    "  if(u.indexOf('auth.php?action=me')>=0)\n"
    "    return Promise.resolve(new Response('null',{status:200,headers:{'Content-Type':'application/json'}}));\n"
    "  if(u.indexOf('ai.php')>=0&&u.indexOf('action=models')>=0)\n"
    "    return Promise.resolve(new Response('{\"object\":\"list\",\"data\":[]}',{status:200,headers:{'Content-Type':'application/json'}}));\n"
    "  if(u.indexOf('/api/')>=0||u.indexOf('api/')===0)\n"
    "    return Promise.resolve(new Response('{\"error\":\"offline\"}',{status:404,headers:{'Content-Type':'application/json'}}));\n"
    "  return _f.apply(this,arguments);\n"
    "};\n"
    "})();"
)

driver_js = """
(function(){
  var m=/[?&]view=([^&]+)/.exec(location.search);
  var view=m?decodeURIComponent(m[1]):'library';
  var n=0,done=false;
  function openEditor(){ openBookOverview('b_dom'); enterEditor(null); }
  function act(){
    if(done)return; done=true;
    try{
      if(view==='editor'){ openEditor(); }
      else if(view==='overview'){ openBookOverview('b_dom'); }
      else if(view==='ai'){
        openEditor();
        setTimeout(function(){ aiOpenPanel(); },600);
      }
      else if(view==='world'){
        openEditor();
        setTimeout(function(){ document.getElementById('btnWiki').click(); },600);
      }
      else if(view==='map'){
        openEditor();
        setTimeout(function(){
          document.getElementById('btnWiki').click();
          setTimeout(function(){
            var t=document.querySelector('.wp-tab[data-tab="graph"]');
            if(t)t.click();
          },800);
        },600);
      }
    }catch(e){ console.error('SHOT',e&&e.message); }
  }
  function waitBoot(){
    n++;
    var started=(typeof appStarted!=='undefined')&&appStarted;
    if(!started&&n<600){ setTimeout(waitBoot,50); return; }
    if(!started){
      try{
        if(typeof accounts!=='undefined'&&accounts.users&&accounts.users.length)
          enterApp(accounts.users[0]);
      }catch(e){}
    }
    /* под virtual time CSS-переходы не добегают до конца — отключаем их,
       иначе панели снимают в исходном (невидимом) состоянии */
    try{
      var st=document.createElement('style');
      st.setAttribute('data-shot','1');
      st.textContent='*,*::before,*::after{transition:none!important;animation:none!important;caret-color:transparent!important}';
      document.head.appendChild(st);
    }catch(e){}
    setTimeout(act,500);
  }
  waitBoot();
})();
"""

with open(IDX, encoding='utf-8') as f:
    html = f.read()

assert '</head>' in html and '</body>' in html, 'маркеры не найдены'
seed_block = '<script id="shot-seed">' + seed_js + '</script>\n'
driver_block = '<script id="shot-driver">' + driver_js + '</script>\n'
# в шапке файла — HTML-комментарий с литеральными </body>, поэтому
# драйвер вставляем перед ПОСЛЕДНИМ </body>, seed — перед первым </head>
html = html.replace('</head>', seed_block + '</head>', 1)
head, sep, tail = html.rpartition('</body>')
assert sep, 'нет </body>'
html = head + driver_block + sep + tail

with open(OUT, 'w', encoding='utf-8', newline='') as f:
    f.write(html)

print('written:', OUT, os.path.getsize(OUT), 'bytes')
print('books:', len(state['books']), 'wiki:', len(b_dom['wiki']),
      'stats days:', len(stats))
