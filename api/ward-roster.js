import { supabaseAdmin } from "./_supabaseAdmin.js";

function getAccessToken(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)sb_access_token=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function getCurrentUser(req) {
  const accessToken = getAccessToken(req);
  if (!accessToken) return null;

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(accessToken);

  if (error || !user) return null;
  return user;
}

async function getProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("user_id, username, display_name, role")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;
  return data;
}

async function getWardForUser(userId) {
  const { data: membership, error: membershipError } = await supabaseAdmin
    .from("ward_members")
    .select("ward_id")
    .eq("user_id", userId)
    .single();

  if (membershipError || !membership) return null;

  const { data: ward, error: wardError } = await supabaseAdmin
    .from("wards")
    .select("id, ward_name, ward_code, username, active")
    .eq("id", membership.ward_id)
    .single();

  if (wardError || !ward) return null;
  return ward;
}

async function getRoster(wardId) {
  const { data, error } = await supabaseAdmin
    .from("ward_rosters")
    .select("roster, updated_at")
    .eq("ward_id", wardId)
    .maybeSingle();

  if (error) throw new Error(error.message);

  return {
    roster:
      data?.roster && typeof data.roster === "object"
        ? data.roster
        : {},
    updatedAt: data?.updated_at || null,
  };
}

async function saveRoster(wardId, roster, userId) {
  const { data, error } = await supabaseAdmin
    .from("ward_rosters")
    .upsert(
      {
        ward_id: wardId,
        roster,
        updated_by: userId,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "ward_id" }
    )
    .select("roster, updated_at")
    .single();

  if (error) throw new Error(error.message);

  return {
    roster: data?.roster || {},
    updatedAt: data?.updated_at || null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "GET" && req.method !== "PUT") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const user = await getCurrentUser(req);

    if (!user) {
      return res.status(401).json({ error: "Not authenticated" });
    }

    const profile = await getProfile(user.id);

    if (!profile) {
      return res.status(403).json({
        error: "User profile is not configured",
      });
    }

    let ward = null;

    if (profile.role === "admin") {
      const wardId = req.query?.wardId || req.body?.wardId;

      if (!wardId) {
        return res.status(400).json({
          error: "wardId is required for administrator",
        });
      }

      const { data, error } = await supabaseAdmin
        .from("wards")
        .select("id, ward_name, ward_code, username, active")
        .eq("id", wardId)
        .single();

      if (error || !data) {
        return res.status(404).json({ error: "Ward not found" });
      }

      ward = data;
    } else if (profile.role === "ward") {
      ward = await getWardForUser(user.id);

      if (!ward) {
        return res.status(403).json({
          error: "No ward is assigned to this user",
        });
      }

      if (ward.active === false) {
        return res.status(403).json({
          error: "This ward account is inactive",
        });
      }
    } else {
      return res.status(403).json({ error: "Invalid user role" });
    }

    if (req.method === "GET") {
      const result = await getRoster(ward.id);

      return res.status(200).json({
        ok: true,
        ward,
        roster: result.roster,
        updatedAt: result.updatedAt,
      });
    }

    const roster = req.body?.roster;

    if (!roster || typeof roster !== "object" || Array.isArray(roster)) {
      return res.status(400).json({
        error: "Valid roster data is required",
      });
    }

    const result = await saveRoster(ward.id, roster, user.id);

    return res.status(200).json({
      ok: true,
      ward,
      roster: result.roster,
      updatedAt: result.updatedAt,
    });
  } catch (error) {
    console.error("Ward roster API error:", error);

    return res.status(500).json({
      error:
        error.message ||
        "Server error while handling ward roster",
    });
  }
}
