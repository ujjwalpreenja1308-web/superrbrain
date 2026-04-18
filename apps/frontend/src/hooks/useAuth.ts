import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const MARKETING_URL =
  import.meta.env.VITE_MARKETING_URL ||
  (import.meta.env.PROD ? "https://covable.app" : "http://localhost:5173");

const HOME_URL =
  import.meta.env.VITE_HOME_URL ||
  (import.meta.env.PROD ? "https://home.covable.app" : "http://localhost:5173");

const SIGN_IN_URL =
  import.meta.env.VITE_SIGN_IN_URL ||
  `${MARKETING_URL}/auth/sign-in`;

const SIGN_UP_URL =
  import.meta.env.VITE_SIGN_UP_URL ||
  `${MARKETING_URL}/auth/sign-up`;

const MARKETING_HOSTNAME = new URL(MARKETING_URL).hostname;
const HOME_HOSTNAME = new URL(HOME_URL).hostname;

interface AuthRedirectPayload {
  accessToken: string | null;
  refreshToken: string | null;
  authCode: string | null;
}

function getAuthRedirectPayload(): AuthRedirectPayload {
  if (typeof window === "undefined") {
    return { accessToken: null, refreshToken: null, authCode: null };
  }

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const searchParams = new URLSearchParams(window.location.search);

  return {
    accessToken: hashParams.get("access_token"),
    refreshToken: hashParams.get("refresh_token"),
    authCode: searchParams.get("code"),
  };
}

function hasPendingAuthRedirect(): boolean {
  const { accessToken, refreshToken, authCode } = getAuthRedirectPayload();
  if (accessToken || refreshToken || authCode) return true;
  if (typeof window === "undefined") return false;

  const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  const searchParams = new URLSearchParams(window.location.search);

  return (
    hashParams.has("error") ||
    searchParams.has("error") ||
    searchParams.has("error_code") ||
    searchParams.has("error_description")
  );
}

function clearAuthRedirectParams() {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  url.hash = "";
  url.searchParams.delete("code");
  url.searchParams.delete("error");
  url.searchParams.delete("error_code");
  url.searchParams.delete("error_description");
  window.history.replaceState({}, "", url.toString());
}

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const pendingAuthRedirect = hasPendingAuthRedirect();
    const { accessToken, refreshToken, authCode } = getAuthRedirectPayload();

    const applySession = (nextUser: User | null) => {
      if (!active) return;
      setUser(nextUser);
      setLoading(false);
    };

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      // During an auth callback, Supabase can briefly emit an empty initial session
      // before it finishes parsing the URL tokens/code. Ignoring that first null
      // prevents a redirect loop back to the sign-in/sign-up page.
      if (pendingAuthRedirect && _event === "INITIAL_SESSION" && !session) {
        return;
      }

      applySession(session?.user ?? null);
    });

    const syncSession = async () => {
      try {
        if (authCode) {
          const { error } = await supabase.auth.exchangeCodeForSession(authCode);
          if (!error) clearAuthRedirectParams();
        } else if (accessToken && refreshToken) {
          const { error } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!error) clearAuthRedirectParams();
        }

        const { data: { session } } = await supabase.auth.getSession();
        applySession(session?.user ?? null);
      } catch {
        applySession(null);
      }
    };

    const timer = window.setTimeout(() => {
      void syncSession();
    }, pendingAuthRedirect ? 150 : 0);

    return () => {
      active = false;
      window.clearTimeout(timer);
      subscription.unsubscribe();
    };
  }, []);

  async function signIn(email: string, password: string) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    if (import.meta.env.PROD) {
      const planParam = new URLSearchParams(window.location.search).get("plan");
      const session = data.session!;
      const hash = `access_token=${session.access_token}&refresh_token=${session.refresh_token}&type=magiclink`;
      const base = planParam ? `${HOME_URL}?plan=${planParam}` : HOME_URL;
      window.location.href = `${base}#${hash}`;
    }
  }

  async function signUp(email: string, password: string) {
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    if (import.meta.env.PROD && data.session) {
      const planParam = new URLSearchParams(window.location.search).get("plan");
      const session = data.session;
      const hash = `access_token=${session.access_token}&refresh_token=${session.refresh_token}&type=magiclink`;
      const base = planParam ? `${HOME_URL}?plan=${planParam}` : HOME_URL;
      window.location.href = `${base}#${hash}`;
    }
  }

  async function signInWithGoogle() {
    // Always redirect back to the current auth route so detectSessionInUrl can
    // pick up the token before forwarding the user to home.covable.app.
    const redirectTo = import.meta.env.PROD
      ? `${MARKETING_URL}/auth${window.location.search}`
      : `${window.location.origin}${window.location.pathname}${window.location.search}`;
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo },
    });
    if (error) throw new Error(error.message);
  }

  async function signOut() {
    await supabase.auth.signOut();
    // Redirect to the public sign-in page after sign out.
    if (import.meta.env.PROD) {
      window.location.href = SIGN_IN_URL;
    }
  }

  return { user, loading, signIn, signUp, signOut, signInWithGoogle };
}

export function isMarketingDomain(): boolean {
  if (!import.meta.env.PROD) return true; // dev: always show auth routes
  return window.location.hostname === MARKETING_HOSTNAME;
}

/** Returns true if running on the home/dashboard subdomain */
export function isHomeDomain(): boolean {
  if (!import.meta.env.PROD) return true; // dev: always show dashboard routes
  return window.location.hostname === HOME_HOSTNAME;
}

export function getSignInUrl(plan?: string | null): string {
  if (!plan) return SIGN_IN_URL;
  const url = new URL(SIGN_IN_URL);
  url.searchParams.set("plan", plan);
  return url.toString();
}

export function getSignUpUrl(plan?: string | null): string {
  if (!plan) return SIGN_UP_URL;
  const url = new URL(SIGN_UP_URL);
  url.searchParams.set("plan", plan);
  return url.toString();
}
