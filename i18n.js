// English / French strings and date formatting. No DOM access.
import { parseDateTime } from './logic.js';

export const LANGS = ['en', 'fr'];

export const DICT = {
  en: {
    tab_exams: 'Exams', tab_timetable: 'Timetable', tab_timer: 'Timer', tab_settings: 'Settings',
    title_exams: 'Exams', title_timetable: 'Weekly timetable', title_timer: 'Study timer', title_settings: 'Settings',

    next_exam: 'Next exam', upcoming: 'Upcoming', past_exams: 'Past exams', done: 'Done',
    today: 'Today', tomorrow: 'Tomorrow',
    in_days_one: 'In {n} day', in_days_other: 'In {n} days',
    unit_days_one: 'day', unit_days_other: 'days',
    unit_hours_one: 'hour', unit_hours_other: 'hours',
    unit_min: 'min', unit_sec: 'sec',
    no_exams: 'No exams yet. Tap + to add your first one.',
    add_exam: 'Add exam', edit_exam: 'Edit exam',
    field_exam: 'Exam name', field_date: 'Date', field_time: 'Time', field_room: 'Room (optional)',

    add_class: 'Add class', edit_class: 'Edit class',
    field_subject: 'Subject', field_day: 'Day', field_start: 'Starts', field_end: 'Ends',
    no_classes: 'No classes', no_classes_week: 'Your week is empty. Tap + to add a class.',

    save: 'Save', cancel: 'Cancel', delete: 'Delete', ok: 'OK',
    confirm_delete: 'Delete this item?',
    err_name: 'Please enter a name.', err_date: 'Choose a valid date.', err_time: 'Choose a valid time.',
    err_day: 'Choose a day.', err_end: 'The end time must be after the start time.',
    err_duration: 'Enter a duration between 1 and 180 minutes.',
    saved_toast: 'Saved', deleted_toast: 'Deleted',

    timer_ready: 'Ready', timer_running: 'Focus', timer_paused: 'Paused',
    start: 'Start', pause: 'Pause', resume: 'Resume',
    finish_save: 'Finish & save', discard: 'Discard',
    minutes_short: '{n} min', custom_minutes: 'Custom (minutes)', set: 'Set',
    streak: 'Streak', streak_days_one: '{n} day', streak_days_other: '{n} days',
    streak_best: 'Best: {n}', studied_today: 'Today: {n} min',
    streak_hint: 'Study at least 5 minutes a day to keep your streak.',
    streak_done_today: 'Today counts. Streak safe!',
    last7: 'Last 7 days',
    session_done: 'Session complete!', session_saved: '{n} min saved to your streak.',
    session_saved_short: '{n} min saved.', nothing_saved: 'Nothing to save yet.',

    lang: 'Language', reminders: 'Reminders',
    daily_reminder: 'Daily study reminder', daily_time: 'Reminder time',
    exam_reminders: 'Exam reminders', exam_reminders_hint: '7 days, 1 day and 2 hours before',
    class_reminders: 'Class reminders', class_lead: 'Remind me before class',
    min_before: '{n} min before',
    notif_status: 'Notifications',
    notif_granted: 'Allowed', notif_denied: 'Blocked',
    notif_denied_help: 'Notifications are blocked. Allow them in Android Settings > Apps > Cogenax > Notifications.',
    notif_prompt: 'Not asked yet', notif_web: 'Only in the Android app',
    allow_notifications: 'Allow notifications',
    test_notif: 'Send a test notification (5 s)',
    test_title: 'Cogenax test', test_body: 'Notifications are working.',
    test_sent: 'Test scheduled. Wait 5 seconds.',
    test_web: 'Notifications only work in the Android app.',
    about: 'About', version: 'Version {v}',

    n_daily_title: 'Time to study', n_daily_body: 'Open Cogenax and start a session to keep your streak.',
    n_exam_7d_title: 'Exam in 7 days', n_exam_1d_title: 'Exam tomorrow', n_exam_2h_title: 'Exam in 2 hours',
    n_exam_body: '{name} · {when}',
    n_class_title: '{subject} in {n} min', n_class_body: '{start}–{end}{room}',
    n_timer_title: 'Session complete', n_timer_body: '{n} minutes of focus. Well done!'
  },

  fr: {
    tab_exams: 'Examens', tab_timetable: 'Horaire', tab_timer: 'Minuteur', tab_settings: 'Réglages',
    title_exams: 'Examens', title_timetable: 'Emploi du temps', title_timer: "Minuteur d'étude", title_settings: 'Réglages',

    next_exam: 'Prochain examen', upcoming: 'À venir', past_exams: 'Examens passés', done: 'Terminé',
    today: "Aujourd'hui", tomorrow: 'Demain',
    in_days_one: 'Dans {n} jour', in_days_other: 'Dans {n} jours',
    unit_days_one: 'jour', unit_days_other: 'jours',
    unit_hours_one: 'heure', unit_hours_other: 'heures',
    unit_min: 'min', unit_sec: 'sec',
    no_exams: 'Aucun examen pour le moment. Appuyez sur + pour ajouter le premier.',
    add_exam: 'Ajouter un examen', edit_exam: "Modifier l'examen",
    field_exam: "Nom de l'examen", field_date: 'Date', field_time: 'Heure', field_room: 'Salle (facultatif)',

    add_class: 'Ajouter un cours', edit_class: 'Modifier le cours',
    field_subject: 'Matière', field_day: 'Jour', field_start: 'Début', field_end: 'Fin',
    no_classes: 'Aucun cours', no_classes_week: 'Votre semaine est vide. Appuyez sur + pour ajouter un cours.',

    save: 'Enregistrer', cancel: 'Annuler', delete: 'Supprimer', ok: 'OK',
    confirm_delete: 'Supprimer cet élément ?',
    err_name: 'Veuillez saisir un nom.', err_date: 'Choisissez une date valide.', err_time: 'Choisissez une heure valide.',
    err_day: 'Choisissez un jour.', err_end: "L'heure de fin doit être après l'heure de début.",
    err_duration: 'Saisissez une durée entre 1 et 180 minutes.',
    saved_toast: 'Enregistré', deleted_toast: 'Supprimé',

    timer_ready: 'Prêt', timer_running: 'Concentration', timer_paused: 'En pause',
    start: 'Démarrer', pause: 'Pause', resume: 'Reprendre',
    finish_save: 'Terminer et enregistrer', discard: 'Abandonner',
    minutes_short: '{n} min', custom_minutes: 'Durée perso (minutes)', set: 'OK',
    streak: 'Série', streak_days_one: '{n} jour', streak_days_other: '{n} jours',
    streak_best: 'Record : {n}', studied_today: "Aujourd'hui : {n} min",
    streak_hint: 'Étudiez au moins 5 minutes par jour pour garder votre série.',
    streak_done_today: "Aujourd'hui compte. Série sauvée !",
    last7: '7 derniers jours',
    session_done: 'Session terminée !', session_saved: '{n} min ajoutées à votre série.',
    session_saved_short: '{n} min enregistrées.', nothing_saved: 'Rien à enregistrer pour le moment.',

    lang: 'Langue', reminders: 'Rappels',
    daily_reminder: "Rappel d'étude quotidien", daily_time: 'Heure du rappel',
    exam_reminders: "Rappels d'examen", exam_reminders_hint: '7 jours, 1 jour et 2 heures avant',
    class_reminders: 'Rappels de cours', class_lead: 'Me prévenir avant le cours',
    min_before: '{n} min avant',
    notif_status: 'Notifications',
    notif_granted: 'Autorisées', notif_denied: 'Bloquées',
    notif_denied_help: 'Les notifications sont bloquées. Autorisez-les dans Paramètres Android > Applications > Cogenax > Notifications.',
    notif_prompt: 'Pas encore demandé', notif_web: "Uniquement dans l'application Android",
    allow_notifications: 'Autoriser les notifications',
    test_notif: 'Envoyer une notification de test (5 s)',
    test_title: 'Test Cogenax', test_body: 'Les notifications fonctionnent.',
    test_sent: 'Test programmé. Attendez 5 secondes.',
    test_web: "Les notifications ne fonctionnent que dans l'application Android.",
    about: 'À propos', version: 'Version {v}',

    n_daily_title: "C'est l'heure d'étudier", n_daily_body: 'Ouvrez Cogenax et lancez une session pour garder votre série.',
    n_exam_7d_title: 'Examen dans 7 jours', n_exam_1d_title: 'Examen demain', n_exam_2h_title: 'Examen dans 2 heures',
    n_exam_body: '{name} · {when}',
    n_class_title: '{subject} dans {n} min', n_class_body: '{start}–{end}{room}',
    n_timer_title: 'Session terminée', n_timer_body: '{n} minutes de concentration. Bravo !'
  }
};

export function detectLang(navLang) {
  return String(navLang || '').toLowerCase().startsWith('fr') ? 'fr' : 'en';
}

export function createI18n(lang) {
  const L = LANGS.includes(lang) ? lang : 'en';
  const dict = DICT[L];
  const rules = new Intl.PluralRules(L);

  function t(key, params = {}) {
    let s = dict[key] ?? DICT.en[key] ?? key;
    return s.replace(/\{(\w+)\}/g, (_, k) => (params[k] !== undefined ? String(params[k]) : `{${k}}`));
  }
  // Plural-aware: keys named base_one / base_other.
  function tn(base, n, params = {}) {
    const rule = rules.select(n);
    const key = dict[`${base}_${rule}`] !== undefined ? `${base}_${rule}` : `${base}_other`;
    return t(key, { n, ...params });
  }
  // day: 1 = Monday ... 7 = Sunday. 2024-01-01 was a Monday.
  function weekday(day, width = 'long') {
    return new Intl.DateTimeFormat(L, { weekday: width }).format(new Date(2024, 0, day));
  }
  function fmtDate(dateStr) {
    return new Intl.DateTimeFormat(L, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })
      .format(parseDateTime(dateStr));
  }
  function fmtDateTime(dateStr, timeStr) {
    return `${fmtDate(dateStr)}, ${timeStr}`;
  }
  return { lang: L, t, tn, weekday, fmtDate, fmtDateTime };
}
