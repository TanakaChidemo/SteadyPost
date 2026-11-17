import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { safeReturnPath } from "./signInReturn.js";

describe("safeReturnPath", () => {
  it("keeps a page in the app, with its query", () => {
    assert.equal(safeReturnPath("/invitations/accept?token=abc"), "/invitations/accept?token=abc");
  });

  it("never goes to another site", () => {
    for (const path of ["https://evil.example", "//evil.example/x", "/\\evil.example", "javascript:alert(1)"]) {
      assert.equal(safeReturnPath(path), null, path);
    }
  });

  it("ignores the landing page, the callback and missing values", () => {
    for (const path of ["/", "/auth/callback?accessToken=x", "", null, undefined]) {
      assert.equal(safeReturnPath(path), null, String(path));
    }
  });
});
