export function isLocalDevBypassEnabled(): boolean {
  if (process.env.NODE_ENV === "production") return false;

  return getFrontendOrigins()
    .some((origin) => origin.includes("localhost") || origin.includes("127.0.0.1"));
}

export function getFrontendOrigins(): string[] {
  return (process.env.FRONTEND_URL ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
}

export function getPrimaryFrontendUrl(): string {
  const origins = getFrontendOrigins();
  const origin =
    origins.find((url) => url.includes("//home.") || url.includes("//app.")) ??
    origins[0];
  if (!origin) {
    throw new Error("FRONTEND_URL environment variable is required");
  }
  return origin;
}

export function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} environment variable is required`);
  }
  return value;
}
