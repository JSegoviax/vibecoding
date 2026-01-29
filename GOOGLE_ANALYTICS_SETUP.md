# Google Analytics Setup Guide

## Steps to Add Google Analytics

1. **Get your Google Analytics Measurement ID:**
   - Go to [Google Analytics](https://analytics.google.com/)
   - Create a new property or select an existing one
   - Go to Admin → Data Streams → Web
   - Copy your Measurement ID (format: `G-XXXXXXXXXX`)

2. **Add the Measurement ID to your project:**
   - Open `index.html`
   - Find the line: `<script async src="https://www.googletagmanager.com/gtag/js?id=G-XXXXXXXXXX"></script>`
   - Replace `G-XXXXXXXXXX` with your actual Measurement ID (appears twice in the script)
   - Save the file

3. **For Vercel deployment:**
   - You can also set it as an environment variable in Vercel:
   - Go to your project settings → Environment Variables
   - Add `VITE_GA_MEASUREMENT_ID` with your Measurement ID
   - Then update `index.html` to use: `id=${import.meta.env.VITE_GA_MEASUREMENT_ID}`

4. **Test it:**
   - Deploy your changes
   - Visit your site
   - Go to Google Analytics → Realtime reports
   - You should see your visit appear within a few seconds

## Optional: Track Custom Events

You can track custom game events using the utility functions in `src/utils/analytics.ts`:

```typescript
import { trackEvent } from './utils/analytics'

// Example: Track when a player wins
trackEvent('game_won', 'gameplay', playerName, victoryPoints)

// Example: Track when dice are rolled
trackEvent('dice_rolled', 'gameplay', `sum_${dice1 + dice2}`)
```
