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
  const accessToken =
    getAccessToken(req);

  if (!accessToken) {
    return null;
  }

  const {
    data: { user },
    error,
  } =
    await supabaseAdmin.auth.getUser(
      accessToken
    );

  if (error || !user) {
    return null;
  }

  return user;
}

async function getUserProfile(userId) {
  const {
    data: profile,
    error,
  } =
    await supabaseAdmin
      .from("profiles")
      .select(
        "user_id, username, display_name, role"
      )
      .eq("user_id", userId)
      .single();

  if (error || !profile) {
    return null;
  }

  return profile;
}

async function getWardIdForUser(userId) {
  const {
    data: membership,
    error,
  } =
    await supabaseAdmin
      .from("ward_members")
      .select("ward_id")
      .eq("user_id", userId)
      .single();

  if (error || !membership) {
    return null;
  }

  return membership.ward_id;
}

export default async function handler(req, res) {
  try {
    const user =
      await getCurrentUser(req);

    if (!user) {
      return res.status(401).json({
        error: "Not authenticated",
      });
    }

    const profile =
      await getUserProfile(user.id);

    if (!profile) {
      return res.status(403).json({
        error:
          "User profile is not configured",
      });
    }

    /*
     * ADMIN
     *
     * Admin can load/save a specific ward roster
     * by sending ?wardId=...
     */
    if (profile.role === "admin") {
      const wardId =
        req.query?.wardId ||
        req.body?.wardId;

      if (!wardId) {
        return res.status(400).json({
          error:
            "Ward ID is required for administrator",
        });
      }

      return await handleRoster(
        req,
        res,
        wardId,
        user.id
      );
    }

    /*
     * WARD USER
     *
     * Ward user can only access the ward assigned
     * to their own account.
     */
    if (profile.role === "ward") {
      const wardId =
        await getWardIdForUser(user.id);

      if (!wardId) {
        return res.status(403).json({
          error:
            "Ward user is not assigned to a ward",
        });
      }

      const {
        data: ward,
        error: wardError,
      } =
        await supabaseAdmin
          .from("wards")
          .select(
            "id, ward_name, ward_code, username, active"
          )
          .eq("id", wardId)
          .single();

      if (wardError || !ward) {
        return res.status(404).json({
          error: "Ward not found",
        });
      }

      if (!ward.active) {
        return res.status(403).json({
          error:
            "This ward login is inactive",
        });
      }

      return await handleRoster(
        req,
        res,
        wardId,
        user.id
      );
    }

    return res.status(403).json({
      error: "Invalid user role",
    });

  } catch (error) {
    console.error(
      "Ward roster API error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Server error while handling ward roster",
    });
  }
}

async function handleRoster(
  req,
  res,
  wardId,
  userId
) {
  /*
   * GET
   * Load the roster for this ward.
   */
  if (req.method === "GET") {
    const {
      data,
      error,
    } =
      await supabaseAdmin
        .from("ward_rosters")
        .select(
          "ward_id, roster, updated_by, updated_at"
        )
        .eq("ward_id", wardId)
        .maybeSingle();

    if (error) {
      return res.status(400).json({
        error: error.message,
      });
    }

    /*
     * If the ward doesn't have a roster yet,
     * return an empty object.
     */
    return res.status(200).json({
      ok: true,
      wardId,
      roster: data?.roster || {},
      updated_at:
        data?.updated_at || null,
    });
  }

  /*
   * POST
   * Save/update the roster for this ward.
   */
  if (
    req.method === "POST" ||
    req.method === "PUT"
  ) {
    const body = req.body || {};

    const roster =
      body.roster !== undefined
        ? body.roster
        : body;

    if (
      roster === null ||
      typeof roster !== "object"
    ) {
      return res.status(400).json({
        error:
          "A valid roster object is required",
      });
    }

    /*
     * Check whether a roster already exists.
     */
    const {
      data: existing,
      error: existingError,
    } =
      await supabaseAdmin
        .from("ward_rosters")
        .select("id")
        .eq("ward_id", wardId)
        .maybeSingle();

    if (existingError) {
      return res.status(400).json({
        error:
          existingError.message,
      });
    }

    let result;

    if (existing) {
      /*
       * Update existing roster.
       */
      result =
        await supabaseAdmin
          .from("ward_rosters")
          .update({
            roster,
            updated_by: userId,
            updated_at:
              new Date().toISOString(),
          })
          .eq("ward_id", wardId)
          .select(
            "ward_id, roster, updated_by, updated_at"
          )
          .single();
    } else {
      /*
       * Create the first roster.
       */
      result =
        await supabaseAdmin
          .from("ward_rosters")
          .insert({
            ward_id: wardId,
            roster,
            updated_by: userId,
          })
          .select(
            "ward_id, roster, updated_by, updated_at"
          )
          .single();
    }

    if (result.error) {
      return res.status(400).json({
        error:
          result.error.message,
      });
    }

    return res.status(200).json({
      ok: true,
      message:
        "Roster saved successfully",
      wardId,
      roster:
        result.data.roster,
      updated_at:
        result.data.updated_at,
    });
  }

  /*
   * DELETE
   * Optional: clear the roster while keeping
   * the ward itself.
   */
  if (req.method === "DELETE") {
    const {
      error,
    } =
      await supabaseAdmin
        .from("ward_rosters")
        .update({
          roster: {},
          updated_by: userId,
          updated_at:
            new Date().toISOString(),
        })
        .eq("ward_id", wardId);

    if (error) {
      return res.status(400).json({
        error: error.message,
      });
    }

    return res.status(200).json({
      ok: true,
      message:
        "Roster cleared successfully",
    });
  }

  return res.status(405).json({
    error: "Method not allowed",
  });
}
