/* ==========================================================================
 * 20-sync.js — СИНХРОНИЗАЦИЯ с сервером (api/*.php)
 * Проект: «Черновик» — веб-редактор рукописей.
 * Что делает:
 *   - Sync.boot() — определяет серверную сессию при запуске (вход уже сделан);
 *   - Sync.join/login/logout — аккаунт на сервере (api/auth.php);
 *   - Sync.pull() — забирает состояние сервера и сводит его с локальным:
 *     книги — LWW по updated, профиль (тема/настройки) — LWW,
 *     статистика — max-merge по дням (конфликтов не бывает);
 *   - Sync.flush() — отправляет изменённые книги (PUT api/book.php),
 *     профиль и статистику (POST api/state.php), удаления (DELETE);
 *   - Sync.markDirty() — вызывается из persist(), дебаунс 1.5 с;
 *   - офлайн: сеть недоступна → работаем из localStorage, повтор по таймеру.
 * Ключевое: Sync.boot, Sync.join, Sync.pull, Sync.flush, Sync.markDirty.
 * Зависимости: 01–19 (state, persist, saveTxt, renderStats, setTheme).
 * ========================================================================== */
"use strict";

var Sync = {
  base: '',                 /* '' = тот же origin, что и страница */
  mode: 'local',            /* server | local */
  user: null,               /* {id,login,name} на сервере */
  pulled: false,            /* состояние сервера уже сводилось */
  sentBooks: {},            /* id -> updated, подтверждено сервером */
  sentProfile: null,        /* JSON профиля, подтверждённый сервером */
  sentStats: null,          /* JSON статистики, подтверждённый сервером */
  needDelete: {},           /* id -> true: удалить на сервере */
  freshSeed: false,         /* локальный state только что засеян (новый профиль) */
  pendingPull: false,       /* подмена открытой книги отложена */
  dirty: false,
  timer: null,
  flushing: false,
  fails: 0
};

/* ---------- низкоуровневый fetch с таймаутом ---------- */
function syncFetch(path, opt) {
  opt = opt || {};
  var ctrl = ('AbortController' in window) ? new AbortController() : null;
  var to = ctrl ? setTimeout(function () { try { ctrl.abort() } catch (e) {} }, 9000) : null;
  var body = opt.body ? JSON.stringify(opt.body) : null;
  return fetch(Sync.base + path, {
    method: opt.method || 'GET',
    headers: body ? { 'Content-Type': 'application/json' } : {},
    body: body,
    credentials: 'same-origin',
    keepalive: !!opt.keepalive && !!body && body.length < 60000,
    signal: ctrl ? ctrl.signal : undefined
  }).then(function (r) {
    if (to) clearTimeout(to);
    return r.json().catch(function () { return null }).then(function (j) {
      if (!r.ok) {
        var e = new Error((j && j.error) || ('HTTP ' + r.status));
        e.status = r.status; e.data = j;
        throw e;
      }
      return j;
    });
  }, function (e) {
    if (to) clearTimeout(to);
    throw e;
  });
}

/* ---------- что отправляем как «профиль» (без книг и статистики) ---------- */
function profileOf(s) {
  return {
    theme: s.theme || 'light',
    zen: !!s.zen,
    spell: !!s.spell,
    ui: (s.ui && typeof s.ui === 'object') ? s.ui : {},
    heroes: Array.isArray(s.heroes) ? s.heroes : []
  };
}
function profileStr(s) { return JSON.stringify(profileOf(s)) }
function statsStr(s) { return JSON.stringify(normalizeStats(s && s.stats)) }

function normalizeStats(map) {
  var out = {};
  if (!map || typeof map !== 'object') return out;
  Object.keys(map).forEach(function (day) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return;
    var e = map[day];
    if (typeof e === 'number') e = { __all: e };
    if (!e || typeof e !== 'object') return;
    var o = {};
    Object.keys(e).forEach(function (k) { if (isFinite(e[k])) o[k] = Number(e[k]) });
    out[day] = o;
  });
  return out;
}
/* max-merge: по каждому дню и ключу берём максимум — операция конфликтобезопасна */
function statsMergeMax(a, b) {
  var out = normalizeStats(a);
  var nb = normalizeStats(b);
  Object.keys(nb).forEach(function (day) {
    if (!out[day]) out[day] = {};
    Object.keys(nb[day]).forEach(function (k) {
      out[day][k] = Math.max(out[day][k] || 0, nb[day][k] || 0);
    });
  });
  return out;
}

/* ---------- строка статуса внизу редактора ---------- */
function syncStatus(kind) {
  if (typeof isReadOnly === 'function' && isReadOnly()) return;
  if (typeof saveTxt === 'undefined' || !saveTxt) return;
  var t = '';
  if (kind === 'sending') t = 'Синхронизация…';
  else if (kind === 'synced') t = 'Синхронизировано · ' + new Date().toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  else if (kind === 'offline') t = 'Офлайн · сохранено локально';
  else if (kind === 'local') t = 'Локальный режим';
  else return;
  saveTxt.textContent = t;
}

/* ---------- аккаунт ---------- */
Sync.boot = function () {
  return syncFetch('api/auth.php?action=me').then(function (j) {
    Sync.user = (j && j.user) || null;
    Sync.mode = Sync.user ? 'server' : 'local';
    return Sync.user;
  }).catch(function () {
    Sync.mode = 'local'; Sync.user = null;
    return null;
  });
};

Sync.join = function (login, name, pass) {
  return syncFetch('api/auth.php?action=join', { method: 'POST', body: { login: login, name: name, pass: pass } })
    .then(function (j) {
      Sync.user = j.user; Sync.mode = 'server';
      Sync.sentBooks = {}; Sync.sentProfile = null; Sync.sentStats = null;
      Sync.pulled = false;
      return { ok: true };
    })
    .catch(function (e) {
      return { ok: false, reason: e.status ? 'http' : 'offline' };
    });
};

Sync.logout = function () {
  if (Sync.mode !== 'server') return Promise.resolve();
  var p = syncFetch('api/auth.php?action=logout', { method: 'POST', keepalive: true })
    .catch(function () {});
  Sync.mode = 'local'; Sync.user = null; Sync.pulled = false;
  Sync.sentBooks = {}; Sync.sentProfile = null; Sync.sentStats = null;
  return p;
};

/* ---------- сверка состояния ---------- */
function applyProfile(pd) {
  state.theme = pd.theme || 'light';
  state.zen = !!pd.zen;
  state.spell = !!pd.spell;
  state.ui = (pd.ui && typeof pd.ui === 'object') ? pd.ui : {};
  state.heroes = Array.isArray(pd.heroes) ? pd.heroes : [];
  try {
    if (typeof setTheme === 'function') setTheme(state.theme);
    if (typeof applyReaderPrefs === 'function') applyReaderPrefs();
    if (typeof invalidateCo === 'function') invalidateCo();
  } catch (e) {}
}

function reconcile(srv) {
  if (!state || !Array.isArray(state.books)) return;
  var fresh = !!Sync.freshSeed;
  Sync.freshSeed = false;
  /* новое устройство (только что создан локальный профиль со сидом) и на сервере уже есть книги:
     сервер — источник истины, demo-сигу не дублируем */
  if (fresh && (srv.books || []).length) {
    state.books = [];
    Sync.sentBooks = {};
  }
  var S = {}, Lb = {};
  (srv.books || []).forEach(function (b) { if (b && b.id) S[b.id] = b });
  state.books.forEach(function (b) { Lb[b.id] = b });

  var ids = {};
  Object.keys(S).forEach(function (i) { ids[i] = 1 });
  state.books.forEach(function (b) { ids[b.id] = 1 });

  var out = [];
  Object.keys(ids).forEach(function (id) {
    var L = Lb[id] || null, Sv = S[id] || null;
    var has = Object.prototype.hasOwnProperty.call(Sync.sentBooks, id);
    var sent = has ? Sync.sentBooks[id] : null;
    var lNew = !!L && (!has || L.updated !== sent);
    var sNew = !!Sv && (!has || Sv.updated !== sent);
    var isActive = false;
    if (id === state.activeBookId) {
      if (typeof workspace !== 'undefined' && workspace && !workspace.hidden) isActive = true;
      if (typeof bookView !== 'undefined' && bookView && !bookView.hidden) isActive = true;
    }

    if (L && !Sv) {
      if (!has || lNew) out.push(L);          /* новая или изменена локально — отправим */
      else delete Sync.sentBooks[id];         /* удалена на сервере */
      return;
    }
    if (!L && Sv) {
      if (!has || Sv.updated > sent) { out.push(Sv); Sync.sentBooks[id] = Sv.updated; }
      else Sync.needDelete[id] = 1;           /* удалена локально — подтвердим удаление */
      return;
    }
    if (L && Sv) {
      if (!lNew && !sNew) { out.push(L); Sync.sentBooks[id] = L.updated; return; }
      if (lNew && !sNew) { out.push(L); return; }          /* отправим */
      if (!lNew && sNew) {                                 /* изменилась только на сервере */
        if (Sv.updated > L.updated) {
          if (isActive) { Sync.pendingPull = true; out.push(L); return; }
          out.push(Sv); Sync.sentBooks[id] = Sv.updated;
        } else out.push(L);
        return;
      }
      /* оба изменены — побеждает более позднее обновление */
      if (Sv.updated > L.updated) {
        if (isActive) { Sync.pendingPull = true; out.push(L); return; }
        out.push(Sv); Sync.sentBooks[id] = Sv.updated;
      } else out.push(L);
      return;
    }
  });
  state.books = out;

  /* профиль (тема/настройки/мир): при первом заходе (sentProfile=null) сервер авторитетен */
  var pd = (srv.prefs && srv.prefs.data) ? srv.prefs.data : null;
  var pstr = profileStr(state);
  if (pd && (Sync.sentProfile === null || pstr === Sync.sentProfile)) {
    applyProfile(pd);
    Sync.sentProfile = profileStr(state);
  }

  /* статистика: max-merge, локальные значения не теряем */
  var merged = statsMergeMax(state.stats || {}, srv.stats || {});
  var before = statsStr(state);
  state.stats = merged;
  if (statsStr(state) !== before) {
    try { if (typeof renderStats === 'function') renderStats() } catch (e) {}
  }

  /* после сверки — перерисовать то, что держит список книг (иначе карточки ведут на старые id) */
  try {
    if (typeof renderLibrary === 'function') renderLibrary();
    if (typeof snapshotStats === 'function') snapshotStats();
    if (typeof renderStats === 'function') renderStats();
    if (typeof updateCrumb === 'function') updateCrumb();
  } catch (e) {}
}

Sync.pull = function () {
  if (Sync.mode !== 'server') { Sync.pulled = true; return Promise.resolve(); }
  return syncFetch('api/state.php').then(function (srv) {
    reconcile(srv || { books: [], stats: {}, prefs: null });
    Sync.pulled = true;
    if (Sync.pendingPull) {
      Sync.pendingPull = false;
      setTimeout(function () { Sync.pull().then(function () { Sync.flush() }) }, 4000);
    }
  }).catch(function (e) {
    if (e.status === 401) { Sync.mode = 'local'; Sync.user = null; Sync.pulled = true; syncStatus('local'); return; }
    /* сеть недоступна — работаем локально, отправим при появлении связи */
    Sync.pulled = true;
    syncStatus('offline');
  });
};

/* ---------- отправка ---------- */
function syncPutBook(b) {
  return syncFetch('api/book.php?id=' + encodeURIComponent(b.id), { method: 'PUT', body: b })
    .then(function (j) {
      if (j && j.ok === false && j.stale) return 'stale';
      Sync.sentBooks[b.id] = b.updated;
      return 'ok';
    });
}
function syncDelBook(id) {
  return syncFetch('api/book.php?id=' + encodeURIComponent(id), { method: 'DELETE' })
    .then(function () { delete Sync.sentBooks[id]; delete Sync.needDelete[id]; });
}
function syncPutState(prefs, stats) {
  return syncFetch('api/state.php', { method: 'POST', body: { prefs: prefs, stats: stats } })
    .then(function () { return 'ok' });
}

Sync.flush = function (opt) {
  opt = opt || {};
  if (Sync.mode !== 'server' || Sync.flushing) return;
  if (!Sync.pulled) {
    clearTimeout(Sync.timer);
    Sync.timer = setTimeout(function () { Sync.flush() }, 2000);
    return;
  }
  if (!state) return;

  var plan = [];
  Object.keys(Sync.needDelete).forEach(function (id) {
    var still = state.books.some(function (b) { return b.id === id });
    if (!still) plan.push({ t: 'del', id: id });
    else delete Sync.needDelete[id];
  });
  state.books.forEach(function (b) {
    if (Sync.sentBooks[b.id] !== b.updated) plan.push({ t: 'book', b: b });
  });

  var pstr = profileStr(state), sstr = statsStr(state);
  var wantState = (pstr !== Sync.sentProfile) || (sstr !== Sync.sentStats);
  if (!wantState && !plan.length) { Sync.dirty = false; if (!opt.silent) syncStatus('synced'); return; }

  Sync.flushing = true;
  Sync.dirty = false;
  if (!opt.silent) syncStatus('sending');

  var i = 0;
  function step() {
    if (i >= plan.length) {
      if (wantState) {
        /* профиль и статистика уезжают одним запросом */
        var wasProf = pstr !== Sync.sentProfile, wasStats = sstr !== Sync.sentStats;
        syncPutState(
          wasProf ? { data: profileOf(state), updated: Date.now() } : null,
          wasStats ? normalizeStats(state.stats) : null
        ).then(function () {
          if (wasProf) Sync.sentProfile = pstr;
          if (wasStats) Sync.sentStats = sstr;
          done(true);
        }).catch(function (e) { fail(e) });
      } else done(true);
      return;
    }
    var op = plan[i++];
    var req = op.t === 'book' ? syncPutBook(op.b)
      : op.t === 'del' ? syncDelBook(op.id)
      : Promise.resolve();
    req.then(function (r) {
      if (r === 'stale') { Sync.staleHit = true; return step(); }
      step();
    }).catch(function (e) { fail(e) });
  }
  function done() {
    Sync.flushing = false; Sync.fails = 0;
    if (!opt.silent) syncStatus('synced');
    if (Sync.dirty) { clearTimeout(Sync.timer); Sync.timer = setTimeout(function () { Sync.flush() }, 400); }
    if (Sync.staleHit) { Sync.staleHit = false; setTimeout(function () { Sync.pull().then(function () { Sync.flush() }) }, 600); }
  }
  function fail() {
    Sync.flushing = false; Sync.fails++;
    syncStatus('offline');
    clearTimeout(Sync.timer);
    var backoff = Math.min(30000, 3000 * Sync.fails);
    Sync.timer = setTimeout(function () { Sync.flush() }, backoff);
  }
  step();
};

/* ---------- вход со стороны приложения ---------- */
Sync.markDirty = function () {
  if (Sync.mode !== 'server') return;
  Sync.dirty = true;
  clearTimeout(Sync.timer);
  Sync.timer = setTimeout(function () { Sync.flush() }, 1500);
};

Sync.afterStart = function () {
  if (Sync.mode !== 'server') return Promise.resolve();
  return Sync.pull().then(function () {
    if (typeof syncStatus === 'function' && Sync.pulled) syncStatus('synced');
    Sync.flush({ silent: true });
  });
};

addEventListener('online', function () { Sync.fails = 0; Sync.flush() });
addEventListener('beforeunload', function () {
  if (Sync.mode === 'server' && (Sync.dirty || Sync.timer)) {
    try { Sync.flush({ silent: true }) } catch (e) {}
  }
});
