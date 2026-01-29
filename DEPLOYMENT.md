# Deployment Guide

This guide will help you deploy your Settlers of Oregon game to the internet.

## Option 1: Vercel (Recommended - Easiest)

Vercel is the easiest option for Vite/React apps and offers free hosting.

### Steps:

1. **Push your code to GitHub** (if not already done):
   ```bash
   git push origin main
   ```

2. **Sign up for Vercel**:
   - Go to [vercel.com](https://vercel.com)
   - Click "Sign Up" and sign in with your GitHub account

3. **Import your project**:
   - Click "Add New..." → "Project"
   - Import your GitHub repository (`VibeCoding`)
   - Vercel will auto-detect it's a Vite project

4. **Configure build settings** (usually auto-detected):
   - **Framework Preset**: Vite
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`

5. **Deploy**:
   - Click "Deploy"
   - Wait 1-2 minutes for the build to complete
   - Your game will be live at: `https://your-project-name.vercel.app`

6. **Custom Domain (Optional)**:
   - Go to Project Settings → Domains
   - Add your custom domain if you have one

### Benefits:
- ✅ Free tier with generous limits
- ✅ Automatic deployments on every git push
- ✅ HTTPS included
- ✅ Global CDN
- ✅ Very fast setup

---

## Option 2: Netlify

Similar to Vercel, also very easy.

### Steps:

1. **Push your code to GitHub** (if not already done)

2. **Sign up for Netlify**:
   - Go to [netlify.com](https://netlify.com)
   - Sign in with GitHub

3. **Deploy**:
   - Click "Add new site" → "Import an existing project"
   - Select your GitHub repository
   - Configure:
     - **Build command**: `npm run build`
     - **Publish directory**: `dist`
   - Click "Deploy site"

4. **Your site will be live** at: `https://random-name.netlify.app`

---

## Option 3: GitHub Pages

Free hosting directly from GitHub, but requires a bit more setup.

### Steps:

1. **Install gh-pages package**:
   ```bash
   npm install --save-dev gh-pages
   ```

2. **Update package.json**:
   Add these scripts:
   ```json
   "scripts": {
     "predeploy": "npm run build",
     "deploy": "gh-pages -d dist"
   }
   ```

3. **Update vite.config.ts**:
   Add base path:
   ```typescript
   export default defineConfig({
     plugins: [react()],
     base: '/VibeCoding/', // Replace with your repo name
   })
   ```

4. **Deploy**:
   ```bash
   npm run deploy
   ```

5. **Enable GitHub Pages**:
   - Go to your repo on GitHub
   - Settings → Pages
   - Source: `gh-pages` branch
   - Your site will be at: `https://yourusername.github.io/VibeCoding/`

---

## Option 4: Render

Another good free option.

### Steps:

1. Go to [render.com](https://render.com)
2. Sign up with GitHub
3. New → Static Site
4. Connect your repository
5. Build command: `npm run build`
6. Publish directory: `dist`
7. Deploy

---

## Testing Your Build Locally

Before deploying, test your production build:

```bash
npm run build
npm run preview
```

This will build and serve your app locally so you can verify everything works.

---

## Important Notes

- Make sure all your assets (images in `public/`) are committed to git
- Check that your game works in production mode (some dev-only features might not work)
- Consider adding environment variables if needed (API keys, etc.)
- Set up automatic deployments so your site updates when you push to GitHub

---

## Recommended: Vercel

For this project, **Vercel is the best choice** because:
- Zero configuration needed
- Fastest setup (literally 2 minutes)
- Best performance for React/Vite apps
- Free SSL certificate
- Automatic deployments
