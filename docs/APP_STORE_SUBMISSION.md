# App Store & Play Store Submission Guide — Hex Hobbyist

This guide walks you through getting Hex Hobbyist into the **Apple App Store** and **Google Play Store**. Your app is already set up with **Capacitor**: the same React code runs on web, iOS, and Android.

---

## Before You Start

### What you need

| Store | Account | Cost | Device / tools |
|--------|---------|------|-----------------|
| **Apple App Store** | Apple Developer Program | **$99/year** | **Mac** with Xcode (for building and uploading) |
| **Google Play Store** | Google Play Console | **$25 one-time** | Any computer; Android Studio for building (or use a build service) |

### Project setup (already done)

- Capacitor is installed; `android/` and `ios/` folders exist.
- **Bundle ID (iOS):** `com.hexhobbyist.app`
- **Application ID (Android):** `com.hexhobbyist.app`
- **App name:** Hex Hobbyist

### After you change the web app

Whenever you update the game (React/Vite code), run:

```bash
npm run cap:sync
```

Then rebuild and re-upload the native app (see below). That’s how you publish updates.

---

## Part 1: Apple App Store (iOS)

### 1.1 Create an Apple Developer account

1. Go to [developer.apple.com](https://developer.apple.com).
2. Sign in with your Apple ID.
3. Enroll in the **Apple Developer Program** ($99/year). Approval can take a day or two.

### 1.2 Build the iOS app on a Mac

1. **Install Xcode** from the Mac App Store (free, large download).
2. In your project folder, build and copy the web app into the native project:
   ```bash
   npm run cap:sync
   ```
3. Open the iOS project in Xcode:
   ```bash
   npm run cap:open:ios
   ```
4. In Xcode:
   - Select the **App** target.
   - Under **Signing & Capabilities**, choose your **Team** (your Apple Developer account) and ensure **Automatically manage signing** is on.
   - Pick your **Bundle Identifier** (e.g. `com.hexhobbyist.app`). It must match what you’ll use in App Store Connect.
5. **App icon:** Replace the placeholder in `ios/App/App/Assets.xcassets/AppIcon.appiconset/` with a 1024×1024 PNG (no transparency). Xcode can generate other sizes from it.
6. **Archive:** Menu **Product → Archive**. When the archive is ready, click **Distribute App**.
7. Choose **App Store Connect** → **Upload**. Follow the prompts; Xcode will upload the build.

### 1.3 Create the app in App Store Connect

1. Go to [App Store Connect](https://appstoreconnect.apple.com).
2. **My Apps** → **+** → **New App**.
   - **Platform:** iOS  
   - **Name:** Hex Hobbyist  
   - **Primary Language:** English (or your choice)  
   - **Bundle ID:** Select the one you used in Xcode (e.g. `com.hexhobbyist.app`)  
   - **SKU:** e.g. `hexhobbyist-001`
3. Fill in the **App Information** and **Pricing and Availability** (e.g. Free).
4. In the version you’re preparing, add:
   - **Screenshots** (required): iPhone 6.7", 6.5", 5.5" (and optionally iPad). Use a simulator or device.
   - **Description**, **Keywords**, **Support URL**, **Marketing URL** (optional).
   - **Privacy Policy URL** (required if you collect data; recommended anyway).
   - **Category:** e.g. Games → Strategy.
5. After the build has finished processing (can take 10–30 minutes), select that **build** for the version and submit for **Review**.

### 1.4 Submit for review

- Answer the **Export Compliance**, **Content Rights**, **Advertising** (e.g. “No” if you don’t use third-party ads), and **App Privacy** questions.
- Click **Submit for Review**. Review usually takes 24–48 hours.

---

## Part 2: Google Play Store (Android)

### 2.1 Create a Google Play Developer account

1. Go to [play.google.com/console](https://play.google.com/console).
2. Sign in with a Google account and pay the **one-time $25** registration fee.
3. Complete your **developer profile** (name, email, etc.).

### 2.2 Build the Android app

1. **Install Android Studio** from [developer.android.com/studio](https://developer.android.com/studio).
2. In your project folder:
   ```bash
   npm run cap:sync
   npm run cap:open:android
   ```
3. Android Studio will open. Wait for Gradle sync to finish.
4. **App icon:** Replace the default icon under `android/app/src/main/res/` (e.g. `mipmap-hdpi`, `mipmap-mdpi`, etc.) or use **Image Asset** in Android Studio to generate from a 1024×1024 PNG.
5. **Build a release bundle** (required for Play Store):
   - **Build → Generate Signed Bundle / APK** → **Android App Bundle**.
   - Create or choose a **keystore** (store the file and passwords safely; you need them for all future updates).
   - Choose **release** and finish. The `.aab` file will be in `android/app/release/`.

### 2.3 Create the app in Play Console

1. In [Play Console](https://play.google.com/console), click **Create app**.
2. Fill in **App name** (Hex Hobbyist), **Default language**, **App or game** (Game), **Free or paid** (Free).
3. Accept the declarations and create the app.

### 2.4 Complete the store listing

1. **Main store listing:**
   - Short description (80 chars) and full description.
   - **Graphics:** App icon 512×512, feature graphic 1024×500, and **screenshots** (phone at least; tablet optional).
2. **App content:**
   - **Privacy policy:** Add a URL (required if you collect data; recommended in any case).
   - **Ads:** Declare if the app contains ads (e.g. “No” if you don’t).
   - **Target audience:** Set age group.
   - **News app / COVID-19:** Usually “No”.
   - **Data safety:** Describe what data you collect (e.g. “No data collected” or describe analytics/multiplayer).

### 2.5 Release the app

1. Go to **Release → Production** (or **Testing** first).
2. **Create new release** → upload the `.aab` you built.
3. Add **Release name** (e.g. “1.0.0”) and **Release notes**.
4. **Review and roll out** (or start with a limited rollout). After review, the app will go live.

---

## Quick reference: npm and Capacitor commands

| Command | What it does |
|--------|----------------|
| `npm run build` | Build the web app (output in `dist/`) |
| `npm run cap:sync` | Build web app and copy into `android/` and `ios/` |
| `npm run cap:open:ios` | Open the iOS project in Xcode (Mac only) |
| `npm run cap:open:android` | Open the Android project in Android Studio |

---

## Checklist before first submission

- [ ] **Icons:** 1024×1024 PNG for both stores; replace placeholders in `ios/App/App/Assets.xcassets/AppIcon.appiconset/` and Android `mipmap-*` (or use Android Studio Image Asset).
- [ ] **Privacy policy:** Host a page (e.g. on your site) and add the URL in both store consoles.
- [ ] **Screenshots:** At least the required sizes for iPhone and Android phone.
- [ ] **Descriptions and keywords** written and pasted into both consoles.
- [ ] **Supabase / backend:** If your app uses Supabase, ensure the project is set up for production and any env vars are documented (Capacitor uses the same built web app, so same API URLs as your site).

---

## Updating the app after release

1. Change your React/Vite code as usual.
2. Bump **version** in `package.json` (e.g. `0.1.0` → `0.1.1`). For iOS you also set the version in Xcode; for Android, in `android/app/build.gradle` (`versionCode` and `versionName`).
3. Run `npm run cap:sync`.
4. **iOS:** Open Xcode → Archive → Upload new build → Submit new version in App Store Connect.
5. **Android:** Build a new signed `.aab` in Android Studio → Upload in Play Console → Create new release.

You’re set. For more detail, use Apple’s and Google’s official docs and the [Capacitor docs](https://capacitorjs.com/docs).
