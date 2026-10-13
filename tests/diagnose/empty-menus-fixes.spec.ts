import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { test, type Page } from "@playwright/test";

// Each orphaned "menu" in the accessibility tree is an AXMenu with no DOM id or class.
// Try one mitigation at a time on the hidden <select>s and count what is left.
const SITE = process.env.SITE_URL ?? "https://zipstring.com";
const OUT = process.env.OUT_DIR ?? "transcripts/diagnose";
const results: string[] = [];

function orphanMenus(name: string) {
  fs.mkdirSync(OUT, { recursive: true });
  const file = path.join(OUT, `${name}.jsonl`);
  execFileSync("swift", ["tools/ax-dump.swift", "Playwright", file], { encoding: "utf8", timeout: 600000 });
  const rows = fs.readFileSync(file, "utf8").split("\n").filter(Boolean).map((l) => JSON.parse(l));
  // Path "0.…" is the browser window; "1.…" is the macOS menu bar.
  const n = rows.filter((r) => r.role === "AXMenu" && r.path.startsWith("0.") && !r.domId && !r.domClass).length;
  results.push(`${name}: ${n} orphan menus`);
  return n;
}

async function trial(page: Page, name: string, scope: string, apply: string, revert: string) {
  await page.evaluate(([s, a]) => document.querySelectorAll(s).forEach((el) => new Function("el", a)(el)), [scope, apply]);
  await page.waitForTimeout(1500);
  orphanMenus(name);
  await page.evaluate(([s, r]) => document.querySelectorAll(s).forEach((el) => new Function("el", r)(el)), [scope, revert]);
  await page.waitForTimeout(1500);
}

test("which mitigation removes the orphaned menus", async ({ page }) => {
  test.setTimeout(25 * 60 * 1000);
  await page.goto(`${SITE}/products/zipstring-aracna`, { waitUntil: "load" });
  await page.waitForTimeout(5000);
  await page.getByRole("button", { name: /Add to cart/ }).first().click();
  await page.waitForTimeout(4000);
  await page.bringToFront();

  const sel = 'modal-element[id^="ShippingCalculator"] select';
  results.push(`drawer: ${await page.locator(sel).count()} hidden selects in the shipping calculator`);
  orphanMenus("drawer-0-baseline");
  await trial(page, "drawer-1-inert-on-modal", 'modal-element[id^="ShippingCalculator"]', "el.inert = true", "el.inert = false");
  await trial(page, "drawer-2-select-hidden-attr", sel, "el.hidden = true", "el.hidden = false");
  await trial(page, "drawer-3-select-disabled", sel, "el.disabled = true", "el.disabled = false");
  await trial(page, "drawer-4-select-aria-hidden", sel, "el.setAttribute('aria-hidden','true')", "el.removeAttribute('aria-hidden')");
  await trial(page, "drawer-5-select-size-2", sel, "el.size = 2", "el.removeAttribute('size')");
  await trial(page, "drawer-6-select-removed", sel, "el.__p = el.parentNode; el.__n = el.nextSibling; el.remove()", "el.__p.insertBefore(el, el.__n)");
  orphanMenus("drawer-7-after-restore");

  fs.writeFileSync(path.join(OUT, "fixes.txt"), results.join("\n") + "\n");
  console.log(results.join("\n"));
});
