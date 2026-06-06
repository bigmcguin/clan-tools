import React from "react";
import { AbsoluteFill, OffthreadVideo } from "remotion";
import {
  linearTiming,
  TransitionSeries,
} from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { SCENE_DURATION_IN_FRAMES, TRANSITION_IN_FRAMES } from "./config";
import type { Film } from "./config";

/**
 * Stitches a film's scene clips together into one continuous video with a
 * gentle crossfade between each scene. The clips are silent by design — add
 * voiceover / music / on-screen text separately in your edit.
 */
export const JustFireFilm: React.FC<{ film: Film }> = ({ film }) => {
  return (
    <AbsoluteFill style={{ backgroundColor: "black" }}>
      <TransitionSeries>
        {film.scenes.map((scene, i) => (
          <React.Fragment key={scene.id}>
            <TransitionSeries.Sequence durationInFrames={SCENE_DURATION_IN_FRAMES}>
              <AbsoluteFill style={{ backgroundColor: "black" }}>
                <OffthreadVideo
                  src={scene.src}
                  muted
                  // Trim to the scene length; freeze on the last frame if the
                  // source clip happens to be a touch shorter.
                  style={{ width: "100%", height: "100%", objectFit: "cover" }}
                />
              </AbsoluteFill>
            </TransitionSeries.Sequence>
            {i < film.scenes.length - 1 ? (
              <TransitionSeries.Transition
                presentation={fade()}
                timing={linearTiming({ durationInFrames: TRANSITION_IN_FRAMES })}
              />
            ) : null}
          </React.Fragment>
        ))}
      </TransitionSeries>
    </AbsoluteFill>
  );
};
