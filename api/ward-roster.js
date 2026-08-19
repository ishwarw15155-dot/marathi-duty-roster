import { supabaseAdmin } from "./_supabaseAdmin.js";

function getToken(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)duty_auth=([^;]+)/);

  return match ? decodeURIComponent(match[1]) : null;
}

async function getCurrentUser(req) {
  const token = getToken(req);

  if (!token) return null;

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) return null;

  return user;
}

async function getProfile(userId) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role, username, display_name")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;

  return data;
}

async function getWardForUser(userId) {
  const { data, error } = await supabaseAdmin
    .from("ward_members")
    .select("ward_id")
    .eq("user_id", userId)
    .single();

  if (error || !data) return null;

  return data.ward_id;
}

async function canAccessWard(userId, role, wardId) {
  if (role === "admin") {
    return true;
  }

  const ownWardId = await getWardForUser(userId);

  return ownWardId === wardId;
}

export default async function handler(req, res) {
  try {
    const user = await getCurrentUser(req);

    if (!user) {
      return res.status(401).json({
        error: "Not authenticated",
      });
    }

    const profile = await getProfile(user.id);

    if (!profile) {
      return res.status(403).json({
        error: "User profile not found",
      });
    }

    /*
     * ADMIN:
     * wardId can be supplied in the request.
     *
     * WARD USER:
     * wardId is automatically restricted to
     * the ward assigned to that user.
     */
    let wardId =
      req.query?.wardId ||
      req.body?.wardId ||
      null;

    if (profile.role !== "admin") {
      wardId = await getWardForUser(user.id);

      if (!wardId) {
        return res.status(403).json({
          error: "No ward is assigned to this user",
        });
      }
    }

    if (!wardId) {
      return res.status(400).json({
        error: "Ward ID is required",
      });
    }

    const allowed = await canAccessWard(
      user.id,
      profile.role,
      wardId
    );

    if (!allowed) {
      return res.status(403).json({
        error: "You do not have access to this ward",
      });
    }

    // ========================================================
    // GET CURRENT WARD ROSTER
    // ========================================================

    if (req.method === "GET") {
      const {
        data,
        error,
      } = await supabaseAdmin
        .from("ward_rosters")
        .select(
          "ward_id, roster, updated_by, updated_at"
        )
        .eq("ward_id", wardId)
        .maybeSingle();

      if (error) {
        console.error(error);

        return res.status(500).json({
          error: error.message,
        });
      }

      return res.status(200).json({
        ok: true,
        wardId,
        roster: data?.roster || {},
        updatedAt: data?.updated_at || null,
      });
    }

    // ========================================================
    // SAVE CURRENT WARD ROSTER
    // ========================================================

    if (req.method === "PUT") {
      const body = req.body || {};

      const roster =
        body.roster !== undefined
          ? body.roster
          : body;

      if (
        roster === null ||
        typeof roster !== "object" ||
        Array.isArray(roster)
      ) {
        return res.status(400).json({
          error: "Invalid roster data",
        });
      }

      const {
        data,
        error,
      } = await supabaseAdmin
        .from("ward_rosters")
        .upsert(
          {
            ward_id: wardId,
            roster,
            updated_by: user.id,
            updated_at: new Date().toISOString(),
          },
          {
            onConflict: "ward_id",
          }
        )
        .select()
        .single();

      if (error) {
        console.error(error);

        return res.status(500).json({
          error: error.message,
        });
      }

      return res.status(200).json({
        ok: true,
        wardId,
        roster: data.roster,
        updatedAt: data.updated_at,
      });
    }

    return res.status(405).json({
      error: "Method not allowed",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Server error while accessing ward roster",
    });
  }
}
