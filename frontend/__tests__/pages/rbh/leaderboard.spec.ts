import { describe, it, expect } from "vitest";
import { page } from "../../../src/ts/pages/rbh/leaderboard";

describe("RBH Leaderboard Page", () => {
  it("should have correct id and path", () => {
    expect(page.id).toBe("rbhLeaderboard");
    expect(page.pathname).toBe("/rbh/leaderboard");
  });
});
