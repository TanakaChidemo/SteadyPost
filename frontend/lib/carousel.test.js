import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { wrapIndex, stepIndex } from "./carousel.js";

describe("wrapIndex", () => {
  it("keeps an index that's already in range", () => {
    assert.equal(wrapIndex(0, 5), 0);
    assert.equal(wrapIndex(4, 5), 4);
  });

  it("wraps past the last slide back to the first", () => {
    assert.equal(wrapIndex(5, 5), 0);
    assert.equal(wrapIndex(12, 5), 2);
  });

  it("wraps before the first slide round to the last", () => {
    assert.equal(wrapIndex(-1, 5), 4);
    assert.equal(wrapIndex(-6, 5), 4);
  });

  it("is 0 when there are no slides or the input isn't a number", () => {
    assert.equal(wrapIndex(3, 0), 0);
    assert.equal(wrapIndex(NaN, 5), 0);
    assert.equal(wrapIndex(1, undefined), 0);
  });
});

describe("stepIndex", () => {
  it("goes forward and back, wrapping at both ends", () => {
    assert.equal(stepIndex(0, 1, 3), 1);
    assert.equal(stepIndex(2, 1, 3), 0);
    assert.equal(stepIndex(0, -1, 3), 2);
  });
});
