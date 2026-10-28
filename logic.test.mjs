import test from 'node:test';
import assert from 'node:assert/strict';
import {
  toISODate, parseDateTime, isValidDate, isValidTime, weekdayMon1, calendarDaysBetween,
  countdown, splitExams, validateExam, slotsByDay, validateSlot,
  addStudy, computeStreak, lastDays, MIN_STREAK_SECONDS,
  idleTimer, timerStart, timerPause, timerRemaining, timerCompleteIfDue, timerStop, timerDiscard,
  buildNotifications, NOTIF
} from '../www/js/logic.js';
import { createI18n } from '../www/js/i18n.js';
import { defaultState } from '../www/js/store.js';

const at = (s) => new Date(s); // local time strings, e.g. '2026-10-28T10:00:00'

test('date helpers', () => {
  assert.equal(toISODate(at('2026-01-05T23:59:00')), '2026-01-05');
  assert.equal(isValidDate('2026-02-29'), false);
  assert.equal(isValidDate('2028-02-29'), true);
  assert.equal(isValidDate('26-1-1'), false);
  assert.equal(isValidTime('24:00'), false);
  assert.equal(isValidTime('09:05'), true);
  assert.equal(weekdayMon1(at('2026-10-26T12:00:00')), 1); // Monday
  assert.equal(weekdayMon1(at('2026-11-01T12:00:00')), 7); // Sunday
  assert.equal(calendarDaysBetween(at('2026-10-28T23:59:00'), at('2026-10-29T00:01:00')), 1);
});

test('countdown values and past flag', () => {
  const now = at('2026-10-28T10:00:00');
  const c = countdown({ date: '2026-10-30', time: '08:30' }, now);
  assert.equal(c.past, false);
  assert.deepEqual([c.days, c.hours, c.minutes, c.seconds], [1, 22, 30, 0]);
  assert.equal(c.calDays, 2);
  const p = countdown({ date: '2026-10-28', time: '09:00' }, now);
  assert.equal(p.past, true);
  assert.equal(p.calDays, 0);
});

test('splitExams sorts upcoming ascending and past descending', () => {
  const now = at('2026-10-28T10:00:00');
  const exams = [
    { id: 1, date: '2026-12-01', time: '08:00' },
    { id: 2, date: '2026-10-30', time: '08:00' },
    { id: 3, date: '2026-10-01', time: '08:00' },
    { id: 4, date: '2026-10-20', time: '08:00' }
  ];
  const { upcoming, past } = splitExams(exams, now);
  assert.deepEqual(upcoming.map((e) => e.id), [2, 1]);
  assert.deepEqual(past.map((e) => e.id), [4, 3]);
});

test('exam and slot validation', () => {
  assert.equal(validateExam({ name: '  ', date: '2026-10-30', time: '08:00' }), 'err_name');
  assert.equal(validateExam({ name: 'Math', date: '', time: '08:00' }), 'err_date');
  assert.equal(validateExam({ name: 'Math', date: '2026-10-30', time: '' }), 'err_time');
  assert.equal(validateExam({ name: 'Math', date: '2026-10-30', time: '08:00' }), null);
  assert.equal(validateSlot({ subject: 'C', day: 0, start: '08:00', end: '09:00' }), 'err_day');
  assert.equal(validateSlot({ subject: 'C', day: 1, start: '09:00', end: '09:00' }), 'err_end');
  assert.equal(validateSlot({ subject: 'C', day: 1, start: '08:00', end: '09:30' }), null);
});

test('slotsByDay groups and sorts by start time', () => {
  const g = slotsByDay([
    { id: 1, day: 2, start: '14:00' }, { id: 2, day: 2, start: '08:00' }, { id: 3, day: 7, start: '10:00' }
  ]);
  assert.deepEqual(g[2].map((s) => s.id), [2, 1]);
  assert.equal(g[1].length, 0);
  assert.equal(g[7].length, 1);
});

test('streak: counts consecutive days, today optional', () => {
  const S = MIN_STREAK_SECONDS;
  const log = { '2026-10-25': S, '2026-10-26': S + 1000, '2026-10-27': S };
  // today (28th) not studied yet: streak stays alive from yesterday
  let r = computeStreak(log, '2026-10-28');
  assert.equal(r.current, 3);
  assert.equal(r.todayDone, false);
  // studied today too
  r = computeStreak({ ...log, '2026-10-28': S }, '2026-10-28');
  assert.equal(r.current, 4);
  assert.equal(r.todayDone, true);
  // today studied but under the threshold does not extend it
  r = computeStreak({ ...log, '2026-10-28': S - 1 }, '2026-10-28');
  assert.equal(r.current, 3);
  // a gap breaks it
  r = computeStreak({ '2026-10-20': S, '2026-10-21': S, '2026-10-27': S }, '2026-10-28');
  assert.equal(r.current, 1);
  assert.equal(r.best, 2);
  // missed yesterday and today: streak is 0
  r = computeStreak({ '2026-10-20': S }, '2026-10-28');
  assert.equal(r.current, 0);
  assert.equal(r.best, 1);
  // month boundary
  r = computeStreak({ '2026-10-31': S, '2026-11-01': S, '2026-11-02': S }, '2026-11-02');
  assert.equal(r.current, 3);
});

test('addStudy accumulates and ignores zero', () => {
  let log = addStudy({}, '2026-10-28', 600);
  log = addStudy(log, '2026-10-28', 120.9);
  assert.equal(log['2026-10-28'], 720);
  assert.equal(addStudy(log, '2026-10-29', 0), log);
});

test('lastDays returns 7 entries ending today', () => {
  const d = lastDays({ '2026-10-28': 900 }, '2026-10-28', 7);
  assert.equal(d.length, 7);
  assert.equal(d[6].date, '2026-10-28');
  assert.equal(d[6].seconds, 900);
  assert.equal(d[0].date, '2026-10-22');
});

test('timer: start, pause, resume, complete', () => {
  const t0 = idleTimer(25);
  const T = at('2026-10-28T10:00:00').getTime();
  let t = timerStart(t0, T);
  assert.equal(t.status, 'running');
  assert.equal(timerRemaining(t, T + 60000), 24 * 60000);
  t = timerPause(t, T + 5 * 60000);
  assert.equal(t.status, 'paused');
  assert.equal(t.remainingMs, 20 * 60000);
  assert.equal(timerRemaining(t, T + 99 * 60000), 20 * 60000); // paused: time does not move
  t = timerStart(t, T + 10 * 60000);
  assert.equal(t.endAt, T + 30 * 60000);
  let r = timerCompleteIfDue(t, T + 29 * 60000);
  assert.equal(r.completed, false);
  r = timerCompleteIfDue(t, T + 31 * 60000);
  assert.equal(r.completed, true);
  assert.deepEqual(r.credit, { date: '2026-10-28', seconds: 25 * 60 });
  assert.equal(r.timer.status, 'idle');
  assert.equal(r.timer.remainingMs, 25 * 60000);
});

test('timer: completes after the app was closed past midnight, credited to the end date', () => {
  const T = at('2026-10-28T23:50:00').getTime();
  const t = timerStart(idleTimer(25), T);
  const r = timerCompleteIfDue(t, at('2026-10-29T08:00:00').getTime());
  assert.equal(r.credit.date, '2026-10-29');
});

test('timer: finishing early credits elapsed time only', () => {
  const T = at('2026-10-28T10:00:00').getTime();
  let t = timerStart(idleTimer(25), T);
  let r = timerStop(t, T + 7 * 60000 + 30000);
  assert.deepEqual(r.credit, { date: '2026-10-28', seconds: 450 });
  assert.equal(r.timer.status, 'idle');
  // paused timer
  t = timerPause(timerStart(idleTimer(25), T), T + 10 * 60000);
  r = timerStop(t, T + 999 * 60000);
  assert.equal(r.credit.seconds, 600);
  // nothing elapsed
  r = timerStop(timerStart(idleTimer(25), T), T);
  assert.equal(r.credit, null);
  assert.equal(timerDiscard(t).status, 'idle');
});

function ctx(lang = 'en') {
  const i = createI18n(lang);
  return { t: i.t, fmtDateTime: i.fmtDateTime };
}

test('notifications: daily + exams (past offsets skipped) + classes + timer', () => {
  const now = at('2026-10-28T10:00:00');
  const st = defaultState('en');
  st.exams = [
    { id: 1, name: 'Maths', date: '2026-11-10', time: '08:00', room: '' }, // all 3 in future
    { id: 2, name: 'C lang', date: '2026-10-29', time: '08:00', room: '' }, // 7d past, 1d (28th 09:00) past, 2h future
    { id: 3, name: 'Old', date: '2026-10-01', time: '08:00', room: '' }
  ];
  st.slots = [{ id: 5, subject: 'Networks', day: 1, start: '08:00', end: '10:00', room: 'B12' }];
  st.timer = { status: 'running', durationMs: 25 * 60000, remainingMs: 25 * 60000, endAt: now.getTime() + 60000 };
  const list = buildNotifications(st, now, ctx());
  const ids = list.map((n) => n.id);
  assert.equal(new Set(ids).size, ids.length, 'ids unique');
  assert.ok(ids.includes(NOTIF.DAILY));
  assert.ok(ids.includes(NOTIF.TIMER));
  assert.deepEqual(ids.filter((i) => i >= NOTIF.EXAM_BASE && i < NOTIF.CLASS_BASE).sort(), [100010, 100011, 100012, 100022]);
  const daily = list.find((n) => n.id === NOTIF.DAILY);
  assert.deepEqual(daily.schedule.on, { hour: 18, minute: 0 });
  const cls = list.find((n) => n.id === NOTIF.CLASS_BASE + 5);
  // Monday 08:00 minus 15 min = Monday 07:45 -> Capacitor weekday 2
  assert.deepEqual(cls.schedule.on, { weekday: 2, hour: 7, minute: 45 });
  assert.equal(cls.title, 'Networks in 15 min');
  assert.equal(cls.body, '08:00–10:00 · B12');
  const e1 = list.find((n) => n.id === 100010);
  assert.equal(e1.schedule.at.getTime(), at('2026-11-03T09:00:00').getTime());
  const e2h = list.find((n) => n.id === 100012);
  assert.equal(e2h.schedule.at.getTime(), at('2026-11-10T06:00:00').getTime());
});

test('notifications: class reminder crossing midnight moves to previous weekday', () => {
  const st = defaultState('en');
  st.settings.classLeadMin = 30;
  st.slots = [
    { id: 1, subject: 'Early', day: 1, start: '00:10', end: '01:00', room: '' }, // Monday 00:10 -> Sunday 23:40
    { id: 2, subject: 'Sun', day: 7, start: '09:00', end: '10:00', room: '' },
    { id: 3, subject: 'Sat', day: 6, start: '09:00', end: '10:00', room: '' }
  ];
  const l = buildNotifications(st, at('2026-10-28T10:00:00'), ctx());
  const by = (id) => l.find((n) => n.id === NOTIF.CLASS_BASE + id).schedule.on;
  assert.deepEqual(by(1), { weekday: 1, hour: 23, minute: 40 }); // Sunday = 1
  assert.deepEqual(by(2), { weekday: 1, hour: 8, minute: 30 });  // Sunday = 1
  assert.deepEqual(by(3), { weekday: 7, hour: 8, minute: 30 });  // Saturday = 7
});

test('notifications: respects switches and french text', () => {
  const now = at('2026-10-28T10:00:00');
  const st = defaultState('fr');
  st.settings.daily.enabled = false;
  st.settings.examReminders = false;
  st.settings.classReminders = false;
  st.exams = [{ id: 1, name: 'Maths', date: '2026-11-10', time: '08:00', room: '' }];
  st.slots = [{ id: 2, subject: 'X', day: 1, start: '08:00', end: '09:00', room: '' }];
  assert.equal(buildNotifications(st, now, ctx('fr')).length, 0);
  st.settings.examReminders = true;
  const l = buildNotifications(st, now, ctx('fr'));
  assert.equal(l.length, 3);
  assert.equal(l.find((n) => n.id === 100011).title, 'Examen demain');
});
