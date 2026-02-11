# Mobile App Port Plan: Hex Hobbyist (Settlers of Oregon & Oregon Capitalist)

This document is a **step-by-step plan** for bringing your Hex Hobbyist web games to mobile. It’s written so you can follow it yourself or hand it to a developer. Your current app is **React + TypeScript + Vite**, with two games (Settlers of Oregon, Oregon Capitalist), a hex board, and Supabase multiplayer—all of which can be reused for mobile.

---

## What “Mobile” Can Mean (Pick Your Path)

| Option | What you get | Effort | Best for |
|--------|----------------|--------|----------|
| **A. Better mobile web** | Same site, but works great on phones (bigger taps, no zoom) | Low | Quick win, no app stores |
| **B. PWA (installable)** | “Add to Home Screen” → icon on phone, can feel like an app, optional offline | Low–Medium | Most users, no store approval |
| **C. Native-style apps** | Real iOS/Android apps from the same code (e.g. Capacitor) | Medium | App Store & Play Store presence |
| **D. Full native rewrite** | Rebuild UI in React Native / Swift / Kotlin | High | Only if you need maximum native feel |

**Recommendation:** Do **A → B**, then add **C** if you want to be in the App Store and Play Store. That way you reuse 100% of your existing code and don’t need to learn a new platform.

---

## What We’re Starting From

- **Tech:** React 18, TypeScript, Vite, React Router, Supabase.
- **Features:** Hex board (SVG + images), dice, resources, multiplayer, Oregon Capitalist idle game.
- **Already in place:** Viewport meta tag, some mobile CSS (touch targets, safe areas), `onClick` (works as tap on mobile).

So the base is already mobile-friendly; the plan is to **improve** that and then **package** it as installable PWA and/or native apps.

---

## Phase 1: Make the Existing Site Feel Great on Phones (1–2 days)

**Goal:** Anyone opening your site on a phone gets a smooth, readable experience with no accidental zoom and easy tapping.

### Step 1.1: Lock viewport and prevent zoom (you or a dev)

- **Check:** In `index.html` you already have:
  ```html
  <meta name="viewport" content="width=device-width, initial-scale=1.0, viewport-fit=cover" />
  ```
- **Optional:** To discourage zoom on double-tap, add `user-scalable=no` only if you’re sure (it can hurt accessibility). Often leaving it as-is is better.

**Who does it:** Anyone with access to `index.html`. Change one line if needed.

### Step 1.2: Enforce touch-friendly tap targets (you or a dev)

- **Idea:** Buttons and clickable areas should be at least **44×44 px** on mobile so fingers don’t miss.
- **Where:** Your `src/index.css` already has `@media (max-width: 768px)` with `.game-sidebar button` and `.dismiss-error` at `min-height: 44px` and `min-width: 44px`. Good.
- **Action:** Walk through every screen (home, game list, Settlers, Oregon Capitalist, modals) on a real phone or browser device emulation. Any small button or link that’s hard to tap should get the same `min-height/min-width: 44px` (and padding) in the mobile CSS.

**Who does it:** Developer or you with dev tools (e.g. Chrome “Toggle device toolbar” to simulate a phone).

### Step 1.3: Test the hex board on touch (you or a dev)

- **Current:** The board uses `onClick` on SVG elements (hexes, vertices, edges). Browsers turn taps into clicks, so it should already work.
- **Action:** On a real device, tap settlements, roads, hexes, and dice. If anything feels unresponsive or triggers scroll instead of tap, a dev can add `touch-action: manipulation` on the board container to reduce delay and prevent double-tap zoom.

**Who does it:** You test; a dev applies small CSS/JS changes if needed.

### Step 1.4: Safe areas and full-screen (you or a dev)

- **Check:** Your CSS already uses `env(safe-area-inset-*)` for notched devices. Make sure all main layouts use `padding-left/right/top/bottom: max(..., env(safe-area-inset-*))` so nothing is hidden behind the notch or home indicator.

**Who does it:** Quick check in browser with “iPhone with notch”; then a dev tweaks padding if something is cut off.

### Step 1.5: Checklist before calling Phase 1 done

- [ ] Home, Games, How to Play, About, FAQ, Changelog all readable and tappable on a 375px-wide screen.
- [ ] Settlers: place settlements/roads, roll dice, use sidebar (Resources/History), open/close modals without frustration.
- [ ] Oregon Capitalist: tap hexes, buttons, prestige, modals—all comfortable.
- [ ] No horizontal scrolling unless intentional (e.g. a wide table).
- [ ] On an iPhone with notch, nothing important is under the notch or home bar.

---

## Phase 2: Progressive Web App (PWA) — “Add to Home Screen” (2–4 days)

**Goal:** Users can install your site on their phone like an app (icon on home screen, optional full-screen, optional offline).

### Step 2.1: Add a web app manifest (developer)

- **What:** A `manifest.json` (or `manifest.webmanifest`) that describes your app: name, short name, icons, colors, display mode.
- **Where:** Usually in `public/manifest.json` so the URL is `https://yoursite.com/manifest.json`.
- **Example structure:**
  ```json
  {
    "name": "Hex Hobbyist - Settlers of Oregon",
    "short_name": "Hex Hobbyist",
    "description": "Play Settlers of Oregon and Oregon Capitalist",
    "start_url": "/",
    "display": "standalone",
    "background_color": "#1a1f2e",
    "theme_color": "#1a1f2e",
    "orientation": "any",
    "icons": [
      { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
      { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png" }
    ]
  }
  ```
- **Icons:** You need at least 192×192 and 512×512 PNGs. You can use your existing logo or a simple “H” icon; a dev can generate these from one image.

**Who does it:** Developer creates `public/manifest.json` and adds icon assets; you provide logo or approve design.

### Step 2.2: Link the manifest in HTML (developer)

- In `index.html` inside `<head>`:
  ```html
  <link rel="manifest" href="/manifest.json" />
  ```
- Your theme color is already set with `<meta name="theme-color" content="#1a1f2e" />`. That’s good for PWA.

**Who does it:** Developer (one line).

### Step 2.3: Service worker (optional but recommended) (developer)

- **What:** A script that runs in the background so the app can load from cache (faster repeat visits, optional offline).
- **How:** Use Vite’s PWA plugin (`vite-plugin-pwa`). It generates the service worker and injects it.
  - Install: `npm i -D vite-plugin-pwa`
  - In `vite.config.ts`: import the plugin and add it with `registerType: 'autoUpdate'` (or `prompt` if you want to ask the user before updating). Configure `workbox` to precache your app shell and static assets.
- **Scope:** Start with “cache on first visit, then serve from cache” (no offline gameplay required). Offline play (e.g. full game without network) is a later enhancement.

**Who does it:** Developer; you only need to run `npm run build` and test.

### Step 2.4: Verify installability (you + developer)

- Deploy the site (e.g. Vercel) with HTTPS.
- On Android Chrome: open the site → menu → “Install app” or “Add to Home screen.” It should show your icon and name.
- On iOS Safari: Share → “Add to Home Screen.” Icon and name should appear.
- Launch from the icon: the app should open in standalone (or fullscreen) mode without browser UI.

**Who does it:** You test on your phone; developer fixes any manifest or scope issues if “Install” doesn’t appear.

### Step 2.5: PWA checklist

- [ ] `manifest.json` exists and is linked; no 404 in browser DevTools.
- [ ] Icons 192 and 512 present; no console errors about icons.
- [ ] Android: “Install app” works; app opens in standalone.
- [ ] iOS: “Add to Home Screen” works; app opens without Safari chrome.
- [ ] Optional: Service worker registered; repeat load feels fast (or works offline for static shell).

---

## Phase 3: Native-Style Apps with Capacitor (1–2 weeks)

**Goal:** Build real `.ipa` (iOS) and `.apk`/`.aab` (Android) apps from the **same** Vite/React code, so you can submit to the App Store and Play Store.

### Step 3.1: Understand the approach

- **Capacitor** wraps your built website (the `dist` folder after `npm run build`) in a native app shell.
- You keep developing the React app as usual; Capacitor just loads it in a WebView and gives you access to some device APIs (camera, files, etc.) if you need them later.
- **No rewrite:** Same `src/` code for web and native.

**Who does it:** You read; a dev does the setup.

### Step 3.2: Add Capacitor to the project (developer)

1. Build the web app once so `dist` exists:
   ```bash
   npm run build
   ```
2. Install Capacitor:
   ```bash
   npm install @capacitor/core @capacitor/cli
   npx cap init "Hex Hobbyist" "com.hexhobbyist.app"
   ```
   (Use your desired app name and bundle ID.)
3. Add platforms:
   ```bash
   npm install @capacitor/android @capacitor/ios
   npx cap add android
   npx cap add ios
   ```
4. Point Capacitor to your web build: in `capacitor.config.ts`, set `webDir` to `"dist"`.

**Who does it:** Developer, on a Mac for iOS (Xcode required for building iOS apps).

### Step 3.3: Build and run locally (developer)

- After any change to the web app:
  ```bash
  npm run build
  npx cap sync
  ```
- Android: `npx cap open android` → open in Android Studio → run on device or emulator.
- iOS: `npx cap open ios` → open in Xcode → run on device or simulator (Mac only).

**Who does it:** Developer. You can run the built app on your phone via USB or TestFlight (iOS) / internal testing (Android).

### Step 3.4: Configure app identity and permissions (developer + you)

- **Icons and splash:** Use Capacitor’s asset generator or provide 1024×1024 icon and splash art; put them in `resources/` and run `npx cap copy` or use a tool to generate platform-specific assets.
- **Permissions:** In `AndroidManifest.xml` and Xcode project, only request permissions you need (e.g. network; no camera unless you add a feature that uses it).
- **Bundle ID / package name:** Decide final values (e.g. `com.hexhobbyist.app`) and stick to them for store submissions.

**Who does it:** You provide graphics; developer configures projects.

### Step 3.5: Handle “open in browser” links and deep links (developer)

- In-app links that go to `https://yoursite.com/...` can be set to open in the system browser or stay in the WebView, depending on product choice. Capacitor’s `Browser` plugin can open URLs externally.
- If you later add share or “open in app” links, you’ll configure associated domains (iOS) and App Links (Android). Not required for first release.

**Who does it:** Developer, when you decide the desired behavior.

### Step 3.6: Submit to the stores (you + possibly developer)

- **Apple:** Requires an Apple Developer account ($99/year). Build in Xcode (Archive → Distribute App), then upload to App Store Connect. Fill in listing, screenshots, privacy policy, and submit for review.
- **Google:** One-time $25 developer account. Build an Android App Bundle in Android Studio, upload to Google Play Console. Fill in listing, screenshots, privacy policy, and release.

**Who does it:** You create accounts and store listings; a dev can do the technical upload and first submission, then you can take over updates.

### Step 3.7: Capacitor checklist

- [ ] `npm run build` and `npx cap sync` run without errors.
- [ ] Android app runs on device/emulator and loads the game.
- [ ] iOS app runs on device/simulator and loads the game (if you have a Mac).
- [ ] App icon and splash screen look correct.
- [ ] No unnecessary permissions.
- [ ] Plan for updates: when you change the web app, rebuild, sync, then upload a new build to the stores.

---

## Phase 4: Optional Improvements (Ongoing)

- **Offline play:** Extend the service worker and caching so that single-player (or a defined subset) works offline; sync with Supabase when back online. Bigger design and testing effort.
- **Push notifications:** For multiplayer or “your turn” reminders, add push via Firebase or a provider; requires backend or Supabase Edge Functions and store-specific setup.
- **Native feel:** Small tweaks like pull-to-refresh, haptic feedback on buttons, or native share sheet can be added with Capacitor plugins.
- **Analytics:** You already have Google Analytics; in native apps you can use the same or add Firebase Analytics for store-installed users.

---

## Summary: What You Do vs What a Developer Does

| Step | You | Developer (or you with guidance) |
|------|-----|-----------------------------------|
| Phase 1 | Test on your phone; report what’s hard to tap or read | Add/fix mobile CSS and viewport |
| Phase 2 | Provide logo/icon; test “Add to Home Screen” on iOS and Android | Add manifest, icons, service worker |
| Phase 3 | Provide app icon/splash; create Apple/Google developer accounts; write store descriptions | Add Capacitor, build and sync, configure app id and permissions, first store upload |
| Phase 4 | Decide which features (offline, push) you want | Implement and maintain |

---

## Suggested Order and Time (Non-Developer Friendly)

1. **Week 1:** Phase 1 (polish mobile web) + Phase 2 (PWA). Result: your existing site is installable and feels good on phones; no app store yet.
2. **Week 2–3:** Phase 3 (Capacitor). Result: one codebase, two store-ready apps. You can then iterate on store listings and screenshots.
3. **Later:** Phase 4 items as you need them (offline, push, etc.).

If you tell me which phase you want to start with (e.g. “just PWA” or “all the way to App Store”), I can break that phase into even smaller, copy-paste steps or draft the exact `manifest.json` and `capacitor.config.ts` for your repo.
