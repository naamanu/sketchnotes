# Development

How to set up a machine, build the APK, install it on a tablet, and work on the code.

- [1. One-time machine setup](#1-one-time-machine-setup)
- [2. Clone and install](#2-clone-and-install)
- [3. npm scripts](#3-npm-scripts)
- [4. The build pipeline](#4-the-build-pipeline)
- [5. Day-to-day loop](#5-day-to-day-loop)
- [6. Debugging on the device](#6-debugging-on-the-device)
- [7. Wireless install (no cable)](#7-wireless-install-no-cable)
- [8. Release builds and signing](#8-release-builds-and-signing)
- [9. Upgrading dependencies](#9-upgrading-dependencies)
- [10. Conventions](#10-conventions)

---

## 1. One-time machine setup

You need **Node.js**, **JDK 21** and the **Android SDK**. Android Studio is optional; this project was built with only the command-line tools.

### Node.js

Node 20 or newer works; the project was developed on Node 24. Any version manager (fnm, nvm, asdf) is fine.

### JDK 21

```bash
java -version   # should report 21.x
```

On Debian/Ubuntu: `sudo apt install openjdk-21-jdk`. Gradle uses whatever `java` is on `PATH`, or `JAVA_HOME` if it's set.

### Android SDK (command-line only)

The SDK goes in `~/Android/Sdk`, and no root is needed.

```bash
mkdir -p ~/Android/Sdk && cd ~/Android/Sdk

# 1. platform-tools (adb)
curl -fLO https://dl.google.com/android/repository/platform-tools-latest-linux.zip
unzip -q platform-tools-latest-linux.zip && rm platform-tools-latest-linux.zip

# 2. cmdline-tools (sdkmanager). Find the newest build number:
curl -fsSL https://dl.google.com/android/repository/repository2-3.xml \
  | grep -o 'commandlinetools-linux-[0-9]*_latest.zip' | sort -V | tail -1
# then download it (replace the number):
curl -fLO https://dl.google.com/android/repository/commandlinetools-linux-16111833_latest.zip
unzip -q commandlinetools-linux-*_latest.zip && rm commandlinetools-linux-*_latest.zip
mkdir -p cmdline-tools/latest
mv cmdline-tools/{bin,lib,NOTICE.txt,source.properties} cmdline-tools/latest/

# 3. licences + platform + build tools
yes | cmdline-tools/latest/bin/sdkmanager --sdk_root=$HOME/Android/Sdk --licenses
cmdline-tools/latest/bin/sdkmanager --sdk_root=$HOME/Android/Sdk \
  "platforms;android-36" "build-tools;36.0.0"
```

Gradle downloads anything else it needs on the first build, such as build-tools 35. The licences you accepted above cover that.

Optionally, add these to your shell profile:

```bash
export ANDROID_HOME=$HOME/Android/Sdk
export PATH=$ANDROID_HOME/platform-tools:$PATH
```

On fish: `set -Ux ANDROID_HOME ~/Android/Sdk; fish_add_path ~/Android/Sdk/platform-tools`.

### The tablet

1. **Settings → About tablet** → tap **Build number** 7 times to unlock Developer options.
2. **Settings → System → Developer options** → turn on **USB debugging**.
3. Plug it in and accept the **"Allow USB debugging?"** prompt. Tick *Always allow*.
4. Check that it's visible:

   ```bash
   ~/Android/Sdk/platform-tools/adb devices -l
   # HVA71BAH   device usb:1-4.3 product:… model:…
   ```

   `unauthorized` means you haven't accepted the prompt on the tablet yet. If nothing is listed, see [troubleshooting](troubleshooting.md#adb-doesnt-see-the-tablet).

## 2. Clone and install

```bash
git clone git@github.com:naamanu/sketchnotes.git
cd sketchnotes
npm install
echo "sdk.dir=$HOME/Android/Sdk" > android/local.properties
```

- `npm install` runs a **postinstall** step that copies Excalidraw's fonts from `node_modules/@excalidraw/excalidraw/dist/prod/fonts` into `public/fonts`. They're gitignored (about 14 MB) and bundled into the APK so text renders offline.
- `android/local.properties` tells Gradle where the SDK is. It's machine-specific and gitignored. You can skip it if `ANDROID_HOME` is exported.

## 3. npm scripts

| Script | What it does |
|---|---|
| `npm run dev` | Vite dev server on all interfaces (`--host`), so you can open it from the tablet's browser on the same Wi-Fi. Hot reload. **Handwriting recognition is unavailable here.** The toggle is hidden, because it needs the native plugin. |
| `npm run build` | `tsc --noEmit` (type-check) and then `vite build` into `dist/`. |
| `npm run apk` | `build` → `npx cap sync android` (copy `dist/` into the Android project and update plugins) → `./gradlew assembleDebug`. Output: `android/app/build/outputs/apk/debug/app-debug.apk`. |
| `npm run install-tablet` | `adb install -r` the debug APK. `-r` replaces the app **and keeps its data**. |
| `postinstall` | Copies the Excalidraw fonts into `public/fonts` (runs automatically). |

The usual "rebuild and put it on the tablet" command is:

```bash
npm run apk && npm run install-tablet
```

Then launch from the tablet, or with:

```bash
adb shell monkey -p dev.nana.sketchnotes -c android.intent.category.LAUNCHER 1
```

## 4. The build pipeline

```
src/*.tsx, *.ts, styles.css ──┐
index.html                    ├─ vite build ─► dist/ ──┐
public/fonts/** (copied)  ────┘                        │ npx cap sync android
                                                       ▼
                         android/app/src/main/assets/public/   (gitignored)
                         android/app/src/main/assets/capacitor.config.json
                                                       │
android/app/src/main/java/** (MainActivity, InkPlugin) │ ./gradlew assembleDebug
@capacitor/* native code, ML Kit AAR (Maven)  ─────────┤
                                                       ▼
                         android/app/build/outputs/apk/debug/app-debug.apk
```

Key config files:

| File | Purpose |
|---|---|
| `capacitor.config.json` | `appId` `dev.nana.sketchnotes`, `appName` SketchNotes, `webDir` `dist`. |
| `vite.config.ts` | React plugin, plus `process.env.IS_PREACT = "false"`, which Excalidraw expects to be defined. |
| `index.html` | Sets `window.EXCALIDRAW_ASSET_PATH = "/"` so Excalidraw loads fonts from the bundled `/fonts/…` instead of a CDN. |
| `android/variables.gradle` | `minSdkVersion 24`, `compileSdkVersion`/`targetSdkVersion 36`, AndroidX versions. |
| `android/app/build.gradle` | App module; adds `com.google.mlkit:digital-ink-recognition:19.0.0`. |
| `android/app/src/main/java/dev/nana/sketchnotes/MainActivity.java` | Registers `InkPlugin` before `super.onCreate`. |

`android/` is committed and owned by this repo. Don't delete and regenerate it with `npx cap add android`, or you'll lose `InkPlugin.java`, the `MainActivity` registration and the ML Kit dependency.

## 5. Day-to-day loop

**UI work (fast):**
```bash
npm run dev
# open http://localhost:5173 (or http://<your-LAN-IP>:5173 from the tablet's Chrome)
```
Storage in the browser is separate from the app's storage, so you're working on test data.

**Anything touching native code, handwriting, sharing, or real-device behaviour:**
```bash
npm run apk && npm run install-tablet
```
A full rebuild takes about 15–30 s once Gradle is warm. The first build is slower because it downloads Gradle 8.14 and the dependencies.

**Native-only change (Java/Gradle):** you can skip the web build:
```bash
(cd android && ./gradlew assembleDebug) && npm run install-tablet
```

## 6. Debugging on the device

### Inspect the WebView with Chrome DevTools

Debug builds have WebView debugging on. With the tablet plugged in and the app open:

1. On your computer, open Chrome at `chrome://inspect/#devices`.
2. Under your tablet, find **dev.nana.sketchnotes** and click **inspect**.

You get the full DevTools: console, elements, network, and **Application → IndexedDB → keyval-store** to look at the stored data.

### Logs

```bash
adb logcat | grep -iE "Capacitor|chromium|sketchnotes|mlkit|DigitalInk"
```

`Capacitor/Console` lines are the web `console.log`s.

### Screenshots and taps from the command line

```bash
adb exec-out screencap -p > screen.png
adb shell input tap X Y                   # device pixels (e.g. 1200×1920 on the TB330FU)
adb shell uiautomator dump /sdcard/u.xml && adb shell cat /sdcard/u.xml   # find button bounds
```

## 7. Wireless install (no cable)

Android 11+ supports wireless debugging:

1. **Developer options → Wireless debugging** → on, then **Pair device with pairing code**.
2. On the computer: `adb pair <ip>:<pair-port>` and enter the code.
3. `adb connect <ip>:<port>` (the port shown on the main Wireless debugging screen).
4. `npm run install-tablet` now works over Wi-Fi.

## 8. Release builds and signing

The debug APK is fine for your own device. For a signed release, for example to share the APK or upload it to Play:

```bash
# one-time: create a keystore (keep it and the passwords safe and OUT of git)
keytool -genkeypair -v -keystore ~/keys/sketchnotes.jks -alias sketchnotes \
  -keyalg RSA -keysize 2048 -validity 10000
```

Add to `~/.gradle/gradle.properties` (not the repo):

```properties
SKETCHNOTES_STORE_FILE=/home/you/keys/sketchnotes.jks
SKETCHNOTES_STORE_PASSWORD=…
SKETCHNOTES_KEY_ALIAS=sketchnotes
SKETCHNOTES_KEY_PASSWORD=…
```

and in `android/app/build.gradle`:

```groovy
android {
    signingConfigs {
        release {
            storeFile file(SKETCHNOTES_STORE_FILE)
            storePassword SKETCHNOTES_STORE_PASSWORD
            keyAlias SKETCHNOTES_KEY_ALIAS
            keyPassword SKETCHNOTES_KEY_PASSWORD
        }
    }
    buildTypes { release { signingConfig signingConfigs.release } }
}
```

Then build with `npm run build && npx cap sync android && (cd android && ./gradlew assembleRelease)` (or `bundleRelease` for an `.aab`).

> A release build is signed with a different key than the debug build, so Android won't install it over the debug app. Export a backup, uninstall, install the release, then import.

## 9. Upgrading dependencies

- **Excalidraw:** after `npm i @excalidraw/excalidraw@<ver>`, re-run `npm install` so `postinstall` copies the matching fonts. Check that `FONT_FAMILY`, `convertToExcalidrawElements`, `CaptureUpdateAction` and `newElementWith` are still exported (used by `src/diagramInk.ts`).
- **Capacitor:** keep `@capacitor/core`, `@capacitor/android`, `@capacitor/cli` and the plugins on the same major. Run `npx cap sync android` afterwards. Major upgrades may change `android/variables.gradle` and the Gradle wrapper; follow Capacitor's upgrade guide.
- **ML Kit:** bump the version in `android/app/build.gradle`. Note that `RecognitionCandidate` lives in the transitive `digital-ink-common` artifact (`com.google.mlkit.vision.digitalink.common`), not the `recognition` package.

## 10. Conventions

- TypeScript is `strict`, and `npm run build` must pass type-checking.
- Persisted data shapes live in `src/store.ts`. If you change them, keep old data loading (see [data-and-backups.md](data-and-backups.md#migrations)).
- Keep everything working offline: no CDN fonts, scripts or network calls at runtime, apart from the one-time ML Kit model download.
