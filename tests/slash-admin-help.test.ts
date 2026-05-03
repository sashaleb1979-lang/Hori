import { describe, expect, it } from "vitest";

import { SlashAdminService } from "../packages/core/src/services/slash-admin-service";

describe("SlashAdminService.handleHelp", () => {
  it("lists chat codewords, slash tools, context actions, and owner surfaces", async () => {
    const service = new SlashAdminService({} as never, {} as never, {} as never, {} as never, {} as never);

    const help = await service.handleHelp();

    expect(help).toContain("запомни");
    expect(help).toContain("перескажи за день");
    expect(help).toContain("/hori slot");
    expect(help).toContain("/hori knowledge");
    expect(help).toContain("Хори: кратко");
    expect(help).toContain("/hori panel");
    expect(help).toContain("/hori import");
  });
});