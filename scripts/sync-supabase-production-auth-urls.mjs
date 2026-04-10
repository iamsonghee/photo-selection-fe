#!/usr/bin/env node
/**
 * Sets hosted Supabase Auth Site URL and merges production redirect URLs for acut.vercel.app.
 *
 * Requires a Supabase personal access token with auth_config_read + auth_config_write
 * (Dashboard → Account → Access Tokens).
 *
 * Usage:
 *   SUPABASE_ACCESS_TOKEN=... node scripts/sync-supabase-production-auth-urls.mjs
 *
 * Optional:
 *   SUPABASE_PROJECT_REF=anmdcvqrmuomzaswdwmg
 */

const API = "https://api.supabase.com";
const SITE_URL = "https://acut.vercel.app";
const EXTRA_ALLOW = [
  "https://acut.vercel.app",
  "https://acut.vercel.app/",
  "https://acut.vercel.app/auth/callback",
];

const token = process.env.SUPABASE_ACCESS_TOKEN;
const ref =
  process.env.SUPABASE_PROJECT_REF || "anmdcvqrmuomzaswdwmg";

function splitAllowList(raw) {
  if (!raw || typeof raw !== "string") return [];
  const lines = raw.split(/\r?\n/).flatMap((line) =>
    line.includes(",") ? line.split(",") : [line]
  );
  return lines.map((s) => s.trim()).filter(Boolean);
}

function mergeAllowList(existing, additions) {
  const seen = new Set();
  const out = [];
  for (const u of [...existing, ...additions]) {
    const key = u.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    out.push(key);
  }
  return out;
}

async function main() {
  if (!token) {
    console.error(
      "Missing SUPABASE_ACCESS_TOKEN. Create a PAT in Supabase Dashboard → Account → Access Tokens."
    );
    process.exit(1);
  }

  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };

  const getRes = await fetch(`${API}/v1/projects/${ref}/config/auth`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!getRes.ok) {
    const text = await getRes.text();
    console.error(`GET config/auth failed: ${getRes.status}`, text.slice(0, 500));
    process.exit(1);
  }

  const current = await getRes.json();
  const prevList = splitAllowList(current.uri_allow_list);
  const merged = mergeAllowList(prevList, EXTRA_ALLOW);
  const uri_allow_list = merged.join("\n");

  const body = {
    site_url: SITE_URL,
    uri_allow_list,
  };

  const patchRes = await fetch(`${API}/v1/projects/${ref}/config/auth`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(body),
  });

  if (!patchRes.ok) {
    const text = await patchRes.text();
    console.error(`PATCH config/auth failed: ${patchRes.status}`, text.slice(0, 500));
    process.exit(1);
  }

  console.log(
    `Updated Supabase project ${ref}: site_url=${SITE_URL}, redirect URL entries=${merged.length}.`
  );
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
