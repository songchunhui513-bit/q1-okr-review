import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const root = path.resolve(import.meta.dirname, "..");
const formalPath = path.join(root, "previews/vantage-h1-immersive.html");
const openingPosterPath = path.join(
  root,
  "previews/assets/vantage-h1-opening-final-poster.jpg",
);
const secondVideoPath = path.join(
  root,
  "previews/assets/vantage-h1-second-screen-final-1080p.mp4",
);
const secondPosterPath = path.join(
  root,
  "previews/assets/vantage-h1-second-screen-final-poster.jpg",
);
const formal = fs.readFileSync(formalPath, "utf8");

assert.ok(
  fs.existsSync(openingPosterPath),
  "the opening film must have an immediate poster frame instead of a black loading surface",
);
assert.match(
  formal,
  /<video\b(?=[^>]*class="video-bg")(?=[^>]*poster="assets\/vantage-h1-opening-final-poster\.jpg")(?=[^>]*src="assets\/vantage-h1-opening-final-4k\.mp4")[^>]*>/,
  "the opening video must render its poster while the 4K source is loading",
);

assert.ok(
  fs.existsSync(secondVideoPath),
  "the supplied second-screen film must be included in the local formal deck",
);
assert.ok(
  fs.existsSync(secondPosterPath),
  "the second-screen film must have a poster for immediate visual continuity",
);

const secondScene = formal.match(
  /<section class="scene scene-video hero-visual second-film"[\s\S]*?<\/section>/,
)?.[0];
assert.ok(secondScene, "the second screen must be implemented as a video scene");
assert.match(
  secondScene,
  /<video\b(?=[^>]*id="secondScreenVideo")(?=[^>]*class="video-bg second-screen-video")(?=[^>]*playsinline)(?=[^>]*preload="metadata")(?=[^>]*poster="assets\/vantage-h1-second-screen-final-poster\.jpg")(?=[^>]*data-src="\/previews\/assets\/vantage-h1-second-screen-final-1080p\.mp4")[^>]*>/,
  "the second screen must defer the same-origin compatibility film until its scene becomes active",
);
assert.doesNotMatch(
  secondScene,
  /vantage-h1-second-screen-(?:25s|july27|july28-4k)/,
  "superseded second-screen films must no longer be referenced",
);
assert.doesNotMatch(
  secondScene,
  /H1\s*<br>\s*REVIEW|CLARITY|MOMENTUM|GROWTH|hero-title|Half-Year Business Review/,
  "the second screen must remove the former H1 REVIEW overlay copy",
);
assert.match(
  secondScene,
  /<div class="chapter-no">02 <small>\/ 06<\/small><\/div>/,
  "the second screen must retain its page number",
);

assert.doesNotMatch(
  formal,
  /id="audioPrompt"|点击开启声音|audio-permission-prompt/,
  "the presentation must not add a bottom sound-enablement button",
);
assert.match(
  formal,
  /const secondScreenVideo = document\.getElementById\('secondScreenVideo'\);/,
  "the second-screen film must be part of the scene playback controller",
);
assert.match(
  formal,
  /const ensureVideoSource = video => \{[\s\S]*?video\.src = window\.VantageBrowserRuntime\.resolveMediaUrl\(video\.dataset\.src\);[\s\S]*?video\.load\(\);[\s\S]*?ensureVideoSource\(video\);/,
  "deferred scene videos must receive their source immediately before playback",
);
assert.match(
  formal,
  /const playSceneVideo = \(video\) => \{[\s\S]*?video\.muted = !isSoundAudible\(\);[\s\S]*?video\.play\(\)\.then\([\s\S]*?\.catch\(\(\) => \{[\s\S]*?video\.muted = true;[\s\S]*?video\.play\(\)\.catch\(\(\) => \{[\s\S]*?showSecondScreenRetry\(\);/,
  "the active video must request audible playback, fall back to muted playback, and expose recovery when both attempts fail",
);
assert.match(
  formal,
  /else \{\s*video\.pause\(\);\s*video\.muted = true;\s*if \(video === secondScreenVideo\) clearSecondScreenPlaybackWatchdog\(\);\s*\}/,
  "a film that leaves the active screen must pause and become silent",
);
assert.match(
  formal,
  /if \(video === secondScreenVideo && video\.ended\) video\.currentTime = 0;/,
  "returning to a completed second-screen film must replay it from the beginning",
);
assert.doesNotMatch(
  secondScene,
  /<video[^>]*\sloop(?:\s|>|=)/,
  "the second-screen film must stop on its final frame instead of looping",
);

const secondProbe = JSON.parse(
  execFileSync(
    "ffprobe",
    [
      "-v", "error",
      "-show_entries", "format=duration,size:stream=codec_name,codec_type,width,height,pix_fmt,r_frame_rate,bit_rate,sample_rate,channels",
      "-of", "json",
      secondVideoPath,
    ],
    { encoding: "utf8" },
  ),
);
const secondVideo = secondProbe.streams.find(
  (stream) => stream.codec_type === "video",
);
const secondAudio = secondProbe.streams.find(
  (stream) => stream.codec_type === "audio",
);
assert.equal(secondVideo?.codec_name, "h264", "the second-screen film must use H.264");
assert.equal(secondVideo?.width, 1920, "the compatibility film must use 1080p width");
assert.equal(secondVideo?.height, 1080, "the compatibility film must use 1080p height");
assert.equal(secondVideo?.pix_fmt, "yuv420p", "the film must remain broadly browser-compatible");
assert.equal(secondVideo?.r_frame_rate, "24/1", "the supplied 24 fps motion must be preserved");
assert.ok(Number(secondVideo?.bit_rate) >= 4_000_000, "the 1080p film must retain a clear presentation bitrate");
assert.equal(
  secondAudio?.codec_name,
  "aac",
  "the supplied sound-effect version must retain its AAC audio track",
);
assert.equal(secondAudio?.sample_rate, "48000", "the supplied 48 kHz audio must be preserved");
assert.equal(secondAudio?.channels, 2, "the supplied stereo audio must be preserved");
assert.ok(
  Number(secondAudio?.bit_rate) >= 160_000,
  "the sound-effect track must retain high-quality audio bitrate",
);
assert.ok(
  Number(secondProbe.format.duration) >= 8,
  "the complete supplied second-screen film must be retained",
);

const secondBytes = fs.readFileSync(secondVideoPath);
const secondMoovOffset = secondBytes.indexOf(Buffer.from("moov"));
const secondMdatOffset = secondBytes.indexOf(Buffer.from("mdat"));
assert.ok(secondMoovOffset > 0 && secondMdatOffset > 0, "the second-screen MP4 must contain moov and mdat atoms");
assert.ok(secondMoovOffset < secondMdatOffset, "the second-screen MP4 must use faststart");

console.log("H1 opening and second-screen video contract passed.");
