import type { User } from "@supabase/supabase-js";
import { isBuiltInSuperAdminEmail } from "@covable/shared";

function configuredSuperadminEmails(): Set<string> {
  const configured = (process.env.SUPERADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return new Set(configured);
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  if (isBuiltInSuperAdminEmail(email)) return true;
  return configuredSuperadminEmails().has(email.trim().toLowerCase());
}

export function isSuperAdminUser(user: User | null | undefined): boolean {
  return isSuperAdminEmail(user?.email);
}
