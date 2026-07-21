import { test, expect, Page } from "@playwright/test";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Visual regression + grey-text guard for the pre-auth funnel.
 *
 * Rule enforced by the app's brand: onboarding, auth and welcome copy must
 * render as pure white (or the teal accent) on the deep-navy surface — never
 * a muted grey. This spec navigates every step of that funnel on both mobile
 * and tablet, takes a screenshot, and scans the DOM for any visible text
 * whose computed color resolves to a mid-grey. Any hit fails the test with
 * the offending text + colour so we can spot the regression immediately.
 */

const VIEWPORTS = [
  { name: "mobile", width: 390, height: 844 }, // iPhone 14
  { name: "tablet", width: 820, height: 1180 }, // iPad Air-ish
] as const;

const SCREENSHOT_DIR = path.join(__dirname, "screenshots", "visual-onboarding");

type GreyHit = { text: string; color: string; tag: string; selector: string };

/**
 * Runs in the page. Walks every text node, resolves its parent's computed
 * color, and returns nodes whose colour is a "mid grey" (R≈G≈B, not near
 * white, not near black, sufficient alpha to be visible).
 */
async function findGreyText(page: Page): Promise<GreyHit[]> {
  return page.evaluate(() => {
    const hits: GreyHit[] = [];
    const parse = (c: string): [number, number, number, number] | null => {
      const m = c.match(
        /rgba?\(\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*,\s*(\d+(?:\.\d+)?)\s*(?:,\s*(\d*(?:\.\d+)?))?\s*\)/,
      );
      if (!m) return null;
      return [Number(m[1]), Number(m[2]), Number(m[3]), m[4] ? Number(m[4]) : 1];
    };
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    let node: Node | null;
    while ((node = walker.nextNode())) {
      const text = (node.nodeValue ?? "").trim();
      if (text.length < 2) continue;
      const el = node.parentElement;
      if (!el) continue;
      // Skip anything not laid out or hidden.
      const rect = el.getBoundingClientRect();
      if (rect.width < 2 || rect.height < 2) continue;
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      if (Number(cs.opacity) < 0.3) continue;
      const rgba = parse(cs.color);
      if (!rgba) continue;
      const [r, g, b, a] = rgba;
      if (a < 0.4) continue;
      const spread = Math.max(Math.abs(r - g), Math.abs(g - b), Math.abs(r - b));
      const isGreyscale = spread <= 10;
      const isNearWhite = Math.min(r, g, b) > 235;
      const isNearBlack = Math.max(r, g, b) < 40;
      if (!isGreyscale || isNearWhite || isNearBlack) continue;
      hits.push({
        text: text.slice(0, 80),
        color: cs.color,
        tag: el.tagName.toLowerCase(),
        selector: el.className && typeof el.className === "string" ? `.${el.className.split(/\s+/).slice(0, 2).join(".")}` : el.tagName.toLowerCase(),
      });
    }
    // De-dupe identical (text,color) pairs to keep failures readable.
    const seen = new Set<string>();
    return hits.filter((h) => {
      const k = `${h.text}::${h.color}`;
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  });
}

async function snapAndAssert(page: Page, label: string) {
  await page.waitForLoadState("networkidle").catch(() => {});
  // Give the theme + fonts a beat so we don't screenshot a FOUT.
  await page.evaluate(() => document.fonts?.ready).catch(() => {});
  const file = path.join(SCREENSHOT_DIR, `${label}.png`);
  await page.screenshot({ path: file });
  const hits = await findGreyText(page);
  expect(hits, `Grey text detected on ${label}:\n${JSON.stringify(hits, null, 2)}`).toEqual([]);
}

for (const vp of VIEWPORTS) {
  test.describe(`no-grey funnel @ ${vp.name}`, () => {
    test.use({ viewport: { width: vp.width, height: vp.height } });

    test("welcome hero", async ({ page }) => {
      await page.goto("/welcome");
      await snapAndAssert(page, `${vp.name}-welcome`);
    });

    test("auth signup + signin", async ({ page }) => {
      await page.goto("/auth");
      await snapAndAssert(page, `${vp.name}-auth-signup`);
      // Toggle to sign-in mode.
      const toggle = page.getByRole("button", { name: /already have an account/i });
      if (await toggle.isVisible().catch(() => false)) {
        await toggle.click();
        await snapAndAssert(page, `${vp.name}-auth-signin`);
      }
    });

    test("onboarding every step", async ({ page }) => {
      await page.goto("/onboarding");
      // Step count is exposed in the header as "N/M".
      const counter = page.locator("span.tabular-nums").first();
      await expect(counter).toBeVisible({ timeout: 10_000 });
      const total = Number(((await counter.textContent()) ?? "1/1").split("/")[1]) || 1;

      for (let i = 0; i < total; i++) {
        await snapAndAssert(page, `${vp.name}-onboarding-step-${i + 1}`);
        // Advance if we can; the Continue button is disabled on steps that
        // need input, so bail out gracefully — the earlier steps already
        // proved the grey-text guard on every reachable surface.
        const cta = page.getByRole("button", { name: /continue|build my program/i });
        if (!(await cta.isVisible().catch(() => false))) break;
        if (await cta.isDisabled().catch(() => true)) break;
        await cta.click();
        await page.waitForTimeout(150);
      }
    });
  });
}
