export async function resolve(specifier, context, next) {
  if (specifier === "@supabase/ssr") {
    const code = `export function createServerClient(url, key, options) {
      return { auth: { async getUser() {
        options.cookies.setAll([{ name: "migration_refresh", value: "ok", options: { path: "/" } }]);
        return { data: { user: globalThis.__migrationUser ?? null } };
      } } };
    }`;
    return { url: `data:text/javascript,${encodeURIComponent(code)}`, shortCircuit: true };
  }
  return next(specifier, context);
}
