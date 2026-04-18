import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

const SIGN_UP_PATHS = new Set(["/sign-up", "/get-started"]);

function GoogleIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-4 w-4" aria-hidden="true">
      <path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </svg>
  );
}

export function Login() {
  const { signIn, signUp, signInWithGoogle } = useAuth();
  const location = useLocation();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const isSignUp = SIGN_UP_PATHS.has(location.pathname);
  const toggleHref = `${isSignUp ? "/sign-in" : "/sign-up"}${location.search}`;

  useEffect(() => {
    setError("");
  }, [location.pathname, location.search]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      if (isSignUp) {
        await signUp(email, password);
      } else {
        await signIn(email, password);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  const handleGoogle = async () => {
    setError("");
    setGoogleLoading(true);
    try {
      await signInWithGoogle();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed");
      setGoogleLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-screen w-full overflow-hidden bg-black">
      {/* Video background */}
      <video
        src="/ascii-art.mp4"
        autoPlay
        loop
        muted
        playsInline
        className="absolute inset-0 h-full w-full object-cover"
      />

      {/* Top-left wordmark */}
      <a
        href={import.meta.env.PROD ? "https://covable.app" : "/"}
        className="absolute left-8 top-8 z-10 flex items-center gap-2 transition-opacity hover:opacity-70"
      >
        <img src="/logo.svg" alt="" className="h-6 w-6" />
        <span className="text-sm font-semibold tracking-wide text-white/90">
          Covable
        </span>
      </a>

      {/* Auth card — right-side panel */}
      <div className="relative z-10 ml-auto flex h-full min-h-screen w-full max-w-md flex-col justify-center bg-black/50 px-10 py-16 backdrop-blur-xl backdrop-saturate-150 md:border-l md:border-white/10">
        {/* Heading */}
        <div className="mb-8">
          <h1 className="text-2xl font-semibold tracking-tight text-white">
            {isSignUp ? "Create your account" : "Welcome back"}
          </h1>
          <p className="mt-1 text-sm text-white/50">
            {isSignUp
              ? "Create your workspace and start tracking AI citations."
              : "Sign in to your Covable dashboard."}
          </p>
        </div>

        {/* Google OAuth */}
        <button
          onClick={handleGoogle}
          disabled={googleLoading || loading}
          className={cn(
            "flex w-full items-center justify-center gap-3 rounded-lg border border-white/15 bg-white/5 py-2.5 text-sm font-medium text-white/90 transition-all",
            "hover:bg-white/10 hover:border-white/25 active:scale-[0.98]",
            "disabled:cursor-not-allowed disabled:opacity-50"
          )}
        >
          {googleLoading ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
          ) : (
            <GoogleIcon />
          )}
          {googleLoading ? "Redirecting…" : "Continue with Google"}
        </button>

        {/* Divider */}
        <div className="my-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-white/10" />
          <span className="text-xs text-white/30">or</span>
          <div className="h-px flex-1 bg-white/10" />
        </div>

        {/* Email / password form */}
        <form onSubmit={handleSubmit} className="space-y-3">
          <Input
            type="email"
            placeholder="Email address"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            autoComplete="email"
            className="border-white/15 bg-white/5 text-white placeholder:text-white/30 focus-visible:border-white/40 focus-visible:ring-0"
          />
          <Input
            type="password"
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={6}
            autoComplete={isSignUp ? "new-password" : "current-password"}
            className="border-white/15 bg-white/5 text-white placeholder:text-white/30 focus-visible:border-white/40 focus-visible:ring-0"
          />

          {error && (
            <p className="rounded-md bg-red-500/10 px-3 py-2 text-xs text-red-400 border border-red-500/20">
              {error}
            </p>
          )}

          <Button
            type="submit"
            className="w-full bg-white text-black font-medium hover:bg-white/90 active:scale-[0.98] transition-all"
            disabled={loading || googleLoading}
          >
            {loading ? (
              <span className="flex items-center gap-2">
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-black/30 border-t-black" />
                Please wait…
              </span>
            ) : isSignUp ? (
              "Create Account"
            ) : (
              "Sign In"
            )}
          </Button>
        </form>

        {/* Toggle sign-in / sign-up */}
        <p className="mt-6 text-center text-sm text-white/40">
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <Link
            to={toggleHref}
            className="text-white/70 underline underline-offset-2 hover:text-white transition-colors"
          >
            {isSignUp ? "Sign in" : "Sign up"}
          </Link>
        </p>

        {/* Footer */}
        <p className="absolute bottom-6 left-0 right-0 text-center text-xs text-white/20">
          © {new Date().getFullYear()} Covable. All rights reserved.
        </p>
      </div>
    </div>
  );
}
