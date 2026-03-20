import { useState, useEffect } from "react";
import type { User } from "@supabase/supabase-js";
import { supabase } from "@/lib/supabase";

const HOME_URL =
  import.meta.env.VITE_HOME_URL ||
  (import.meta.env.PROD ? "https://home.covable.app" : "http://localhost:5173");

const AUTH_URL =
  import.meta.env.VITE_AUTH_URL ||
  (import.meta.env.PROD ? "https://auth.covable.app" : "http://localhost:5173");

export function useAuth() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      setLoading(false);
    });

    // Listen for auth state changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
    });

    return () => subscription.unsubscribe();
  }, []);

  async function signIn(email: string, password: string) {
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(error.message);
    // Redirect to home app after sign in
    if (import.meta.env.PROD) {
      window.location.href = HOME_URL;
    }
  }

  async function signUp(email: string, password: string) {
    const { error } = await supabase.auth.signUp({ email, password });
    if (error) throw new Error(error.message);
    // Redirect to home app after sign up
    if (import.meta.env.PROD) {
      window.location.href = HOME_URL;
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    // Redirect to auth app after sign out
    if (import.meta.env.PROD) {
      window.location.href = AUTH_URL;
    }
  }

  return { user, loading, signIn, signUp, signOut };
}

/** Returns true if running on the auth subdomain (or localhost in dev) */
export function isAuthDomain(): boolean {
  if (!import.meta.env.PROD) return true; // dev: always show auth routes
  return window.location.hostname === "auth.covable.app";
}

/** Returns true if running on the home/dashboard subdomain */
export function isHomeDomain(): boolean {
  if (!import.meta.env.PROD) return true; // dev: always show dashboard routes
  return window.location.hostname === "home.covable.app";
}
