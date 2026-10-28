// Run after `npx cap add android`. Adds notification permissions, copies our icons,
// and sets the version. Safe to run more than once.
import { readFileSync, writeFileSync, existsSync, cpSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const androidApp = join(root, 'android', 'app');
if (!existsSync(androidApp)) {
  console.error('android/app not found. Run "npx cap add android" first.');
  process.exit(1);
}

// 1) permissions
const manifestPath = join(androidApp, 'src', 'main', 'AndroidManifest.xml');
let manifest = readFileSync(manifestPath, 'utf8');
const perms = ['android.permission.POST_NOTIFICATIONS', 'android.permission.RECEIVE_BOOT_COMPLETED', 'android.permission.VIBRATE'];
for (const p of perms) {
  if (!manifest.includes(`"${p}"`)) {
    manifest = manifest.replace('</manifest>', `    <uses-permission android:name="${p}" />\n</manifest>`);
    console.log('added permission', p);
  }
}
writeFileSync(manifestPath, manifest);

// 2) icons and notification icon
const res = join(root, 'resources', 'android', 'res');
if (existsSync(res)) {
  cpSync(res, join(androidApp, 'src', 'main', 'res'), { recursive: true });
  console.log('copied icons');
}

// 3) version (CI passes the run number so every build has a higher versionCode)
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const code = Number(process.env.APP_VERSION_CODE) || 1;
const name = process.env.APP_VERSION_NAME || pkg.version;
const gradlePath = join(androidApp, 'build.gradle');
let gradle = readFileSync(gradlePath, 'utf8');
const before = gradle;
gradle = gradle.replace(/versionCode\s+\d+/, `versionCode ${code}`).replace(/versionName\s+"[^"]*"/, `versionName "${name}"`);
if (gradle === before && !gradle.includes(`versionCode ${code}`)) console.warn('warning: could not patch versionCode/versionName');
writeFileSync(gradlePath, gradle);
console.log(`version ${name} (${code})`);
