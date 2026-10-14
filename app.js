/* Малыш — дневник новорождённого для Telegram.
   Без сервера: записи лежат в localStorage и в Telegram CloudStorage,
   поэтому синхронизируются между всеми устройствами одного аккаунта. */
(() => {
'use strict';

const BOT_URL = ''; // ссылка на бота — попадает в «Отправить сводку»

const tg = window.Telegram && window.Telegram.WebApp;
const IN_TG = !!(tg && tg.initData);
const ver = v => { try { return IN_TG && tg.isVersionAtLeast(v); } catch (e) { return false; } };

const haptic = {
  tap()  { try { ver('6.1') && tg.HapticFeedback.impactOccurred('light'); } catch (e) {} },
  soft() { try { ver('6.1') && tg.HapticFeedback.impactOccurred('soft'); } catch (e) {} },
  ok()   { try { ver('6.1') && tg.HapticFeedback.notificationOccurred('success'); } catch (e) {} },
  warn() { try { ver('6.1') && tg.HapticFeedback.notificationOccurred('warning'); } catch (e) {} },
  sel()  { try { ver('6.1') && tg.HapticFeedback.selectionChanged(); } catch (e) {} },
};

/* ——— Утилиты ——— */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const uid = () => Date.now().toString(36).slice(-5) + Math.random().toString(36).slice(2, 6);
const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
const MIN = 6e4, HOUR = 36e5, DAY = 864e5;
const now = () => Date.now();
const pad = n => String(n).padStart(2, '0');

function startOfDay(t) { const d = new Date(t); d.setHours(0, 0, 0, 0); return d.getTime(); }
function addDays(t, n) { const d = new Date(t); d.setDate(d.getDate() + n); return d.getTime(); }
function dayKey(t) { const d = new Date(t); return 'd' + d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()); }
function keyStart(k) { return new Date(+k.slice(1, 5), +k.slice(5, 7) - 1, +k.slice(7, 9)).getTime(); }
function hm(t) { const d = new Date(t); return pad(d.getHours()) + ':' + pad(d.getMinutes()); }
function toLocalInput(t) { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`; }
function fromLocalInput(s) { const m = /^(\d{4})-(\d\d)-(\d\d)T(\d\d):(\d\d)/.exec(s || ''); return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]).getTime() : NaN; }
function toDateInput(t) { const d = new Date(t); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; }
function fromDateInput(s) { const m = /^(\d{4})-(\d\d)-(\d\d)/.exec(s || ''); return m ? new Date(+m[1], m[2] - 1, +m[3]).getTime() : 0; }

const MON = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
const WDAY = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
const WD2 = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
function plural(n, f) { n = Math.abs(n) % 100; const n1 = n % 10; if (n > 10 && n < 20) return f[2]; if (n1 > 1 && n1 < 5) return f[1]; if (n1 === 1) return f[0]; return f[2]; }
const times = n => n + ' ' + plural(n, ['раз', 'раза', 'раз']);
const dateLong = t => { const d = new Date(t); return d.getDate() + ' ' + MON[d.getMonth()]; };
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function dayName(t) {
  const k = dayKey(t);
  if (k === dayKey(now())) return 'Сегодня';
  if (k === dayKey(addDays(now(), -1))) return 'Вчера';
  return cap(WDAY[new Date(t).getDay()]) + ', ' + dateLong(t);
}
function whenText(t) {
  const k = dayKey(t);
  if (k === dayKey(now())) return 'в ' + hm(t);
  if (k === dayKey(addDays(now(), -1))) return 'вчера в ' + hm(t);
  return dateLong(t) + ' в ' + hm(t);
}
const fmt1 = v => (Math.round(v * 10) / 10).toFixed(1).replace('.', ',');
const grams = g => Math.round(g).toLocaleString('ru-RU');
const num = s => parseFloat(String(s == null ? '' : s).replace(',', '.').replace(/\s/g, ''));

function fmtDur(ms) {
  const m = Math.max(0, Math.floor(ms / MIN));
  if (m < 1) return 'меньше минуты';
  const h = Math.floor(m / 60), r = m % 60;
  if (!h) return r + ' мин';
  return r ? `${h} ч ${r} мин` : `${h} ч`;
}
const fmtMins = ms => Math.max(1, Math.round(ms / MIN)) + ' мин';
function fmtClock(ms) {
  const s = Math.max(0, Math.floor(ms / 1000)), h = Math.floor(s / 3600), m = Math.floor(s % 3600 / 60), x = s % 60;
  return h ? `${h}:${pad(m)}:${pad(x)}` : `${m}:${pad(x)}`;
}
function durHTML(ms) {
  const m = Math.max(0, Math.floor(ms / MIN));
  if (m >= 48 * 60) { const d = Math.floor(m / 1440); return `${d}<i>${plural(d, ['день', 'дня', 'дней'])}</i>`; }
  const h = Math.floor(m / 60), r = m % 60;
  if (!h) return `${r}<i>мин</i>`;
  return `${h}<i>ч</i>${r ? `${r}<i>мин</i>` : ''}`;
}
const heroAgo = ms => ms < MIN ? '<span class="just">только что</span>' : durHTML(ms);

/* ——— Иконки ——— */
const I = {
  drop: '<path d="M12 3.6c3.1 3.7 5.6 7 5.6 10.1a5.6 5.6 0 0 1-11.2 0C6.4 10.6 8.9 7.3 12 3.6z"/>',
  bottle: '<path d="M10.4 5.6V4.4a1.6 1.6 0 0 1 3.2 0v1.2"/><path d="M8.8 5.6h6.4v2.6H8.8z"/><path d="M8.6 8.2h6.8V19a2.2 2.2 0 0 1-2.2 2.2h-2.4A2.2 2.2 0 0 1 8.6 19z"/><path d="M8.6 12.2h2.6M8.6 15.4h2.6"/>',
  diaper: '<path d="M3.8 6.8h16.4v2.6a8.2 8.2 0 0 1-16.4 0z"/><path d="M8.2 10.4c.9 2.1 2.2 3.2 3.8 3.2s2.9-1.1 3.8-3.2"/>',
  moon: '<path d="M19.6 14.6A7.8 7.8 0 1 1 9.4 4.4a6.2 6.2 0 0 0 10.2 10.2z"/>',
  plus: '<path d="M12 5.5v13M5.5 12h13"/>',
  pump: '<path d="M12 4.2c2.5 3 4.5 5.6 4.5 8.1a4.5 4.5 0 0 1-9 0c0-2.5 2-5.1 4.5-8.1z"/><path d="M5 20.4h14"/>',
  pill: '<path d="M5.2 18.8a3.6 3.6 0 0 1 0-5.1l8.5-8.5a3.6 3.6 0 0 1 5.1 5.1l-8.5 8.5a3.6 3.6 0 0 1-5.1 0z"/><path d="M9.4 9.4l5.2 5.2"/>',
  temp: '<path d="M14 14.6V5.2a2 2 0 0 0-4 0v9.4a4 4 0 1 0 4 0z"/><path d="M12 10v6.2"/>',
  bath: '<circle cx="9" cy="14.5" r="4.8"/><circle cx="17.2" cy="7.6" r="2.6"/><circle cx="18.2" cy="15.8" r="1.4"/>',
  sun: '<circle cx="12" cy="12" r="3.8"/><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6 7 7M17 17l1.4 1.4M5.6 18.4 7 17M17 7l1.4-1.4"/>',
  note: '<path d="M4.5 19.5h3.8L19 8.8a2.7 2.7 0 0 0-3.8-3.8L4.5 15.7z"/><path d="M13.8 6.4l3.8 3.8"/>',
  today: '<path d="M18.8 14.2A7.4 7.4 0 1 1 9.8 5.2"/><path d="M14.5 4.2a5.5 5.5 0 0 1 5.3 5.3"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/>',
  log: '<path d="M5 6.5h14M5 12h14M5 17.5h8.5"/>',
  wave: '<path d="M2.8 12c1.5-3.2 3-3.2 4.6 0s3.1 3.2 4.6 0 3.1-3.2 4.6 0 3 3.2 4.6 0"/>',
  heart: '<path d="M12 19.6s-7.4-4.3-7.4-9.8A4.2 4.2 0 0 1 12 7.4a4.2 4.2 0 0 1 7.4 2.4c0 5.5-7.4 9.8-7.4 9.8z"/>',
  play: '<path d="M9 6.2v11.6l9.4-5.8z" fill="currentColor" stroke="none"/>',
  pause: '<path d="M8.5 6v12M15.5 6v12" stroke-width="2.6"/>',
  chev: '<path d="M9.5 6l6 6-6 6"/>',
  share: '<path d="M12 14.5V4M8.2 7.6 12 3.8l3.8 3.8"/><path d="M5.5 11.5v7A1.5 1.5 0 0 0 7 20h10a1.5 1.5 0 0 0 1.5-1.5v-7"/>',
  dirty: '<circle cx="12" cy="12" r="7.4"/><circle cx="9.6" cy="10.4" r="1.1" fill="currentColor"/><circle cx="14.2" cy="11.4" r="1.4" fill="currentColor"/><circle cx="11.4" cy="14.6" r="1" fill="currentColor"/>',
  both: '<path d="M12 3.6c3.1 3.7 5.6 7 5.6 10.1a5.6 5.6 0 0 1-11.2 0C6.4 10.6 8.9 7.3 12 3.6z"/><circle cx="11" cy="14.4" r="1.2" fill="currentColor"/><circle cx="13.8" cy="12.4" r=".9" fill="currentColor"/>',
};
const svg = (name, size = 22) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${I[name]}</svg>`;
const half = (side, size = 20) => `<svg width="${size}" height="${size}" viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.6"/><path d="${side === 'L' ? 'M12 4a8 8 0 0 0 0 16z' : 'M12 4a8 8 0 0 1 0 16z'}" fill="currentColor"/></svg>`;

/* ——— Типы записей ——— */
const T = {
  bf: { name: 'Грудь', icon: 'drop', c: '--c-bf' },
  bt: { name: 'Бутылочка', icon: 'bottle', c: '--c-bt' },
  pm: { name: 'Сцеживание', icon: 'pump', c: '--c-pm' },
  dp: { name: 'Подгузник', icon: 'diaper', c: '--c-dp' },
  sl: { name: 'Сон', icon: 'moon', c: '--c-sl' },
  md: { name: 'Лекарство', icon: 'pill', c: '--c-ot' },
  tp: { name: 'Температура', icon: 'temp', c: '--c-ot' },
  bh: { name: 'Купание', icon: 'bath', c: '--c-ot' },
  wk: { name: 'Прогулка', icon: 'sun', c: '--c-ot' },
  nt: { name: 'Заметка', icon: 'note', c: '--c-ot' },
};
const SIDE = { L: 'левая', R: 'правая', B: 'обе' };
const DPK = { w: 'мокрый', d: 'грязный', m: 'мокрый и грязный' };

/* ——— Хранилище ——— */
const LS = 'malysh.v1';
const store = {
  profile: { name: '', birth: 0, bw: 0, bh: 0, u: 0 },
  settings: { theme: 'auto', onb: 0, u: 0 },
  active: { bf: null, sl: null, u: 0 },
  events: new Map(),
  growth: new Map(),
};

function loadLocal() {
  try {
    const d = JSON.parse(localStorage.getItem(LS) || 'null');
    if (!d) return;
    Object.assign(store.profile, d.p || {});
    Object.assign(store.settings, d.s || {});
    Object.assign(store.active, d.a || {});
    (d.e || []).forEach(e => store.events.set(e.i, e));
    (d.g || []).forEach(g => store.growth.set(g.i, g));
  } catch (e) {}
}
function saveLocal() {
  try {
    localStorage.setItem(LS, JSON.stringify({
      v: 1, p: store.profile, s: store.settings, a: store.active,
      e: Array.from(store.events.values()), g: Array.from(store.growth.values()),
    }));
  } catch (e) {}
}

const dirty = new Set();
function touch(key) { dirty.add(key); saveLocal(); Cloud.schedule(); }
function touchActive() { store.active.u = now(); touch('a'); }

function bucketValue(key) {
  if (key === 'p') return JSON.stringify(store.profile);
  if (key === 's') return JSON.stringify(store.settings);
  if (key === 'a') return JSON.stringify(store.active);
  if (key === 'g') { const a = Array.from(store.growth.values()); return a.length ? JSON.stringify(a) : ''; }
  const arr = Array.from(store.events.values()).filter(e => dayKey(e.s) === key).sort((a, b) => a.s - b.s);
  return arr.length ? JSON.stringify(arr) : '';
}

/* Telegram CloudStorage: 1024 ключа по 4096 символов. Каждый день — свой ключ,
   длинные значения режем на куски key, key_1, key_2… */
const CHUNK = 3900;
const Cloud = {
  ok: IN_TG && ver('6.9') && !!tg.CloudStorage,
  keys: new Set(),
  timer: 0, busy: false, again: false, synced: false,
  call(method, ...args) {
    return new Promise((res, rej) => {
      try { tg.CloudStorage[method](...args, (err, val) => err ? rej(err) : res(val)); } catch (e) { rej(e); }
    });
  },
  schedule(delay = 700) {
    if (!this.ok) return;
    clearTimeout(this.timer);
    this.timer = setTimeout(() => this.push(), delay);
  },
  async push() {
    if (!this.ok) return;
    if (this.busy) { this.again = true; return; }
    this.busy = true;
    const keys = Array.from(dirty); dirty.clear();
    try {
      for (const k of keys) await this.write(k, bucketValue(k));
    } catch (e) {
      keys.forEach(k => dirty.add(k));
      this.schedule(5000);
    }
    this.busy = false;
    if (this.again) { this.again = false; this.push(); }
  },
  async write(base, value) {
    const parts = [];
    for (let i = 0; i < value.length; i += CHUNK) parts.push(value.slice(i, i + CHUNK));
    const names = parts.map((_, i) => i ? base + '_' + i : base);
    for (let i = 0; i < parts.length; i++) { await this.call('setItem', names[i], parts[i]); this.keys.add(names[i]); }
    const stale = Array.from(this.keys).filter(k => (k === base || k.startsWith(base + '_')) && !names.includes(k));
    if (stale.length) { await this.call('removeItems', stale); stale.forEach(k => this.keys.delete(k)); }
  },
  async pull() {
    const keys = (await this.call('getKeys')) || [];
    this.keys = new Set(keys);
    const vals = {};
    for (let i = 0; i < keys.length; i += 30) Object.assign(vals, await this.call('getItems', keys.slice(i, i + 30)));
    const groups = {};
    keys.forEach(k => {
      const m = /^(.*?)(?:_(\d+))?$/.exec(k);
      (groups[m[1]] = groups[m[1]] || [])[+(m[2] || 0)] = vals[k] || '';
    });
    const raw = {};
    Object.keys(groups).forEach(b => { raw[b] = groups[b].join(''); });
    return raw;
  },
};

function mergeInto(map, item) {
  if (!item || !item.i) return;
  const cur = map.get(item.i);
  if (!cur || (item.u || 0) > (cur.u || 0)) map.set(item.i, item);
}
const parse = s => { try { return JSON.parse(s); } catch (e) { return null; } };

async function syncCloud() {
  if (!Cloud.ok) return;
  try {
    const raw = await Cloud.pull();
    const p = raw.p && parse(raw.p), s = raw.s && parse(raw.s), a = raw.a && parse(raw.a);
    if (p && (p.u || 0) > (store.profile.u || 0)) store.profile = Object.assign({}, store.profile, p);
    if (s && (s.u || 0) > (store.settings.u || 0)) store.settings = Object.assign({}, store.settings, s);
    if (a && (a.u || 0) > (store.active.u || 0)) store.active = Object.assign({ bf: null, sl: null }, a);
    (parse(raw.g || '[]') || []).forEach(x => mergeInto(store.growth, x));
    const days = Object.keys(raw).filter(b => /^d\d{8}$/.test(b));
    days.forEach(b => (parse(raw[b]) || []).forEach(e => mergeInto(store.events, e)));
    changed();
    const buckets = new Set(['p', 's', 'a', 'g'].concat(days));
    store.events.forEach(e => buckets.add(dayKey(e.s)));
    buckets.forEach(b => { if ((raw[b] || '') !== bucketValue(b)) dirty.add(b); });
    Cloud.synced = true;
    saveLocal();
    if (!Sheet.cur) render();
    Cloud.schedule(200);
  } catch (e) { /* офлайн — попробуем при следующем открытии */ }
}

/* ——— Записи ——— */
let liveCache = null;
function live() {
  if (!liveCache) liveCache = Array.from(store.events.values()).filter(e => !e.x);
  return liveCache;
}
function changed() { liveCache = null; }
function addEvent(ev) {
  ev.i = ev.i || uid(); ev.u = now();
  store.events.set(ev.i, ev); changed(); touch(dayKey(ev.s));
  return ev;
}
function updateEvent(id, patch) {
  const old = store.events.get(id); if (!old) return;
  const ev = Object.assign({}, old, patch, { i: id, u: now() });
  store.events.set(id, ev); changed();
  touch(dayKey(old.s)); touch(dayKey(ev.s));
}
function deleteEvent(id) {
  const old = store.events.get(id); if (!old) return;
  store.events.set(id, { i: id, s: old.s, x: 1, u: now() }); changed(); touch(dayKey(old.s));
}
function restoreEvent(ev) {
  const e = Object.assign({}, ev, { u: now() }); delete e.x;
  store.events.set(e.i, e); changed(); touch(dayKey(e.s));
}

function lastOf(types) {
  let best = null;
  for (const e of live()) if (types.includes(e.t) && (!best || e.s > best.s)) best = e;
  return best;
}
function inRange(a, b) { return live().filter(e => e.s >= a && e.s < b).sort((x, y) => y.s - x.s); }
function bfSides(e) {
  const r = { L: 0, R: 0 };
  (e.g || []).forEach(([s, x, y]) => { if (r[s] != null) r[s] += Math.max(0, (y || now()) - x); });
  return r;
}
const bfTotal = e => { const s = bfSides(e); return s.L + s.R; };
function sidesText(e) {
  const s = bfSides(e), order = [];
  (e.g || []).forEach(([side]) => { if (!order.includes(side) && s[side] >= 30000) order.push(side); });
  if (!order.length) (e.g || []).forEach(([side]) => { if (!order.includes(side) && s[side] > 0) order.push(side); });
  if (!order.length) return '';
  if (order.length === 1) return `${SIDE[order[0]]}, ${fmtMins(s[order[0]])}`;
  return order.map(k => `${SIDE[k]} ${fmtMins(s[k])}`).join(' · ');
}
function evTitle(e) { return e.t === 'md' ? (e.m || 'Лекарство') : T[e.t].name; }
function evDetail(e) {
  let d = '';
  switch (e.t) {
    case 'bf': d = sidesText(e); break;
    case 'bt': d = `${e.v || 0} мл ${e.k === 'm' ? 'сцеженного' : 'смеси'}`; break;
    case 'pm': d = `${e.v || 0} мл` + (e.k ? ' · ' + SIDE[e.k] : ''); break;
    case 'dp': d = DPK[e.k] || ''; break;
    case 'sl': d = fmtDur((e.e || now()) - e.s) + ' · до ' + hm(e.e || now()); break;
    case 'tp': d = fmt1(e.v) + ' °C'; break;
    case 'wk': d = fmtDur((e.e || e.s) - e.s); break;
    case 'md': case 'nt': return e.n || '';
  }
  return e.n ? (d ? d + ' · ' : '') + e.n : d;
}

function suggestSide() {
  const a = store.active.bf;
  if (a) return null;
  const last = lastOf(['bf']);
  if (!last || !last.g || !last.g.length) return null;
  const s = bfSides(last);
  const used = ['L', 'R'].filter(k => s[k] > 30000);
  const lastSide = last.g[last.g.length - 1][0];
  // одна грудь — предлагаем другую; обе — ту, на которой закончили
  if (used.length === 1) return used[0] === 'L' ? 'R' : 'L';
  return lastSide;
}

function activeSides() {
  const r = { L: 0, R: 0 }, a = store.active.bf;
  if (!a) return r;
  const t = now();
  a.g.forEach(([s, x, y]) => { r[s] += Math.max(0, (y || t) - x); });
  return r;
}

function dayStats(a, b) {
  const evs = live().filter(e => e.s >= a && e.s < b);
  const bf = evs.filter(e => e.t === 'bf'), bt = evs.filter(e => e.t === 'bt'), dp = evs.filter(e => e.t === 'dp');
  let sleep = 0, naps = 0;
  live().forEach(e => {
    if (e.t !== 'sl') return;
    const s = Math.max(e.s, a), en = Math.min(e.e || e.s, b);
    if (en > s) { sleep += en - s; if (e.s >= a) naps++; }
  });
  const as = store.active.sl;
  if (as) { const s = Math.max(as.s, a), en = Math.min(now(), b); if (en > s) sleep += en - s; }
  return {
    feeds: bf.length + bt.length, bfN: bf.length, btN: bt.length,
    breast: bf.reduce((s, e) => s + bfTotal(e), 0),
    ml: bt.reduce((s, e) => s + (+e.v || 0), 0),
    sleep, naps,
    diapers: dp.length,
    wet: dp.filter(e => e.k === 'w' || e.k === 'm').length,
    dirty: dp.filter(e => e.k === 'd' || e.k === 'm').length,
  };
}

function feedInterval() {
  const starts = live().filter(e => (e.t === 'bf' || e.t === 'bt') && e.s > now() - DAY).map(e => e.s).sort((a, b) => a - b);
  if (starts.length < 3) return 0;
  const gaps = [];
  for (let i = 1; i < starts.length; i++) { const g = starts[i] - starts[i - 1]; if (g > 25 * MIN) gaps.push(g); }
  if (gaps.length < 2) return 0;
  const g = gaps.slice(-5).sort((a, b) => a - b);
  return g[Math.floor(g.length / 2)];
}

/* ——— Возраст и ориентиры ——— */
function ageDays() {
  const b = store.profile.birth;
  if (!b) return null;
  return Math.max(0, Math.round((startOfDay(now()) - startOfDay(b)) / DAY));
}
const NOM = { d: ['день', 'дня', 'дней'], w: ['неделя', 'недели', 'недель'], m: ['месяц', 'месяца', 'месяцев'], y: ['год', 'года', 'лет'] };
const GEN = { d: ['дня', 'дней'], w: ['недели', 'недель'], m: ['месяца', 'месяцев'], y: ['года', 'лет'] };
function ageParts() {
  const d = ageDays();
  if (d == null) return null;
  if (d < 14) return [[d, 'd']];
  if (d < 56) { const w = Math.floor(d / 7), r = d % 7; return r ? [[w, 'w'], [r, 'd']] : [[w, 'w']]; }
  const b = new Date(store.profile.birth), n = new Date();
  let m = (n.getFullYear() - b.getFullYear()) * 12 + n.getMonth() - b.getMonth();
  if (n.getDate() < b.getDate()) m--;
  if (m < 24) {
    const anchor = new Date(b); anchor.setMonth(b.getMonth() + m);
    const r = Math.round((startOfDay(n) - startOfDay(anchor)) / DAY);
    return r > 0 ? [[m, 'm'], [r, 'd']] : [[m, 'm']];
  }
  return [[Math.floor(m / 12), 'y']];
}
function ageText() {
  const p = ageParts();
  if (!p) return '';
  if (p[0][0] === 0) return 'первый день';
  return p.map(([n, u]) => `${n} ${plural(n, NOM[u])}`).join(' и ');
}
function ageFor() {
  const p = ageParts();
  if (!p) return '';
  if (p[0][0] === 0) return 'для первого дня';
  return 'для ' + p.map(([n, u]) => `${n} ${n % 10 === 1 && n % 100 !== 11 ? GEN[u][0] : GEN[u][1]}`).join(' и ');
}
function norms(d) {
  return {
    feeds: d < 60 ? '8–12' : d < 120 ? '7–9' : d < 180 ? '6–8' : '4–6',
    vol: d < 3 ? '5–30 мл' : d < 7 ? '30–60 мл' : d < 14 ? '60–90 мл' : d < 30 ? '60–120 мл' : d < 60 ? '90–150 мл' : d < 120 ? '120–180 мл' : d < 180 ? '150–210 мл' : '180–240 мл',
    sleep: d < 120 ? '14–17 ч' : d < 365 ? '12–15 ч' : '11–14 ч',
    wake: wakeWindow(d),
    wet: d >= 5 ? 6 : d + 1,
    gain: d < 14 ? null : d < 90 ? '150–250 г' : d < 180 ? '100–150 г' : '50–100 г',
  };
}
function wakeWindow(d) {
  if (d == null) return null;
  return d < 28 ? [35, 60] : d < 60 ? [60, 90] : d < 120 ? [75, 120] : d < 180 ? [90, 150] : d < 270 ? [120, 180] : d < 365 ? [150, 240] : [180, 300];
}
function wakeText(w) {
  if (w[1] <= 120) return `${w[0]}–${w[1]} мин`;
  const h = m => String(m / 60).replace('.', ',');
  return `${h(w[0])}–${h(w[1])} ч`;
}

/* ——— Тема ——— */
function resolveTheme() {
  const t = store.settings.theme;
  if (t === 'light' || t === 'dark') return t;
  if (IN_TG) return tg.colorScheme === 'dark' ? 'dark' : 'light';
  return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
}
function applyTheme() {
  const th = resolveTheme();
  document.documentElement.dataset.theme = th;
  const bg = th === 'dark' ? '#1b1512' : '#f6efe6';
  const meta = $('meta[name="theme-color"]'); if (meta) meta.content = bg;
  if (IN_TG) {
    try {
      if (ver('6.9')) { tg.setHeaderColor(bg); tg.setBackgroundColor(bg); }
      if (ver('7.10')) tg.setBottomBarColor(th === 'dark' ? '#1d1714' : '#f3ebe1');
    } catch (e) {}
  }
}

/* ——— Белый шум (Web Audio, всё синтезируется на лету) ——— */
const SOUNDS = [
  { id: 'soft', name: 'Мягкий шум', desc: 'Ровный гул, как у вентилятора' },
  { id: 'shh', name: 'Шшш', desc: 'Ритмичное шиканье, как на руках у мамы' },
  { id: 'sea', name: 'Прибой', desc: 'Медленные волны накатывают и уходят' },
  { id: 'womb', name: 'Утроба', desc: 'Приглушённый гул и сердцебиение' },
];
const Noise = {
  ctx: null, out: null, bus: null, nodes: [], cache: {},
  playing: false, fading: false, endAt: 0,
  kind: 'soft', vol: .5, timerMin: 30,
  load() {
    try {
      const s = JSON.parse(localStorage.getItem('malysh.noise') || '{}');
      if (SOUNDS.some(x => x.id === s.kind)) this.kind = s.kind;
      if (typeof s.vol === 'number') this.vol = clamp(s.vol, 0, 1);
      if (typeof s.timerMin === 'number') this.timerMin = s.timerMin;
    } catch (e) {}
  },
  save() { try { localStorage.setItem('malysh.noise', JSON.stringify({ kind: this.kind, vol: this.vol, timerMin: this.timerMin })); } catch (e) {} },
  ensure() {
    if (this.ctx) return true;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return false;
    this.ctx = new AC();
    this.out = this.ctx.createGain();
    this.out.gain.value = 0;
    this.out.connect(this.ctx.destination);
    return true;
  },
  noise(type) {
    if (this.cache[type]) return this.cache[type];
    const c = this.ctx, sr = c.sampleRate, len = Math.floor(sr * 8), X = Math.floor(sr * .5);
    const buf = c.createBuffer(2, len, sr);
    for (let ch = 0; ch < 2; ch++) {
      const tmp = new Float32Array(len + X);
      let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
      for (let i = 0; i < len + X; i++) {
        const w = Math.random() * 2 - 1;
        if (type === 'white') tmp[i] = w * .5;
        else if (type === 'pink') {
          b0 = .99886 * b0 + w * .0555179; b1 = .99332 * b1 + w * .0750759; b2 = .969 * b2 + w * .153852;
          b3 = .8665 * b3 + w * .3104856; b4 = .55 * b4 + w * .5329522; b5 = -.7616 * b5 - w * .016898;
          tmp[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * .5362) * .11; b6 = w * .115926;
        } else { last = (last + .02 * w) / 1.02; tmp[i] = last * 3.5; }
      }
      // бесшовная петля: начало буфера плавно перетекает из продолжения его конца
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = tmp[i];
      for (let i = 0; i < X; i++) { const a = i / X; d[i] = tmp[i] * Math.sqrt(a) + tmp[len + i] * Math.sqrt(1 - a); }
    }
    return (this.cache[type] = buf);
  },
  heart() {
    if (this.cache.heart) return this.cache.heart;
    const c = this.ctx, sr = c.sampleRate, len = Math.floor(sr * 60 / 66);
    const buf = c.createBuffer(1, len, sr), d = buf.getChannelData(0);
    const thump = (t0, amp, f0, dec) => {
      const s0 = Math.floor(t0 * sr); let ph = 0;
      for (let i = 0; i < sr * .3 && s0 + i < len; i++) {
        const t = i / sr;
        const env = (1 - Math.exp(-t * 120)) * Math.exp(-t / dec);
        ph += 2 * Math.PI * f0 * (1 - .4 * Math.min(1, t / .12)) / sr;
        d[s0 + i] += amp * env * Math.sin(ph);
      }
    };
    thump(0, .95, 62, .07);
    thump(.3, .6, 70, .055);
    return (this.cache.heart = buf);
  },
  build(kind) {
    const c = this.ctx, t = c.currentTime, nodes = [];
    const link = (...n) => { for (let i = 0; i < n.length - 1; i++) n[i].connect(n[i + 1]); };
    const src = buf => { const s = c.createBufferSource(); s.buffer = buf; s.loop = true; s.start(t, Math.random() * buf.duration * .9); nodes.push(s); return s; };
    const filt = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    const gain = v => { const g = c.createGain(); g.gain.value = v; return g; };
    const lfo = (hz, depth, param) => { const o = c.createOscillator(); o.frequency.value = hz; const g = gain(depth); link(o, g, param); o.start(t); nodes.push(o); };
    const bus = gain(1); bus.connect(this.out); nodes.push(bus);
    if (kind === 'soft') {
      link(src(this.noise('pink')), filt('lowpass', 5200, .5), gain(.9), bus);
    } else if (kind === 'shh') {
      const g = gain(.7); lfo(.72, .42, g.gain);
      link(src(this.noise('white')), filt('bandpass', 2400, .55), g, bus);
      link(src(this.noise('pink')), gain(.22), bus);
    } else if (kind === 'sea') {
      const lp = filt('lowpass', 650, .4); lfo(.085, 380, lp.frequency);
      const g = gain(.85); lfo(.085, .35, g.gain);
      link(src(this.noise('brown')), lp, g, bus);
      const g2 = gain(.07); lfo(.085, .06, g2.gain);
      link(src(this.noise('pink')), filt('highpass', 1800, .5), g2, bus);
    } else {
      link(src(this.noise('brown')), filt('lowpass', 320, .5), gain(1.05), bus);
      link(src(this.heart()), filt('lowpass', 170, .7), gain(1.7), bus);
    }
    this.bus = bus;
    return nodes;
  },
  level() { return Math.pow(this.vol, 2) * .9; },
  ramp(to, sec) {
    const g = this.out.gain, t = this.ctx.currentTime;
    g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(to, t + sec);
  },
  play() {
    if (!this.ensure()) { toast('Этот браузер не умеет воспроизводить шум'); return; }
    try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (e) {}
    this.ctx.resume();
    this.kill(this.nodes);
    this.nodes = this.build(this.kind);
    this.ramp(this.level(), 1.5);
    this.playing = true; this.fading = false;
    this.endAt = this.timerMin ? now() + this.timerMin * MIN : 0;
  },
  stop(fade = .5) {
    if (!this.ctx) return;
    this.ramp(0, fade);
    const old = this.nodes; this.nodes = [];
    setTimeout(() => this.kill(old), fade * 1000 + 100);
    this.playing = false; this.endAt = 0; this.fading = false;
  },
  kill(list) { list.forEach(n => { try { n.stop && n.stop(); } catch (e) {} try { n.disconnect(); } catch (e) {} }); },
  setKind(k) {
    this.kind = k; this.save();
    if (!this.playing) return;
    const old = this.nodes, oldBus = this.bus, t = this.ctx.currentTime;
    oldBus.gain.setValueAtTime(1, t); oldBus.gain.linearRampToValueAtTime(0, t + .6);
    setTimeout(() => this.kill(old), 700);
    this.nodes = this.build(k);
    this.bus.gain.setValueAtTime(0, t); this.bus.gain.linearRampToValueAtTime(1, t + .9);
  },
  setVol(v) {
    this.vol = v; this.save();
    if (this.playing && !this.fading) { const g = this.out.gain; g.cancelScheduledValues(this.ctx.currentTime); g.setTargetAtTime(this.level(), this.ctx.currentTime, .08); }
  },
  setTimer(m) {
    this.timerMin = m; this.save();
    if (this.playing) {
      this.endAt = m ? now() + m * MIN : 0;
      if (this.fading) { this.fading = false; this.ramp(this.level(), 1); }
    }
  },
  tick() {
    if (!this.playing || !this.endAt) return;
    const left = this.endAt - now();
    if (left <= 20000 && !this.fading) { this.fading = true; this.ramp(0, Math.max(.5, left / 1000)); }
    if (left <= 0) { this.stop(.2); if (ui.tab === 'noise' && !Sheet.cur) render(); }
  },
  wake() { if (this.playing && this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); },
};
function noiseCaption() {
  if (!Noise.playing) return 'Нажмите, чтобы включить';
  if (!Noise.endAt) return 'Играет, пока не выключите';
  return 'Выключится через ' + fmtClock(Noise.endAt - now());
}

/* ——— Интерфейс ——— */
const ui = { tab: 'today', day: dayKey(now()), weeks: 1, renderedDay: '' };

function needsOnboarding() { return !store.settings.onb && !store.profile.name; }
const babyName = () => store.profile.name || 'Малыш';

function render(enter) {
  applyTheme();
  const app = $('#app');
  ui.renderedDay = dayKey(now());
  if (needsOnboarding()) {
    $('#nav').hidden = true;
    app.className = 'app';
    app.style.padding = '0';
    app.innerHTML = viewOnboard();
    return;
  }
  app.style.padding = '';
  $('#nav').hidden = false;
  renderNav();
  const views = { today: viewToday, log: viewLog, noise: viewNoise, help: viewHelp };
  if (!enter) { clearTimeout(render.t); app.classList.remove('enter'); }
  app.innerHTML = (views[ui.tab] || viewToday)();
  if (enter) {
    app.classList.remove('enter');
    Array.from(app.children).forEach((c, i) => c.style.setProperty('--i', i));
    void app.offsetWidth;
    app.classList.add('enter');
    clearTimeout(render.t);
    render.t = setTimeout(() => app.classList.remove('enter'), 1400);
  }
  tick();
}

function renderNav() {
  const tabs = [['today', 'today', 'Сегодня'], ['log', 'log', 'Дневник'], ['noise', 'wave', 'Шум'], ['help', 'heart', 'Полезное']];
  $('#nav-in').innerHTML = tabs.map(([id, ic, l]) =>
    `<button type="button" data-act="tab" data-tab="${id}"${ui.tab === id ? ' aria-current="page"' : ''}>${svg(ic, 23)}<span>${l}</span></button>`).join('');
}

/* Сегодня */
function viewToday() {
  const today = startOfDay(now());
  const st = dayStats(today, addDays(today, 1));
  const age = ageText();
  const d = new Date();
  return `
  <header class="top">
    <div>
      <h1 class="baby">${esc(babyName())}</h1>
      <p class="age">${age ? esc(age) + ' · ' : ''}${WDAY[d.getDay()]}, ${dateLong(d)}</p>
    </div>
    <button type="button" class="avatar" data-act="settings" aria-label="Настройки">${esc((babyName()[0] || 'М').toUpperCase())}</button>
  </header>
  ${heroHTML()}
  ${tilesHTML()}
  ${sleepCardHTML() || wakeHTML()}
  <section class="sec">
    <div class="sec-h"><h2>За сегодня</h2></div>
    ${statsHTML(st)}
  </section>
  <section class="sec">
    <div class="sec-h"><h2>Лента</h2><span>нажмите на запись, чтобы изменить</span></div>
    ${feedList(inRange(today, addDays(today, 1)))}
  </section>`;
}

function heroHTML() {
  const a = store.active.bf;
  if (a) {
    const s = activeSides(), cur = a.g[a.g.length - 1][0], paused = !!a.p;
    return `<section class="hero is-live${paused ? ' is-paused' : ''}">
      <div class="moon" aria-hidden="true"></div>
      <p class="kicker">${paused ? 'Кормление на паузе' : '<span class="pulse"></span>Идёт кормление'}</p>
      <p class="big" data-live="bf-total">${fmtClock(s.L + s.R)}</p>
      <p class="sub">началось ${whenText(a.g[0][1])} · нажмите на другую грудь, чтобы переключиться</p>
      <div class="sides">${['L', 'R'].map(k => `
        <button type="button" class="side${k === cur ? ' cur' : ''}${k === cur && !paused ? ' on' : ''}${paused ? ' paused' : ''}" data-act="bf-side" data-side="${k}"
          aria-label="${k === 'L' ? 'Левая' : 'Правая'} грудь${k === cur ? (paused ? ', продолжить' : ', поставить на паузу') : ', переключиться'}">
          <span class="side-top">${half(k)}${k === 'L' ? 'Левая' : 'Правая'}</span>
          <span class="side-time" data-live="bf-${k}">${fmtClock(s[k])}</span>
        </button>`).join('')}
      </div>
      <div class="live-actions">
        <button type="button" class="btn" data-act="bf-pause">${paused ? 'Продолжить' : 'Пауза'}</button>
        <button type="button" class="btn primary" data-act="bf-finish">Покормили</button>
      </div>
      <button type="button" class="link" data-act="bf-cancel">Сбросить без записи</button>
    </section>`;
  }
  const last = lastOf(['bf', 'bt']);
  const next = suggestSide();
  let top;
  if (last) {
    const what = last.t === 'bf' ? sidesText(last) : `бутылочка, ${last.v || 0} мл`;
    const iv = feedInterval();
    let hint = '';
    if (iv) {
      const at = last.s + iv;
      hint = at > now()
        ? `<p class="hint">обычный интервал ~${fmtDur(iv)} — следующее около ${hm(at)}</p>`
        : `<p class="hint">обычный интервал ~${fmtDur(iv)}</p>`;
    }
    top = `<p class="kicker">С начала кормления</p>
      <p class="big" data-live="ago" data-t="${last.s}">${heroAgo(now() - last.s)}</p>
      <p class="sub">${whenText(last.s)} · ${esc(what)}</p>${hint}`;
  } else {
    top = `<p class="kicker">Кормление</p>
      <p class="big"><span class="big--soft">Начнём?</span></p>
      <p class="sub">Нажмите на грудь, с которой начинаете, — пойдёт таймер. Переключаться можно в любой момент, он не собьётся, даже если закрыть приложение.</p>`;
  }
  return `<section class="hero">
    <div class="moon" aria-hidden="true"></div>
    ${top}
    <div class="sides">${['L', 'R'].map(k => `
      <button type="button" class="side${next === k ? ' next' : ''}" data-act="bf-side" data-side="${k}">
        <span class="side-top">${half(k)}${k === 'L' ? 'Левая' : 'Правая'}</span>
        <span class="side-note">${next === k ? 'следующая' : 'запустить таймер'}</span>
      </button>`).join('')}
    </div>
  </section>`;
}

function tilesHTML() {
  const sl = store.active.sl;
  return `<nav class="tiles" aria-label="Быстрые записи">
    <button type="button" class="tile" data-act="open" data-sheet="bt" style="--c:var(--c-bt)"><span class="ic">${svg('bottle')}</span>Бутылочка</button>
    <button type="button" class="tile" data-act="open" data-sheet="dp" style="--c:var(--c-dp)"><span class="ic">${svg('diaper')}</span>Подгузник</button>
    <button type="button" class="tile${sl ? ' on' : ''}" data-act="${sl ? 'sl-finish' : 'sl-start'}" style="--c:var(--c-sl)"><span class="ic">${svg('moon')}</span>${sl ? 'Проснулись' : 'Сон'}</button>
    <button type="button" class="tile" data-act="open" data-sheet="more" style="--c:var(--ink-2)"><span class="ic">${svg('plus')}</span>Ещё</button>
  </nav>`;
}

function sleepCardHTML() {
  const a = store.active.sl;
  if (!a) return '';
  return `<section class="live-card">
    <span class="ic" style="--c:var(--c-sl)">${svg('moon')}</span>
    <button type="button" class="lc-main" data-act="open" data-sheet="slActive" aria-label="Изменить начало сна">
      <p class="kicker">Спит</p>
      <p class="mid" data-live="sl">${durHTML(now() - a.s)}</p>
      <p class="lc-sub">с ${hm(a.s)} · изменить</p>
    </button>
    <button type="button" class="btn primary" data-act="sl-finish">Проснулись</button>
  </section>`;
}

function wakeHTML() {
  const ls = lastOf(['sl']);
  if (!ls || !ls.e || now() - ls.e > 10 * HOUR || ls.e > now()) return '';
  const w = wakeWindow(ageDays());
  return `<section class="wake">
    <div class="wake-row"><p>Не спит <b data-live="wake" data-t="${ls.e}">${fmtDur(now() - ls.e)}</b></p>${w ? `<small>ориентир ${wakeText(w)}</small>` : ''}</div>
    ${w ? `<div class="bar" data-live="wake-bar" data-t="${ls.e}" data-max="${w[1]}" data-min="${w[0]}"><span></span></div>
    <p class="wake-note" data-live="wake-note" data-t="${ls.e}" data-max="${w[1]}" data-min="${w[0]}"></p>` : ''}
  </section>`;
}
function wakeNote(el, t) {
  const m = (t - +el.dataset.t) / MIN, mn = +el.dataset.min, mx = +el.dataset.max;
  if (m >= mx) return ['Пора укладывать — окно бодрствования на исходе', true];
  if (m >= mn) return ['Присматривайтесь к признакам усталости: зевает, трёт глазки, капризничает', false];
  return ['', false];
}

function statsHTML(st) {
  return `<div class="stats">
    <div class="stat" style="--c:var(--c-bf)"><p class="lab">Кормления</p><b>${st.feeds}</b><span>${st.bfN ? 'у груди ' + fmtDur(st.breast) : 'грудью — пока нет'}</span></div>
    <div class="stat" style="--c:var(--c-bt)"><p class="lab">Бутылочка</p><b>${st.ml}<i>мл</i></b><span>${st.btN ? times(st.btN) : 'пока не было'}</span></div>
    <div class="stat" style="--c:var(--c-sl)"><p class="lab">Сон</p><b>${st.sleep >= MIN ? durHTML(st.sleep) : '0'}</b><span>${st.naps ? times(st.naps) : 'пока не было'}</span></div>
    <div class="stat" style="--c:var(--c-dp)"><p class="lab">Подгузники</p><b>${st.diapers}</b><span>${st.diapers ? `мокрых ${st.wet} · грязных ${st.dirty}` : 'пока не было'}</span></div>
  </div>`;
}

function feedList(evs, emptyText) {
  if (!evs.length) return `<p class="empty">${emptyText || 'Здесь появятся записи за день. Начните с кормления или подгузника — это одно касание.'}</p>`;
  return `<ol class="feed">${evs.map(e => `<li>
    <button type="button" class="ev" data-act="edit" data-id="${e.i}" style="--c:var(${T[e.t].c})">
      <time>${hm(e.s)}</time><span class="dot"></span>
      <span class="ev-b"><span class="ev-t">${esc(evTitle(e))}</span>${evDetail(e) ? `<span class="ev-d">${esc(evDetail(e))}</span>` : ''}</span>
    </button></li>`).join('')}</ol>`;
}

/* Дневник */
function viewLog() {
  const today = startOfDay(now());
  const n = ui.weeks * 7;
  const days = [];
  for (let i = 0; i < n; i++) days.push(addDays(today, -i));
  const sel = keyStart(ui.day), selEnd = addDays(sel, 1);
  const isToday = ui.day === dayKey(now());

  // средние за прошедшие дни недели, где есть записи
  const past = days.slice(1, 7).map(d => dayStats(d, addDays(d, 1))).filter(s => s.feeds || s.sleep || s.diapers);
  let week = '';
  if (past.length >= 2) {
    const avg = k => past.reduce((s, x) => s + x[k], 0) / past.length;
    week = `<p class="week">В среднем за ${past.length} ${plural(past.length, ['день', 'дня', 'дней'])}: <b>${Math.round(avg('feeds'))}</b> ${plural(Math.round(avg('feeds')), ['кормление', 'кормления', 'кормлений'])}, сон <b>${fmtDur(avg('sleep'))}</b>, подгузников <b>${Math.round(avg('diapers'))}</b></p>`;
  }

  return `
  <header class="page-h">
    <div class="moon" aria-hidden="true"></div>
    <h1>Дневник</h1>
    <p>Ритм дня по часам: видно, когда малыш спит, ест и как складывается режим.</p>
  </header>
  <section class="rh">
    <div class="rh-axis"><span></span><div class="ticks"><span style="left:0">0</span><span style="left:25%">6</span><span style="left:50%">12</span><span style="left:75%">18</span><span style="left:100%">24</span></div></div>
    ${days.map(rhythmRow).join('')}
    <div class="legend"><span style="--c:var(--c-sl)">сон</span><span style="--c:var(--c-bf)">грудь</span><span style="--c:var(--c-bt)">бутылочка</span><span style="--c:var(--c-dp)">подгузник</span></div>
    ${ui.weeks < 8 ? `<button type="button" class="ghost" data-act="more-weeks">Показать ещё неделю</button>` : ''}
    ${week}
  </section>
  <section class="sec">
    <div class="sec-h"><h2>${esc(dayName(sel))}</h2>${isToday ? '' : `<span>${WDAY[new Date(sel).getDay()]}</span>`}</div>
    ${statsHTML(dayStats(sel, selEnd))}
    <div style="margin-top:14px">${feedList(inRange(sel, selEnd), 'В этот день записей нет.')}</div>
    <button type="button" class="ghost" data-act="add-day">${svg('plus', 18)}Добавить запись за ${isToday ? 'сегодня' : dateLong(sel)}</button>
  </section>`;
}

function rhythmRow(d) {
  const a = d, b = addDays(d, 1), span = b - a, t = now();
  const pct = x => ((x - a) / span * 100).toFixed(2);
  const w = (x, y) => ((y - x) / span * 100).toFixed(2);
  let h = '<span class="gl" style="left:25%"></span><span class="gl" style="left:50%"></span><span class="gl" style="left:75%"></span>';
  const all = live();
  all.forEach(e => {
    if (e.t !== 'sl') return;
    const s = Math.max(e.s, a), en = Math.min(e.e || e.s, b);
    if (en > s) h += `<span class="rh-sl" style="left:${pct(s)}%;width:${w(s, en)}%"></span>`;
  });
  const as = store.active.sl;
  if (as) { const s = Math.max(as.s, a), en = Math.min(t, b); if (en > s) h += `<span class="rh-sl" style="left:${pct(s)}%;width:${w(s, en)}%"></span>`; }
  all.forEach(e => {
    if (e.s < a || e.s >= b) return;
    if (e.t === 'bf') h += `<span class="rh-bf" style="left:${pct(e.s)}%;width:${w(e.s, Math.min(e.e || e.s, b))}%"></span>`;
    else if (e.t === 'bt') h += `<span class="rh-bt" style="left:${pct(e.s)}%"></span>`;
    else if (e.t === 'dp') h += `<span class="rh-dp" style="left:${pct(e.s)}%"></span>`;
  });
  const ab = store.active.bf;
  if (ab && ab.g[0][1] >= a && ab.g[0][1] < b) h += `<span class="rh-bf" style="left:${pct(ab.g[0][1])}%;width:${w(ab.g[0][1], Math.min(t, b))}%"></span>`;
  if (t >= a && t < b) h += `<span class="rh-now" style="left:${pct(t)}%"></span>`;
  const k = dayKey(d), dt = new Date(d);
  return `<button type="button" class="rh-row${k === ui.day ? ' sel' : ''}" data-act="sel-day" data-day="${k}" aria-label="${esc(dayName(d))}"${k === ui.day ? ' aria-pressed="true"' : ''}>
    <span class="rh-lab"><b>${dt.getDate()}</b>${k === dayKey(t) ? 'сег.' : WD2[dt.getDay()]}</span>
    <span class="rh-track">${h}</span>
  </button>`;
}

/* Шум */
function viewNoise() {
  const N = Noise;
  return `
  <header class="page-h">
    <div class="moon" aria-hidden="true"></div>
    <h1>Белый шум</h1>
    <p>Ровный фон напоминает звуки, которые малыш слышал до рождения, и помогает ему успокоиться и уснуть.</p>
  </header>
  <div class="lamp${N.playing ? ' on' : ''}">
    <span class="ring"></span><span class="ring"></span><span class="ring"></span>
    <button type="button" class="core" data-act="noise-toggle" aria-label="${N.playing ? 'Выключить шум' : 'Включить шум'}">${svg(N.playing ? 'pause' : 'play', 36)}</button>
  </div>
  <p class="lamp-cap" data-live="noise">${noiseCaption()}</p>
  <div class="sounds">${SOUNDS.map(s => `
    <button type="button" class="sound" data-act="noise-kind" data-kind="${s.id}" aria-pressed="${N.kind === s.id}"><b>${s.name}</b><span>${s.desc}</span></button>`).join('')}
  </div>
  <div class="field">
    <label class="flabel" for="vol">Громкость</label>
    <input id="vol" type="range" min="0" max="100" value="${Math.round(N.vol * 100)}" data-input="noise-vol" style="--v:${Math.round(N.vol * 100)}%">
  </div>
  <div class="field">
    <span class="flabel">Выключить через</span>
    <div class="chips">${[[15, '15 мин'], [30, '30 мин'], [60, '1 час'], [0, 'Не выключать']].map(([m, l]) =>
      `<button type="button" class="chip" data-act="noise-timer" data-min="${m}" aria-pressed="${N.timerMin === m}">${l}</button>`).join('')}
    </div>
  </div>
  <p class="fine">Положите телефон не ближе двух метров от кроватки и выберите самую тихую громкость, на которой шум ещё помогает. Звук играет, пока дневник открыт. Если не слышно — проверьте беззвучный режим.</p>`;
}

/* Полезное */
function viewHelp() {
  const d = ageDays();
  const last24 = dayStats(now() - DAY, now());
  let normsHTML;
  if (d == null) {
    normsHTML = `<p class="empty">Укажите дату рождения — подберём ориентиры под возраст малыша.</p>
      <button type="button" class="ghost" data-act="settings">Указать дату рождения</button>`;
  } else {
    const n = norms(d);
    const w = latestWeight();
    const perDay = w && d >= 14 && d < 180 ? Math.min(1000, Math.round(w / 1000 * 150 / 10) * 10) : 0;
    const any = last24.feeds || last24.sleep || last24.diapers;
    normsHTML = `<dl class="norms">
      <div class="norm"><dt>Кормлений в сутки</dt><dd>${n.feeds}</dd>${any ? `<small>за последние 24 часа — <b>${last24.feeds}</b></small>` : ''}</div>
      <div class="norm"><dt>Смесь или сцеженное за раз</dt><dd>${n.vol}</dd><small>${perDay ? `в сутки около <b>${perDay} мл</b> — примерно 150 мл на килограмм веса` : 'грудью — по требованию, объём считать не нужно'}</small></div>
      <div class="norm"><dt>Сон в сутки</dt><dd>${n.sleep}</dd>${last24.sleep ? `<small>за последние 24 часа — <b>${fmtDur(last24.sleep)}</b></small>` : ''}</div>
      <div class="norm"><dt>Бодрствование между снами</dt><dd>${wakeText(n.wake)}</dd></div>
      <div class="norm"><dt>Мокрых подгузников в сутки</dt><dd>от ${n.wet}</dd>${any ? `<small>за последние 24 часа — <b>${last24.wet}</b></small>` : ''}</div>
      ${n.gain ? `<div class="norm"><dt>Прибавка веса в неделю</dt><dd>${n.gain}</dd></div>` : `<div class="norm"><dt>Вес в первые дни</dt><dd>−7–10%</dd><small>это нормально; к 10–14 дню малыш обычно возвращается к весу при рождении</small></div>`}
    </dl>
    <p class="fine">Это средние ориентиры из педиатрических рекомендаций. Малыши разные: важнее общая динамика, чем одна цифра за день.</p>`;
  }

  return `
  <header class="page-h">
    <div class="moon" aria-hidden="true"></div>
    <h1>Полезное</h1>
    <p>Ориентиры по возрасту, рост и вес, и когда нужно сразу звонить врачу.</p>
  </header>
  <section class="sec">
    <div class="sec-h"><h2>Ориентиры</h2><span>${esc(ageFor())}</span></div>
    ${normsHTML}
  </section>
  <section class="sec">
    <div class="sec-h"><h2>Рост и вес</h2></div>
    ${growthHTML()}
    <button type="button" class="ghost" data-act="open" data-sheet="growth">${svg('plus', 18)}Добавить замер</button>
  </section>
  <section class="sec">
    <div class="sec-h"><h2>Когда сразу к врачу</h2></div>
    <div class="call"><p>Звоните педиатру или в скорую, если заметили хотя бы одно:</p><a href="tel:112">112</a></div>
    <ul class="flags">
      <li>Температура 38 °C и выше у малыша младше трёх месяцев — даже если в остальном он выглядит как обычно</li>
      <li>Температура ниже 36 °C</li>
      <li>Вялый, его трудно разбудить, отказывается от еды несколько кормлений подряд</li>
      <li>Дышит тяжело или очень часто, кряхтит на каждом выдохе, между рёбрами западает кожа, синеют губы</li>
      <li>Нет мокрого подгузника 6–8 часов или запал родничок</li>
      <li>Рвота фонтаном несколько раз подряд или зелёная рвота</li>
      <li>Кровь в стуле, либо стул очень светлый — белый или серый</li>
      <li>Желтуха появилась в первые сутки, усиливается или спустилась на живот и ножки</li>
      <li>Судороги, выбухающий родничок, непривычно пронзительный крик</li>
      <li>Кожа вокруг пупка краснеет, ранка мокнет с неприятным запахом или гноем</li>
    </ul>
    <p class="fine">Это ориентиры, а не диагноз. Если что-то тревожит, звоните педиатру, даже если этого нет в списке, — вы знаете своего малыша лучше всех.</p>
  </section>
  <section class="sec">
    <button type="button" class="set-btn" data-act="share">${svg('share', 20)}Отправить сводку за сегодня</button>
  </section>`;
}

function growthPoints() {
  const pts = Array.from(store.growth.values()).filter(g => !g.x).sort((a, b) => a.d - b.d);
  const p = store.profile;
  if (p.birth && (p.bw || p.bh)) pts.unshift({ d: p.birth, w: p.bw || 0, h: p.bh || 0, birth: true });
  return pts;
}
function latestWeight() {
  const pts = growthPoints().filter(x => x.w);
  return pts.length ? pts[pts.length - 1].w : 0;
}
function growthHTML() {
  const pts = growthPoints();
  if (!pts.length) return `<p class="empty">Добавьте вес при рождении в настройках или первый замер у педиатра — покажем прибавку.</p>`;
  const ws = pts.filter(x => x.w);
  let top = '';
  if (ws.length) {
    const last = ws[ws.length - 1], prev = ws[ws.length - 2], first = ws[0];
    let sub = '';
    if (prev) {
      const dd = Math.max(1, Math.round((startOfDay(last.d) - startOfDay(prev.d)) / DAY));
      const diff = last.w - prev.w;
      const perWeek = Math.round(diff / dd * 7 / 10) * 10;
      sub = `${diff >= 0 ? '+' : '−'}${grams(Math.abs(diff))} г за ${dd} ${plural(dd, ['день', 'дня', 'дней'])}${dd >= 3 ? ` · ≈${perWeek >= 0 ? '+' : '−'}${grams(Math.abs(perWeek))} г в неделю` : ''}`;
      if (first !== prev && first.birth) sub += `<br>${last.w - first.w >= 0 ? '+' : '−'}${grams(Math.abs(last.w - first.w))} г с рождения`;
    } else sub = last.birth ? 'вес при рождении' : 'первый замер';
    top = `<div class="growth-top"><div><p class="growth-big">${grams(last.w)}<i>г</i></p><p class="growth-sub">${sub}</p></div></div>`;
    if (ws.length >= 2) top += spark(ws);
  }
  const rows = pts.slice().reverse().map(g => {
    const vals = [g.w ? grams(g.w) + ' г' : '', g.h ? fmt1(g.h).replace(',0', '') + ' см' : '', g.c ? 'голова ' + fmt1(g.c).replace(',0', '') + ' см' : ''].filter(Boolean).join(' · ');
    const label = g.birth ? 'При рождении' : dateLong(g.d);
    return g.birth
      ? `<li><div class="row"><span>${label}</span><span>${vals}</span></div></li>`
      : `<li><button type="button" class="row" data-act="open" data-sheet="growth" data-id="${g.i}"><span>${label}</span><span>${vals}</span></button></li>`;
  }).join('');
  return top + `<ul class="rows">${rows}</ul>`;
}
function spark(pts) {
  const W = 300, H = 60, x0 = pts[0].d, x1 = pts[pts.length - 1].d || x0 + 1;
  const ys = pts.map(p => p.w), y0 = Math.min.apply(null, ys), y1 = Math.max.apply(null, ys);
  const X = d => (x1 === x0 ? W / 2 : (d - x0) / (x1 - x0) * (W - 8) + 4).toFixed(1);
  const Y = w => (y1 === y0 ? H / 2 : H - 6 - (w - y0) / (y1 - y0) * (H - 12)).toFixed(1);
  const line = pts.map((p, i) => (i ? 'L' : 'M') + X(p.d) + ' ' + Y(p.w)).join(' ');
  const dots = pts.map(p => `<path d="M${X(p.d)} ${Y(p.w)}h0" stroke-width="7" vector-effect="non-scaling-stroke"/>`).join('');
  return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" aria-hidden="true" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round">
    <path d="${line}" stroke-width="2" vector-effect="non-scaling-stroke"/>${dots}</svg>`;
}

/* Знакомство */
function viewOnboard() {
  return `<div class="onb">
    <div class="moon" aria-hidden="true"></div>
    <div>
      <p class="kicker">Дневник малыша</p>
      <h1>Кормления, сон и&nbsp;подгузники — <i>одной рукой</i></h1>
      <p class="lead">Записывайте всё в одно касание, даже в три часа ночи. Таймеры не собьются, если закрыть приложение.</p>
    </div>
    <form data-form="onb" novalidate>
      <div class="field"><label class="flabel" for="o-name">Как зовут малыша</label>
        <input class="input" id="o-name" name="name" placeholder="Например, Миша" autocomplete="off" maxlength="40"></div>
      <div class="row2">
        <div class="field"><label class="flabel" for="o-birth">Дата рождения</label>
          <input class="input" type="date" id="o-birth" name="birth" max="${toDateInput(now())}"></div>
        <div class="field"><label class="flabel" for="o-bw">Вес, г</label>
          <input class="input" id="o-bw" name="bw" inputmode="numeric" placeholder="3400" autocomplete="off"></div>
      </div>
      <p class="err" data-err hidden></p>
      <div class="actions"><button type="submit" class="btn primary wide">Начать</button></div>
      <button type="button" class="link" data-act="onb-skip">Заполню позже</button>
    </form>
  </div>`;
}

/* ——— Шторки ——— */
function whenField(ctx, t, label = 'Когда', name = 's') {
  const chips = !ctx.past && !ctx.id && !ctx.noChips;
  return `<div class="field"><label class="flabel" for="f-${name}">${label}</label>
    <input class="input" type="datetime-local" id="f-${name}" name="${name}" value="${toLocalInput(t)}">
    ${chips ? `<div class="chips">${[[0, 'Сейчас'], [-10, '−10 мин'], [-30, '−30 мин'], [-60, '−1 час']].map(([o, l]) =>
      `<button type="button" class="chip" data-act="when" data-name="${name}" data-off="${o}"${o === 0 ? ' aria-pressed="true"' : ''}>${l}</button>`).join('')}</div>` : ''}
  </div>`;
}
const fmtStep = (v, f) => f === '1' ? fmt1(v) : String(Math.round(v));
function stepper(name, v, unit, step, min, max, fmt = '') {
  return `<div class="stepper">
    <button type="button" data-act="step" data-name="${name}" data-d="${-step}" aria-label="Меньше">−</button>
    <output data-out="${name}">${fmtStep(v, fmt)}<i>${unit}</i></output>
    <button type="button" data-act="step" data-name="${name}" data-d="${step}" aria-label="Больше">+</button>
    <input type="hidden" name="${name}" value="${v}" data-min="${min}" data-max="${max}" data-fmt="${fmt}" data-unit="${unit}">
  </div>`;
}
function quick(name, vals, unit, fmt = '') {
  return `<div class="chips">${vals.map(v => `<button type="button" class="chip" data-act="set" data-name="${name}" data-val="${v}">${fmtStep(v, fmt)} ${unit}</button>`).join('')}</div>`;
}
function seg(name, opts, val) {
  return `<div class="seg" role="group">${opts.map(([v, l]) =>
    `<button type="button" data-act="seg" data-name="${name}" data-val="${v}" aria-pressed="${v === val}">${l}</button>`).join('')}
    <input type="hidden" name="${name}" value="${esc(val)}"></div>`;
}
const noteField = v => `<div class="field"><label class="flabel" for="f-n">Заметка</label>
  <input class="input" id="f-n" name="n" value="${esc(v || '')}" placeholder="Необязательно" maxlength="200" autocomplete="off"></div>`;
function formEnd(ctx, label = 'Сохранить') {
  return `<p class="err" data-err hidden></p>
    <div class="actions"><button class="btn primary wide" type="submit">${label}</button></div>
    ${ctx.id ? `<button type="button" class="danger-link" data-act="ev-del" data-id="${ctx.id}">Удалить запись</button>` : ''}`;
}
const evOf = ctx => ctx.id ? store.events.get(ctx.id) : null;
const formTag = (type, ctx) => `<form data-form="${type}" data-id="${ctx.id || ''}" novalidate>`;

const SHEETS = {
  more(ctx) {
    const items = [
      ['bf', 'drop', 'Грудь', 'если забыли включить таймер', '--c-bf'],
      ['bt', 'bottle', 'Бутылочка', '', '--c-bt'],
      ['dp', 'diaper', 'Подгузник', '', '--c-dp'],
      ['sl', 'moon', 'Сон', 'если забыли включить таймер', '--c-sl'],
      ['pm', 'pump', 'Сцеживание', '', '--c-pm'],
      ['md', 'pill', 'Лекарство или витамин', '', '--c-ot'],
      ['tp', 'temp', 'Температура', '', '--c-ot'],
      ['bh', 'bath', 'Купание', '', '--c-ot'],
      ['wk', 'sun', 'Прогулка', '', '--c-ot'],
      ['nt', 'note', 'Заметка', '', '--c-ot'],
    ];
    return `<h3>Добавить запись</h3>
      <p class="lead">${ctx.past ? 'За ' + esc(dayName(ctx.base).toLowerCase()) : 'Что записать?'}</p>
      <div class="menu">${items.map(([k, ic, l, sub, c]) => `
        <button type="button" data-act="sub" data-sheet="${k}" style="--c:var(${c})">
          <span class="ic">${svg(ic, 20)}</span><span class="m-l">${l}${sub ? `<small>${sub}</small>` : ''}</span>${svg('chev', 18)}
        </button>`).join('')}</div>`;
  },

  bt(ctx) {
    const e = evOf(ctx), last = lastOf(['bt']);
    const v = e ? e.v : last ? last.v : 60, k = e ? e.k : last ? last.k : 'f';
    return `${formTag('bt', ctx)}
      <h3>Бутылочка</h3>
      <div class="field">${seg('k', [['f', 'Смесь'], ['m', 'Сцеженное']], k || 'f')}</div>
      <div class="field"><span class="flabel">Объём</span>${stepper('v', v, 'мл', 5, 5, 400)}${quick('v', [30, 60, 90, 120], 'мл')}</div>
      ${whenField(ctx, e ? e.s : ctx.base)}
      ${noteField(e && e.n)}
      ${formEnd(ctx, e ? 'Сохранить' : 'Записать')}
    </form>`;
  },

  dp(ctx) {
    const e = evOf(ctx);
    return `${formTag('dp', ctx)}
      <h3>Подгузник</h3>
      <p class="lead">${e ? 'Выберите, что было, — изменения сохранятся' : 'Одно касание — и записано'}</p>
      <div class="choices">${[['w', 'Мокрый', 'drop'], ['d', 'Грязный', 'dirty'], ['m', 'И то и другое', 'both']].map(([k, l, ic]) => `
        <button type="button" class="choice${e && e.k === k ? ' sel' : ''}" data-act="dp-save" data-k="${k}">${svg(ic, 30)}<span>${l}</span></button>`).join('')}
      </div>
      ${whenField(ctx, e ? e.s : ctx.base)}
      ${ctx.id ? `<button type="button" class="danger-link" data-act="ev-del" data-id="${ctx.id}">Удалить запись</button>` : ''}
    </form>`;
  },

  bf(ctx) {
    const e = evOf(ctx);
    const s = e ? bfSides(e) : { L: 10 * MIN, R: 0 };
    const first = e && e.g && e.g[0] ? e.g[0][0] : 'L';
    return `<form data-form="bf" data-id="${ctx.id || ''}" data-first="${first}" novalidate>
      <h3>Кормление грудью</h3>
      ${e ? '' : '<p class="lead">Если забыли включить таймер — укажите, сколько примерно длилось.</p>'}
      <div class="field"><span class="flabel">Левая</span>${stepper('L', Math.round(s.L / MIN), 'мин', 1, 0, 120)}</div>
      <div class="field"><span class="flabel">Правая</span>${stepper('R', Math.round(s.R / MIN), 'мин', 1, 0, 120)}</div>
      ${whenField(Object.assign({}, ctx, { noChips: true }), e ? e.s : ctx.base - 15 * MIN, 'Начало')}
      ${noteField(e && e.n)}
      ${formEnd(ctx, e ? 'Сохранить' : 'Записать')}
    </form>`;
  },

  sl(ctx) {
    const e = evOf(ctx);
    const end = e ? e.e : ctx.base, start = e ? e.s : end - HOUR;
    return `${formTag('sl', ctx)}
      <h3>Сон</h3>
      ${e ? '' : '<p class="lead">Если забыли запустить таймер. Чтобы засечь сон сейчас, нажмите «Сон» на главном экране.</p>'}
      <div class="field"><label class="flabel" for="f-s">Начало</label><input class="input" type="datetime-local" id="f-s" name="s" value="${toLocalInput(start)}"></div>
      <div class="field"><label class="flabel" for="f-e">Конец</label><input class="input" type="datetime-local" id="f-e" name="e" value="${toLocalInput(end)}">
        <div class="chips">${[[30, '30 мин'], [60, '1 ч'], [90, '1,5 ч'], [120, '2 ч'], [180, '3 ч']].map(([m, l]) =>
          `<button type="button" class="chip" data-act="dur" data-min="${m}">${l}</button>`).join('')}</div>
      </div>
      ${noteField(e && e.n)}
      ${formEnd(ctx, e ? 'Сохранить' : 'Записать')}
    </form>`;
  },

  slActive() {
    const a = store.active.sl;
    if (!a) return '<h3>Сон уже закончился</h3>';
    return `<form data-form="slActive" novalidate>
      <h3>Сон идёт</h3>
      <p class="lead">Если включили таймер не сразу — поправьте время, когда малыш уснул.</p>
      ${whenField({ noChips: true }, a.s, 'Начало сна')}
      ${formEnd({})}
      <button type="button" class="danger-link" data-act="sl-cancel">Сбросить сон без записи</button>
    </form>`;
  },

  pm(ctx) {
    const e = evOf(ctx), last = lastOf(['pm']);
    const v = e ? e.v : last ? last.v : 60;
    return `${formTag('pm', ctx)}
      <h3>Сцеживание</h3>
      <div class="field">${seg('k', [['L', 'Левая'], ['R', 'Правая'], ['B', 'Обе']], e ? e.k || 'B' : 'B')}</div>
      <div class="field"><span class="flabel">Сколько сцедили</span>${stepper('v', v, 'мл', 5, 5, 500)}${quick('v', [30, 50, 80, 120], 'мл')}</div>
      ${whenField(ctx, e ? e.s : ctx.base)}
      ${noteField(e && e.n)}
      ${formEnd(ctx, e ? 'Сохранить' : 'Записать')}
    </form>`;
  },

  md(ctx) {
    const e = evOf(ctx);
    const names = ['Витамин D'];
    live().filter(x => x.t === 'md' && x.m).sort((a, b) => b.s - a.s).forEach(x => { if (!names.includes(x.m) && names.length < 6) names.push(x.m); });
    return `${formTag('md', ctx)}
      <h3>Лекарство или витамин</h3>
      <div class="field"><label class="flabel" for="f-m">Что дали</label>
        <input class="input" id="f-m" name="m" value="${esc(e ? e.m : '')}" placeholder="Название" maxlength="60" autocomplete="off">
        <div class="chips">${names.map(n => `<button type="button" class="chip" data-act="set-text" data-name="m" data-val="${esc(n)}">${esc(n)}</button>`).join('')}</div>
      </div>
      <div class="field"><label class="flabel" for="f-n">Дозировка</label>
        <input class="input" id="f-n" name="n" value="${esc(e ? e.n : '')}" placeholder="Например, 1 капля" maxlength="60" autocomplete="off"></div>
      ${whenField(ctx, e ? e.s : ctx.base)}
      ${formEnd(ctx, e ? 'Сохранить' : 'Записать')}
    </form>`;
  },

  tp(ctx) {
    const e = evOf(ctx), v = e ? e.v : 36.6;
    const d = ageDays(), young = d == null || d < 90;
    return `${formTag('tp', ctx)}
      <h3>Температура</h3>
      <div class="field">${stepper('v', v, '°C', .1, 34, 42.5, '1')}${quick('v', [36.6, 37, 37.5, 38], '°C', '1')}</div>
      <div class="warn" data-warn${v >= 38 ? '' : ' hidden'}>${young
        ? '38 °C и выше у малыша младше трёх месяцев — повод сразу позвонить педиатру или в 112, даже если он выглядит бодрым.'
        : 'Температура высокая. Если малыш вялый, отказывается от еды или вас что-то тревожит — звоните педиатру.'}</div>
      ${whenField(ctx, e ? e.s : ctx.base)}
      ${noteField(e && e.n)}
      ${formEnd(ctx, e ? 'Сохранить' : 'Записать')}
    </form>`;
  },

  bh(ctx) {
    const e = evOf(ctx);
    return `${formTag('bh', ctx)}<h3>Купание</h3>${whenField(ctx, e ? e.s : ctx.base)}${noteField(e && e.n)}${formEnd(ctx, e ? 'Сохранить' : 'Записать')}</form>`;
  },

  wk(ctx) {
    const e = evOf(ctx), mins = e ? Math.round(((e.e || e.s) - e.s) / MIN) : 30;
    return `${formTag('wk', ctx)}
      <h3>Прогулка</h3>
      <div class="field"><span class="flabel">Сколько гуляли</span>${stepper('d', mins, 'мин', 5, 5, 600)}${quick('d', [20, 30, 45, 60], 'мин')}</div>
      ${whenField(Object.assign({}, ctx, { noChips: true }), e ? e.s : ctx.base - 30 * MIN, 'Начало')}
      ${noteField(e && e.n)}
      ${formEnd(ctx, e ? 'Сохранить' : 'Записать')}
    </form>`;
  },

  nt(ctx) {
    const e = evOf(ctx);
    return `${formTag('nt', ctx)}
      <h3>Заметка</h3>
      <div class="field"><label class="flabel" for="f-n">Что хотите запомнить</label>
        <textarea class="input" id="f-n" name="n" maxlength="500" placeholder="Например, вопрос для педиатра">${esc(e ? e.n : '')}</textarea></div>
      ${whenField(ctx, e ? e.s : ctx.base)}
      ${formEnd(ctx, e ? 'Сохранить' : 'Записать')}
    </form>`;
  },

  growth(ctx) {
    const g = ctx.id ? store.growth.get(ctx.id) : null;
    return `<form data-form="growth" data-id="${ctx.id || ''}" novalidate>
      <h3>${g ? 'Замер' : 'Новый замер'}</h3>
      <p class="lead">Заполните то, что измерили, — остальное можно пропустить.</p>
      <div class="field"><label class="flabel" for="g-d">Дата</label><input class="input" type="date" id="g-d" name="d" value="${toDateInput(g ? g.d : now())}" max="${toDateInput(now())}"></div>
      <div class="field"><label class="flabel" for="g-w">Вес, г</label><input class="input" id="g-w" name="w" inputmode="numeric" value="${g && g.w ? g.w : ''}" placeholder="3650" autocomplete="off"></div>
      <div class="row2">
        <div class="field"><label class="flabel" for="g-h">Рост, см</label><input class="input" id="g-h" name="h" inputmode="decimal" value="${g && g.h ? fmt1(g.h).replace(',0', '') : ''}" placeholder="52" autocomplete="off"></div>
        <div class="field"><label class="flabel" for="g-c">Голова, см</label><input class="input" id="g-c" name="c" inputmode="decimal" value="${g && g.c ? fmt1(g.c).replace(',0', '') : ''}" placeholder="35" autocomplete="off"></div>
      </div>
      <p class="err" data-err hidden></p>
      <div class="actions"><button class="btn primary wide" type="submit">Сохранить</button></div>
      ${g ? `<button type="button" class="danger-link" data-act="gr-del" data-id="${g.i}">Удалить замер</button>` : ''}
    </form>`;
  },

  settings() {
    const p = store.profile;
    return `<form data-form="settings" novalidate>
      <h3>Настройки</h3>
      <div class="field"><label class="flabel" for="s-name">Имя малыша</label>
        <input class="input" id="s-name" name="name" value="${esc(p.name)}" placeholder="Например, Миша" maxlength="40" autocomplete="off"></div>
      <div class="field"><label class="flabel" for="s-birth">Дата рождения</label>
        <input class="input" type="date" id="s-birth" name="birth" value="${p.birth ? toDateInput(p.birth) : ''}" max="${toDateInput(now())}"></div>
      <div class="row2">
        <div class="field"><label class="flabel" for="s-bw">Вес при рождении, г</label>
          <input class="input" id="s-bw" name="bw" inputmode="numeric" value="${p.bw || ''}" placeholder="3400" autocomplete="off"></div>
        <div class="field"><label class="flabel" for="s-bh">Рост, см</label>
          <input class="input" id="s-bh" name="bh" inputmode="decimal" value="${p.bh ? fmt1(p.bh).replace(',0', '') : ''}" placeholder="51" autocomplete="off"></div>
      </div>
      <div class="field"><span class="flabel">Оформление</span>${seg('theme', [['auto', 'Как в Telegram'], ['light', 'Светлое'], ['dark', 'Тёмное']], store.settings.theme)}</div>
      <p class="err" data-err hidden></p>
      <div class="actions"><button class="btn primary wide" type="submit">Сохранить</button></div>
      <div class="set-sec">
        <span class="flabel">Данные</span>
        <p class="fine" style="margin-top:0">${Cloud.ok
          ? 'Записи хранятся в вашем аккаунте Telegram и появляются на всех ваших устройствах — телефоне, планшете, компьютере.'
          : 'Сейчас записи хранятся только на этом устройстве. Откройте дневник через бота в Telegram, чтобы они сохранялись в аккаунте.'}</p>
        <button type="button" class="set-btn" data-act="share">${svg('share', 20)}Отправить сводку за сегодня</button>
        <button type="button" class="danger-link" data-act="wipe">Удалить все записи</button>
      </div>
    </form>`;
  },
};

const Sheet = {
  cur: null,
  get root() { return $('#sheet-root'); },
  get body() { return $('#sheet-body'); },
  open(name, ctx = {}, push = false) {
    if (ctx.base == null) ctx.base = now();
    const prev = push ? this.cur : null;
    this.cur = { name, ctx, prev };
    const body = this.body;
    body.innerHTML = SHEETS[name](ctx);
    body.scrollTop = 0;
    if (push) { body.classList.remove('swap'); void body.offsetWidth; body.classList.add('swap'); }
    const root = this.root;
    if (root.hidden) {
      root.hidden = false;
      document.body.classList.add('sheet-open');
      requestAnimationFrame(() => requestAnimationFrame(() => root.classList.add('open')));
    }
    backButton(true);
  },
  back() {
    if (!this.cur) return;
    const p = this.cur.prev;
    if (p) { this.cur = null; this.open(p.name, p.ctx, false); this.cur.prev = p.prev; }
    else this.close();
  },
  close() {
    if (!this.cur) return;
    this.cur = null;
    const root = this.root;
    root.classList.remove('open');
    document.body.classList.remove('sheet-open');
    backButton(false);
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    setTimeout(() => { if (!this.cur) { root.hidden = true; this.body.innerHTML = ''; this.body.classList.remove('swap'); } }, 420);
  },
};
function backButton(show) {
  if (!ver('6.1')) return;
  try { show ? tg.BackButton.show() : tg.BackButton.hide(); } catch (e) {}
}

/* Свайп вниз закрывает шторку */
(function dragToClose() {
  let y0 = null, dy = 0, sheet = null;
  document.addEventListener('touchstart', e => {
    sheet = e.target.closest('#sheet');
    if (!sheet || e.target.closest('input[type=range], textarea')) { y0 = null; return; }
    if ($('#sheet-body').scrollTop > 0) { y0 = null; return; }
    y0 = e.touches[0].clientY; dy = 0;
  }, { passive: true });
  document.addEventListener('touchmove', e => {
    if (y0 == null) return;
    dy = e.touches[0].clientY - y0;
    if (dy > 0) { sheet.classList.add('dragging'); sheet.style.transform = `translateY(${dy}px)`; }
  }, { passive: true });
  document.addEventListener('touchend', () => {
    if (y0 == null) return;
    sheet.classList.remove('dragging'); sheet.style.transform = '';
    if (dy > 110) Sheet.close();
    y0 = null;
  });
})();

/* ——— Тост ——— */
let toastTimer = 0;
function toast(msg, undo) {
  const el = $('#toast');
  el.innerHTML = `<span>${esc(msg)}</span>${undo ? '<button type="button">Отменить</button>' : ''}`;
  if (undo) el.querySelector('button').onclick = () => {
    undo(); el.classList.remove('show'); haptic.tap();
    if (!Sheet.cur) render();
  };
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), undo ? 5000 : 2600);
}

/* ——— Таймеры ——— */
function bfSide(side) {
  const t = now(), a = store.active.bf;
  if (!a) {
    store.active.bf = { g: [[side, t, 0]], p: 0 };
    haptic.tap();
    // начали кормить — значит, малыш проснулся
    const sl = store.active.sl;
    if (sl) {
      store.active.sl = null;
      if (t - sl.s >= MIN) {
        const ev = addEvent({ t: 'sl', s: sl.s, e: t });
        touchActive(); render();
        toast('Записали сон, ' + fmtDur(t - sl.s), () => { deleteEvent(ev.i); store.active.sl = sl; touchActive(); });
        return;
      }
    }
  } else {
    const last = a.g[a.g.length - 1];
    if (side === last[0]) {
      if (a.p) { a.g.push([side, t, 0]); a.p = 0; } else { last[2] = t; a.p = 1; }
    } else {
      if (!a.p) last[2] = t;
      a.g.push([side, t, 0]); a.p = 0;
    }
    haptic.sel();
  }
  touchActive(); render();
}
function bfFinish() {
  const a = store.active.bf; if (!a) return;
  const t = now(), saved = JSON.parse(JSON.stringify(a));
  const g = a.g.map(([s, x, y]) => [s, x, y || t]).filter(([, x, y]) => y - x >= 1000);
  const m = [];
  g.forEach(seg => { const p = m[m.length - 1]; if (p && p[0] === seg[0] && seg[1] - p[2] < 1000) p[2] = seg[2]; else m.push(seg.slice()); });
  store.active.bf = null; touchActive();
  const total = m.reduce((s, [, x, y]) => s + y - x, 0);
  if (total < 5000) { render(); toast('Слишком коротко — не сохранили'); return; }
  const ev = addEvent({ t: 'bf', s: m[0][1], e: m[m.length - 1][2], g: m });
  haptic.ok(); render();
  toast('Записали кормление, ' + fmtMins(total), () => { deleteEvent(ev.i); store.active.bf = saved; touchActive(); });
}
function bfCancel() {
  const saved = store.active.bf; if (!saved) return;
  store.active.bf = null; touchActive(); render(); haptic.soft();
  toast('Таймер сброшен', () => { store.active.bf = saved; touchActive(); });
}
function slStart() {
  if (store.active.sl) return;
  store.active.sl = { s: now() }; touchActive(); haptic.tap(); render();
  toast('Таймер сна запущен', () => { store.active.sl = null; touchActive(); });
}
function slFinish() {
  const a = store.active.sl; if (!a) return;
  const t = now(); store.active.sl = null; touchActive();
  if (t - a.s < MIN) { render(); toast('Меньше минуты — не сохранили'); return; }
  const ev = addEvent({ t: 'sl', s: a.s, e: t });
  haptic.ok(); render();
  toast('Записали сон, ' + fmtDur(t - a.s), () => { deleteEvent(ev.i); store.active.sl = a; touchActive(); });
}

/* ——— Сохранение форм ——— */
const val = (f, n) => { const el = f.elements.namedItem(n); return el ? el.value : ''; };
const numv = (f, n) => num(val(f, n));
function fail(f, msg) {
  const el = f.querySelector('[data-err]');
  if (el) { el.textContent = msg; el.hidden = false; el.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); }
  haptic.warn();
  return false;
}
function timeError(s) {
  if (!isFinite(s)) return 'Укажите время';
  if (s > now() + 5 * MIN) return 'Это время ещё не наступило';
  return '';
}
function commit(f, data, label) {
  const id = f.dataset.id;
  if (id) { updateEvent(id, data); toast('Сохранили'); }
  else { const ev = addEvent(data); toast('Записали: ' + label, () => deleteEvent(ev.i)); }
  haptic.ok(); Sheet.close(); render();
}
const noteOf = f => (val(f, 'n') || '').trim() || undefined;

const SAVE = {
  bt(f) {
    const s = fromLocalInput(val(f, 's')), v = numv(f, 'v'), te = timeError(s);
    if (te) return fail(f, te);
    if (!(v > 0)) return fail(f, 'Укажите объём');
    commit(f, { t: 'bt', s, v, k: val(f, 'k'), n: noteOf(f) }, `бутылочка, ${v} мл`);
  },
  bf(f) {
    const s = fromLocalInput(val(f, 's')), te = timeError(s);
    if (te) return fail(f, te);
    const L = numv(f, 'L') * MIN, R = numv(f, 'R') * MIN;
    if (!(L + R > 0)) return fail(f, 'Укажите, сколько минут кормили');
    const order = f.dataset.first === 'R' ? [['R', R], ['L', L]] : [['L', L], ['R', R]];
    let t = s; const g = [];
    order.forEach(([side, d]) => { if (d > 0) { g.push([side, t, t + d]); t += d; } });
    commit(f, { t: 'bf', s, e: t, g, n: noteOf(f) }, 'кормление, ' + fmtMins(L + R));
  },
  sl(f) {
    const s = fromLocalInput(val(f, 's')), e = fromLocalInput(val(f, 'e'));
    const te = timeError(s) || timeError(e);
    if (te) return fail(f, te);
    if (e <= s) return fail(f, 'Конец сна должен быть позже начала');
    if (e - s > 16 * HOUR) return fail(f, 'Слишком долго — проверьте даты');
    commit(f, { t: 'sl', s, e, n: noteOf(f) }, 'сон, ' + fmtDur(e - s));
  },
  slActive(f) {
    const s = fromLocalInput(val(f, 's')), te = timeError(s);
    if (te) return fail(f, te);
    if (s > now()) return fail(f, 'Это время ещё не наступило');
    if (!store.active.sl) { Sheet.close(); return; }
    store.active.sl.s = s; touchActive(); haptic.ok(); Sheet.close(); render(); toast('Поправили начало сна');
  },
  pm(f) {
    const s = fromLocalInput(val(f, 's')), v = numv(f, 'v'), te = timeError(s);
    if (te) return fail(f, te);
    if (!(v > 0)) return fail(f, 'Укажите объём');
    commit(f, { t: 'pm', s, v, k: val(f, 'k'), n: noteOf(f) }, `сцеживание, ${v} мл`);
  },
  md(f) {
    const s = fromLocalInput(val(f, 's')), m = val(f, 'm').trim(), te = timeError(s);
    if (!m) return fail(f, 'Напишите, что дали');
    if (te) return fail(f, te);
    commit(f, { t: 'md', s, m, n: noteOf(f) }, m);
  },
  tp(f) {
    const s = fromLocalInput(val(f, 's')), v = numv(f, 'v'), te = timeError(s);
    if (te) return fail(f, te);
    commit(f, { t: 'tp', s, v, n: noteOf(f) }, `температура ${fmt1(v)} °C`);
  },
  bh(f) {
    const s = fromLocalInput(val(f, 's')), te = timeError(s);
    if (te) return fail(f, te);
    commit(f, { t: 'bh', s, n: noteOf(f) }, 'купание');
  },
  wk(f) {
    const s = fromLocalInput(val(f, 's')), d = numv(f, 'd'), te = timeError(s);
    if (te) return fail(f, te);
    commit(f, { t: 'wk', s, e: s + d * MIN, n: noteOf(f) }, 'прогулка, ' + fmtDur(d * MIN));
  },
  nt(f) {
    const s = fromLocalInput(val(f, 's')), n = noteOf(f), te = timeError(s);
    if (!n) return fail(f, 'Напишите заметку');
    if (te) return fail(f, te);
    commit(f, { t: 'nt', s, n }, 'заметка');
  },
  growth(f) {
    const d = fromDateInput(val(f, 'd'));
    const w = Math.round(numv(f, 'w')) || 0, h = numv(f, 'h') || 0, c = numv(f, 'c') || 0;
    if (!d) return fail(f, 'Укажите дату');
    if (!w && !h && !c) return fail(f, 'Заполните хотя бы вес');
    if (w && (w < 500 || w > 30000)) return fail(f, 'Вес — в граммах, например 3650');
    if (h && (h < 30 || h > 130)) return fail(f, 'Рост — в сантиметрах, например 52');
    const id = f.dataset.id || uid();
    store.growth.set(id, { i: id, d: d + 12 * HOUR, w, h, c, u: now() });
    touch('g'); haptic.ok(); Sheet.close(); render(); toast('Замер сохранён');
  },
  settings(f) {
    const p = store.profile;
    const bw = Math.round(numv(f, 'bw')) || 0, bh = numv(f, 'bh') || 0;
    if (bw && (bw < 500 || bw > 7000)) return fail(f, 'Вес при рождении — в граммах, например 3400');
    p.name = val(f, 'name').trim();
    p.birth = fromDateInput(val(f, 'birth'));
    p.bw = bw; p.bh = bh; p.u = now();
    touch('p');
    const th = val(f, 'theme');
    if (th !== store.settings.theme) { store.settings.theme = th; store.settings.u = now(); touch('s'); }
    haptic.ok(); Sheet.close(); render(); toast('Сохранили');
  },
  onb(f) {
    const bw = Math.round(numv(f, 'bw')) || 0;
    if (bw && (bw < 500 || bw > 7000)) return fail(f, 'Вес — в граммах, например 3400');
    const p = store.profile;
    p.name = val(f, 'name').trim();
    p.birth = fromDateInput(val(f, 'birth'));
    p.bw = bw; p.u = now();
    store.settings.onb = 1; store.settings.u = now();
    touch('p'); touch('s'); haptic.ok();
    if (document.activeElement && document.activeElement.blur) document.activeElement.blur();
    ui.tab = 'today'; window.scrollTo(0, 0); render(true);
  },
};

/* ——— Сводка ——— */
function summaryText() {
  const a = startOfDay(now()), st = dayStats(a, addDays(a, 1));
  const age = ageText();
  const lines = [`${babyName()}${age ? ' · ' + age : ''} · ${dateLong(now())}`];
  lines.push(`Кормлений: ${st.feeds}` + (st.bfN ? ` (грудью ${st.bfN}, ${fmtDur(st.breast)})` : '') + (st.btN ? `, бутылочка ${st.ml} мл` : ''));
  lines.push(`Сон: ${st.sleep >= MIN ? fmtDur(st.sleep) : 'пока не было'}`);
  lines.push(`Подгузников: ${st.diapers}` + (st.diapers ? ` (мокрых ${st.wet}, грязных ${st.dirty})` : ''));
  const last = lastOf(['bf', 'bt']);
  if (last) lines.push(`Последнее кормление ${whenText(last.s)}`);
  return lines.join('\n');
}
function share() {
  const text = summaryText();
  if (IN_TG && ver('6.1')) {
    const url = BOT_URL
      ? `https://t.me/share/url?url=${encodeURIComponent(BOT_URL)}&text=${encodeURIComponent(text)}`
      : `https://t.me/share/url?url=${encodeURIComponent(text)}`;
    tg.openTelegramLink(url);
  } else if (navigator.share) {
    navigator.share({ text }).catch(() => {});
  } else if (navigator.clipboard) {
    navigator.clipboard.writeText(text).then(() => toast('Сводка скопирована'), () => {});
  }
}
function confirmBox(msg, cb) {
  if (ver('6.2')) { try { tg.showConfirm(msg, ok => ok && cb()); return; } catch (e) {} }
  if (window.confirm(msg)) cb();
}

/* ——— Действия ——— */
function pressed(group, btn) {
  $$('[data-act]', group).forEach(b => { if (b.dataset.name === btn.dataset.name || b.dataset.act === btn.dataset.act) b.setAttribute('aria-pressed', String(b === btn)); });
}
function setNum(form, name, v) {
  const inp = form.elements.namedItem(name);
  v = clamp(Math.round(v * 10) / 10, +inp.dataset.min, +inp.dataset.max);
  inp.value = v;
  const out = form.querySelector(`[data-out="${name}"]`);
  if (out) out.innerHTML = fmtStep(v, inp.dataset.fmt) + `<i>${inp.dataset.unit}</i>`;
  const warn = form.querySelector('[data-warn]');
  if (warn && name === 'v') warn.hidden = !(v >= 38);
}

const ACT = {
  tab(b) {
    const t = b.dataset.tab;
    if (t === ui.tab) { window.scrollTo({ top: 0, behavior: 'smooth' }); return; }
    ui.tab = t; haptic.sel(); window.scrollTo(0, 0); render(true);
  },
  settings() { Sheet.open('settings'); },
  open(b) { Sheet.open(b.dataset.sheet, { id: b.dataset.id || undefined }); },
  sub(b) { const c = Sheet.cur ? Sheet.cur.ctx : {}; Sheet.open(b.dataset.sheet, { base: c.base, past: c.past }, true); },
  edit(b) { const e = store.events.get(b.dataset.id); if (e) Sheet.open(e.t, { id: e.i, base: e.s }); },
  'sheet-close'() { Sheet.close(); },
  'bf-side'(b) { bfSide(b.dataset.side); },
  'bf-pause'() { const a = store.active.bf; if (a) bfSide(a.g[a.g.length - 1][0]); },
  'bf-finish'() { bfFinish(); },
  'bf-cancel'() { bfCancel(); },
  'sl-start'() { slStart(); },
  'sl-finish'() { slFinish(); },
  'sl-cancel'() {
    const a = store.active.sl; if (!a) return;
    store.active.sl = null; touchActive(); Sheet.close(); render();
    toast('Сон сброшен', () => { store.active.sl = a; touchActive(); });
  },
  'dp-save'(b) {
    const f = b.closest('form'), s = fromLocalInput(val(f, 's')), te = timeError(s);
    if (te) { toast(te); return; }
    commit(f, { t: 'dp', s, k: b.dataset.k }, 'подгузник, ' + DPK[b.dataset.k]);
  },
  'ev-del'(b) {
    const old = Object.assign({}, store.events.get(b.dataset.id));
    deleteEvent(b.dataset.id); Sheet.close(); render(); haptic.soft();
    toast('Запись удалена', () => restoreEvent(old));
  },
  'gr-del'(b) {
    const g = store.growth.get(b.dataset.id); if (!g) return;
    const old = Object.assign({}, g);
    store.growth.set(g.i, { i: g.i, d: g.d, x: 1, u: now() }); touch('g');
    Sheet.close(); render();
    toast('Замер удалён', () => { store.growth.set(old.i, Object.assign(old, { u: now() })); touch('g'); });
  },
  step(b) { const f = b.closest('form'); const inp = f.elements.namedItem(b.dataset.name); setNum(f, b.dataset.name, num(inp.value) + num(b.dataset.d)); haptic.sel(); },
  set(b) { setNum(b.closest('form'), b.dataset.name, num(b.dataset.val)); haptic.sel(); },
  'set-text'(b) { const inp = b.closest('form').elements.namedItem(b.dataset.name); inp.value = b.dataset.val; haptic.sel(); },
  seg(b) {
    const g = b.closest('.seg');
    $$('button', g).forEach(x => x.setAttribute('aria-pressed', String(x === b)));
    g.querySelector('input').value = b.dataset.val; haptic.sel();
    if (b.dataset.name === 'theme') { const prev = store.settings.theme; store.settings.theme = b.dataset.val; applyTheme(); store.settings.theme = prev; }
  },
  when(b) {
    const f = b.closest('form');
    f.elements.namedItem(b.dataset.name).value = toLocalInput(now() + num(b.dataset.off) * MIN);
    pressed(b.parentNode, b); haptic.sel();
  },
  dur(b) {
    const f = b.closest('form'), s = fromLocalInput(val(f, 's'));
    if (isFinite(s)) f.elements.namedItem('e').value = toLocalInput(Math.min(s + num(b.dataset.min) * MIN, Math.max(now(), s + MIN)));
    pressed(b.parentNode, b); haptic.sel();
  },
  'sel-day'(b) { ui.day = b.dataset.day; haptic.sel(); render(); },
  'more-weeks'() { ui.weeks++; render(); },
  'add-day'() {
    const today = ui.day === dayKey(now());
    const base = today ? now() : Math.min(keyStart(ui.day) + (now() - startOfDay(now())), addDays(keyStart(ui.day), 1) - MIN);
    Sheet.open('more', { base, past: !today });
  },
  'noise-toggle'() {
    if (Noise.playing) Noise.stop(.6); else Noise.play();
    haptic.tap(); render();
  },
  'noise-kind'(b) { Noise.setKind(b.dataset.kind); haptic.sel(); render(); },
  'noise-timer'(b) { Noise.setTimer(+b.dataset.min); haptic.sel(); render(); },
  share() { share(); },
  wipe() {
    confirmBox('Удалить все записи? Это нельзя отменить.', () => {
      store.events.forEach(e => { if (!e.x) store.events.set(e.i, { i: e.i, s: e.s, x: 1, u: now() }); dirty.add(dayKey(e.s)); });
      store.growth.forEach(g => { if (!g.x) store.growth.set(g.i, { i: g.i, d: g.d, x: 1, u: now() }); });
      store.active.bf = null; store.active.sl = null;
      changed(); touch('g'); touchActive();
      Sheet.close(); render(); toast('Все записи удалены');
    });
  },
  'onb-skip'() { store.settings.onb = 1; store.settings.u = now(); touch('s'); render(true); },
};

document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (!b || b.disabled) return;
  const fn = ACT[b.dataset.act];
  if (fn) { e.preventDefault(); fn(b, e); }
});
document.addEventListener('submit', e => {
  e.preventDefault();
  const f = e.target, fn = SAVE[f.dataset.form];
  if (fn) fn(f);
});
document.addEventListener('input', e => {
  const el = e.target;
  if (el.dataset.input === 'noise-vol') { el.style.setProperty('--v', el.value + '%'); Noise.setVol(el.value / 100); }
  const err = el.form && el.form.querySelector('[data-err]');
  if (err) err.hidden = true;
});

/* ——— Живые цифры ——— */
function tick() {
  const t = now();
  $$('[data-live]').forEach(el => {
    let h;
    switch (el.dataset.live) {
      case 'ago': h = heroAgo(t - +el.dataset.t); break;
      case 'bf-total': { const s = activeSides(); h = fmtClock(s.L + s.R); break; }
      case 'bf-L': h = fmtClock(activeSides().L); break;
      case 'bf-R': h = fmtClock(activeSides().R); break;
      case 'sl': h = store.active.sl ? durHTML(t - store.active.sl.s) : ''; break;
      case 'wake': h = fmtDur(t - +el.dataset.t); break;
      case 'wake-bar': {
        const p = clamp((t - +el.dataset.t) / (+el.dataset.max * MIN), 0, 1);
        el.firstElementChild.style.transform = `scaleX(${p.toFixed(3)})`;
        el.classList.toggle('over', p >= 1);
        return;
      }
      case 'wake-note': { const [txt, over] = wakeNote(el, t); h = esc(txt); el.classList.toggle('over', over); el.hidden = !txt; break; }
      case 'noise': h = noiseCaption(); break;
    }
    if (h !== undefined && el._h !== h) { el._h = h; el.innerHTML = h; }
  });
  Noise.tick();
  if (dayKey(t) !== ui.renderedDay && !Sheet.cur && !needsOnboarding()) render();
}

function makeGrain() {
  try {
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const x = c.getContext('2d'), img = x.createImageData(128, 128);
    for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255 | 0; img.data[i] = img.data[i + 1] = img.data[i + 2] = v; img.data[i + 3] = 255; }
    x.putImageData(img, 0, 0);
    document.documentElement.style.setProperty('--grain', `url(${c.toDataURL()})`);
  } catch (e) {}
}

function init() {
  loadLocal();
  Noise.load();
  makeGrain();
  if (IN_TG) {
    try {
      tg.ready();
      tg.expand();
      if (ver('7.7')) tg.disableVerticalSwipes();
      tg.onEvent('themeChanged', () => { if (store.settings.theme === 'auto') applyTheme(); });
      if (ver('6.1')) tg.BackButton.onClick(() => Sheet.back());
    } catch (e) {}
  } else {
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { if (store.settings.theme === 'auto') applyTheme(); });
  }
  render(true);
  setInterval(tick, 1000);
  syncCloud();
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) { if (dirty.size) Cloud.push(); return; }
    tick(); Noise.wake(); syncCloud();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && Sheet.cur) Sheet.back(); });
}

init();
})();
