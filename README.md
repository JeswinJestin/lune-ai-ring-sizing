LUNE — AI-Powered Ring Sizing Platform

Find your perfect ring size in ~30 seconds using AI, then preview styles and try rings in AR.

Features
- AI measurement with camera guidance and orientation fixes
- Optional AR try‑on using layered PNGs (band + gem)
- “Styles for You” gallery sourced
- Per‑landmark Kalman + EMA smoothing for stable tracking
- Vitest unit tests for tracking filters

Tech Stack
- React + Vite
- MediaPipe Hands
- Google Gemini (optional online analysis)
- Vitest

Setup
1) Clone and install
   npm install
2) Create a `.env.local` file (ignored by Git)
   GEMINI_API_KEY=your_key_here
3) Start dev server
   npm run dev
4) Build and preview
   npm run build
   npm run preview

Assets
- Place layered AR assets:
  public/assets/rings/<slug>/<id>_band.png
  public/assets/rings/<slug>/<id>_gem.png
- Place gallery images:
  public/assets/rings/<slug>/<id>_RING.png

Available slugs
- solitaire-diamond, emerald-cut, vintage-halo, sapphire-band, classic-gold-band, twisted-vine, modern-bezel, rose-gold-pearl, art-deco-emerald

Testing
  npm run test -- --run

Environment & Security
- `.env.local` is ignored by `.gitignore`
- Vite injects `GEMINI_API_KEY` at build time in `vite.config.ts`
