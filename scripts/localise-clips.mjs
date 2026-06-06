// Downloads every Just Fire clip into public/clips/<id>.mp4 so the films can
// be rendered fully offline. Run once, then set USE_LOCAL_CLIPS = true in
// src/just-fire/films.ts.
//
//   node scripts/localise-clips.mjs
//
// Requires internet access to the Higgsfield CDN.

import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const OUT = join(__dirname, "..", "public", "clips");

const BASE =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38N7FUMOVFD0tdMeQPORO0JOZHB/";

// id -> CDN filename (keep in sync with src/just-fire/films.ts)
const CLIPS = {
  f1s1: "hf_20260606_065746_27c87a85-fc98-464c-a3a6-b04443fd2370.mp4",
  f1s2: "hf_20260606_065729_f2013bc0-ed3b-44f3-8bf3-3551d42134c6.mp4",
  f1s3: "hf_20260606_065730_eef5bd90-d3ca-49b7-aa8e-6f0bcb952a13.mp4",
  f1s4: "hf_20260606_065732_e71565fe-dddc-470d-9b53-134e5d5a4e3c.mp4",
  f2s1: "hf_20260606_065733_8c332ffd-968a-43fe-b18e-db7c887cdf44.mp4",
  f2s2: "hf_20260606_065734_7a7ecdd9-6df6-4a3b-9822-96760a559581.mp4",
  f2s3: "hf_20260606_065736_510052e0-e25a-4529-b059-da96087c95f6.mp4",
  f2s4: "hf_20260606_065737_80c630bf-6023-49e1-ac1f-ed1cf03bbd2b.mp4",
  f3s1: "hf_20260606_070056_2e9c122c-6192-4980-8dcd-8476463c0b9d.mp4",
  f3s2: "hf_20260606_070111_f351ca9c-9213-4087-8c45-627b4f76c65e.mp4",
  f3s3: "hf_20260606_070057_b0965c0d-969c-41eb-b2ab-07f1bf05caff.mp4",
  f3s4: "hf_20260606_070058_958c32a8-b054-4f91-a57a-c6ba6b056f83.mp4",
  f4s1: "hf_20260606_070059_2567660c-67b9-45de-8401-9ba8b791056f.mp4",
  f4s2: "hf_20260606_070100_787500c0-b1e6-4e7a-924f-00fb356231db.mp4",
  f4s3: "hf_20260606_070101_b73f2dc4-dd2b-4862-97d6-7e96875248d0.mp4",
  f4s4: "hf_20260606_070102_bdee2e81-5b98-4763-a19d-b76b98e16413.mp4",
  f5s1: "hf_20260606_070411_3cec76dd-e243-4f61-9091-42fc8c2fb152.mp4",
  f5s2: "hf_20260606_070412_d8030197-eac4-43ba-9a08-0a18de4d059f.mp4",
  f5s3: "hf_20260606_070413_064347cf-febb-4314-905d-190d021fe1e0.mp4",
  f5s4: "hf_20260606_070414_fa451460-47ac-4de5-b738-ce1f005aa70b.mp4",
};

await mkdir(OUT, { recursive: true });

for (const [id, file] of Object.entries(CLIPS)) {
  const url = BASE + file;
  process.stdout.write(`Downloading ${id} ... `);
  const res = await fetch(url);
  if (!res.ok) {
    console.error(`FAILED (${res.status})`);
    process.exitCode = 1;
    continue;
  }
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(join(OUT, `${id}.mp4`), buf);
  console.log(`${(buf.length / 1e6).toFixed(1)} MB`);
}

console.log("\nDone. Now set USE_LOCAL_CLIPS = true in src/just-fire/films.ts");
