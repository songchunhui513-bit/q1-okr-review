import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { homedir } from "node:os";
import { join } from "node:path";

const require = createRequire(import.meta.url);
let playwright;
for (const candidate of [
  "playwright",
  join(
    homedir(),
    ".cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright",
  ),
]) {
  try {
    playwright = require(candidate);
    break;
  } catch (error) {
    if (error.code !== "MODULE_NOT_FOUND") throw error;
  }
}
assert.ok(
  playwright,
  "Playwright is required; install it or run this test in the Codex workspace runtime",
);
const { chromium } = playwright;

const baseUrl = process.env.H1_VIDEO_TEST_URL;
assert.ok(
  baseUrl,
  "Set H1_VIDEO_TEST_URL to the exact server for the worktree under test",
);
const pageUrl = `${baseUrl}/previews/vantage-h1-immersive.html`;
const secondVideoPattern =
  "**/previews/assets/vantage-h1-second-screen-final-1080p.mp4*";
const browser = await chromium.launch({ headless: true });

const waitForSecondVideo = (page) =>
  page.waitForFunction(
    () => {
      const video = document.querySelector("#secondScreenVideo");
      return video?.readyState >= HTMLMediaElement.HAVE_FUTURE_DATA;
    },
    undefined,
    { timeout: 30_000 },
  );

try {
  {
    const page = await browser.newPage();
    await page.route("**/runtime-config.js", (route) => route.abort());
    await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
    await waitForSecondVideo(page);
    await page.waitForFunction(
      () =>
        document.querySelector("#loginPreloadStatus")?.textContent ===
        "首两屏视频已就绪 2/2",
      undefined,
      { timeout: 30_000 },
    );
    const state = await page.evaluate(() => {
      const video = document.querySelector("#secondScreenVideo");
      return {
        src: video.currentSrc,
        preload: document.querySelector("#loginPreloadStatus")?.textContent,
      };
    });
    assert.equal(
      new URL(state.src).pathname,
      "/previews/assets/vantage-h1-second-screen-final-1080p.mp4",
      "a missing runtime manifest must still load the same-origin second screen",
    );
    assert.equal(
      state.preload,
      "首两屏视频已就绪 2/2",
      "both primary videos must become ready without runtime-config.js",
    );
    await page.close();
  }

  {
    const page = await browser.newPage();
    let secondVideoRequests = 0;
    await page.route(secondVideoPattern, (route) => {
      secondVideoRequests += 1;
      if (secondVideoRequests === 1) return route.abort("connectionfailed");
      return route.continue();
    });
    await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
    await waitForSecondVideo(page);
    assert.ok(
      secondVideoRequests >= 2,
      "the player must retry after the first second-screen request fails",
    );
    assert.equal(
      await page.locator("#secondScreenRetry").isHidden(),
      true,
      "a successful automatic retry must keep the recovery button hidden",
    );
    await page.close();
  }

  {
    const page = await browser.newPage();
    await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
    await waitForSecondVideo(page);
    await page.locator("#loginSubmit").click();
    await page.waitForFunction(
      () => document.querySelector("#loginGate")?.classList.contains("is-hidden"),
    );
    await page.evaluate(() =>
      document.querySelector(".second-film").scrollIntoView({ behavior: "instant" }),
    );
    await page.waitForFunction(
      () => document.querySelector(".second-film")?.classList.contains("active"),
    );
    await page.evaluate(() => {
      const video = document.querySelector("#secondScreenVideo");
      video.pause();
      video.currentTime = 1;
      video.dispatchEvent(new Event("stalled"));
    });
    await page.waitForTimeout(7_000);
    assert.equal(
      await page.locator("#secondScreenVideo").evaluate((video) => video.paused),
      true,
      "the playback watchdog must remain bounded instead of reloading on a brief stall signal",
    );
    await page.waitForFunction(
      () => {
        const video = document.querySelector("#secondScreenVideo");
        return !video.paused && video.currentTime > 0.2;
      },
      undefined,
      { timeout: 8_000 },
    );
    await page.close();
  }

  {
    const page = await browser.newPage();
    let secondVideoRequests = 0;
    const retryWarnings = [];
    page.on("console", (message) => {
      if (message.text().includes("正在重试")) retryWarnings.push(message.text());
    });
    await page.route(secondVideoPattern, async (route) => {
      secondVideoRequests += 1;
      await new Promise((resolve) => setTimeout(resolve, 4_000));
      await route.continue();
    });
    await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
    await waitForSecondVideo(page);
    assert.ok(
      secondVideoRequests >= 1,
      "the slow-response scenario must exercise the second-screen source",
    );
    assert.deepEqual(
      retryWarnings,
      [],
      "a slow but healthy response must complete before the bounded timeout without an application retry",
    );
    await page.close();
  }

  {
    const page = await browser.newPage();
    let secondVideoMode = "fail";
    const heldRoutes = [];
    await page.route(secondVideoPattern, (route) => {
      if (secondVideoMode === "fail") return route.abort("connectionfailed");
      if (secondVideoMode === "hang") {
        heldRoutes.push(route);
        return;
      }
      return route.continue();
    });
    await page.goto(pageUrl, { waitUntil: "domcontentloaded" });
    await page.waitForFunction(
      () => document.querySelector("#secondScreenRetry")?.hidden === false,
      undefined,
      { timeout: 30_000 },
    );
    secondVideoMode = "hang";
    await page.evaluate(() => document.querySelector("#secondScreenRetry").click());
    await page.waitForFunction(
      () => document.querySelector("#secondScreenRetry")?.hidden === true,
    );
    await page.waitForFunction(
      () => document.querySelector("#secondScreenRetry")?.hidden === false,
      undefined,
      { timeout: 20_000 },
    );
    assert.ok(
      heldRoutes.length >= 1,
      "manual recovery must be exercised against a hanging media request",
    );
    secondVideoMode = "allow";
    await Promise.all(
      heldRoutes.splice(0).map((route) =>
        route.abort("connectionfailed").catch(() => {}),
      ),
    );
    await page.evaluate(() => document.querySelector("#secondScreenRetry").click());
    await waitForSecondVideo(page);
    assert.equal(
      await page.locator("#secondScreenRetry").isHidden(),
      true,
      "manual retry must recover playback after connectivity returns",
    );
    await page.close();
  }
} finally {
  await browser.close();
}

console.log(
  "H1 second-screen runtime fallback, automatic retry, and manual recovery passed.",
);
