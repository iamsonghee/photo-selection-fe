import { createBrowserClient } from "@supabase/ssr";

export function createClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
  return createBrowserClient(url, key, {
    cookies: {
      getAll() {
        if (typeof document === "undefined") return [];
        const raw = document.cookie ?? "";
        if (!raw) return [];
        return raw
          .split(";")
          .map((c) => c.trim())
          .filter(Boolean)
          .map((c) => {
            const idx = c.indexOf("=");
            const name = idx >= 0 ? c.slice(0, idx) : c;
            const value = idx >= 0 ? c.slice(idx + 1) : "";
            return { name, value };
          });
      },
      setAll(cookiesToSet) {
        if (typeof document === "undefined") return;
        cookiesToSet.forEach(({ name, value, options }) => {
          let cookie = `${name}=${value}`;
          const opts = options ?? {};
          // Default Path to root so callback route can read it.
          cookie += `; Path=${opts.path ?? "/"}`;
          if (opts.maxAge != null) cookie += `; Max-Age=${opts.maxAge}`;
          if (opts.expires) cookie += `; Expires=${opts.expires.toUTCString()}`;
          if (opts.domain) cookie += `; Domain=${opts.domain}`;
          if (opts.sameSite) cookie += `; SameSite=${opts.sameSite}`;
          // On http://localhost, "Secure" cookies are ignored by browsers.
          const isHttps =
            typeof window !== "undefined" && window.location?.protocol === "https:";
          if (opts.secure && isHttps) cookie += `; Secure`;
          // HttpOnly cannot be set from browser JS.
          document.cookie = cookie;
        });
      },
    },
  });
}
