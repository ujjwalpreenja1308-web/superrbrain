import { lookup } from "node:dns/promises";
import { BlockList, isIP } from "node:net";

const blockedAddresses = new BlockList();

for (const [network, prefix] of [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv4");
}

for (const [network, prefix] of [
  ["::", 128],
  ["::1", 128],
  ["fc00::", 7],
  ["fe80::", 10],
  ["ff00::", 8],
  ["2001:db8::", 32],
] as const) {
  blockedAddresses.addSubnet(network, prefix, "ipv6");
}

export function isPrivateOrReservedAddress(address: string): boolean {
  const normalized = address.replace(/^\[|\]$/g, "").toLowerCase();
  const mappedIpv4 = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/)?.[1];
  if (mappedIpv4) return blockedAddresses.check(mappedIpv4, "ipv4");

  const family = isIP(normalized);
  if (family === 4) return blockedAddresses.check(normalized, "ipv4");
  if (family === 6) return blockedAddresses.check(normalized, "ipv6");
  return true;
}

export async function assertSafePublicUrl(input: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error("URL is invalid");
  }

  if (!(["http:", "https:"] as string[]).includes(url.protocol)) {
    throw new Error("URL must use HTTP or HTTPS");
  }
  if (url.username || url.password)
    throw new Error("URL credentials are not allowed");

  const hostname = url.hostname.replace(/^\[|\]$/g, "").toLowerCase();
  if (
    !hostname ||
    hostname === "localhost" ||
    hostname.endsWith(".localhost") ||
    hostname.endsWith(".local") ||
    hostname.endsWith(".internal")
  ) {
    throw new Error("URL must use a public host");
  }

  if (isIP(hostname)) {
    if (isPrivateOrReservedAddress(hostname))
      throw new Error("URL must use a public host");
    return url;
  }

  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (
    !addresses.length ||
    addresses.some(({ address }) => isPrivateOrReservedAddress(address))
  ) {
    throw new Error("URL must resolve only to public addresses");
  }

  return url;
}
