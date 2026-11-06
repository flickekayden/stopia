import { describe, expect, test } from "bun:test";

import { ROOM_IDLE_MS, abandonedRoomIds } from "../src/lib/room-cleanup";

describe("abandoned room cleanup", () => {
  test("rooms count as idle after 6 hours", () => {
    expect(ROOM_IDLE_MS).toBe(6 * 60 * 60_000);
  });
  test("an idle room with a recently seen player is kept", () => {
    expect(abandonedRoomIds(["a", "b", "c"], ["b"])).toEqual(["a", "c"]);
  });
  test("nothing is deleted when every idle room still has someone", () => {
    expect(abandonedRoomIds(["a"], ["a", "a"])).toEqual([]);
  });
});
