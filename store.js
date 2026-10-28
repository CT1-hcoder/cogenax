// Saved data: load, validate, save. The storage object is passed in so tests can fake it.
import { idleTimer, validateExam, validateSlot, isValidTime } from './logic.js';

export const KEY = 'cogenax.v1';

export function defaultState(lang = 'en') {
  return {
    version: 1,
    nextId: 1,
    settings: {
      lang,
      daily: { enabled: true, time: '18:00' },
      examReminders: true,
      classReminders: true,
      classLeadMin: 15,
      timerMinutes: 25
    },
    exams: [],
    slots: [],
    studyLog: {},
    timer: idleTimer(25)
  };
}

const num = (v, d) => (Number.isFinite(v) ? v : d);

// Accepts anything read from storage and returns a safe state object.
export function normalize(raw, fallbackLang = 'en') {
  const d = defaultState(fallbackLang);
  if (!raw || typeof raw !== 'object') return d;
  const s = raw.settings && typeof raw.settings === 'object' ? raw.settings : {};
  const settings = {
    lang: s.lang === 'fr' || s.lang === 'en' ? s.lang : d.settings.lang,
    daily: {
      enabled: typeof s.daily?.enabled === 'boolean' ? s.daily.enabled : d.settings.daily.enabled,
      time: isValidTime(s.daily?.time) ? s.daily.time : d.settings.daily.time
    },
    examReminders: typeof s.examReminders === 'boolean' ? s.examReminders : true,
    classReminders: typeof s.classReminders === 'boolean' ? s.classReminders : true,
    classLeadMin: [5, 10, 15, 30].includes(s.classLeadMin) ? s.classLeadMin : 15,
    timerMinutes: Number.isInteger(s.timerMinutes) && s.timerMinutes >= 1 && s.timerMinutes <= 180 ? s.timerMinutes : 25
  };
  const exams = (Array.isArray(raw.exams) ? raw.exams : [])
    .filter((e) => e && Number.isInteger(e.id) && !validateExam(e))
    .map((e) => ({ id: e.id, name: String(e.name).trim(), date: e.date, time: e.time, room: e.room ? String(e.room) : '' }));
  const slots = (Array.isArray(raw.slots) ? raw.slots : [])
    .filter((x) => x && Number.isInteger(x.id) && !validateSlot(x))
    .map((x) => ({ id: x.id, subject: String(x.subject).trim(), day: x.day, start: x.start, end: x.end, room: x.room ? String(x.room) : '' }));
  const studyLog = {};
  if (raw.studyLog && typeof raw.studyLog === 'object') {
    for (const [k, v] of Object.entries(raw.studyLog)) {
      if (/^\d{4}-\d{2}-\d{2}$/.test(k) && Number.isFinite(v) && v > 0) studyLog[k] = Math.floor(v);
    }
  }
  let timer = idleTimer(settings.timerMinutes);
  const t = raw.timer;
  if (t && typeof t === 'object' && num(t.durationMs, 0) >= 60000 && t.durationMs <= 180 * 60000) {
    if (t.status === 'running' && Number.isFinite(t.endAt)) {
      timer = { status: 'running', durationMs: t.durationMs, remainingMs: num(t.remainingMs, t.durationMs), endAt: t.endAt };
    } else if (t.status === 'paused' && Number.isFinite(t.remainingMs) && t.remainingMs >= 0) {
      timer = { status: 'paused', durationMs: t.durationMs, remainingMs: Math.min(t.remainingMs, t.durationMs), endAt: null };
    } else {
      timer = idleTimer(t.durationMs / 60000);
    }
  }
  const maxId = Math.max(0, ...exams.map((e) => e.id), ...slots.map((x) => x.id));
  const nextId = Math.max(Number.isInteger(raw.nextId) ? raw.nextId : 1, maxId + 1);
  return { version: 1, nextId, settings, exams, slots, studyLog, timer };
}

export function loadState(storage, fallbackLang = 'en') {
  try {
    const raw = storage.getItem(KEY);
    if (!raw) return defaultState(fallbackLang);
    return normalize(JSON.parse(raw), fallbackLang);
  } catch {
    return defaultState(fallbackLang);
  }
}

export function saveState(storage, state) {
  try {
    storage.setItem(KEY, JSON.stringify(state));
    return true;
  } catch {
    return false;
  }
}

// ---------- edits (return a new state) ----------
export function upsertExam(state, data) {
  const exam = { name: data.name.trim(), date: data.date, time: data.time, room: (data.room || '').trim() };
  if (data.id) {
    return { ...state, exams: state.exams.map((e) => (e.id === data.id ? { id: e.id, ...exam } : e)) };
  }
  return { ...state, nextId: state.nextId + 1, exams: [...state.exams, { id: state.nextId, ...exam }] };
}

export function removeExam(state, id) {
  return { ...state, exams: state.exams.filter((e) => e.id !== id) };
}

export function upsertSlot(state, data) {
  const slot = { subject: data.subject.trim(), day: data.day, start: data.start, end: data.end, room: (data.room || '').trim() };
  if (data.id) {
    return { ...state, slots: state.slots.map((s) => (s.id === data.id ? { id: s.id, ...slot } : s)) };
  }
  return { ...state, nextId: state.nextId + 1, slots: [...state.slots, { id: state.nextId, ...slot }] };
}

export function removeSlot(state, id) {
  return { ...state, slots: state.slots.filter((s) => s.id !== id) };
}
