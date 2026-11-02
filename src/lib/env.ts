/**
 * Reads an env var, treating blanks and unedited .env.example placeholders as
 * unset. Copying .env.example and filling in only some values is the normal
 * way to start, and a half-filled file must behave like a missing value rather
 * than sending "rzp_test_xxxxxxxx" to a payment provider.
 */
const PLACEHOLDER = /xxxxxxxx|user:password@|@host\/|change-this|your-|<[a-z-]+>/i;

// On/off switches: "true", "TRUE", " true " and a quoted "true" all count, so a stray quote or space can't silently turn checkout off.
export const flag = (name: string) => /^["']?true["']?$/i.test(process.env[name]?.trim() ?? "");

export function env(name: string): string | undefined {
  const v = process.env[name]?.trim();
  if (!v || PLACEHOLDER.test(v)) return undefined;
  return v;
}

export function requireEnv(name: string, hint: string): string {
  const v = env(name);
  if (!v) throw new Error(`${name} is not set. ${hint}`);
  return v;
}
