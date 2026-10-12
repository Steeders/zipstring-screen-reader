import path from "node:path";
import { voiceOverTest as test } from "@guidepup/playwright";
import type { Locator, Page } from "@playwright/test";
import type { VoiceOverPlaywright } from "@guidepup/playwright";
import { Journey } from "./journey";

const SITE = process.env.SITE_URL ?? "https://zipstring.com";
const PREVIEW_THEME_ID = process.env.PREVIEW_THEME_ID ?? "";
const PDP = `${SITE}/products/zipstring-aracna${PREVIEW_THEME_ID ? `?preview_theme_id=${PREVIEW_THEME_ID}` : ""}`;
const OUT = process.env.OUT_DIR ?? path.join("transcripts", new Date().toISOString().replace(/[:.]/g, "-"));

// A real checkout button's cursor text starts with "Checkout" and ends with "button"
// ("Checkout+ | $81.96 button", "Checkout without coverage button"). Looser patterns caught
// "calculated at checkout" (run 1) and Redo's "Checkout+" label (run 2).
const CHECKOUT_BUTTON = /^check ?out.*\bbutton$/is;

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Moves VoiceOver with `move` until the cursor matches `target`, up to `max` moves.
async function moveUntil(j: Journey, vo: VoiceOverPlaywright, label: string, move: () => Promise<void>, target: RegExp, max: number) {
  for (let i = 0; i < max; i++) {
    const c = await j.cmd(label, move);
    if (target.test(c.itemText) || target.test(c.spoken)) return true;
  }
  return false;
}

// Fallback when VoiceOver can't get there on its own: focus the element with the
// keyboard and pull the VoiceOver cursor to it, so the journey can carry on.
async function pullCursorTo(j: Journey, vo: VoiceOverPlaywright, el: Locator, why: string) {
  j.note(`FALLBACK: ${why}. Focused the element directly and moved the VoiceOver cursor to keyboard focus.`);
  await el.focus();
  await j.cmd("VO+Cmd+F4 (move cursor to keyboard focus)", () =>
    vo.perform(vo.keyboardCommands.moveCursorToKeyboardFocus, { capture: true }),
  );
}

async function focusSummary(page: Page) {
  return page.evaluate(() => {
    const el = document.activeElement as HTMLElement | null;
    if (!el || el === document.body) return "document body (nothing focused)";
    const name = el.getAttribute("aria-label") ?? el.innerText?.trim().slice(0, 60) ?? "";
    return `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""}${el.getAttribute("role") ? ` role=${el.getAttribute("role")}` : ""} "${name}"`;
  });
}

test.describe("ZipString Aracna: product page to checkout with VoiceOver", () => {
  test("choose the 2-pack, add to cart, reach checkout", async ({ page, voiceOver: vo, browserName }) => {
    const j = new Journey(page, vo, OUT, {
      journey: "Aracna product page → 2-pack → add to cart → cart drawer → checkout (VoiceOver, macOS)",
      site: SITE + (PREVIEW_THEME_ID ? ` (preview theme ${PREVIEW_THEME_ID})` : ""),
      browser: browserName,
      runner: process.env.CI ? `GitHub Actions ${process.env.ImageOS ?? ""} run ${process.env.GITHUB_RUN_ID ?? ""}`.trim() : "local",
    });

    await j.step("Land on the Aracna product page", "What a VoiceOver user hears first when the page opens.", async () => {
      await page.goto(PDP, { waitUntil: "load" });
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      await wait(2000);
      await j.cmd("navigate to web content", () => vo.navigateToWebContent({ capture: true }));
      for (let i = 0; i < 5; i++) await j.cmd("VO+Right (next item)", () => vo.next());
    });

    await j.step("Skim by headings", "Most screen-reader shoppers jump heading to heading to find the product.", async () => {
      const found = await moveUntil(j, vo, "VO+Cmd+H (next heading)", () => vo.nextHeading(), /ZipString Aracna.*heading level 1|heading level 1.*ZipString Aracna/i, 12);
      if (!found) {
        await pullCursorTo(j, vo, page.getByRole("heading", { level: 1 }).first(), "VoiceOver did not reach the product H1 within 12 heading jumps");
      }
    });

    await j.step("Read the buy box", "Line by line from the title down to the pack choices: color, stock, and the Kaching pack bars.", async () => {
      const found = await moveUntil(j, vo, "VO+Right (next item)", () => vo.next(), /Get 2 Aracnas/i, 60);
      if (!found) {
        await pullCursorTo(j, vo, page.getByRole("button", { name: /^Get 2 Aracnas/ }), "VoiceOver did not reach the 2-pack bar within 60 moves");
      }
    });

    await j.step("Choose the 2-pack", "Press the 2-pack bar, then listen: is the choice confirmed, and is the new quantity announced?", async () => {
      await j.cmd("VO+Space (press)", () => vo.act({ capture: true }));
      await wait(1000);
      await j.cmd("VO+F3 (describe current item)", () => vo.perform(vo.keyboardCommands.describeItem, { capture: true }));
      const qty = await page.getByRole("spinbutton", { name: "Quantity" }).first().inputValue().catch(() => "?");
      j.note(`Page state after the press: quantity field reads ${qty}.`);
      const found = await moveUntil(j, vo, "VO+Right (next item)", () => vo.next(), /Add to cart/i, 25);
      if (!found) {
        await pullCursorTo(j, vo, page.getByRole("button", { name: /Add to cart/ }).first(), "VoiceOver did not reach Add to cart within 25 moves");
      }
    });

    await j.step("Add to cart", "Press Add to cart: is the result announced, and where does focus go?", async () => {
      await j.cmd("VO+Space (press)", () => vo.act({ capture: true }));
      await wait(3000);
      j.note(`Keyboard focus after adding: ${await focusSummary(page)}.`);
      await j.cmd("VO+Shift+F4 (describe item with keyboard focus)", () =>
        vo.perform(vo.keyboardCommands.describeItemWithKeyboardFocus, { capture: true }),
      );
    });

    await j.step("Tab through the drawer", "Keyboard-only path from where focus landed: does Tab reach both checkout buttons and stay inside the open drawer?", async () => {
      // Step off the drawer header first: in run 2, Tab pressed while VoiceOver sat on the header never moved.
      await j.cmd("VO+Right (next item)", () => vo.next());
      for (let i = 0; i < 14; i++) {
        await j.cmd("Tab", () => vo.press("Tab", { capture: true }));
        j.note(`Tab ${i + 1} focus: ${await focusSummary(page)}`);
      }
    });

    let reachedCheckoutControl = false;
    await j.step("Read the cart drawer", "From the top of the drawer, item by item: cart contents, price, coverage offer, and a checkout control.", async () => {
      j.note("Reset: put keyboard focus back on the drawer header (where Add to cart left it) and moved the VoiceOver cursor there.");
      await page.locator("#CartDrawer .drawer__tab").first().focus();
      await j.cmd("VO+Cmd+F4 (move cursor to keyboard focus)", () =>
        vo.perform(vo.keyboardCommands.moveCursorToKeyboardFocus, { capture: true }),
      );
      for (let i = 0; i < 55 && !reachedCheckoutControl; i++) {
        const c = await j.cmd("VO+Right (next item)", () => vo.next());
        reachedCheckoutControl = CHECKOUT_BUTTON.test(c.itemText);
      }
      if (!reachedCheckoutControl) j.note("VoiceOver never landed on a checkout button within 55 moves through the drawer.");
    });

    await j.step("Go to checkout", "Press the checkout button VoiceOver found and listen to the first thing the checkout page says.", async () => {
      if (reachedCheckoutControl) await j.cmd("VO+Space (press)", () => vo.act({ capture: true }));
      const reached = await page.waitForURL(/\/checkouts?\//, { timeout: 20000 }).then(() => true, () => false);
      if (!reached) {
        j.note("FALLBACK: checkout did not open from the VoiceOver path. Loaded /checkout directly so the checkout page could still be heard.");
        await page.goto(`${SITE}/checkout`, { waitUntil: "load" });
        await page.waitForURL(/\/checkouts?\//, { timeout: 30000 });
      }
      await wait(4000);
      await j.cmd("navigate to web content", () => vo.navigateToWebContent({ capture: true }));
    });

    await j.step("Read the checkout page", "Headings, then the first stretch of the page. No fields are filled and no order is placed.", async () => {
      for (let i = 0; i < 8; i++) await j.cmd("VO+Cmd+H (next heading)", () => vo.nextHeading());
      await j.cmd("navigate to web content", () => vo.navigateToWebContent());
      for (let i = 0; i < 30; i++) await j.cmd("VO+Right (next item)", () => vo.next());
    });

    j.save();
  });
});
