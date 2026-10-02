import { chromium } from 'playwright';

const URL = process.env.SHOT_URL ?? 'http://127.0.0.1:3210/';
const OUT = process.argv[2] ?? '/tmp/opencode/shot/current.png';

const browser = await chromium.launch({ args: ['--force-color-profile=srgb', '--font-render-hinting=none'] });
const page = await browser.newPage({
  viewport: { width: 1628, height: 966 },
  deviceScaleFactor: 1,
});
await page.goto(URL, { waitUntil: 'networkidle' });
await page.evaluate(() => document.fonts.ready);
await page.waitForTimeout(900);

// Freeze the entrance animations so the capture is the settled composition.
await page.addStyleTag({ content: '*,*::before,*::after{animation-play-state:paused !important}' });
await page.waitForTimeout(150);

const probe = process.env.SHOT_PROBE === '1';
if (probe) {
  const boxes = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const r = el.getBoundingClientRect();
      return { sel, x: +r.x.toFixed(1), y: +r.y.toFixed(1), w: +r.width.toFixed(1), h: +r.height.toFixed(1) };
    };
    const out = {};
    for (const [k, v] of Object.entries(window.__probe ?? {})) out[k] = v;
    for (const sel of window.__probeSelectors ?? []) {
      const r = pick(sel);
      if (r) out[sel] = r;
    }
    return out;
  });
  console.log(JSON.stringify(probe === false ? {} : boxes, null, 2));
}

await page.screenshot({ path: OUT });
await browser.close();
console.log('saved', OUT);
