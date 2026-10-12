# zipstring-screen-reader

Real VoiceOver, driven by [Guidepup](https://www.guidepup.dev) through scripted shopper journeys on zipstring.com.
Every command's spoken output is recorded so the transcript can be read the way a blind shopper would hear the page.

## Journeys

| Spec | Path | Stops at |
|---|---|---|
| `tests/aracna-checkout.voiceover.spec.ts` | Aracna product page → 2-pack → add to cart → cart drawer → checkout | The checkout page. No fields are filled and no order is placed. |

## Running

Runs on GitHub Actions macOS runners only (VoiceOver takes over the machine it runs on):
Actions → **VoiceOver journeys** → Run workflow. The artifact holds `transcripts/<journey>/journey.json`,
`transcript.md`, a screenshot per step, the Playwright video and trace, and the setup screen recording.

The workflow runs on manual dispatch only. Each run adds one cart and opens one checkout session on the live store.

## Limits

- macOS VoiceOver with WebKit (Safari's engine) only: no iPhone VoiceOver, no JAWS, no NVDA yet.
- Scripted paths only. Steps marked `FALLBACK` in the transcript are where VoiceOver could not get there on its own.
- Screen-reader runs in CI are slow and timing-sensitive; one retry is configured.
- Shopify owns the checkout markup.
- This is a test harness, not an accessibility certification.
