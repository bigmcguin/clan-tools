import { staticFile } from "remotion";
import type { Film, Scene } from "./config";

/**
 * The 5 "Just Fire" films, each stitched from four 8s silent Australian clips
 * (Kling 3.0 Pro, 1920x1080). `vo` is the Steve-Jobs-style script line the
 * scene is timed to — recorded SEPARATELY, not baked into the footage.
 *
 * CLIP SOURCING
 * -------------
 * By default each scene streams from the Higgsfield CDN URL (works when your
 * machine can reach the internet). To render fully offline / more reliably:
 *   1. node scripts/localise-clips.mjs      (downloads all clips to public/clips)
 *   2. set USE_LOCAL_CLIPS = true below
 */
export const USE_LOCAL_CLIPS = false;

const BASE =
  "https://d8j0ntlcm91z4.cloudfront.net/user_38N7FUMOVFD0tdMeQPORO0JOZHB/";

type RawScene = { id: string; file: string; vo: string };

const scene = ({ id, file, vo }: RawScene): Scene => ({
  id,
  vo,
  src: USE_LOCAL_CLIPS ? staticFile(`clips/${id}.mp4`) : BASE + file,
});

export const FILMS: Film[] = [
  {
    key: "1",
    title: "The Home",
    scenes: [
      scene({ id: "f1s1", file: "hf_20260606_065746_27c87a85-fc98-464c-a3a6-b04443fd2370.mp4", vo: "This isn't just a house." }),
      scene({ id: "f1s2", file: "hf_20260606_065729_f2013bc0-ed3b-44f3-8bf3-3551d42134c6.mp4", vo: "It's where your life happens." }),
      scene({ id: "f1s3", file: "hf_20260606_065730_eef5bd90-d3ca-49b7-aa8e-6f0bcb952a13.mp4", vo: "So we help you look after it." }),
      scene({ id: "f1s4", file: "hf_20260606_065732_e71565fe-dddc-470d-9b53-134e5d5a4e3c.mp4", vo: "Just Fire. Cover for the home you love." }),
    ],
  },
  {
    key: "2",
    title: "The Everyday",
    scenes: [
      scene({ id: "f2s1", file: "hf_20260606_065733_8c332ffd-968a-43fe-b18e-db7c887cdf44.mp4", vo: "Every day, life plugs in." }),
      scene({ id: "f2s2", file: "hf_20260606_065734_7a7ecdd9-6df6-4a3b-9822-96760a559581.mp4", vo: "Warmth we don't think twice about." }),
      scene({ id: "f2s3", file: "hf_20260606_065736_510052e0-e25a-4529-b059-da96087c95f6.mp4", vo: "Most days, nothing happens." }),
      scene({ id: "f2s4", file: "hf_20260606_065737_80c630bf-6023-49e1-ac1f-ed1cf03bbd2b.mp4", vo: "We help you be ready for the day something might." }),
    ],
  },
  {
    key: "3",
    title: "The People",
    scenes: [
      scene({ id: "f3s1", file: "hf_20260606_070056_2e9c122c-6192-4980-8dcd-8476463c0b9d.mp4", vo: "The people who matter most are under one roof." }),
      scene({ id: "f3s2", file: "hf_20260606_070111_f351ca9c-9213-4087-8c45-627b4f76c65e.mp4", vo: "Memories made in the backyard." }),
      scene({ id: "f3s3", file: "hf_20260606_070057_b0965c0d-969c-41eb-b2ab-07f1bf05caff.mp4", vo: "A place that keeps them safe." }),
      scene({ id: "f3s4", file: "hf_20260606_070058_958c32a8-b054-4f91-a57a-c6ba6b056f83.mp4", vo: "Just Fire. Helping protect the people you come home to." }),
    ],
  },
  {
    key: "4",
    title: "The Unexpected",
    scenes: [
      scene({ id: "f4s1", file: "hf_20260606_070059_2567660c-67b9-45de-8401-9ba8b791056f.mp4", vo: "Australia knows the unexpected." }),
      scene({ id: "f4s2", file: "hf_20260606_070100_787500c0-b1e6-4e7a-924f-00fb356231db.mp4", vo: "But being prepared changes everything." }),
      scene({ id: "f4s3", file: "hf_20260606_070101_b73f2dc4-dd2b-4862-97d6-7e96875248d0.mp4", vo: "Knowing you've got cover in place." }),
      scene({ id: "f4s4", file: "hf_20260606_070102_bdee2e81-5b98-4763-a19d-b76b98e16413.mp4", vo: "Just Fire. Here for what comes next." }),
    ],
  },
  {
    key: "5",
    title: "One More Thing",
    scenes: [
      scene({ id: "f5s1", file: "hf_20260606_070411_3cec76dd-e243-4f61-9091-42fc8c2fb152.mp4", vo: "Fire gives us warmth. Light. Life." }),
      scene({ id: "f5s2", file: "hf_20260606_070412_d8030197-eac4-43ba-9a08-0a18de4d059f.mp4", vo: "But it asks for respect." }),
      scene({ id: "f5s3", file: "hf_20260606_070413_064347cf-febb-4314-905d-190d021fe1e0.mp4", vo: "So we made cover that's simple, and honest." }),
      scene({ id: "f5s4", file: "hf_20260606_070414_fa451460-47ac-4de5-b738-ce1f005aa70b.mp4", vo: "Just Fire. Simple cover for what matters." }),
    ],
  },
];
