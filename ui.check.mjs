// Browser test: runs the real app in Chromium (phone-sized), with a fake Capacitor notification plugin.
// Needs Playwright (not part of the Android build):  node test-ui/ui.check.mjs
import { createRequire } from 'node:module';
import { startServer } from '../scripts/serve.mjs';
import { mkdirSync } from 'node:fs';
const require = createRequire(import.meta.url);
const { chromium } = require('playwright');

const SHOTS = process.env.SHOTS || new URL('./shots/', import.meta.url).pathname;
mkdirSync(SHOTS, { recursive: true });
const server = await startServer(5199);
const BASE = 'http://localhost:5199/';
const T0 = new Date('2026-10-28T09:59:00+01:00');
const NOW = new Date('2026-10-28T10:00:00+01:00'); // Wednesday

let failed = 0, passed = 0;
const check = (name, cond, extra = '') => {
  if (cond) { passed++; console.log('  ok  ', name); } else { failed++; console.log('  FAIL', name, extra); }
};

// Fake of the native plugin: records everything the app asks Android to do.
const FAKE = (perm) => `
  window.__perm = ${JSON.stringify(perm)}; window.__pending = []; window.__log = [];
  const clone = (o) => JSON.parse(JSON.stringify(o));
  window.Capacitor = { isNativePlatform: () => true, Plugins: {
    App: { addListener() {}, exitApp() {} },
    LocalNotifications: {
      async createChannel(o) { __log.push(['createChannel', clone(o)]); },
      async checkPermissions() { return { display: __perm }; },
      async requestPermissions() { __log.push(['requestPermissions']); if (__perm === 'prompt') __perm = 'granted'; return { display: __perm }; },
      async getPending() { return { notifications: __pending.map((n) => ({ id: n.id })) }; },
      async cancel(o) { const ids = o.notifications.map((n) => n.id); __pending = __pending.filter((n) => !ids.includes(n.id)); __log.push(['cancel', ids]); },
      async schedule(o) { for (const n of clone(o).notifications) { __pending = __pending.filter((p) => p.id !== n.id); __pending.push(n); } __log.push(['schedule', o.notifications.length]); }
    } } };`;

const browser = await chromium.launch();
async function newPage({ perm = 'prompt', native = true, scheme = 'light', locale = 'en-US', fakeClock = true } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, timezoneId: 'Africa/Douala', locale, colorScheme: scheme });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  if (native) await page.addInitScript(FAKE(perm));
  if (fakeClock) await page.clock.install({ time: T0 });
  return { page, ctx, errors };
}
const pending = (page) => page.evaluate(() => window.__pending);
const text = (page, sel) => page.locator(sel).first().innerText();
const addExam = async (page, name, date, time, room = '') => {
  await page.click('.fab');
  await page.fill('#sheet input[name=name]', name);
  await page.fill('#sheet input[name=date]', date);
  await page.fill('#sheet input[name=time]', time);
  await page.fill('#sheet input[name=room]', room);
  await page.click('#sheet button[type=submit]');
};
const tab = (page, name) => page.click(`nav button[data-tab=${name}]`);

// ======================================================================
console.log('\n[1] Exams, countdown, notifications');
{
  const { page, ctx, errors } = await newPage();
  await page.goto(BASE);
  await page.clock.pauseAt(NOW);
  await page.waitForSelector('#view');
  check('starts on Exams, English', (await text(page, '#title')) === 'Exams');
  check('empty state shown', (await text(page, '#view')).includes('No exams yet'));
  check('notification channel created on start', await page.evaluate(() => __log.some((l) => l[0] === 'createChannel')));
  await page.screenshot({ path: SHOTS + '01-empty.png' });

  await page.click('.fab');
  await page.click('#sheet button[type=submit]');
  check('empty name rejected', (await text(page, '#ferr')) === 'Please enter a name.');
  await page.click('#sheet [data-action=close-sheet]');

  await addExam(page, 'Algorithms', '2026-11-02', '08:30', 'Hall A');
  check('hero shows exam name', (await text(page, '.hero h2')) === 'Algorithms');
  const cd = await page.locator('.cd b').allInnerTexts();
  check('countdown 4 d 22 h 30 m 00 s', cd.join(':') === '4:22:30:00', cd.join(':'));
  check('permission requested on first save', await page.evaluate(() => __log.some((l) => l[0] === 'requestPermissions')));
  let p = await pending(page);
  check('daily + 1-day + 2-hour reminders scheduled (7-day one already passed)', p.length === 3 && [2,100011,100012].every((i) => p.some((n) => n.id === i)), JSON.stringify(p.map((n) => n.id)));

  await page.clock.runFor(61000);
  const cd2 = await page.locator('.cd b').allInnerTexts();
  check('countdown ticks live (61 s later: 29 m 59 s)', cd2.join(':') === '4:22:28:59', cd2.join(':'));

  await addExam(page, 'Networks', '2026-10-29', '14:00');
  check('nearest exam becomes the hero', (await text(page, '.hero h2')) === 'Networks');
  check('other exam listed with "In 5 days"', (await text(page, '.row-item')).includes('In 5 days'), await text(page, '.row-item'));
  await addExam(page, 'Old exam', '2026-10-01', '08:00');
  check('past exam goes under Past exams', (await text(page, 'details summary')).includes('Past exams (1)'));
  p = await pending(page);
  check('no reminders for the past exam', !p.some((n) => n.body.includes('Old exam')));
  check('2 h reminder for tomorrow exam, 7 d one skipped', p.filter((n) => n.body.startsWith('Networks')).length === 1 && p.find((n) => n.body.startsWith('Networks')).title === 'Exam in 2 hours');

  await page.click('.hero');
  check('edit form opens filled', (await page.inputValue('#sheet input[name=name]')) === 'Networks');
  await page.fill('#sheet input[name=name]', 'Networks & <b>Security</b>');
  await page.click('#sheet button[type=submit]');
  check('names are escaped (no HTML injection)', (await text(page, '.hero h2')) === 'Networks & <b>Security</b>' && (await page.locator('.hero h2 b').count()) === 0);
  await page.screenshot({ path: SHOTS + '02-exams.png' });

  page.once('dialog', (d) => d.accept());
  await page.click('.hero');
  await page.click('#sheet [data-action=delete-exam]');
  check('delete removes exam and its notifications', (await text(page, '.hero h2')) === 'Algorithms' && !(await pending(page)).some((n) => n.body.includes('Networks')));

  await page.reload();
  await page.waitForSelector('.hero');
  check('data survives a restart', (await text(page, '.hero h2')) === 'Algorithms');
  check('no JS errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ======================================================================
console.log('\n[2] Timetable');
{
  const { page, ctx, errors } = await newPage({ perm: 'granted' });
  await page.goto(BASE); await page.clock.pauseAt(NOW);
  await tab(page, 'timetable');
  check('title', (await text(page, '#title')) === 'Weekly timetable');
  check('empty hint', (await text(page, '#view')).includes('Tap + to add a class'));
  await page.click('.fab');
  await page.fill('#sheet input[name=subject]', 'Operating Systems');
  await page.selectOption('#sheet select[name=day]', '3');
  await page.fill('#sheet input[name=start]', '10:00');
  await page.fill('#sheet input[name=end]', '09:00');
  await page.fill('#sheet input[name=room]', 'B12');
  await page.click('#sheet button[type=submit]');
  check('end before start rejected', (await text(page, '#ferr')).includes('end time must be after'));
  await page.fill('#sheet input[name=start]', '08:00');
  await page.fill('#sheet input[name=end]', '10:00');
  await page.click('#sheet button[type=submit]');
  const wed = page.locator('.day').nth(2);
  check('class appears under Wednesday', (await wed.innerText()).includes('Operating Systems') && (await wed.innerText()).includes('B12'));
  check('Wednesday is marked Today', (await wed.innerText()).toLowerCase().includes('today'));
  const days = await page.locator('.day h3').allInnerTexts();
  check('week starts on Monday', days[0].toLowerCase().startsWith('monday') && days[6].toLowerCase().startsWith('sunday'));
  let p = await pending(page);
  let c = p.find((n) => n.id >= 500000);
  check('class reminder: Wednesday 07:45 (Capacitor weekday 4)', c && c.schedule.on.weekday === 4 && c.schedule.on.hour === 7 && c.schedule.on.minute === 45, JSON.stringify(c));
  check('class reminder text', c.title === 'Operating Systems in 15 min' && c.body === '08:00–10:00 · B12', c.title + ' / ' + c.body);
  await page.click('.row-item');
  await page.fill('#sheet input[name=subject]', 'Math');
  await page.click('#sheet button[type=submit]');
  check('edit class', (await wed.innerText()).includes('Math'));
  await page.screenshot({ path: SHOTS + '03-timetable.png' });
  check('no JS errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ======================================================================
console.log('\n[3] Timer and streak');
{
  const { page, ctx, errors } = await newPage({ perm: 'granted' });
  await page.goto(BASE); await page.clock.pauseAt(NOW);
  await tab(page, 'timer');
  check('default 25:00 ready', (await text(page, '#t-time')) === '25:00' && (await text(page, '#t-state')).toLowerCase() === 'ready');
  check('streak starts at 0 days', (await text(page, '.streak .big')).includes('0 days'));
  await page.click('[data-action=preset][data-min="15"]');
  check('preset 15', (await text(page, '#t-time')) === '15:00');
  await page.fill('input[name=min]', '0'); await page.click('.custom button');
  check('custom 0 rejected', (await text(page, '#cerr')).includes('between 1 and 180'));
  await page.fill('input[name=min]', '181'); await page.click('.custom button');
  check('custom 181 rejected', (await text(page, '#cerr')).includes('between 1 and 180'));
  await page.fill('input[name=min]', '2'); await page.click('.custom button');
  check('custom 2 min', (await text(page, '#t-time')) === '02:00');

  await page.click('[data-action=timer-start]');
  check('running state', (await text(page, '#t-state')).toLowerCase() === 'focus');
  check('end-of-session notification scheduled', (await pending(page)).some((n) => n.id === 1 && n.title === 'Session complete'));
  await page.clock.runFor(30000);
  check('counts down (30 s later 01:30)', (await text(page, '#t-time')) === '01:30', await text(page, '#t-time'));
  await page.click('[data-action=timer-pause]');
  check('paused, notification removed', (await text(page, '#t-state')).toLowerCase() === 'paused' && !(await pending(page)).some((n) => n.id === 1));
  await page.clock.runFor(60000);
  check('paused timer does not move', (await text(page, '#t-time')) === '01:30');
  await page.click('[data-action=timer-resume]');
  check('resume re-schedules the notification', (await pending(page)).some((n) => n.id === 1));
  await page.clock.runFor(10000);
  await page.click('[data-action=timer-finish]');
  const log1 = await page.evaluate(() => __cogenax.state.studyLog);
  check('finishing early saves elapsed time (40 s)', Object.values(log1)[0] === 40, JSON.stringify(log1));
  check('under 5 min does not count for the streak', (await text(page, '.streak .big')).includes('0 days'));

  await page.fill('input[name=min]', '5'); await page.click('.custom button');
  await page.click('[data-action=timer-start]');
  await page.clock.runFor(5 * 60000 + 1000);
  check('completion dialog appears', (await text(page, '#sheet h2')) === 'Session complete!', await text(page, '#sheet'));
  await page.screenshot({ path: SHOTS + '04-session-done.png' });
  await page.click('#sheet [data-action=close-sheet]');
  const log2 = await page.evaluate(() => Object.values(__cogenax.state.studyLog)[0]);
  check('full session credited (40 s + 300 s)', log2 === 340, String(log2));
  check('streak is now 1 day', (await text(page, '.streak .big')).includes('1 day') && !(await text(page, '.streak .big')).includes('1 days'));
  check('timer back to ready', (await text(page, '#t-state')).toLowerCase() === 'ready');
  await page.screenshot({ path: SHOTS + '05-timer.png' });

  // App closed while a session ran: on reopening it is completed and credited.
  await page.evaluate(() => {
    const s = __cogenax.state;
    const end = new Date('2026-10-28T09:00:00+01:00').getTime();
    localStorage.setItem('cogenax.v1', JSON.stringify({ ...s, studyLog: {}, timer: { status: 'running', durationMs: 25 * 60000, remainingMs: 25 * 60000, endAt: end } }));
  });
  await page.reload();
  await page.waitForSelector('#sheet[open]');
  check('session that ended while the app was closed is credited on reopen', (await text(page, '#sheet h2')) === 'Session complete!');
  const log3 = await page.evaluate(() => __cogenax.state.studyLog);
  check('credit = 25 min on the day it ended', log3['2026-10-28'] === 1500, JSON.stringify(log3));
  check('no JS errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ======================================================================
console.log('\n[4] Settings, French, reminders');
{
  const { page, ctx, errors } = await newPage({ perm: 'granted' });
  await page.goto(BASE); await page.clock.pauseAt(NOW);
  await addExam(page, 'Maths', '2026-11-10', '08:00');
  await tab(page, 'timetable');
  await page.click('.fab');
  await page.fill('#sheet input[name=subject]', 'Réseaux');
  await page.selectOption('#sheet select[name=day]', '1');
  await page.fill('#sheet input[name=start]', '08:00'); await page.fill('#sheet input[name=end]', '10:00');
  await page.click('#sheet button[type=submit]');
  await tab(page, 'settings');
  await page.screenshot({ path: SHOTS + '06-settings.png' });
  check('notifications shown as Allowed', (await text(page, '#view')).includes('Allowed'));

  await page.click('[data-lang=fr]');
  check('French UI', (await text(page, '#title')) === 'Réglages' && (await text(page, '#tabs')).includes('Examens') && (await text(page, '#tabs')).includes('Minuteur'));
  let p = await pending(page);
  check('notifications re-created in French', p.some((n) => n.title === 'Examen demain') && p.some((n) => n.title === "C'est l'heure d'étudier"), JSON.stringify(p.map((n) => n.title)));
  await tab(page, 'exams');
  check('exam screen in French (jours, Prochain examen)', (await text(page, '.hero')).toLowerCase().includes('prochain examen') && (await text(page, '.hero')).includes('jours'));
  check('French date format', (await text(page, '.hero .when')).toLowerCase().includes('nov'), await text(page, '.hero .when'));
  await tab(page, 'timetable');
  const fdays = await page.locator('.day h3').allInnerTexts();
  check('French weekdays', fdays[0].toLowerCase().startsWith('lundi') && fdays[2].toLowerCase().startsWith('mercredi'), fdays.join(','));
  await page.screenshot({ path: SHOTS + '07-timetable-fr.png' });
  await tab(page, 'timer');
  check('timer screen in French', (await text(page, '#t-state')).toLowerCase() === 'prêt' && (await text(page, '.streak')).includes('Série'));
  await tab(page, 'settings');

  await page.uncheck('[data-setting="daily.enabled"]');
  check('daily reminder off removes it', !(await pending(page)).some((n) => n.id === 2));
  await page.check('[data-setting="daily.enabled"]');
  await page.fill('[data-setting="daily.time"]', '06:45');
  await page.dispatchEvent('[data-setting="daily.time"]', 'change');
  const d = (await pending(page)).find((n) => n.id === 2);
  check('daily reminder time 06:45', d && d.schedule.on.hour === 6 && d.schedule.on.minute === 45, JSON.stringify(d));
  await page.selectOption('[data-setting=classLeadMin]', '30');
  const cl = (await pending(page)).find((n) => n.id >= 500000);
  check('class lead 30 min: Monday 07:30 (weekday 2)', cl.schedule.on.weekday === 2 && cl.schedule.on.hour === 7 && cl.schedule.on.minute === 30 && cl.title === 'Réseaux dans 30 min', JSON.stringify(cl));
  await page.uncheck('[data-setting=classReminders]');
  check('class reminders off', !(await pending(page)).some((n) => n.id >= 500000));
  await page.uncheck('[data-setting=examReminders]');
  check('exam reminders off', !(await pending(page)).some((n) => n.id >= 100000 && n.id < 500000));

  await page.click('[data-action=test-notif]');
  check('test notification scheduled ~5 s ahead', (await pending(page)).some((n) => n.id === 3 && n.title === 'Test Cogenax'));
  await page.click('[data-setting="daily.enabled"]'); // a later sync must not cancel the test
  check('later sync keeps the test notification', (await pending(page)).some((n) => n.id === 3));

  await page.reload();
  await page.waitForSelector('#title');
  check('language and switches persist after restart', (await text(page, '#title')) === 'Exams' || (await text(page, '#title')) === 'Examens');
  const st = await page.evaluate(() => __cogenax.state.settings);
  check('settings persisted', st.lang === 'fr' && st.examReminders === false && st.classLeadMin === 30 && st.daily.time === '06:45', JSON.stringify(st));
  check('no JS errors', errors.length === 0, errors.join(' | '));
  await ctx.close();
}

// ======================================================================
console.log('\n[5] Permission denied / plain browser / dark mode / French phone');
{
  const a = await newPage({ perm: 'denied' });
  await a.page.goto(BASE); await a.page.clock.pauseAt(NOW);
  await addExam(a.page, 'Maths', '2026-11-10', '08:00');
  check('nothing scheduled when blocked', (await pending(a.page)).length === 0);
  await tab(a.page, 'settings');
  check('explains how to unblock', (await text(a.page, '#view')).includes('Allow them in Android Settings'));
  check('no JS errors (denied)', a.errors.length === 0, a.errors.join(' | '));
  await a.ctx.close();

  const b = await newPage({ native: false });
  await b.page.goto(BASE); await b.page.clock.pauseAt(NOW);
  await addExam(b.page, 'Maths', '2026-11-10', '08:00');
  await tab(b.page, 'settings');
  check('plain browser: works, says notifications are Android-only', (await text(b.page, '#view')).includes('Only in the Android app'));
  await b.page.click('[data-action=test-notif]');
  check('plain browser: test button explains', (await text(b.page, '#toast')).includes('only work in the Android app'));
  check('no JS errors (browser)', b.errors.length === 0, b.errors.join(' | '));
  await b.ctx.close();

  const c = await newPage({ scheme: 'dark', locale: 'fr-CM', perm: 'granted' });
  await c.page.goto(BASE); await c.page.clock.pauseAt(NOW);
  check('a French phone starts in French', (await text(c.page, '#title')) === 'Examens');
  await addExam(c.page, 'Algorithmique', '2026-10-30', '08:00', 'Amphi 1');
  await c.page.screenshot({ path: SHOTS + '08-exams-dark-fr.png' });
  await tab(c.page, 'timer');
  await c.page.screenshot({ path: SHOTS + '09-timer-dark.png' });
  check('no JS errors (dark/fr)', c.errors.length === 0, c.errors.join(' | '));
  await c.ctx.close();
}

await browser.close();
server.close();
console.log(`\n${passed} passed, ${failed} failed`);
process.exit(failed ? 1 : 0);
