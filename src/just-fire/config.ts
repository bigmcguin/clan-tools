/**
 * Shared configuration + types for the "Just Fire" stitched films.
 *
 * Each film is 4 scenes, each scene is an 8-second silent Kling clip,
 * joined with a short crossfade. Voiceover, music, on-screen text and any
 * terms & conditions are intentionally NOT included — add them in your edit.
 */

export const FPS = 30;
export const SCENE_SECONDS = 8;
export const SCENE_DURATION_IN_FRAMES = SCENE_SECONDS * FPS; // 240
export const TRANSITION_IN_FRAMES = 15; // 0.5s crossfade

export type Scene = {
  /** stable id, e.g. "f1s1" */
  id: string;
  /** video source — a CloudFront URL, or staticFile() path once localised */
  src: string;
  /** the voiceover line this scene is timed to (for reference only) */
  vo: string;
};

export type Film = {
  /** composition id suffix, e.g. "1" -> composition "JustFire1" */
  key: string;
  /** human title */
  title: string;
  scenes: Scene[];
};

/** Total length of a film = scenes back-to-back minus the overlapping crossfades. */
export const filmDurationInFrames = (film: Film): number =>
  film.scenes.length * SCENE_DURATION_IN_FRAMES -
  Math.max(0, film.scenes.length - 1) * TRANSITION_IN_FRAMES;
