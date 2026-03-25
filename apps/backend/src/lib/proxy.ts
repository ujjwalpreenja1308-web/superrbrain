/**
 * Per-region proxy configuration.
 *
 * Env var convention (per country ISO code):
 *   PROXY_<CC>_SERVER    e.g. PROXY_IN_SERVER=socks5://1.2.3.4:1080
 *   PROXY_<CC>_USERNAME  (optional)
 *   PROXY_<CC>_PASSWORD  (optional)
 *
 * Fallback (used when no country-specific proxy is found):
 *   PROXY_SERVER / PROXY_USERNAME / PROXY_PASSWORD
 */

export interface ProxyConfig {
  server: string;
  username?: string;
  password?: string;
}

const SUPPORTED_COUNTRIES = [
  "IN", "US", "GB", "AU", "SG", "AE", "CA", "DE", "FR", "JP",
] as const;

const _countryProxyMap = new Map<string, ProxyConfig>();

for (const cc of SUPPORTED_COUNTRIES) {
  const server = process.env[`PROXY_${cc}_SERVER`];
  if (server) {
    _countryProxyMap.set(cc, {
      server,
      username: process.env[`PROXY_${cc}_USERNAME`],
      password: process.env[`PROXY_${cc}_PASSWORD`],
    });
  }
}

const _defaultProxy: ProxyConfig | undefined = process.env.PROXY_SERVER
  ? {
      server: process.env.PROXY_SERVER,
      username: process.env.PROXY_USERNAME,
      password: process.env.PROXY_PASSWORD,
    }
  : undefined;

/**
 * Returns the proxy config for a given ISO country code.
 * Falls back to the global PROXY_SERVER if no country-specific proxy is set.
 * Returns undefined if no proxy is configured at all.
 */
export function getProxyForCountry(country?: string): ProxyConfig | undefined {
  if (country) {
    const specific = _countryProxyMap.get(country.toUpperCase());
    if (specific) return specific;
  }
  return _defaultProxy;
}

/** List all configured country proxies (for logging/health checks) */
export function getConfiguredProxies(): string[] {
  const countries = [..._countryProxyMap.keys()];
  if (_defaultProxy) countries.push("default");
  return countries;
}
