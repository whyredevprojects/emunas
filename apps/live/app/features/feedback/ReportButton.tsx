/**
 * "Something's wrong here" (concept-live §9, tech-live §7, integration-plan W4.7): a two-tap report
 * on any item. Tap one opens a small dialog; tap two picks the reason and sends. An optional note
 * can be written before choosing. Turnstile runs inside the dialog (invisible unless Cloudflare
 * wants an interaction); a reason chosen before the token arrives is sent as soon as it does.
 *
 * Reports are a queue for the pipeline owner; they never change the site.
 */
import { UI_DIR, type UiLang } from "@emunas/i18n";
import { useCallback, useEffect, useId, useRef, useState, type JSX } from "react";
import { Button, Dialog, DialogTrigger, Heading, Popover } from "react-aria-components";
import {
  FEEDBACK_REASONS,
  MAX_TEXT_LENGTH,
  buildBody,
  noteLength,
  submitFeedback,
  type FeedbackReason,
  type FeedbackTarget,
  type SubmitOutcome,
} from "./api.ts";
import { feedbackConfig } from "./config.ts";
import { feedbackT, type FeedbackKey, type FeedbackT } from "./strings.ts";
import { feedbackStyles as s } from "./styles.ts";
import { turnstileLanguage, type TurnstileApi } from "./turnstile.ts";

export interface ReportButtonProps {
  ui: UiLang;
  /** The shiur file's `rev`, so a report can be matched to the data it was made against. */
  rev: string;
  target: FeedbackTarget;
}

/** The site key, read after mount (prerendered HTML and the first client render agree on "none"). */
function useSiteKey(): string | null {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    setKey(feedbackConfig().siteKey());
  }, []);
  return key;
}

export function ReportButton({ ui, rev, target }: ReportButtonProps): JSX.Element | null {
  const siteKey = useSiteKey();
  const ft = feedbackT(ui);
  if (siteKey === null) return null;
  return (
    <DialogTrigger>
      <Button className={s.trigger} data-report={target.momentId ?? target.shiurId}>
        <FlagIcon />
        <span className={s.visuallyHidden}>{ft("report.open")}</span>
      </Button>
      <Popover className={s.popover} placement="bottom end">
        <Dialog className={s.dialog} data-report-dialog="">
          {({ close }) => <ReportForm ui={ui} rev={rev} target={target} siteKey={siteKey} ft={ft} close={close} />}
        </Dialog>
      </Popover>
    </DialogTrigger>
  );
}

function FlagIcon(): JSX.Element {
  return (
    <svg className={s.icon} viewBox="0 0 16 16" width="16" height="16" aria-hidden="true" focusable="false">
      <path d="M3 1.5v13M3 2.5h8.5l-2 3 2 3H3" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

type Widget = "loading" | "ready" | "error";
type Phase =
  | { kind: "idle" }
  | { kind: "waiting"; reason: FeedbackReason }
  | { kind: "sending"; reason: FeedbackReason }
  | { kind: "sent" }
  | { kind: "error"; message: FeedbackKey };

const ERROR_MESSAGE: Record<Exclude<SubmitOutcome["kind"], "sent">, FeedbackKey> = {
  verify: "error.verify",
  rate: "error.rate",
  unavailable: "error.unavailable",
  invalid: "error.invalid",
  network: "error.network",
};

function ReportForm({
  ui,
  rev,
  target,
  siteKey,
  ft,
  close,
}: {
  ui: UiLang;
  rev: string;
  target: FeedbackTarget;
  siteKey: string;
  ft: FeedbackT;
  close: () => void;
}): JSX.Element {
  const ids = useId();
  const [text, setText] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [widget, setWidget] = useState<Widget>("loading");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [attempt, setAttempt] = useState(0);
  const box = useRef<HTMLDivElement>(null);
  const api = useRef<{ turnstile: TurnstileApi; id: string } | null>(null);
  const closeButton = useRef<HTMLButtonElement>(null);
  const alive = useRef(true);

  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  // Render the Turnstile widget while the dialog is open (again after a failed load: `attempt`).
  useEffect(() => {
    let cancelled = false;
    setWidget("loading");
    setToken(null);
    feedbackConfig()
      .loadTurnstile()
      .then((turnstile) => {
        if (cancelled || !box.current) return;
        const id = turnstile.render(box.current, {
          sitekey: siteKey,
          callback: (t) => {
            if (cancelled) return;
            setToken(t);
            setWidget("ready");
          },
          "error-callback": () => {
            if (cancelled) return;
            setToken(null);
            setWidget("error");
          },
          "expired-callback": () => {
            if (cancelled) return;
            setToken(null);
            api.current?.turnstile.reset(api.current.id);
          },
          "timeout-callback": () => {
            if (cancelled) return;
            setToken(null);
            setWidget("error");
          },
          language: turnstileLanguage(ui),
          appearance: "interaction-only",
          theme: "auto",
          size: "flexible",
          action: "feedback",
        });
        if (id === undefined) {
          setWidget("error");
          return;
        }
        api.current = { turnstile, id };
      })
      .catch(() => {
        if (!cancelled) setWidget("error");
      });
    return () => {
      cancelled = true;
      const w = api.current;
      api.current = null;
      if (w) {
        try {
          w.turnstile.remove(w.id);
        } catch {
          // already gone
        }
      }
    };
  }, [siteKey, ui, attempt]);

  /** Tokens are single-use: after any attempt, ask for a fresh one. */
  const freshToken = useCallback(() => {
    setToken(null);
    const w = api.current;
    if (w) w.turnstile.reset(w.id);
  }, []);

  const send = useCallback(
    async (reason: FeedbackReason, turnstile: string) => {
      setPhase({ kind: "sending", reason });
      const body = buildBody({ target, reason, text, ui, rev, turnstile });
      const outcome = await submitFeedback(body, feedbackConfig().fetch);
      if (!alive.current) return;
      freshToken();
      if (outcome.kind === "sent") setPhase({ kind: "sent" });
      else setPhase({ kind: "error", message: ERROR_MESSAGE[outcome.kind] });
    },
    [target, text, ui, rev, freshToken],
  );

  // A reason chosen before the token arrived goes out as soon as it does.
  useEffect(() => {
    if (phase.kind === "waiting" && token !== null) void send(phase.reason, token);
  }, [phase, token, send]);

  useEffect(() => {
    if (phase.kind === "sent") closeButton.current?.focus();
  }, [phase]);

  const choose = (reason: FeedbackReason) => {
    if (phase.kind === "sending" || phase.kind === "sent") return;
    if (noteLength(text) > MAX_TEXT_LENGTH) {
      setPhase({ kind: "error", message: "error.invalid" });
      return;
    }
    if (token !== null) void send(reason, token);
    else setPhase({ kind: "waiting", reason });
  };

  const retryWidget = () => {
    setPhase({ kind: "idle" });
    setAttempt((n) => n + 1);
  };

  const chosen = phase.kind === "sending" || phase.kind === "waiting" ? phase.reason : null;
  const busy = chosen !== null;
  const length = noteLength(text);
  const status =
    phase.kind === "sending"
      ? ft("report.sending")
      : phase.kind === "waiting"
        ? ft("report.verifying")
        : phase.kind === "sent"
          ? ft("report.sent")
          : "";
  const error = phase.kind === "error" ? ft(phase.message) : widget === "error" ? ft("error.verifyLoad") : "";

  return (
    <div className={s.form} lang={ui} dir={UI_DIR[ui]}>
      <Heading slot="title" className={s.title}>
        {ft("report.title")}
      </Heading>
      {phase.kind !== "sent" ? (
        <>
          <p className={s.lead}>{ft("report.lead")}</p>
          <label className={s.label} htmlFor={`${ids}-note`}>
            {ft("report.note")}
          </label>
          <textarea
            id={`${ids}-note`}
            className={s.note}
            value={text}
            onChange={(e) => setText(e.currentTarget.value)}
            maxLength={MAX_TEXT_LENGTH * 2}
            rows={3}
            dir="auto"
            aria-describedby={`${ids}-count`}
            aria-invalid={length > MAX_TEXT_LENGTH ? "true" : undefined}
            disabled={busy}
          />
          <p id={`${ids}-count`} className={length > MAX_TEXT_LENGTH ? `${s.count} ${s.over}` : s.count}>
            {ft("report.noteCount", { n: length, max: MAX_TEXT_LENGTH })}
          </p>
          <div className={s.reasons} role="group" aria-labelledby={`${ids}-reasons`}>
            <p id={`${ids}-reasons`} className={s.label}>
              {ft("report.reasons")}
            </p>
            {FEEDBACK_REASONS.map((r) => (
              <button
                key={r}
                type="button"
                className={s.reason}
                onClick={() => choose(r)}
                disabled={busy || widget === "error"}
                data-chosen={chosen === r ? "" : undefined}
                data-reason={r}
              >
                {ft(`reason.${r}`)}
              </button>
            ))}
          </div>
        </>
      ) : null}
      <div ref={box} className={s.widget} data-turnstile-box="" hidden={phase.kind === "sent"} />
      <p role="status" className={s.status} data-report-status="">
        {status}
      </p>
      <p role="alert" className={s.error} data-report-error="">
        {error}
      </p>
      <div className={s.actions}>
        {widget === "error" && phase.kind !== "sent" ? (
          <button type="button" className={s.secondary} onClick={retryWidget}>
            {ft("report.retry")}
          </button>
        ) : null}
        <button type="button" ref={closeButton} className={s.secondary} onClick={close}>
          {ft("report.close")}
        </button>
      </div>
    </div>
  );
}
