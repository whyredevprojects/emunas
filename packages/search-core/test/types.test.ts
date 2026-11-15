/**
 * Type-level checks (run by `tsc` over the tests and by vitest's expectTypeOf at runtime as no-ops):
 * no transcript-derived field can be referenced from the search types or the builder input.
 */
import { describe, expectTypeOf, it } from "vitest";
import type { DeepKeys, EntityDoc, ForbiddenSearchKey, MomentRow, SearchDoc, SearchInput } from "../src/index.ts";
import { _fieldChecks } from "../src/index.ts";

describe("types", () => {
  it("DeepKeys finds nested forbidden keys (the check can fail)", () => {
    type Leaky = { a: { b: { heardAs: string[] }[] } };
    expectTypeOf<Extract<DeepKeys<Leaky>, ForbiddenSearchKey>>().toEqualTypeOf<"heardAs">();
  });

  it("SearchDoc, MomentRow and the builder input carry no transcript-derived key", () => {
    expectTypeOf<Extract<DeepKeys<SearchDoc>, ForbiddenSearchKey>>().toBeNever();
    expectTypeOf<Extract<DeepKeys<MomentRow>, ForbiddenSearchKey>>().toBeNever();
    expectTypeOf<Extract<DeepKeys<EntityDoc>, ForbiddenSearchKey>>().toBeNever();
    expectTypeOf<Extract<DeepKeys<SearchInput>, "candidateTopics" | "asrVariants">>().toBeNever();
    // PublicRecording.transcript is the literal { eligible: false } descriptor, not text.
    expectTypeOf<Extract<DeepKeys<SearchInput["shiur"]>, Exclude<ForbiddenSearchKey, "transcript">>>().toBeNever();
  });

  it("referencing a forbidden field does not compile", () => {
    const fn = (d: SearchDoc, r: MomentRow, i: SearchInput, e: EntityDoc) => {
      // @ts-expect-error retired (C9): SearchInput has no extraction topic list
      void i.candidateTopics;
      // @ts-expect-error ASR variants are never an EntityDoc field
      void e.asrVariants;
      // @ts-expect-error not a SearchDoc field
      void d.heardAs;
      // @ts-expect-error not a SearchDoc field (retired; keywords hold topic labels)
      void d.candidateTopics;
      // @ts-expect-error not a MomentRow field
      void r.segs;
      // @ts-expect-error PublicShiur has no transcript text
      void i.shiur.notes?.asrNotes;
    };
    expectTypeOf(fn).toBeFunction();
    expectTypeOf(_fieldChecks.doc).toEqualTypeOf<true>();
    expectTypeOf(_fieldChecks.entity).toEqualTypeOf<true>();
  });
});
