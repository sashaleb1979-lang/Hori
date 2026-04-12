import { isIP } from "node:net";

function isPrivateIpv4(hostname: string) {
  const parts = hostname.split(".").map((part) => Number(part));

  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
    return false;
  }

  const [a, b] = parts;

  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 100 && b >= 64 && b <= 127)
  );
}

function normalizeHostname(hostname: string) {
  return hostname.trim().toLowerCase().replace(/^\[/, "").replace(/\]$/, "");
}

export function isBlockedHostnameOrIp(hostname: string) {
  const normalized = normalizeHostname(hostname);

  if (!normalized) {
    return true;
  }

  if (normalized === "localhost" || normalized.endsWith(".localhost")) {
    return true;
  }

  if (normalized === "metadata.google.internal") {
    return true;
  }

  const ipVersion = isIP(normalized);

  if (ipVersion === 4) {
    return isPrivateIpv4(normalized);
  }

  if (ipVersion === 6) {
    return (
      normalized === "::1" ||
      normalized === "0:0:0:0:0:0:0:1" ||
      normalized.startsWith("fc") ||
      normalized.startsWith("fd") ||
      normalized.startsWith("fe80:")
    );
  }

  return false;
}
