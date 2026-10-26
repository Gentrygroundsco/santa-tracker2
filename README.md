# 🎅 Santa Tracker

A NORAD-style Santa tracker on a live 3D globe, hosted for free on Cloudflare Workers.

- **3D globe** with real day and night shading, city lights, drifting clouds and falling snow
- **3D sleigh** with Santa and nine galloping reindeer (Rudolph's nose glows), trailing sparkles
- **Live Santa Cam**: a picture-in-picture camera on the sleigh with five angles (Chase, Santa's view, Side, Reindeer, Overhead); expand any of them to full screen
- **Gift tracker** counting up to 7.3 billion presents, plus stops visited, distance, speed and cookies eaten
- **Next stop** with a live arrival countdown, and the **final destination** (Pago Pago, then home to the North Pole)
- **Real route timing**: 240 stops, each reached at about local midnight. Santa leaves the North Pole at 09:00 UTC on December 24, reaches Kiritimati at 10:00 UTC and lands home at about 12:18 UTC on December 25
- **Countdown** to takeoff the rest of the year, with a **demo flight** you can watch any time (60× to 1800× speed, with a timeline you can scrub)
- **Sleigh cam**: puts the Santa Cam full screen (drag to swing around the sleigh)
- **When does Santa reach me?** uses the browser's location to find your nearest stop

## Run it locally

```sh
npm install
npm run dev        # http://localhost:8787
npm test
```

Handy URLs while developing:

- `/?demo` starts the demo flight (`&speed=600` to change speed)
- `/?t=2026-12-24T23:10:00Z` pretends it is that moment, to preview the live tracker

## Deploy to Cloudflare (free plan)

Option 1, from your computer:

```sh
npx wrangler login
npm run deploy
```

Wrangler builds the app and prints your URL, like `https://santa-tracker.<your-subdomain>.workers.dev`.

Option 2, deploy on every push: in the Cloudflare dashboard go to **Workers & Pages → Create → Import a repository**, pick this repo, and keep the defaults (deploy command `npx wrangler deploy`).

### Why it fits the free plan

Everything except `/api/time` is a static asset, and static asset requests on Workers are free and unlimited. `/api/time` is called once per page load so every visitor sees Santa in the same place even if their clock is off; the free plan allows 100,000 of those a day.

## How it works

| File | What it does |
| --- | --- |
| `src/client/route.js` | The 240 stops, with Christmas Eve UTC offsets (southern-hemisphere daylight saving included) |
| `src/client/schedule.js` | Builds the timetable, and works out Santa's position, gifts, distance and speed at any moment |
| `src/client/sleigh.js` | Loads the 3D sleigh model and animates it (with a simple built-in fallback), plus the sparkle trail |
| `public/models/santa-sleigh.glb` | The Santa, sleigh and reindeer model |
| `src/client/main.js` | Globe, camera modes, panels, countdown and demo mode |
| `src/worker.js` | The Worker: serves `public/` and `/api/time` |

The Santa and sleigh model is [“Santa - NORAD Santa Tracker”](https://sketchfab.com/3d-models/santa-norad-santa-tracker-227766d4adc44aacaf90233c168984ac) by [tenslant44](https://sketchfab.com/tenslant44), licensed under [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/). The credit line on the page is required by that license, so keep it if you change the layout.

The globe uses [globe.gl](https://github.com/vasturiano/globe.gl) and [three.js](https://threejs.org). Earth textures come from NASA's Blue Marble and Black Marble imagery, via the three-globe examples.
