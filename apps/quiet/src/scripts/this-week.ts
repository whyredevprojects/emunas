/**
 * "This week" on the title page (components/catalog/ThisWeek.astro): the page is built for the
 * build day and carries the days around it as inert templates. On load this shows the visitor's own
 * civil day (local midnight, as in Live) when it is one of those days; otherwise the built block
 * stays, and its lead still names the day it is for.
 */

export interface WeekDay {
  /** The rendered "as of {date}" lead, or "" past the calendar table. */
  readonly lead: string;
  readonly blocks: readonly string[];
}

/** The local civil day of `now` as `YYYY-MM-DD`. */
export function localIsoDay(now: Date): string {
  const pad = (n: number, width = 2) => String(n).padStart(width, "0");
  return `${pad(now.getFullYear(), 4)}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

/** The `data-blocks` list: block keys separated by spaces. */
export function parseBlocks(attr: string | undefined): string[] {
  return (attr ?? "").split(" ").filter((k) => k !== "");
}

/**
 * The day to swap in, or null to leave the page as built: the visitor's day is the shown day, is
 * outside the window, has nothing to show, or names a block the page does not carry.
 */
export function dayToShow(
  days: ReadonlyMap<string, WeekDay>,
  shown: string | undefined,
  today: string,
  carried: ReadonlySet<string>,
): WeekDay | null {
  if (today === shown) return null;
  const day = days.get(today);
  if (day === undefined || day.blocks.length === 0) return null;
  return day.blocks.every((k) => carried.has(k)) ? day : null;
}

export function showVisitorDay(doc: Document, now: Date): void {
  const root = doc.querySelector<HTMLElement>("[data-this-week]");
  const grid = root?.querySelector<HTMLElement>("[data-week-grid]");
  const lead = root?.querySelector<HTMLElement>("[data-week-lead]");
  const daysTemplate = root?.querySelector<HTMLTemplateElement>("template[data-week-days]");
  if (!root || !grid || !lead || !daysTemplate) return;

  const days = new Map<string, WeekDay>();
  for (const el of daysTemplate.content.querySelectorAll<HTMLElement>("[data-day]")) {
    const date = el.dataset["day"];
    if (date !== undefined) days.set(date, { lead: el.textContent ?? "", blocks: parseBlocks(el.dataset["blocks"]) });
  }
  const templates = new Map<string, HTMLTemplateElement>();
  for (const t of root.querySelectorAll<HTMLTemplateElement>("template[data-week-block]")) {
    const key = t.dataset["weekBlock"];
    if (key !== undefined) templates.set(key, t);
  }

  const today = localIsoDay(now);
  const day = dayToShow(days, root.dataset["weekDate"], today, new Set(templates.keys()));
  if (day === null) return;
  grid.replaceChildren(...day.blocks.flatMap((k) => templates.get(k)?.content.cloneNode(true) ?? []));
  lead.textContent = day.lead;
  lead.hidden = day.lead === "";
  root.dataset["weekDate"] = today;
}
