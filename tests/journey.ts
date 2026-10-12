import fs from "node:fs";
import path from "node:path";
import type { Page } from "@playwright/test";
import type { VoiceOverPlaywright } from "@guidepup/playwright";

type Command = { n: number; command: string; itemText: string; spoken: string; ms: number };

type Step = {
  id: string;
  name: string;
  intent: string;
  url: string;
  commands: Command[];
  spoken: string[];
  notes: string[];
  openDialogs: string[];
  screenshot?: string;
  error?: string;
};

// Records what VoiceOver says at every command, sliced into named steps, plus a
// screenshot per step. The JSON is what Claude reads back as a listener.
export class Journey {
  private steps: Step[] = [];
  private current?: Step;
  private n = 0;
  readonly startedAt = new Date().toISOString();

  constructor(
    private page: Page,
    private vo: VoiceOverPlaywright,
    readonly outDir: string,
    readonly meta: Record<string, string>,
  ) {
    fs.mkdirSync(path.join(outDir, "screens"), { recursive: true });
  }

  async step(name: string, intent: string, fn: () => Promise<void>) {
    const id = String(this.steps.length + 1).padStart(2, "0");
    const before = (await this.vo.spokenPhraseLog()).length;
    const step: Step = { id, name, intent, url: this.page.url(), commands: [], spoken: [], notes: [], openDialogs: [] };
    this.steps.push(step);
    this.current = step;
    try {
      await fn();
    } catch (e) {
      step.error = e instanceof Error ? e.message.split("\n")[0] : String(e);
    }
    step.spoken = (await this.vo.spokenPhraseLog()).slice(before);
    step.url = this.page.url();
    step.openDialogs = await this.openDialogs();
    const shot = `screens/${id}-${slug(name)}.png`;
    await this.page.screenshot({ path: path.join(this.outDir, shot) }).catch(() => undefined);
    step.screenshot = shot;
    this.save();
    return step;
  }

  // Runs one VoiceOver command and records what it said and where the cursor landed.
  async cmd(label: string, run: () => Promise<unknown>) {
    const t = Date.now();
    await run();
    const c: Command = {
      n: ++this.n,
      command: label,
      itemText: (await this.vo.itemText()).trim(),
      spoken: (await this.vo.lastSpokenPhrase()).trim(),
      ms: Date.now() - t,
    };
    this.current?.commands.push(c);
    return c;
  }

  note(text: string) {
    this.current?.notes.push(text);
  }

  private async openDialogs() {
    return this.page
      .evaluate(() =>
        [...document.querySelectorAll<HTMLElement>('[role="dialog"], dialog, [aria-modal="true"]')]
          .filter((el) => {
            const s = getComputedStyle(el);
            const r = el.getBoundingClientRect();
            return s.visibility !== "hidden" && s.display !== "none" && r.width > 0 && r.height > 0 && r.right > 0 && r.left < innerWidth;
          })
          .map((el) => `${el.tagName.toLowerCase()}${el.id ? "#" + el.id : ""} "${el.getAttribute("aria-label") ?? ""}"`),
      )
      .catch(() => []);
  }

  save() {
    const out = {
      ...this.meta,
      startedAt: this.startedAt,
      savedAt: new Date().toISOString(),
      steps: this.steps,
    };
    fs.writeFileSync(path.join(this.outDir, "journey.json"), JSON.stringify(out, null, 2));
    fs.writeFileSync(path.join(this.outDir, "transcript.md"), toMarkdown(out));
  }
}

function slug(s: string) {
  return s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
}

function toMarkdown(run: { steps: Step[] } & Record<string, unknown>) {
  const lines = [`# ${run.journey}`, "", `Started ${run.startedAt} · ${run.browser} · ${run.runner ?? "local"}`, ""];
  for (const s of run.steps) {
    lines.push(`## ${s.id}. ${s.name}`, "", `_${s.intent}_`, "", `URL: ${s.url}`, "");
    if (s.error) lines.push(`**Step error:** ${s.error}`, "");
    for (const n of s.notes) lines.push(`> ${n}`);
    if (s.notes.length) lines.push("");
    if (s.openDialogs.length) lines.push(`Open dialogs: ${s.openDialogs.join(", ")}`, "");
    for (const c of s.commands) lines.push(`- \`${c.command}\` → “${c.spoken}”${c.itemText && c.itemText !== c.spoken ? ` (cursor: ${c.itemText})` : ""}`);
    lines.push("", `![${s.name}](${s.screenshot})`, "");
  }
  return lines.join("\n");
}
