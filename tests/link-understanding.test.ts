import { describe, expect, it } from "vitest";

import { extractLinksFromMessage } from "../packages/search/src/link-understanding/detect";
import { isBlockedHostnameOrIp } from "../packages/search/src/link-understanding/ssrf";

describe("link understanding detection", () => {
  it("extracts only bare safe links", () => {
    const links = extractLinksFromMessage("Вот [док](https://example.com/md) и https://example.com/page.", { maxLinks: 2 });

    expect(links).toEqual(["https://example.com/page"]);
  });

  it("blocks localhost and private IPs", () => {
    expect(extractLinksFromMessage("http://localhost:3000 http://192.168.1.1")).toEqual([]);
    expect(isBlockedHostnameOrIp("127.0.0.1")).toBe(true);
    expect(isBlockedHostnameOrIp("example.com")).toBe(false);
  });
});
