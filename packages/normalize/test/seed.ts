import concepts from "../seed/concepts.json" with { type: "json" };
import parsha from "../seed/parsha.json" with { type: "json" };
import people from "../seed/people.json" with { type: "json" };
import refs from "../seed/sefaria-refs.json" with { type: "json" };
import works from "../seed/works.json" with { type: "json" };
import zman from "../seed/zman.json" with { type: "json" };

export interface SeedValue {
  value: string;
  shiurim: number;
  count: number;
}

export const seed: Record<"parsha" | "zman" | "works" | "refs" | "people" | "concepts", readonly SeedValue[]> = {
  parsha: parsha.values,
  zman: zman.values,
  works: works.values,
  refs: refs.values,
  people: people.values,
  concepts: concepts.values,
};
