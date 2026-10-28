# Cogenax

Study reminders for students: exam countdowns, weekly timetable, study timer with streak. English and French.
Capacitor app (HTML/CSS/JS in `www/`) with native Android notifications.

## Get the APK (GitHub Actions)

1. Create an empty repository on GitHub named `cogenax`.
2. In this folder run, one per line:

```
git init
git add .
git commit -m "Cogenax milestone 1"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/cogenax.git
git push -u origin main
```

3. On GitHub open the **Actions** tab, then the latest run of **Build Android APK**.
4. When it is green, scroll to **Artifacts** and download `cogenax-apk`. Unzip it and copy `app-debug.apk` to your phone.
5. Open it on the phone and allow "install unknown apps" when asked.

If the run is red, open it, copy the red error text and send it to me.

## Try it in a browser (no phone needed)

```
node scripts/serve.mjs
```

Open http://localhost:5173. Notifications only work in the Android app.

## Tests

```
npm install
npm test
```

## Layout

- `www/` the app (`js/logic.js` is the pure logic, `js/app.js` the screens)
- `test/` unit tests, run by `npm test` and by GitHub Actions on every push
- `test-ui/` browser test (needs Playwright, optional)
- `resources/android/` icons and the notification icon, copied into the Android project by `scripts/prepare-android.mjs`
- `android/` is created fresh by the workflow each build, so it is not committed
