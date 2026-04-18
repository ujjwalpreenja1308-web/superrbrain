import { createClient } from "@supabase/supabase-js";

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL?.trim();
const supabaseAnonKey =
  (
    import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ??
    import.meta.env.VITE_SUPABASE_ANON_KEY
  )?.trim();

function requireEnv(name: string, value: string | undefined) {
  if (value) return value;
  throw new Error(
    `[Covable auth] Missing ${name}. Set ${name} in the frontend environment before loading auth routes.`
  );
}

// Cookie domain: in prod use .covable.app so all subdomains share it
const COOKIE_DOMAIN = import.meta.env.PROD ? ".covable.app" : "localhost";
const COOKIE_NAME = "covable-auth";
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365; // 1 year

function setCookie(value: string) {
  document.cookie = [
    `${COOKIE_NAME}=${encodeURIComponent(value)}`,
    `domain=${COOKIE_DOMAIN}`,
    `path=/`,
    `max-age=${COOKIE_MAX_AGE}`,
    `SameSite=Lax`,
    import.meta.env.PROD ? "Secure" : "",
  ]
    .filter(Boolean)
    .join("; ");
}

function getCookie(): string | null {
  const match = document.cookie.match(
    new RegExp("(?:^|; )" + COOKIE_NAME + "=([^;]*)")
  );
  return match ? decodeURIComponent(match[1]) : null;
}

function removeCookie() {
  document.cookie = `${COOKIE_NAME}=; domain=${COOKIE_DOMAIN}; path=/; max-age=0`;
}

// Custom storage adapter that writes to a parent-domain cookie
const cookieStorage = {
  getItem(key: string): string | null {
    if (key !== COOKIE_NAME) return localStorage.getItem(key);
    return getCookie();
  },
  setItem(key: string, value: string): void {
    if (key !== COOKIE_NAME) { localStorage.setItem(key, value); return; }
    setCookie(value);
  },
  removeItem(key: string): void {
    if (key !== COOKIE_NAME) { localStorage.removeItem(key); return; }
    removeCookie();
  },
};

export const supabase = createClient(
  requireEnv("VITE_SUPABASE_URL", supabaseUrl),
  requireEnv(
    "VITE_SUPABASE_PUBLISHABLE_KEY or VITE_SUPABASE_ANON_KEY",
    supabaseAnonKey
  ),
  {
  auth: {
    persistSession: true,
    storageKey: COOKIE_NAME,
    storage: cookieStorage,
    detectSessionInUrl: true,
  },
  }
);
