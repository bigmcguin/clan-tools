import { Composition } from "remotion";
import { FILMS } from "./just-fire/films";
import { FPS, filmDurationInFrames } from "./just-fire/config";
import { JustFireFilm } from "./just-fire/JustFireFilm";

// Each <Composition> is an entry in the Studio sidebar.
//
// The "Just Fire" films stitch the silent Australian Kling clips together.
// Render one with:  npx remotion render JustFire1 out/just-fire-1.mp4
// Render all with:  npm run render:all

export const RemotionRoot: React.FC = () => {
  return (
    <>
      {FILMS.map((film) => (
        <Composition
          key={film.key}
          id={`JustFire${film.key}`}
          component={JustFireFilm}
          durationInFrames={filmDurationInFrames(film)}
          fps={FPS}
          width={1920}
          height={1080}
          defaultProps={{ film }}
        />
      ))}
    </>
  );
};
