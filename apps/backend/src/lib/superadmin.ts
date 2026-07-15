import type { User } from "@supabase/supabase-js";

const BUILT_IN_SUPERADMIN_EMAILS = ["ujjwal.preenja1308@gmail.com"];

function configuredSuperadminEmails(): Set<string> {
  const configured = (process.env.SUPERADMIN_EMAILS ?? "")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);

  return new Set([...BUILT_IN_SUPERADMIN_EMAILS, ...configured]);
}

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  return configuredSuperadminEmails().has(email.trim().toLowerCase());
}

export function isSuperAdminUser(user: User | null | undefined): boolean {
  return isSuperAdminEmail(user?.email);
}
