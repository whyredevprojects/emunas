/**
 * @emunas/calendar runtime entry (browser-safe, no @hebcal code).
 *
 *   import { thisWeek, nearestOccasion } from "@emunas/calendar";
 *   thisWeek("2027-06-12", { israel: true })?.parshaKey; // "nasso"
 *
 * The data comes from `table/5787-5800.json`, generated at build time by `scripts/generate.ts`.
 * To ship the table separately (e.g. fetched and cached by a service worker), import
 * `createCalendar` + `asCalendarTable` and pass your own copy.
 */
import rawTable from "../table/5787-5800.json" with { type: "json" };
import { createCalendar, type Calendar, type NearestOccasionOptions, type ThisWeekOptions } from "./calendar.ts";
import { asCalendarTable } from "./table.ts";

export { createCalendar, toIsoDay } from "./calendar.ts";
export type { Calendar, HebrewDate, NearestOccasionOptions, OccasionHit, ThisWeek, ThisWeekOptions } from "./calendar.ts";
export { asCalendarTable } from "./table.ts";
export type { CalendarTable, MonthRow, OccasionRow, ShabbosRow } from "./table.ts";

export const calendar: Calendar = createCalendar(asCalendarTable(rawTable));

export const thisWeek = (date: Date | string, options?: ThisWeekOptions) => calendar.thisWeek(date, options);
export const nearestOccasion = (date: Date | string, options?: NearestOccasionOptions) => calendar.nearestOccasion(date, options);
export const hebrewDate = (date: Date | string) => calendar.hebrewDate(date);
export const occasionWindows = (key: string, options?: { israel?: boolean }) => calendar.occasionWindows(key, options);
