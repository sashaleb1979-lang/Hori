import { describe, expect, it } from "vitest";

import { isUnsafeLoopbackUrl } from "@hori/shared";

describe("isUnsafeLoopbackUrl", () => {
  it("rejects loopback infrastructure URLs in production", () => {
    expect(isUnsafeLoopbackUrl("postgresql://postgres:postgres@localhost:5432/hori", "production")).toBe(true);
    expect(isUnsafeLoopbackUrl("redis://127.0.0.1:6379", "production")).toBe(true);
  });

  it("allows local infrastructure URLs outside production", () => {
    expect(isUnsafeLoopbackUrl("postgresql://postgres:postgres@localhost:5432/hori", "development")).toBe(false);
  });

  it("allows non-loopback URLs in production", () => {
    expect(isUnsafeLoopbackUrl("postgresql://postgres:postgres@hori-postgres.railway.internal:5432/hori", "production")).toBe(false);
    expect(isUnsafeLoopbackUrl("rediss://default:secret@redis.railway.internal:6379", "production")).toBe(false);
  });
});
