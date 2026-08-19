import { supabaseAdmin } from "./_supabaseAdmin.js";

function getAccessToken(req) {
  const cookie = req.headers.cookie || "";

  const match = cookie.match(
    /(?:^|;\s*)sb_access_token=([^;]+)/
  );

  return match
    ? decodeURIComponent(match[1])
    : null;
}

async function getCurrentUser(req) {
  const accessToken = getAccessToken(req);

  if (!accessToken) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(
    accessToken
  );

  if (error || !user) {
    return null;
  }

  return user;
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

    const {
      data: profile,
      error: profileError,
    } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

    if (
      profileError ||
      !profile ||
      profile.role !== "admin"
    ) {
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
