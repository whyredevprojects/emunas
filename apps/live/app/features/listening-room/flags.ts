/**
 * Transcript view: designed, OFF (integration-plan §0.3, C17; tech-live §3.5).
 *
 * The listening room has a reserved slot for a Transcript tab after the companion tabs. No transcript
 * component exists in this feature and nothing here fetches transcript data. W5.2 owns the gated
 * scaffold (`app/features/transcript/**`, `app/config/feature-flags.ts`) and will import it only
 * behind `if (TRANSCRIPT_VIEW)`, so with the constant `false` the bundler drops it entirely.
 * `room.test.tsx` and the e2e bundle grep assert that no Transcript tab reaches the page or bundle.
 */
export const TRANSCRIPT_VIEW = false as const;
