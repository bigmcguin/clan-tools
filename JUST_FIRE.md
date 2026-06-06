# Just Fire — 5 stitched films (Remotion)

Five short brand films for **Just Fire Insurance**, Steve-Jobs storytelling style.
Each film = four 8-second **silent** Australian clips (Kling 3.0 Pro, 1920×1080)
stitched with a 0.5s crossfade → **30.5s** per film.

**By design there is NO voiceover, NO on-screen text, and NO terms & conditions
baked into the footage.** Add those separately in your edit. The `vo` lines
below are the script to record/lay over.

## Render the 5 finished MP4s

> ⚠️ These were **not** rendered in the cloud session: the environment's network
> policy blocks the clip CDN (`403 Host not in allowlist`). Render locally (or in
> an environment whose network allowlist includes `remotion.media` and
> `d8j0ntlcm91z4.cloudfront.net`).

```bash
npm install
npm run render:all      # writes out/just-fire-1..5-*.mp4
# or one at a time: npm run render:1 ... render:5
# preview in the Studio: npm run dev
```

On first render Remotion downloads its Chrome Headless Shell automatically.

### Fully offline option
```bash
node scripts/localise-clips.mjs        # downloads clips to public/clips/
# then set USE_LOCAL_CLIPS = true in src/just-fire/films.ts
npm run render:all
```

## The scripts (record VO separately)

**Film 1 — The Home** (`JustFire1`)
1. Aussie brick-veneer home, golden hour — *"This isn't just a house."*
2. Warm Australian living room — *"It's where your life happens."*
3. Ceiling smoke alarm, green light — *"So we help you look after it."*
4. Home at dusk, lights on — *"Just Fire. Cover for the home you love."*

**Film 2 — The Everyday** (`JustFire2`)
1. Australian power point, kettle plugged in — *"Every day, life plugs in."*
2. Column heater in winter lounge — *"Warmth we don't think twice about."*
3. Tidy power board behind the TV — *"Most days, nothing happens."*
4. Calm weatherboard exterior — *"We help you be ready for the day something might."*

**Film 3 — The People** (`JustFire3`)
1. Child's room, nightlight — *"The people who matter most are under one roof."*
2. Backyard, Hills hoist — *"Memories made in the backyard."*
3. Front door opening to warm light — *"A place that keeps them safe."*
4. Family home, golden hour — *"Just Fire. Helping protect the people you come home to."*

**Film 4 — The Unexpected** (`JustFire4`)
1. Hazy bushfire-season sunset over bushland — *"Australia knows the unexpected."*
2. Calm interior, rain on the window — *"But being prepared changes everything."*
3. House keys on a kitchen bench — *"Knowing you've got cover in place."*
4. Sunrise over the neighbourhood — *"Just Fire. Here for what comes next."*

**Film 5 — One More Thing** (`JustFire5`)
1. Single candle flame — *"Fire gives us warmth. Light. Life."*
2. Candle flame, slow — *"But it asks for respect."*
3. Fire blanket + smoke alarm on an Aussie kitchen wall — *"So we made cover that's simple, and honest."*
4. Home exterior at dusk — *"Just Fire. Simple cover for what matters."*

## ASIC compliance notes (RG 234)

The VO copy is written to be **ASIC-aware**: it avoids guarantees ("always pay",
"fully protected") and uses qualified language ("help protect", "cover…").
Before publishing, your compliance/legal team must add the required disclosures —
typically:

- A **general advice warning** (the ad doesn't account for personal circumstances).
- *"Consider the Product Disclosure Statement (PDS) and Target Market
  Determination (TMD) before deciding."*
- The **issuer / AFSL** details.
- That cover is **subject to terms, conditions, limits and exclusions**.

These belong in the separate text/VO layer you add. **This is not legal advice —
obtain sign-off before use.**

## Source clips (Higgsfield CDN)

Exact filenames are in `src/just-fire/films.ts` and `scripts/localise-clips.mjs`.
Base: `https://d8j0ntlcm91z4.cloudfront.net/user_38N7FUMOVFD0tdMeQPORO0JOZHB/`
