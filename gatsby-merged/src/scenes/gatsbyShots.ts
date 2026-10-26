import type { CameraKey } from "../engine/CameraRig";

/**
 * The Gatsby shot list: one continuous move, no cuts.
 *
 *   0 – 2.5 s   the exact paper close-up: we watch the line being struck
 *   2.5 – 6.5   slow pull-out and up, bringing the keys and swinging type bars into frame
 *               (typing runs to about 8.2 s, so the keys are seen pressing)
 *   6.5 – 13    rise over the pages while every letter lifts off
 *   13 – 23.4   slow climb as the desk dissolves and the city comes into focus
 *   23.4 – 34   the aerial hold, drifting gently, while the quote forms and is read
 *
 * The aerial pose (about 3 m up, 7° down) is the one the city backdrop camera
 * and the quote layout are built around; the city camera adds its own offset.
 */
export const GATSBY_SHOTS: readonly CameraKey[] = [
  { t: 0.0, pos: [0.115, 0.265, -0.15], look: [-0.01, 0.19, -0.338], fov: 38, dof: 0.5 },
  { t: 2.5, pos: [0.11, 0.268, -0.135], look: [-0.01, 0.19, -0.338], fov: 38, dof: 0.5 },
  { t: 6.5, pos: [0.12, 0.33, 0.08], look: [-0.01, 0.13, -0.25], fov: 36, dof: 0.6 },
  { t: 13.0, pos: [0.06, 0.9, 0.75], look: [0.0, 0.02, -0.04], fov: 44, dof: 0.6 },
  { t: 18.0, pos: [0.2, 1.9, 1.3], look: [0.0, 0.6, -6.0], fov: 44, focus: 12, dof: 0.4 },
  { t: 23.4, pos: [0.37, 3.17, 0.74], look: [-1.03, 0.57, -19.06], fov: 44, focus: 18, dof: 0.35 },
  { t: 34.0, pos: [0.9, 3.13, 0.37], look: [0.76, 0.89, -19.4], fov: 44, focus: 18, dof: 0.35 },
];
