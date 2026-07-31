import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

import { resolveMediaUrl } from "../src/vantage-browser-runtime.mjs";

const [
  immersive,
  report,
  buildScript,
  gitignore,
  gitattributes,
  vercelignore,
  vercelConfig,
  manifest,
] = await Promise.all([
  readFile("previews/vantage-h1-immersive.html", "utf8"),
  readFile("index.html", "utf8"),
  readFile("scripts/build-production.mjs", "utf8"),
  readFile(".gitignore", "utf8"),
  readFile(".gitattributes", "utf8"),
  readFile(".vercelignore", "utf8"),
  readFile("vercel.json", "utf8").then(JSON.parse),
  readFile("config/video-manifest.json", "utf8").then(JSON.parse),
]);

const secondVideoPath =
  "previews/assets/vantage-h1-second-screen-final-1080p.mp4";
const secondVideoUrl = `/${secondVideoPath}`;

assert.match(
  immersive,
  new RegExp(
    `<video\\b(?=[^>]*id="secondScreenVideo")(?=[^>]*data-src="${secondVideoUrl}")`,
  ),
  "the second screen must use a root-absolute same-origin compatibility video",
);
assert.match(
  immersive,
  /id="secondScreenRetry"[\s\S]*?重试播放/,
  "the second screen must expose a user-gesture retry control",
);
assert.match(
  immersive,
  /const LOGIN_VIDEO_LOAD_TIMEOUT_MS = \d+;[\s\S]*?const LOGIN_VIDEO_MAX_ATTEMPTS = 2;/,
  "login video preloading must have a bounded timeout and one retry",
);
assert.match(
  immersive,
  /addEventListener\('stalled'[\s\S]*?addEventListener\('abort'[\s\S]*?retryLoginVideoLoad/,
  "stalled and aborted media loads must be monitored by the bounded retry path",
);
assert.match(
  immersive,
  /const showSecondScreenRetry = [\s\S]*?secondScreenRetry\.hidden = false[\s\S]*?secondScreenRetry\.addEventListener\('click'/,
  "failed autoplay or delivery must reveal a direct retry action",
);
assert.match(
  immersive,
  /const loadAndPlaySecondScreen = [\s\S]*?LOGIN_VIDEO_LOAD_TIMEOUT_MS[\s\S]*?secondScreenRetry\.addEventListener\('click', \(\) => \{[\s\S]*?loadAndPlaySecondScreen\(\);/,
  "manual retry must reuse the bounded second-screen recovery controller",
);
assert.match(
  immersive,
  /secondScreenVideo\.addEventListener\(\s*'waiting'[\s\S]*?secondScreenVideo\.addEventListener\(\s*'stalled'[\s\S]*?secondScreenVideo\.addEventListener\(\s*'abort'[\s\S]*?armSecondScreenPlaybackWatchdog/,
  "playback must retain bounded waiting, stalled, and abort monitoring after preload",
);
assert.match(
  immersive,
  /const markReady = [\s\S]*?scenes\[activeIndex\]\?\.contains\(video\)[\s\S]*?playSceneVideo\(video\)/,
  "a successful preload retry must resume playback when the second scene is already active",
);
assert.match(
  immersive,
  /vantage-primary-media-state-request[\s\S]*?notifyReportPrimaryVideosReady/,
  "the immersive shell must answer the embedded report's primary-media readiness handshake",
);
assert.match(
  report,
  /vantage-primary-media-state-request[\s\S]*?vantage-primary-videos-ready[\s\S]*?startWarmup/,
  "the report must delay competing video warm-up until the opening and second-screen films are ready",
);

assert.ok(
  buildScript.includes(
    `copyPublicFile("${secondVideoPath}")`,
  ),
  "the production artifact must include the second-screen compatibility video",
);
assert.ok(
  gitignore.includes(`!${secondVideoPath}`),
  "the active second-screen compatibility video must not be ignored",
);
assert.ok(
  gitattributes.includes(`${secondVideoPath} filter=lfs`),
  "the active second-screen compatibility video must be tracked with Git LFS",
);
assert.ok(
  vercelignore.includes(`!${secondVideoPath}`),
  "the active second-screen compatibility video must reach the Vercel builder",
);
assert.equal(
  manifest[secondVideoPath]?.url,
  secondVideoUrl,
  "the production manifest must keep the second screen on the canonical origin",
);

const videoHeaderRoute = vercelConfig.routes?.find(
  (route) =>
    route.src ===
    "^/previews/assets/vantage-h1-second-screen-final-1080p\\.mp4$",
);
assert.equal(
  videoHeaderRoute?.headers?.["Cache-Control"],
  "public, max-age=31536000, immutable",
  "the versioned compatibility video must use immutable browser caching",
);

const previousManifest = globalThis.__VANTAGE_VIDEO_MANIFEST__;
try {
  globalThis.__VANTAGE_VIDEO_MANIFEST__ = {};
  assert.equal(
    resolveMediaUrl(secondVideoPath, { hostname: "vantage-h1.vercel.app" }),
    secondVideoUrl,
    "a missing runtime manifest must fall back to a root-absolute same-origin URL",
  );
} finally {
  globalThis.__VANTAGE_VIDEO_MANIFEST__ = previousManifest;
}

console.log("H1 second-screen resilient delivery contract passed.");
