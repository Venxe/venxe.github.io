export const DESKTOP_SIZE = Object.freeze({ width: 1200, height: 675 });

const laptopWidth = 3.6;
const screenWidth = laptopWidth - 0.14;
const screenHeight = screenWidth * DESKTOP_SIZE.height / DESKTOP_SIZE.width;
export const LAPTOP_SIZE = Object.freeze({
  width: laptopWidth,
  depth: screenHeight + 0.12,
  screenWidth,
  screenHeight,
});
// Compress the original 2.4-unit deck layout without shrinking ports or details.
export const LAPTOP_DEPTH_SCALE = LAPTOP_SIZE.depth / 2.4;

export const SETTINGS = Object.freeze({
  maxPixelRatio: 1.5,
  fieldOfView: 35,
  minPolarAngle: Math.PI / 7,
  maxPolarAngle: Math.PI / 2.15,
  minSceneDistance: 5,
  focusEnterRatio: 0.7,
  focusApproachRatio: 1.05,
  focusMinRatio: 0.94,
  focusFrameRatio: 0.98,
  focusElevation: Math.PI / 12,
  screenFitRatio: 0.99,
  zoomGestureIdleMs: 200,
  transitionSeconds: 0.65,
  dragThreshold: 6,
  steamCount: 40,
  steamHeight: 1.3,
  laptopPosition: [-0.65, 0.0815, 0],
  cupPosition: [1.95, 0.003, 0.05],
});
