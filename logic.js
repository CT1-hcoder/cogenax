// Pure helpers: dates, countdown, timetable, streak, timer, notification plan.
// No DOM and no storage in here, so everything can be tested in Node.

export const MIN_STREAK_SECONDS = 300; // a day counts after 5 minutes of study
export const CHANNEL_ID = 'cogenax';
export const NOTIF = { TIMER: 1, DAILY: 2, TEST: 3, EXAM_BASE: 100000, CLASS_BASE: 500000 };

const pad = (n) => String(n).padStart(2, '0');

// ---------- dates ----------
export function toISODate(d) {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function parseDateTime(dateStr, timeStr = '00:00') {
  const [y, m, d] = dateStr.split('-').map(Number);
  const [hh, mm] = timeStr.split(':').map(Number);
  return new Date(y, m - 1, d, hh, mm, 0, 0);
}

export function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  return toISODate(parseDateTime(s)) === s;
}

export function isValidTime(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function timeToMinutes(s) {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
}

// 1 = Monday ... 7 = Sunday
export function weekdayMon1(d) {
  const g = d.getDay();
  return g === 0 ? 7 : g;
}

export function addDays(d, n) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
  return x;
}

// whole calendar days from a to b (ignores clock time, safe across DST)
export function calendarDaysBetween(a, b) {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}

// ---------- exams ----------
export function countdown(exam, now) {
  const target = parseDateTime(exam.date, exam.time);
  const diff = target - now;
  const abs = Math.abs(diff);
  return {
    past: diff <= 0,
    diff,
    days: Math.floor(abs / 86400000),
    hours: Math.floor((abs % 86400000) / 3600000),
    minutes: Math.floor((abs % 3600000) / 60000),
    seconds: Math.floor((abs % 60000) / 1000),
    calDays: calendarDaysBetween(now, target)
  };
}

export function splitExams(exams, now) {
  const withT = exams.map((e) => ({ e, t: parseDateTime(e.date, e.time).getTime() }));
  const upcoming = withT.filter((x) => x.t > now.getTime()).sort((a, b) => a.t - b.t).map((x) => x.e);
  const past = withT.filter((x) => x.t <= now.getTime()).sort((a, b) => b.t - a.t).map((x) => x.e);
  return { upcoming, past };
}

export function validateExam(x) {
  if (!x.name || !String(x.name).trim()) return 'err_name';
  if (!isValidDate(x.date)) return 'err_date';
  if (!isValidTime(x.time)) return 'err_time';
  return null;
}

// ---------- timetable ----------
export function slotsByDay(slots) {
  const out = { 1: [], 2: [], 3: [], 4: [], 5: [], 6: [], 7: [] };
  for (const s of slots) if (out[s.day]) out[s.day].push(s);
  for (const d of Object.keys(out)) out[d].sort((a, b) => timeToMinutes(a.start) - timeToMinutes(b.start));
  return out;
}

export function validateSlot(x) {
  if (!x.subject || !String(x.subject).trim()) return 'err_name';
  if (!Number.isInteger(x.day) || x.day < 1 || x.day > 7) return 'err_day';
  if (!isValidTime(x.start) || !isValidTime(x.end)) return 'err_time';
  if (timeToMinutes(x.end) <= timeToMinutes(x.start)) return 'err_end';
  return null;
}

// ---------- study log + streak ----------
// log: { 'YYYY-MM-DD': seconds }
export function addStudy(log, dateISO, seconds) {
  const s = Math.max(0, Math.floor(seconds));
  if (s === 0) return log;
  return { ...log, [dateISO]: (log[dateISO] || 0) + s };
}

export function computeStreak(log, todayISO) {
  const ok = (iso) => (log[iso] || 0) >= MIN_STREAK_SECONDS;
  let current = 0;
  let d = parseDateTime(todayISO);
  if (!ok(todayISO)) d = addDays(d, -1);
  while (ok(toISODate(d))) {
    current++;
    d = addDays(d, -1);
  }
  const days = Object.keys(log).filter(ok).sort();
  let best = 0;
  let run = 0;
  let prev = null;
  for (const day of days) {
    run = prev && calendarDaysBetween(parseDateTime(prev), parseDateTime(day)) === 1 ? run + 1 : 1;
    if (run > best) best = run;
    prev = day;
  }
  return { current, best, todaySec: log[todayISO] || 0, todayDone: ok(todayISO) };
}

export function lastDays(log, todayISO, n = 7) {
  const out = [];
  const today = parseDateTime(todayISO);
  for (let i = n - 1; i >= 0; i--) {
    const d = addDays(today, -i);
    const iso = toISODate(d);
    out.push({ date: iso, day: weekdayMon1(d), seconds: log[iso] || 0 });
  }
  return out;
}

// ---------- timer ----------
// timer: { status: 'idle'|'running'|'paused', durationMs, remainingMs, endAt }
export function idleTimer(minutes) {
  const ms = Math.round(minutes * 60000);
  return { status: 'idle', durationMs: ms, remainingMs: ms, endAt: null };
}

export function validateMinutes(v) {
  return Number.isFinite(v) && Number.isInteger(v) && v >= 1 && v <= 180;
}

export function timerRemaining(timer, now) {
  const ms = timer.status === 'running' ? timer.endAt - now : timer.remainingMs;
  return Math.max(0, ms);
}

export function timerStart(timer, nowMs) {
  return { ...timer, status: 'running', endAt: nowMs + timer.remainingMs };
}

export function timerPause(timer, nowMs) {
  if (timer.status !== 'running') return timer;
  return { ...timer, status: 'paused', remainingMs: Math.max(0, timer.endAt - nowMs), endAt: null };
}

// If a running timer has reached zero, credit the full session. Used on every tick and on app resume.
export function timerCompleteIfDue(timer, nowMs) {
  if (timer.status === 'running' && timer.endAt <= nowMs) {
    return {
      timer: idleTimer(timer.durationMs / 60000),
      credit: { date: toISODate(new Date(timer.endAt)), seconds: Math.floor(timer.durationMs / 1000) },
      completed: true
    };
  }
  return { timer, credit: null, completed: false };
}

// Finish early: credit the time actually studied.
export function timerStop(timer, nowMs) {
  if (timer.status === 'idle') return { timer, credit: null };
  const remaining = timerRemaining(timer, nowMs);
  const elapsedSec = Math.floor((timer.durationMs - remaining) / 1000);
  return {
    timer: idleTimer(timer.durationMs / 60000),
    credit: elapsedSec > 0 ? { date: toISODate(new Date(nowMs)), seconds: elapsedSec } : null
  };
}

export function timerDiscard(timer) {
  return idleTimer(timer.durationMs / 60000);
}

// ---------- notification plan ----------
// Builds the full list of notifications that should exist right now.
// ctx: { t, fmtDateTime }. Capacitor weekday numbers: 1 = Sunday ... 7 = Saturday.
export function buildNotifications(state, now, ctx) {
  const { t, fmtDateTime } = ctx;
  const s = state.settings;
  const out = [];
  const common = { channelId: CHANNEL_ID };

  if (s.daily.enabled && isValidTime(s.daily.time)) {
    const [hour, minute] = s.daily.time.split(':').map(Number);
    out.push({
      id: NOTIF.DAILY, title: t('n_daily_title'), body: t('n_daily_body'),
      schedule: { on: { hour, minute }, allowWhileIdle: true }, ...common
    });
  }

  if (s.examReminders) {
    for (const ex of state.exams) {
      const target = parseDateTime(ex.date, ex.time);
      const d7 = addDays(target, -7); d7.setHours(9, 0, 0, 0);
      const d1 = addDays(target, -1); d1.setHours(9, 0, 0, 0);
      const h2 = new Date(target.getTime() - 2 * 3600000);
      const when = fmtDateTime(ex.date, ex.time);
      [['7d', d7], ['1d', d1], ['2h', h2]].forEach(([key, at], k) => {
        if (at.getTime() > now.getTime()) {
          out.push({
            id: NOTIF.EXAM_BASE + ex.id * 10 + k,
            title: t(`n_exam_${key}_title`),
            body: t('n_exam_body', { name: ex.name, when }),
            schedule: { at, allowWhileIdle: true }, ...common
          });
        }
      });
    }
  }

  if (s.classReminders) {
    for (const sl of state.slots) {
      let startMin = timeToMinutes(sl.start) - s.classLeadMin;
      let day = sl.day;
      if (startMin < 0) { startMin += 1440; day = day === 1 ? 7 : day - 1; }
      out.push({
        id: NOTIF.CLASS_BASE + sl.id,
        title: t('n_class_title', { subject: sl.subject, n: s.classLeadMin }),
        body: t('n_class_body', { start: sl.start, end: sl.end, room: sl.room ? ` · ${sl.room}` : '' }),
        schedule: { on: { weekday: (day % 7) + 1, hour: Math.floor(startMin / 60), minute: startMin % 60 }, allowWhileIdle: true },
        ...common
      });
    }
  }

  const tm = state.timer;
  if (tm.status === 'running' && tm.endAt > now.getTime()) {
    out.push({
      id: NOTIF.TIMER, title: t('n_timer_title'),
      body: t('n_timer_body', { n: Math.round(tm.durationMs / 60000) }),
      schedule: { at: new Date(tm.endAt), allowWhileIdle: true }, ...common
    });
  }
  return out;
}
