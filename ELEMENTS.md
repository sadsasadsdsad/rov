# «Черновик» — как работает каждый элемент

Код: `index.html` + `css/01–12` + `js/01–22` (порядок подключения = порядок зависимостей) + `api/*.php`.
Ниже — каждый элемент, где живёт и какой функцией работает.

---

## 1. Каркас и состояния

| Состояние | Как задаётся | Что меняет |
|---|---|---|
| Экран библиотеки | `#library` | Главный экран со списком книг |
| Редактор | `#workspace` + `body` без классов | Сайдбар + текст + статусбар |
| Чтение | `body.reader` | Только текст (телефон) |
| Только чтение | `body.ro` (книга от другого автора) | Панели скрыты, правка запрещена (`isReadOnly()`) |
| Фокус (zen) | `toggleZen()` (`15-editor.js`) | Скрыты сайдбар/топбар/статус, `zenAnchor` помнит, что было |

**Данные.** `state` (глобальный объект) → `persist()` (`04-state-seed.js`) пишет в `localStorage` под ключом `LS='chernovik.v2'`. `load()` читает, `seed()` — первый запуск с демо-книгой, `initState()` связывает всё вместе. Сохранение не на каждое нажатие: `scheduleSave()` ставит таймер, `commitNow()` пишет сразу (перед уходом со страницы), `syncCurrentChapter()` перед закрытием главы переносит HTML из редактора в `ch.html`.

| Служебные ключи localStorage | Файл |
|---|---|
| `chernovik.v2` — книги, настройки | `01-core.js` `LS` |
| `chernovik.thesaurus.v5` — кэш синонимов | `THESAURUS_LS` |
| `chernovik.snapshots.v1` — история версий | `SNAP_LS` |
| `chernovik.accounts.v1` — профили | `ACC_LS` |

---

## 2. Библиотека (`#library`)

| Элемент | Функция | Файл |
|---|---|---|
| Список книг | `renderLibrary()` — рисует карточки со статистикой глав/слов | `15-editor.js` |
| Вкладки «Мои / Общие книги» | `setLibTab()` — сегмент-капсула `#libTabs[data-tab]` с переезжающей подложкой; каталог `.shared-*` с поиском | `21-shared.js`, `11-access.css` |
| Обложка книги | `bookExcerpt()` — первая живая строка рукописи (`.cv-exc`, до 3 строк); объём `.cv-words` справа сверху — при наведении его сменяют кнопки; внизу за пунктиром `.cv-time`: главы · остановка · когда писали | `15-editor.js`, `02-library.css` |
| Числительные | `plural(n,'слово','слова','слов')` — «Написано сегодня · 12 слов», «5 глав» | `01-core.js` |
| Открыть книгу | `openBookOverview(id)` → экран обзора | `15-editor.js` |
| Новая книга | `createBook()` — книга + глава, сразу вход в редактор | `15-editor.js` |
| Статистика письма | `renderStats()` — сегодня/неделя/30 дней/среднее + график (SVG, `bindChartHover`), под линиями мягкая заливка `.ser-area` | `05-chart.js`, `02-library.css` |
| Бэкап ⬇ / ⬆ | `restoreBackup()` — JSON всех книг | `15-editor.js` |
| Тема (светлая/сепия/тёмная) | `setTheme()` через `body[data-theme]`, иконки `.ic-sun/.ic-sepia/.ic-moon` | `15-editor.js` |
| ИИ-пилюля | `aiFabLib` → `aiOn()` — панель ИИ поверх библиотеки | `22-assistant.js` |

## 3. Обзор книги

| Элемент | Функция | Файл |
|---|---|---|
| Обложка, описание, тип | `renderBookView()` | `15-editor.js` |
| Сетка глав с началами | `chapterExcerpt()` — первые N слов | `15-editor.js` |
| Доступ (закрыта/по ссылке/публичная) | `setBookVisibility()` + `renderBookAccess()`, ссылка `shareLinkFor()` | `21-shared.js` |
| Вход в текст | `enterEditor(chId)` → `openChapter(id)` | `15-editor.js` |

---

## 4. Редактор

### Топбар (`#topbar`, `index.html`)

| Кнопка | Обработчик | Что делает |
|---|---|---|
| `#btnShelf` | `toLibrary()` | Назад к книгам |
| `#btnSide` | `setWorkspaceVisible()` | Свернуть сайдбар глав |
| Поиск `#spInput` | `spRun()` (дебаунс, Enter — сразу) | Ищет по главам, статьям мира и заметкам |
| `#btnNote` | `insertNoteAtCursor()` · `Ctrl+Alt+N` | Вставляет заметку в позицию курсора |
| `#btnBookmark` | `createMarkAtCursor()` · `Ctrl+Alt+M` | Ставит метку, `renderMarksRail()` рисует их в рейке |
| `#aiFab` | `aiOn()` | Панель ИИ |
| `#btnVoice` | `micToggle()` · `Ctrl+Alt+R` | Диктовка: распознанное вставляется в текст (`micInsert`, команды «новый абзац» и т.п.) | `18-voice.js` |
| `#btnZen` | `toggleZen()` | Режим фокуса |
| `#btnWiki` | `toggleWikiPanel()` | Панель энциклопедии |
| Тема | см. §2 | |
| `#btnExport` | `openExportMenu()` → `doExport(kind)` | TXT (`buildTxt`), MD (`buildMd`), HTML (`buildHtmlDoc`), печать (`buildPrintBook()` → `Ctrl+P`) |
| Аккаунт | `openAccMenu()` | Профиль, выход, синхронизация | `16-accounts.js` |

### Сайдбар глав (`#side`)

| Элемент | Функция | Как работает |
|---|---|---|
| `#chlist` | `renderList(animate)` | Карточки глав; клик — `openChapter`, `Enter` — тоже |
| Перетаскивание | `dragify()` + `moveChapter()` | HTML5-drag: куда бросили, туда встала; порядок в `b.chapters` |
| `#addCh` | обработчик в `15-editor.js` (строка ~1025) | Новая глава в конец |
| Барабан глав (рейка) | `loopFit()`, `railCenterActive()`, `chWheelUpdate` | `requestAnimationFrame`-цикл: пока идёт анимация (`anim=true` ⇔ `raf≠null`), рейка едет и центрирует **активную** главу; замеряет `.ch:not(.dupe)` (дубли-кольца только для бесконечности) |
| Полозок полосы меток | `renderMarksRail()`, `jumpToMark()` | Метки по главам, клик — прыжок в текст |
| Низ | `updateStats()` | Слов в книге + время чтения |

### Текст

| Элемент | Функция | Как работает |
|---|---|---|
| `#editor` (contenteditable) | `15-editor.js` | `Enter` — `splitBlock()`, `Backspace` в пустом блоке — слияние, `Space` в `<p>` — блок-меню, `/` — `openSlash()` (слэш-меню: заголовок, разделитель, заметка…) с навигацией `↑↓/Enter/Esc` |
| Ручка ширины `#edRz` | `positionEdRz()`, клавиши в `07-layout.js` | Тянется мышью, `←/→` ±16px, диапазон 520–1040 (`state.ui.edW`) |
| Выделение → панель | `captureSelectionRange()`, `selbarButtons` | Жирный/курсив/Э.., синонимы (`scheduleThesaurus` → `showThesaurusResult`), «Исправить/Улучшить» → ИИ, заметка |
| `#statusbar` | `updateStatsNow()` + `#saveDot/#saveTxt` | Точка сохранения: серая → оранжевая (пишется) → зелёная (ок) |
| Автосохранение | `scheduleSave()` → `commitNow()` | Дебаунс + `beforeunload` |
| Снапшоты | `takeSnapshot()` / `restoreFromSnapshot()` / `openDayModal(key)` | Раз в день (лимиты: `SNAP_MAX_DAYS=30`, `SNAP_MAX_BYTES=3.5МБ`) | `03-snapshots.js` |

### Горячие клавиши (глобальные, `15-editor.js`)

`Ctrl+S` сохранить · `Ctrl+F` поиск · `Ctrl+Alt+N` заметка · `Ctrl+Alt+M` метка · `Ctrl+Alt+R` диктовка · `Esc` закрыть меню/модалку.

---

## 5. Энциклопедия (`#wikiPanel`, `10-wiki-panel.js`)

| Элемент | Функция | Как работает |
|---|---|---|
| Открыть/закрыть | `toggleWikiPanel(force,tab)` | Принимает таб; `chatVis` — показать ли чат ИИ внутри панели |
| Режимы | `#wpFull` обработчик | `.win` — встык-бокс 340px между хидером и статусом; без — во весь экран; после переключения пересчитывается индикатор табов и затемнение краёв тегов |
| Вкладки | `setPanelTab()`, `updatePanelTabs()` | **Мир** / **Заметки** / **Карта** / **Чат**; бегунок `.wp-tabs-indicator` едет CSS-transformом (transition .5s) |
| Поиск `#wpSearch` | дебаунс `wpTid` → `renderWiki()` | По названию/описанию/алиасам |
| Полоса тегов `#wpFilters` | `renderWikiFilters()` + `wpFiltersBind()`/`wpFiltersEdge()` | Чипы типов со счётчиками; в `.win` — одна строка (nowrap): **колесо** сдвигает по горизонтали, классы `edge-l/edge-r` включают затемнение краёв (маска-gradient), доехал до конца — крайнее снимается |
| Список статей | `renderWiki()` | Карточки: цвет типа (`wikiTypeColor`), счётчики упоминаний; клик — `openWikiView(id)` |

**Сбор данных по книге** (`09-cooccurrence.js`):
`buildCoOccurrence(force)` — сквозной проход по главам, кэш `coCache` (сбрасывается `invalidateCo()`). Слева направо: `08-declensions.js` даёт формы имени (`declForms`, `buildNameRegexAll` — падежи/числа через `LEMMA_RULES`), `findContexts()` ищет вхождения, `nameStats()` считает. Результат — «где встречается» (таймлайн `timelineHtml()`) и связи (`relationsOf()`).

## 6. Статья мира (модалка `#wvModal`, `13-wiki-modal.js`)

| Блок | Функция | Как работает |
|---|---|---|
| Открытие | `openWikiView(id)` | Собирает описание, таймлайн, цитаты, связи |
| Таймлайн «Где встречается» | `timelineHtml()` | Главы с числами упоминаний; клик — `jumpToQuote()` (находит оффсет `findQuoteOffset`, подсвечивает `flashRange`) |
| **Связи-пилюли** | `openWikiView` + CSS `07-wiki-modals.css` | Абсолютный слой `#wvRel` в `.wv-inner`; пилюли `data-side=l/r` чередуют борта, вертикаль = слот + джиттер, отступ 8–40px случайный, дрейф `--fx1/--fy1/--fx2/--fy2`, длительность 3.2–6.6с, отрицательная фаза, порядок перемешан; клик — переход на статью. ≤1080px — обычные перенесённые чипы |
| Цитаты | `findQuoteOffset` | Реальный фрагмент текста; клик — прыжок в главу |
| Редактирование | `openWikiModal(id)` (`09-cooccurrence.js`) | Имя, тип (`WIKI_TYPES`), алиасы, описание; превью `updateWikiPreview()` |
| Тип-чип | `paintTypeBadge()` | Цвет из `COLORS`/`getWikiType()` |

## 7. Заметки (таб «Заметки», `11-notes.js`)

| Элемент | Функция |
|---|---|
| Сбор | `collectNotes()` — проход по главам, `ensureNoteIds()` проставляет id |
| Фильтры `#npFilters` | `renderNoteFilters()` — «Все / С текстом / Пустые» + число глав; та же лента и затемнение, что у тегов мира |
| Список | `renderNotes()` → `noteCard()` |
| Действия | `jumpToNote()`, `editNote()`, `moveNoteToChapter()`, `deleteNote()` |

## 8. Карта книги (таб «Карта», `12-graph.js`)

| Элемент | Функция | Как работает |
|---|---|---|
| Данные графа | `buildGraphData()` | Узлы = статьи мира (карточки-ноды), рёбра = совместные упоминания; главный узел — по весу |
| Раскладки | `layoutTree()` — «Ноды» (дефолт), `layoutRadial()` — «Радиальная», `layoutCircle()` — «Круг» (эллипс по форме окна), `layoutForce()` — «Силы» | Кнопки `.gp-mode`; переезд узлов анимируется (`startGraphTween`, 620мс, easeInOutCubic) |
| Карточка-нода | `nodeBox()`, `headPath()` | Шапка 24px цветом типа, тело «тип · упом. · связ.», сокеты-кружки по краям — как ноды в Блендере |
| Отрисовка | `paintGraph()` — SVG | Нити — кубические кривые гнездо-гнездо; точечная сетка `#gpGrid` (pattern) едет с камерой |
| Камера | `graphViewTick()`, `graphFitTarget()`, `zoomBy()` | Плавная (цели + rAF, константа ~72мс), инерция пана после броска, авто-вписывание при первом показе / «вписать» / смене режима |
| Фокус | клик по строке ранга или двойной клик по ноде; двойной клик по фону — сброс | Окружение подсвечено, остальное затемняется анимацией |
| Фильтры | `renderGraphTypeBar()`, `renderGraphRank()`, `renderGraphLegend()` | По типам, рангу, легенда |
| Одиночки без связей | `n.iso` — статьи без упоминаний не выбрасываются: в «Нодах» — колонка справа, в «Радиальной» — внешнее кольцо; подпись на холсте `.gn-cap` «без связей · N» | `12-graph.js` |
| Переключатель «без связей» | `#gpOrphans` в тулбаре (включён по умолчанию) | `index.html`, `12-graph.js` |
| «Структура книги» | выдвижная панель `.gp-rank` поверх холста: кнопка `#gpRankBtn`, `setGraphRankOpen()`; на пустой карте открывается сама. Слайдеры «Глубина/Связь» — в полосе `.gp-bar` | `12-graph.js`, `06-graph.css` |
| Плавность | Уважается `prefers-reduced-motion`; экраны библиотеки/обзора/редактора проявляются мягко (`viewFadeIn`) | `12-graph.js`, `01-base.css` |
| Ресайз/таб | `scheduleGraph()` → `scheduleGraphPaint()` → `buildAndRenderGraph()` | Дебаунс; после легенды/рангов холст перемеряется — раскладка и вписывание считаются по верной высоте |
| Экспорт | `#gpExport` | SVG со вшитыми стилями карточек и нитей |
| CSS | `06-graph.css` | Карточки-ноды, сетка, анимации появления, тултипы, легенда, тип-бар |

---

## 9. ИИ-ассистент (`#aiPanel`, `22-assistant.js`)

| Элемент | Функция | Как работает |
|---|---|---|
| Открыть | `aiOn()` / пилюли `aiFabs` (`.ai-open`) | Плавает справа; на телефоне — лист |
| Охват `#aiScope` | меню `#aiScopeMenu`, `aiRenderCtx()` | Книга / текущая глава / выделение — что уйдёт в запрос |
| Отправка | `aiSendMsg()` → `aiAsk(q)` | Строит системный промпт: названия глав, текст главы (`aiChText`), выделение (`aiSelection`), сам запрос |
| Запрос | `aiUrl(kind)` + `aiFetch()` | По умолчанию `POST /api/ai.php` (PHP-релей → локальному прокси → DeepSeek); можно свой прокси/ключ/модель (модалка `#aiSetModal`, `aiLoadCfg`/`aiSaveCfg` в localStorage) |
| Стрим | чтение SSE-потока | Текст тикает в ленту, `aiRender()` рисует сообщение |
| Лента | `aiRenderHtml()` | Рассуждение сворачивается в `<details>`, типографика, автоскролл |
| Чипы-подсказки | `fillChips()` / `fillMessage()` | Быстрые вопросы и действия |
| Создание книги/главы | карточка в ответе | Одна кнопка — команда в `15-editor.js` (`createBook`/глава) |
| Правка выделенного | выделение → «Исправить/Улучшить» → `#aiResModal` | Показывает исходник и результат: `ПРИМЕНИТЬ` (подставляет в текст), `КОПИРОВАТЬ`, `ПОВТОРИТЬ` |
| Настройки | `#aiGear` → `#aiSetModal` | Адрес прокси, API-ключ, модель |
| Очистить | `#aiClear` | Диалог стирается из localStorage |

**Путь запроса:** браузер → `/api/ai.php` (rate-limit 20/мин, без буферизации для стрима) → прокси `127.0.0.1:8080` → DeepSeek.

## 10. Поиск (`14-search.js`)

| Шаг | Функция |
|---|---|
| Ввод | `spTid` дебаунс → `spRun()` (Enter — без ожидания) |
| Где ищет | главы (`chapters`), статьи мира, заметки — `renderSearchResults()` |
| Навигация | `↑↓` — `paintSearch()`, `Enter` — `goToResult()` (прыжок + прокрутка `scrollSearchAct`) |
| Панель | `showSearchResults()/positionSearchResults()` — всплывает под полем топбара |

---

## 11. Телефонная версия (`19-mobile-reader.js`)

| Элемент | Функция | Как работает |
|---|---|---|
| Порог | `mqMobile = matchMedia('(max-width:880px)')` (`01-core.js`) | На ≤880 включается `body.reader` |
| Чтение | `applyReaderMode()` | Только текст; в `body.reader` панель энциклопедии `display:none` |
| Тап-зоны | `readerNeighbour()` | Края — листать главы, центр — показать панель (`showReaderUi/hideReaderUi`) |
| Панель «Aa» | `openReaderSheet()` / `toggleReaderSheet()`, `rdStepFs()` | Шрифт ±, интерлиньяж, отступ, выравнивание → `applyReaderPrefs()` (пишет в `state.ui`) |
| Прогресс | `readerScrollPct()` → `updateReaderProgress()` | Полоса внизу |
| Оглавление | `readerGoto()` | Переход по главам |
| Клавиши | `19-mobile-reader.js` `keydown` | `Esc` закрывает шторки |

## 12. Диктовка (`18-voice.js`)

`micToggle()` → `micInsertOne/micInsert` по кускам (`micChunk`), форматирование (`micFormat`), команды (`micCommands` — «новый абзац» и т.п.), забота о каретке (`micPlaceCaret`, `micScrollIntoView`); `Esc` — стоп.

## 13. Аккаунты и синхронизация

| Элемент | Функция | Файл |
|---|---|---|
| Профили | `renderAuthProfiles()`, вход/регистрация, пароль необязателен | `16-accounts.js` |
| Пароль | `hashPassword()`/`verifyPassword()` (соль `randomSalt`) | `16-accounts.js` |
| Старт приложения | `boot()` → `startApp(user)` | `17-start.js` |
| Синхронизация | `syncFetch`, `syncPutBook`, `syncPutState`, `syncDelBook`; статус `syncStatus()`, пауза при ошибках `syncBackoff()` | `20-sync.js` |
| Общие книги | `openSharedBook(id,token)`, `openForeignBook()`, режим чтения `roNormalize`/`updateRoChrome` | `21-shared.js` |

---

## 14. Служебное

| Элемент | Функция | Файл |
|---|---|---|
| Метки | `createMarkAtCursor`, `jumpToMark`, `deleteMark`, подсказка `showMarkTip` | `06-marks.js` |
| Синонимы/антонимы | `fetchSynonymOnline`, `fetchAntonymOnline`, `fetchWiktionary` + кэш `THESAURUS_CACHE` | `02-thesaurus.js` |
| Диалоговые окна | `uiAsk/uiPrompt/uiConfirm` (своя разметка, не `prompt`) | `07-layout.js` |
| Тосты | `toast()` | `15-editor.js` |
| Склонения | `declForms`, `variants`, `lemmatize` | `08-declensions.js` |
| Доступ/безопасность HTML | `sanitizeChapterHtml`, `hardenChapterHtml` | `21-shared.js` |

---

## 15. Стили (что за что отвечает)

| Файл | Содержимое |
|---|---|
| `01-base.css` | Переменные-токены (цвета, шрифты), сброс, базовая типографика; скроллбары спрятаны по всему сайту |
| `02-library.css` | Библиотека: карточки-обложки (`.cv-exc`, `.cv-words`, `.cv-time`), статистика, график (`.ser-area`) |
| `03-bookview-workspace.css` | Обзор книги + сайдбар глав, барабан, номера глав (`.ch .num` — радиус 5px) |
| `04-editor.css` | Поле текста, панель выделения, слэш-меню |
| `05-modals-notes.css` | Модалки, заметки, панель энциклопедии и её свёрнутый вид (`.win`), полоса тегов и её затемнение |
| `06-graph.css` | Карта книги: карточки-ноды, сетка, анимации, тултипы, легенда, выдвижная «структура» |
| `07-wiki-modals.css` | Статья мира: таймлайн, связи-пилюли (`#wvRel`), цитаты |
| `08-responsive-auth.css` | Адаптив и экран входа |
| `09-mobile-reader.css` | Телефонная читалка, шторка «Aa» |
| `10-shared.css` | Общие книги (только чтение) |
| `11-access.css` | Сегмент «Мои/Общие книги», каталог общих книг (`.shared-*`), доступ к книге: «закрыта/по ссылке/публичная» |
| `12-assistant.css` | Панель ИИ: лента, ввод (скрытый скроллбар), модалки результатов |

---

## 16. Куда смотреть при правке

| Хочу изменить | Файл |
|---|---|
| Поведение текста, топбар, экспорт, список глав | `15-editor.js` |
| Энциклопедия, связи, статьи | `09-cooccurrence.js`, `13-wiki-modal.js`, `10-wiki-panel.js` |
| Ответы ИИ, промпт, стрим | `22-assistant.js` |
| Карта-граф | `12-graph.js` |
| Телефонная версия | `19-mobile-reader.js`, `09-mobile-reader.css` |
| Цвета/шрифты/отступы всего сайта | `01-base.css` (переменные) |
| Конкретный экран | свой `css/NN-*.css` по таблице §15 |
