export function getSupabaseConfig() {
  const url =
    process.env.SUPABASE_URL ||
    process.env.VITE_SUPABASE_URL;

  const key =
    process.env.SUPABASE_ANON_KEY ||
    process.env.SUPABASE_PUBLISHABLE_KEY ||
    process.env.VITE_SUPABASE_PUBLISHABLE_KEY;

  if (!url || !key) {
    throw new Error(
      "Supabase URL or publishable/anon key is missing"
    );
  }

  return {
    url,
    key,
  };
}

export function getAdmin() {
  return {
    username:
      process.env.ADMIN_USERNAME || "admin",

    password:
      process.env.ADMIN_PASSWORD || "change-me",

    name:
      process.env.ADMIN_NAME || "Administrator",

    role:
      process.env.ADMIN_ROLE || "admin",

    email:
      process.env.ADMIN_EMAIL ||
      "admin@hospital.local",
  };
}
