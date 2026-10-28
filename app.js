// Cogenax UI. Plain JavaScript, no build step.
import {
  toISODate, weekdayMon1, countdown, splitExams, slotsByDay, validateExam, validateSlot,
  addStudy, computeStreak, lastDays, MIN_STREAK_SECONDS,
  idleTimer, validateMinutes, timerRemaining, timerStart, timerPause, timerCompleteIfDue,
  timerStop, timerDiscard, buildNotifications, isValidTime
} from './logic.js';
import { createI18n, detectLang } from './i18n.js';
import { loadState, saveState, upsertExam, removeExam, upsertSlot, removeSlot } from './store.js';
import * as notif from './notifications.js';

const APP_VERSION = '0.1.0';
const PRESETS = [15, 25, 45, 60];
const RING_R = 100;
const RING_C = 2 * Math.PI * RING_R;

// ---------- storage (falls back to memory if the WebView blocks it) ----------
const memory = new Map();
const storage = (() => {
  try {
    const s = window.localStorage;
    s.setItem('cogenax.probe', '1');
    s.removeItem('cogenax.probe');
    return s;
  } catch {
    return { getItem: (k) => (memory.has(k) ? memory.get(k) : null), setItem: (k, v) => memory.set(k, v) };
  }
})();

// ---------- state ----------
let state = loadState(storage, detectLang(navigator.language));
let i18n = createI18n(state.settings.lang);
const ui = { tab: 'exams', perm: 'unknown' };

const $ = (sel, root = document) => root.querySelector(sel);
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const T = (k, p) => i18n.t(k, p);
const pad2 = (n) => String(n).padStart(2, '0');
const clone = (o) => JSON.parse(JSON.stringify(o));

function setState(next) {
  state = next;
  saveState(storage, state);
}

// ---------- notifications (one sync at a time) ----------
let syncChain = Promise.resolve();
function scheduleSync(ask) {
  syncChain = syncChain.then(async () => {
    try {
      const perm = await notif.permissionState(!!ask);
      ui.perm = perm;
      if (perm === 'granted') {
        const list = buildNotifications(state, new Date(), { t: i18n.t, fmtDateTime: i18n.fmtDateTime });
        await notif.replaceAll(list);
      }
      if (ui.tab === 'settings' && !$('#sheet').open && !document.activeElement?.matches?.('input, select')) render();
    } catch (e) {
      console.warn('notification sync failed', e);
    }
  });
  return syncChain;
}

// ---------- small UI helpers ----------
let toastTimer;
function toast(msg) {
  const el = $('#toast');
  el.textContent = msg;
  el.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), 2200);
}

function openSheet(html, onSubmit) {
  const sh = $('#sheet');
  sh.innerHTML = html;
  if (!sh.open) sh.showModal();
  const f = sh.querySelector('form');
  if (f && onSubmit) f.addEventListener('submit', (e) => { e.preventDefault(); onSubmit(new FormData(f)); });
  const first = sh.querySelector('input[type=text], input[type=number]');
  if (first && !first.value) first.focus();
}
function closeSheet() {
  const sh = $('#sheet');
  if (sh.open) sh.close();
}
function formError(key) {
  const el = $('#ferr');
  if (el) el.textContent = key ? T(key) : '';
}

const ICONS = {
  exams: '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M8 3v4M16 3v4M3.5 10h17M9 15l2 2 4-4"/>',
  timetable: '<rect x="3.5" y="4" width="17" height="16" rx="3"/><path d="M3.5 9h17M9 9v11M15 9v11"/>',
  timer: '<circle cx="12" cy="13.5" r="7.5"/><path d="M12 9.5v4l2.5 1.5M9.5 2.5h5"/>',
  settings: '<path d="M4 7h10M18 7h2M4 17h2M10 17h10"/><circle cx="16" cy="7" r="2"/><circle cx="8" cy="17" r="2"/>'
};
const FLAME = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2c1 3.5-1.5 5-1.5 7.5 0 1.4 1 2.5 2.3 2.5 1.5 0 2.7-1.2 2.7-3 2 1.8 3 4 3 6.2 0 3.7-2.8 6.3-6.5 6.3S5.5 19 5.5 15.4c0-2.7 1.6-4.6 3-6.2C9.5 8 12 6.3 12 2z"/></svg>';
const TABS = ['exams', 'timetable', 'timer', 'settings'];

const fab = (action, label) => `<button class="fab" data-action="${action}" aria-label="${esc(label)}">+</button>`;

// ---------- views ----------
function examBadge(c) {
  if (c.past) return `<span class="badge muted">${esc(T('done'))}</span>`;
  if (c.calDays <= 0) return `<span class="badge soon">${esc(T('today'))}</span>`;
  if (c.calDays === 1) return `<span class="badge soon">${esc(T('tomorrow'))}</span>`;
  return `<span class="badge${c.calDays <= 3 ? ' soon' : ''}">${esc(i18n.tn('in_days', c.calDays))}</span>`;
}

function examRow(e, now, past) {
  const c = countdown(e, now);
  return `<button class="row-item${past ? ' past' : ''}" data-action="edit-exam" data-id="${e.id}">
    <div class="grow"><div class="name">${esc(e.name)}</div>
    <div class="meta">${esc(i18n.fmtDateTime(e.date, e.time))}${e.room ? ' · ' + esc(e.room) : ''}</div></div>
    ${examBadge(c)}</button>`;
}

function viewExams() {
  const now = new Date();
  const { upcoming, past } = splitExams(state.exams, now);
  if (!state.exams.length) {
    return `<div class="card empty">${esc(T('no_exams'))}</div>${fab('add-exam', T('add_exam'))}`;
  }
  let h = '';
  if (upcoming.length) {
    const e = upcoming[0];
    const c = countdown(e, now);
    h += `<button class="card hero" data-action="edit-exam" data-id="${e.id}">
      <div class="kicker">${esc(T('next_exam'))}</div>
      <h2>${esc(e.name)}</h2>
      <div class="when">${esc(i18n.fmtDateTime(e.date, e.time))}${e.room ? ' · ' + esc(e.room) : ''}</div>
      <div class="cd" data-exam="${e.id}">
        <div><b data-cd="d">${c.days}</b><span data-cd-u="d">${esc(i18n.tn('unit_days', c.days))}</span></div>
        <div><b data-cd="h">${pad2(c.hours)}</b><span data-cd-u="h">${esc(i18n.tn('unit_hours', c.hours))}</span></div>
        <div><b data-cd="m">${pad2(c.minutes)}</b><span>${esc(T('unit_min'))}</span></div>
        <div><b data-cd="s">${pad2(c.seconds)}</b><span>${esc(T('unit_sec'))}</span></div>
      </div></button>`;
    const rest = upcoming.slice(1);
    if (rest.length) h += `<div class="section-label">${esc(T('upcoming'))}</div>` + rest.map((x) => examRow(x, now, false)).join('');
  }
  if (past.length) {
    h += `<details style="margin-top:18px"><summary>${esc(T('past_exams'))} (${past.length})</summary>${past.map((x) => examRow(x, now, true)).join('')}</details>`;
  }
  return h + fab('add-exam', T('add_exam'));
}

function viewTimetable() {
  if (!state.slots.length) {
    return `<div class="card empty">${esc(T('no_classes_week'))}</div>${fab('add-class', T('add_class'))}`;
  }
  const g = slotsByDay(state.slots);
  const today = weekdayMon1(new Date());
  let h = '';
  for (let d = 1; d <= 7; d++) {
    h += `<section class="day${d === today ? ' today' : ''}"><h3>${esc(i18n.weekday(d))}${d === today ? `<span class="badge">${esc(T('today'))}</span>` : ''}</h3>`;
    if (!g[d].length) h += `<p class="none">${esc(T('no_classes'))}</p>`;
    for (const s of g[d]) {
      h += `<button class="row-item" data-action="edit-class" data-id="${s.id}">
        <div class="time-col">${esc(s.start)}<small>${esc(s.end)}</small></div>
        <div class="grow"><div class="name">${esc(s.subject)}</div>${s.room ? `<div class="meta">${esc(s.room)}</div>` : ''}</div></button>`;
    }
    h += '</section>';
  }
  return h + fab('add-class', T('add_class'));
}

function fmtClock(ms) {
  const s = Math.ceil(ms / 1000);
  return `${pad2(Math.floor(s / 60))}:${pad2(s % 60)}`;
}
function ringOffset(tm, nowMs) {
  const frac = tm.durationMs ? timerRemaining(tm, nowMs) / tm.durationMs : 1;
  return RING_C * (1 - Math.min(1, Math.max(0, frac)));
}

function viewTimer() {
  const nowMs = Date.now();
  const tm = state.timer;
  const idle = tm.status === 'idle';
  const mins = Math.round(tm.durationMs / 60000);
  const label = { idle: 'timer_ready', running: 'timer_running', paused: 'timer_paused' }[tm.status];
  const todayISO = toISODate(new Date());
  const st = computeStreak(state.studyLog, todayISO);
  const days = lastDays(state.studyLog, todayISO, 7);
  const maxSec = Math.max(1800, ...days.map((d) => d.seconds));

  const actions = {
    idle: `<button class="btn primary" data-action="timer-start">${esc(T('start'))}</button>`,
    running: `<button class="btn primary" data-action="timer-pause">${esc(T('pause'))}</button>
              <button class="btn" data-action="timer-finish">${esc(T('finish_save'))}</button>`,
    paused: `<button class="btn primary" data-action="timer-resume">${esc(T('resume'))}</button>
             <button class="btn" data-action="timer-finish">${esc(T('finish_save'))}</button>
             <button class="btn ghost danger" data-action="timer-discard">${esc(T('discard'))}</button>`
  }[tm.status];

  return `<div class="stack">
    <div class="card timer-card">
      <div class="ring">
        <svg viewBox="0 0 224 224" aria-hidden="true">
          <circle class="track" cx="112" cy="112" r="${RING_R}"/>
          <circle class="bar" id="t-bar" cx="112" cy="112" r="${RING_R}" stroke-dasharray="${RING_C.toFixed(2)}" stroke-dashoffset="${ringOffset(tm, nowMs).toFixed(2)}"/>
        </svg>
        <div class="center"><div class="time" id="t-time" role="timer">${fmtClock(timerRemaining(tm, nowMs))}</div><div class="state" id="t-state">${esc(T(label))}</div></div>
      </div>
      <div class="chips">${PRESETS.map((m) => `<button class="chip" data-action="preset" data-min="${m}" aria-pressed="${m === mins}" ${idle ? '' : 'disabled'}>${esc(T('minutes_short', { n: m }))}</button>`).join('')}</div>
      ${idle ? `<form class="custom" data-action-form="custom" novalidate><input type="number" name="min" inputmode="numeric" min="1" max="180" placeholder="${esc(T('custom_minutes'))}" aria-label="${esc(T('custom_minutes'))}"><button class="btn" type="submit">${esc(T('set'))}</button></form><p class="err" id="cerr" role="alert"></p>` : ''}
      <div class="actions">${actions}</div>
    </div>
    <div class="card streak">
      <div class="flame">${FLAME}</div>
      <div><div class="big">${esc(T('streak'))}: ${esc(i18n.tn('streak_days', st.current))}</div>
      <div class="sub">${esc(T('streak_best', { n: st.best }))} · ${esc(T('studied_today', { n: Math.floor(st.todaySec / 60) }))}</div>
      <div class="sub">${esc(st.todayDone ? T('streak_done_today') : T('streak_hint'))}</div></div>
    </div>
    <div class="card bars-wrap">
      <div class="section-label" style="margin-left:16px">${esc(T('last7'))}</div>
      <div class="bars">${days.map((d) => `<div title="${Math.floor(d.seconds / 60)} min"><i class="${d.seconds >= MIN_STREAK_SECONDS ? 'on' : ''}" style="height:${Math.max(4, Math.round((d.seconds / maxSec) * 100))}%"></i>${esc(i18n.weekday(d.day, 'short'))}</div>`).join('')}</div>
    </div>
  </div>`;
}

function toggle(key, checked, label, hint) {
  return `<label class="setting"><span class="lbl">${esc(label)}${hint ? `<div class="hint">${esc(hint)}</div>` : ''}</span>
    <span class="switch"><input type="checkbox" data-setting="${key}" ${checked ? 'checked' : ''}></span></label>`;
}

function viewSettings() {
  const s = state.settings;
  const permPill = {
    granted: `<span class="pill ok">${esc(T('notif_granted'))}</span>`,
    denied: `<span class="pill bad">${esc(T('notif_denied'))}</span>`,
    prompt: `<span class="pill">${esc(T('notif_prompt'))}</span>`,
    web: `<span class="pill">${esc(T('notif_web'))}</span>`,
    unknown: ''
  }[ui.perm] || '';
  return `<div class="stack">
    <div class="group"><div class="setting"><span class="lbl">${esc(T('lang'))}</span>
      <span class="seg"><button data-action="lang" data-lang="en" aria-pressed="${s.lang === 'en'}">EN</button><button data-action="lang" data-lang="fr" aria-pressed="${s.lang === 'fr'}">FR</button></span></div></div>

    <div class="section-label">${esc(T('reminders'))}</div>
    <div class="group">
      ${toggle('daily.enabled', s.daily.enabled, T('daily_reminder'))}
      <label class="setting"><span class="lbl">${esc(T('daily_time'))}</span><input type="time" data-setting="daily.time" value="${esc(s.daily.time)}" ${s.daily.enabled ? '' : 'disabled'}></label>
      ${toggle('examReminders', s.examReminders, T('exam_reminders'), T('exam_reminders_hint'))}
      ${toggle('classReminders', s.classReminders, T('class_reminders'))}
      <label class="setting"><span class="lbl">${esc(T('class_lead'))}</span>
        <select data-setting="classLeadMin" ${s.classReminders ? '' : 'disabled'}>${[5, 10, 15, 30].map((n) => `<option value="${n}" ${s.classLeadMin === n ? 'selected' : ''}>${esc(T('min_before', { n }))}</option>`).join('')}</select></label>
    </div>

    <div class="group">
      <div class="setting"><span class="lbl">${esc(T('notif_status'))}</span>${permPill}</div>
      ${ui.perm === 'denied' ? `<div class="note">${esc(T('notif_denied_help'))}</div>` : ''}
      <div class="setting" style="gap:8px;flex-wrap:wrap">
        ${ui.perm === 'prompt' ? `<button class="btn" data-action="allow-notif">${esc(T('allow_notifications'))}</button>` : ''}
        <button class="btn" data-action="test-notif">${esc(T('test_notif'))}</button>
      </div>
    </div>

    <div class="section-label">${esc(T('about'))}</div>
    <div class="group"><div class="setting"><span class="lbl">Cogenax</span><span class="pill">${esc(T('version', { v: APP_VERSION }))}</span></div></div>
  </div>`;
}

const VIEWS = { exams: viewExams, timetable: viewTimetable, timer: viewTimer, settings: viewSettings };

function render() {
  document.documentElement.lang = i18n.lang;
  const view = $('#view');
  const top = view.scrollTop;
  $('#title').textContent = T('title_' + ui.tab);
  view.innerHTML = VIEWS[ui.tab]();
  view.scrollTop = top;
  $('#tabs').innerHTML = TABS.map((k) => `<button data-action="tab" data-tab="${k}" ${ui.tab === k ? 'aria-current="page"' : ''}>
      <svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[k]}</svg>${esc(T('tab_' + k))}</button>`).join('');
}

function go(tab) {
  ui.tab = tab;
  $('#view').scrollTop = 0;
  render();
  if (tab === 'settings') scheduleSync(false);
}

// ---------- forms ----------
function examForm(id) {
  const ex = id ? state.exams.find((e) => e.id === id) : null;
  const v = ex || { name: '', date: toISODate(new Date()), time: '08:00', room: '' };
  openSheet(`<form novalidate>
    <h2>${esc(T(ex ? 'edit_exam' : 'add_exam'))}</h2>
    <label class="field"><span>${esc(T('field_exam'))}</span><input type="text" name="name" maxlength="80" autocomplete="off" value="${esc(v.name)}"></label>
    <div class="two">
      <label class="field"><span>${esc(T('field_date'))}</span><input type="date" name="date" value="${esc(v.date)}"></label>
      <label class="field"><span>${esc(T('field_time'))}</span><input type="time" name="time" value="${esc(v.time)}"></label>
    </div>
    <label class="field"><span>${esc(T('field_room'))}</span><input type="text" name="room" maxlength="40" autocomplete="off" value="${esc(v.room || '')}"></label>
    <p class="err" id="ferr" role="alert"></p>
    <div class="btns">${ex ? `<button type="button" class="btn danger" data-action="delete-exam" data-id="${ex.id}">${esc(T('delete'))}</button>` : ''}<span class="grow"></span>
      <button type="button" class="btn ghost" data-action="close-sheet">${esc(T('cancel'))}</button>
      <button type="submit" class="btn primary">${esc(T('save'))}</button></div></form>`, (fd) => {
    const data = { id: ex?.id, name: String(fd.get('name') || ''), date: String(fd.get('date') || ''), time: String(fd.get('time') || ''), room: String(fd.get('room') || '') };
    const err = validateExam(data);
    if (err) return formError(err);
    setState(upsertExam(state, data));
    closeSheet(); render(); toast(T('saved_toast')); scheduleSync(true);
  });
}

function classForm(id) {
  const sl = id ? state.slots.find((s) => s.id === id) : null;
  const v = sl || { subject: '', day: weekdayMon1(new Date()), start: '08:00', end: '10:00', room: '' };
  openSheet(`<form novalidate>
    <h2>${esc(T(sl ? 'edit_class' : 'add_class'))}</h2>
    <label class="field"><span>${esc(T('field_subject'))}</span><input type="text" name="subject" maxlength="80" autocomplete="off" value="${esc(v.subject)}"></label>
    <label class="field"><span>${esc(T('field_day'))}</span><select name="day">${[1, 2, 3, 4, 5, 6, 7].map((d) => `<option value="${d}" ${v.day === d ? 'selected' : ''}>${esc(i18n.weekday(d))}</option>`).join('')}</select></label>
    <div class="two">
      <label class="field"><span>${esc(T('field_start'))}</span><input type="time" name="start" value="${esc(v.start)}"></label>
      <label class="field"><span>${esc(T('field_end'))}</span><input type="time" name="end" value="${esc(v.end)}"></label>
    </div>
    <label class="field"><span>${esc(T('field_room'))}</span><input type="text" name="room" maxlength="40" autocomplete="off" value="${esc(v.room || '')}"></label>
    <p class="err" id="ferr" role="alert"></p>
    <div class="btns">${sl ? `<button type="button" class="btn danger" data-action="delete-class" data-id="${sl.id}">${esc(T('delete'))}</button>` : ''}<span class="grow"></span>
      <button type="button" class="btn ghost" data-action="close-sheet">${esc(T('cancel'))}</button>
      <button type="submit" class="btn primary">${esc(T('save'))}</button></div></form>`, (fd) => {
    const data = { id: sl?.id, subject: String(fd.get('subject') || ''), day: Number(fd.get('day')), start: String(fd.get('start') || ''), end: String(fd.get('end') || ''), room: String(fd.get('room') || '') };
    const err = validateSlot(data);
    if (err) return formError(err);
    setState(upsertSlot(state, data));
    closeSheet(); render(); toast(T('saved_toast')); scheduleSync(true);
  });
}

function showFinished(seconds) {
  const st = computeStreak(state.studyLog, toISODate(new Date()));
  const min = Math.max(1, Math.round(seconds / 60));
  openSheet(`<div class="sheet-body"><h2>${esc(T('session_done'))}</h2>
    <p>${esc(T('session_saved', { n: min }))}</p>
    <p style="margin:6px 0 16px;color:var(--ink-2)">${esc(T('streak'))}: ${esc(i18n.tn('streak_days', st.current))}</p>
    <button class="btn primary wide" data-action="close-sheet">${esc(T('ok'))}</button></div>`);
}

// ---------- timer ----------
function applyTimer(timer, credit) {
  const log = credit ? addStudy(state.studyLog, credit.date, credit.seconds) : state.studyLog;
  setState({ ...state, timer, studyLog: log });
}

function timerAction(a) {
  const now = Date.now();
  const tm = state.timer;
  if (a === 'start' || a === 'resume') applyTimer(timerStart(tm, now));
  else if (a === 'pause') applyTimer(timerPause(tm, now));
  else if (a === 'discard') applyTimer(timerDiscard(tm));
  else if (a === 'finish') {
    const r = timerStop(tm, now);
    applyTimer(r.timer, r.credit);
    toast(r.credit ? T('session_saved_short', { n: Math.max(1, Math.round(r.credit.seconds / 60)) }) : T('nothing_saved'));
  }
  render();
  scheduleSync(a === 'start' || a === 'resume');
}

function tick() {
  const nowMs = Date.now();
  if (state.timer.status === 'running') {
    const r = timerCompleteIfDue(state.timer, nowMs);
    if (r.completed) {
      const wasLive = nowMs - state.timer.endAt < 5000; // not an old session found after reopening the app
      applyTimer(r.timer, r.credit);
      if (wasLive) navigator.vibrate?.([200, 100, 200]);
      render();
      showFinished(r.credit.seconds);
      scheduleSync(false);
      return;
    }
  }
  if (ui.tab === 'timer') {
    const tm = state.timer;
    const time = $('#t-time');
    if (time) {
      time.textContent = fmtClock(timerRemaining(tm, nowMs));
      $('#t-bar').setAttribute('stroke-dashoffset', ringOffset(tm, nowMs).toFixed(2));
    }
  } else if (ui.tab === 'exams') {
    const box = $('[data-exam]');
    if (box) {
      const e = state.exams.find((x) => x.id === Number(box.dataset.exam));
      const c = e && countdown(e, new Date(nowMs));
      if (!c || c.past) return render();
      const set = (k, v) => { const el = box.querySelector(`[data-cd="${k}"]`); if (el && el.textContent !== v) el.textContent = v; };
      set('d', String(c.days)); set('h', pad2(c.hours)); set('m', pad2(c.minutes)); set('s', pad2(c.seconds));
      box.querySelector('[data-cd-u="d"]').textContent = i18n.tn('unit_days', c.days);
      box.querySelector('[data-cd-u="h"]').textContent = i18n.tn('unit_hours', c.hours);
    }
  }
}

// ---------- events ----------
function confirmDelete() {
  return window.confirm(T('confirm_delete'));
}

document.addEventListener('click', async (ev) => {
  if (ev.target === $('#sheet')) return closeSheet(); // tap on the dimmed background
  const el = ev.target.closest('[data-action]');
  if (!el) return;
  const a = el.dataset.action;
  const id = Number(el.dataset.id);
  switch (a) {
    case 'tab': return go(el.dataset.tab);
    case 'add-exam': return examForm();
    case 'edit-exam': return examForm(id);
    case 'add-class': return classForm();
    case 'edit-class': return classForm(id);
    case 'close-sheet': return closeSheet();
    case 'delete-exam':
      if (!confirmDelete()) return;
      setState(removeExam(state, id)); closeSheet(); render(); toast(T('deleted_toast')); return scheduleSync(true);
    case 'delete-class':
      if (!confirmDelete()) return;
      setState(removeSlot(state, id)); closeSheet(); render(); toast(T('deleted_toast')); return scheduleSync(true);
    case 'timer-start': return timerAction('start');
    case 'timer-pause': return timerAction('pause');
    case 'timer-resume': return timerAction('resume');
    case 'timer-finish': return timerAction('finish');
    case 'timer-discard': return timerAction('discard');
    case 'preset': {
      const m = Number(el.dataset.min);
      if (state.timer.status !== 'idle') return;
      const s = clone(state.settings); s.timerMinutes = m;
      setState({ ...state, settings: s, timer: idleTimer(m) });
      return render();
    }
    case 'lang': {
      const s = clone(state.settings); s.lang = el.dataset.lang;
      setState({ ...state, settings: s });
      i18n = createI18n(s.lang);
      render();
      return scheduleSync(false);
    }
    case 'allow-notif': await scheduleSync(true); return render();
    case 'test-notif': {
      const perm = await notif.permissionState(true);
      ui.perm = perm;
      if (perm === 'web') toast(T('test_web'));
      else if (perm === 'granted') { await notif.scheduleTest(T('test_title'), T('test_body')); toast(T('test_sent')); }
      return render();
    }
  }
});

document.addEventListener('submit', (ev) => {
  const f = ev.target.closest('[data-action-form="custom"]');
  if (!f) return;
  ev.preventDefault();
  const m = Number(new FormData(f).get('min'));
  if (!validateMinutes(m)) { $('#cerr').textContent = T('err_duration'); return; }
  const s = clone(state.settings); s.timerMinutes = m;
  setState({ ...state, settings: s, timer: idleTimer(m) });
  render();
});

document.addEventListener('change', (ev) => {
  const el = ev.target.closest('[data-setting]');
  if (!el) return;
  const s = clone(state.settings);
  switch (el.dataset.setting) {
    case 'daily.enabled': s.daily.enabled = el.checked; break;
    case 'daily.time': if (!isValidTime(el.value)) return; s.daily.time = el.value; break;
    case 'examReminders': s.examReminders = el.checked; break;
    case 'classReminders': s.classReminders = el.checked; break;
    case 'classLeadMin': s.classLeadMin = Number(el.value); break;
    default: return;
  }
  setState({ ...state, settings: s });
  render();
  scheduleSync(true);
});

document.addEventListener('visibilitychange', () => {
  if (!document.hidden) { tick(); render(); scheduleSync(false); }
});

// Android back button (only exists inside the app)
try {
  const App = globalThis.Capacitor?.Plugins?.App;
  App?.addListener?.('backButton', () => {
    if ($('#sheet').open) closeSheet();
    else if (ui.tab !== 'exams') go('exams');
    else App.exitApp();
  });
} catch { /* not running inside Capacitor */ }

// ---------- start ----------
render();
notif.setupChannel().then(() => scheduleSync(false));
setInterval(tick, 250);
tick();

// handy for automated tests
window.__cogenax = { get state() { return state; }, tick };
