import test from 'node:test';
import assert from 'node:assert/strict';
import { DICT, LANGS, createI18n, detectLang } from '../www/js/i18n.js';
import {
  KEY, defaultState, normalize, loadState, saveState, upsertExam, removeExam, upsertSlot, removeSlot
} from '../www/js/store.js';

test('English and French have exactly the same keys, none empty', () => {
  const en = Object.keys(DICT.en).sort();
  const fr = Object.keys(DICT.fr).sort();
  assert.deepEqual(fr, en);
  for (const l of LANGS) for (const [k, v] of Object.entries(DICT[l])) assert.ok(v.trim().length > 0, `${l}.${k} empty`);
});

test('placeholders match between languages', () => {
  const ph = (s) => (s.match(/\{\w+\}/g) || []).sort().join(',');
  for (const k of Object.keys(DICT.en)) assert.equal(ph(DICT.fr[k]), ph(DICT.en[k]), k);
});

test('translations, plurals and fallbacks', () => {
  const en = createI18n('en');
  const fr = createI18n('fr');
  assert.equal(en.tn('in_days', 1), 'In 1 day');
  assert.equal(en.tn('in_days', 0), 'In 0 days');
  assert.equal(en.tn('in_days', 5), 'In 5 days');
  assert.equal(fr.tn('in_days', 0), 'Dans 0 jour'); // French: 0 is singular
  assert.equal(fr.tn('in_days', 1), 'Dans 1 jour');
  assert.equal(fr.tn('in_days', 2), 'Dans 2 jours');
  assert.equal(en.t('missing_key'), 'missing_key');
  assert.equal(createI18n('de').lang, 'en');
  assert.equal(detectLang('fr-CM'), 'fr');
  assert.equal(detectLang('en-US'), 'en');
  assert.equal(detectLang(undefined), 'en');
});

test('weekday names follow the language, Monday first', () => {
  assert.equal(createI18n('en').weekday(1), 'Monday');
  assert.equal(createI18n('en').weekday(7), 'Sunday');
  assert.equal(createI18n('fr').weekday(1), 'lundi');
  assert.equal(createI18n('fr').weekday(7), 'dimanche');
});

function fakeStorage(initial) {
  const m = new Map(initial ? [[KEY, initial]] : []);
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, v), raw: () => m.get(KEY) };
}

test('state survives a save/load round trip', () => {
  const s = fakeStorage();
  let st = defaultState('fr');
  st = upsertExam(st, { name: ' Maths ', date: '2026-11-10', time: '08:00', room: 'A1' });
  st = upsertSlot(st, { subject: 'C', day: 3, start: '08:00', end: '10:00' });
  st.studyLog = { '2026-10-28': 900 };
  assert.ok(saveState(s, st));
  const back = loadState(s, 'en');
  assert.deepEqual(back, st);
  assert.equal(back.exams[0].name, 'Maths');
  assert.equal(back.settings.lang, 'fr');
});

test('edit and delete', () => {
  let st = defaultState('en');
  st = upsertExam(st, { name: 'A', date: '2026-11-10', time: '08:00' });
  st = upsertExam(st, { name: 'B', date: '2026-11-11', time: '08:00' });
  const idA = st.exams[0].id;
  assert.notEqual(st.exams[0].id, st.exams[1].id);
  st = upsertExam(st, { id: idA, name: 'A2', date: '2026-11-12', time: '09:00' });
  assert.equal(st.exams.length, 2);
  assert.equal(st.exams[0].name, 'A2');
  st = removeExam(st, idA);
  assert.equal(st.exams.length, 1);
  st = upsertSlot(st, { subject: 'S', day: 1, start: '08:00', end: '09:00' });
  const sid = st.slots[0].id;
  assert.ok(!st.exams.some((e) => e.id === sid), 'ids are never reused across exams and classes');
  st = removeSlot(st, sid);
  assert.equal(st.slots.length, 0);
});

test('corrupt or hostile storage never crashes and falls back to defaults', () => {
  assert.deepEqual(loadState(fakeStorage('{not json'), 'en'), defaultState('en'));
  assert.deepEqual(loadState(fakeStorage('null'), 'fr'), defaultState('fr'));
  const throwing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('full'); } };
  assert.deepEqual(loadState(throwing, 'en'), defaultState('en'));
  assert.equal(saveState(throwing, defaultState('en')), false);
});

test('normalize drops invalid entries and repairs bad values', () => {
  const st = normalize({
    nextId: 1,
    settings: { lang: 'xx', daily: { enabled: 'yes', time: '99:99' }, classLeadMin: 7, timerMinutes: 0 },
    exams: [{ id: 4, name: 'ok', date: '2026-11-10', time: '08:00' }, { id: 5, name: '', date: '2026-11-10', time: '08:00' }, null, { name: 'noid', date: '2026-11-10', time: '08:00' }],
    slots: [{ id: 6, subject: 'x', day: 9, start: '08:00', end: '09:00' }],
    studyLog: { '2026-10-28': 600, 'bad': 5, '2026-10-29': -3 },
    timer: { status: 'running', durationMs: 5, endAt: 1 }
  }, 'fr');
  assert.equal(st.settings.lang, 'fr');
  assert.deepEqual(st.settings.daily, { enabled: true, time: '18:00' });
  assert.equal(st.settings.classLeadMin, 15);
  assert.equal(st.settings.timerMinutes, 25);
  assert.deepEqual(st.exams.map((e) => e.id), [4]);
  assert.equal(st.slots.length, 0);
  assert.deepEqual(st.studyLog, { '2026-10-28': 600 });
  assert.equal(st.timer.status, 'idle');
  assert.ok(st.nextId > 4, 'nextId moves past existing ids');
});

test('a running timer is preserved so it can finish after the app was closed', () => {
  const st = normalize({ timer: { status: 'running', durationMs: 1500000, remainingMs: 1500000, endAt: 1760000000000 } });
  assert.equal(st.timer.status, 'running');
  assert.equal(st.timer.endAt, 1760000000000);
});
