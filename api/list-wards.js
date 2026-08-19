import { supabaseAdmin } from "./_supabaseAdmin.js";

function getToken(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)duty_auth=([^;]+)/);

  return match ? decodeURIComponent(match[1]) : null;
}

async function getCurrentUser(req) {
  const token = getToken(req);

  if (!token) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

async function isAdmin(userId) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .single();

  return !error && data?.role === "admin";
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const user = await getCurrentUser(req);

    if (!user) {
      return res.status(401).json({
        error: "Not authenticated",
      });
    }

    const admin = await isAdmin(user.id);

    if (!admin) {
      return res.status(403).json({
        error: "Administrator access required",
      });
    }

    const {
      data: wards,
      error,
    } = await supabaseAdmin
      .from("wards")
      .select(
        "id, ward_name, ward_code, username, active, created_at, updated_at"
      )
      .order("ward_name", {
        ascending: true,
      });

    if (error) {
      console.error(error);

      return res.status(500).json({
        error: error.message,
      });
    }

    return res.status(200).json({
      ok: true,
      wards: wards || [],
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Server error while loading wards",
    });
  }
}
