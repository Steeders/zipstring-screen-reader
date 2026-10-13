import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test } from "@playwright/test";

// Diagnostic, no screen reader: dump the macOS accessibility tree (what VoiceOver reads) at the two
// places VoiceOver announced empty "menu" items, so each one can be tied to a DOM element.
const SITE = process.env.SITE_URL ?? "https://zipstring.com";
const OUT = process.env.OUT_DIR ?? "transcripts/diagnose";

function dump(name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  const out = execFileSync("swift", ["tools/ax-dump.swift", "Playwright", path.join(OUT, `${name}.jsonl`)], { encoding: "utf8", timeout: 600000 });
  console.log(name, out.trim());
}

test("accessibility tree around the empty menus", async ({ page }) => {
  test.setTimeout(20 * 60 * 1000);
  await page.goto(`${SITE}/products/zipstring-aracna`, { waitUntil: "load" });
  await page.waitForTimeout(5000);
  await page.locator(".kaching-bundles__bar-main").nth(1).click();
  await page.waitForTimeout(1500);
  await page.bringToFront();
  dump("pdp-2pack");
  fs.writeFileSync(path.join(OUT, "pdp-2pack-kaching.html"), await page.locator(".kaching-bundles__bars").first().evaluate((e) => e.outerHTML));

  await page.getByRole("button", { name: /Add to cart/ }).first().click();
  await page.waitForTimeout(4000);
  dump("drawer");
  fs.writeFileSync(path.join(OUT, "drawer.html"), await page.locator("#CartDrawer").evaluate((e) => e.outerHTML));
});
