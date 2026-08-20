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

async function getProfile(userId) {
  const {
    data: profile,
    error,
  } = await supabaseAdmin
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

async function getWardForUser(userId) {
  const {
    data: membership,
    error: membershipError,
  } = await supabaseAdmin
    .from("ward_members")
    .select("ward_id")
    .eq("user_id", userId)
    .maybeSingle();

  if (
    membershipError ||
    !membership?.ward_id
  ) {
    return null;
  }

  const wardId = membership.ward_id;

  const {
    data: ward,
    error: wardError,
  } = await supabaseAdmin
    .from("wards")
    .select(
      "id, ward_name, ward_code, username, active"
    )
    .eq("id", wardId)
    .single();

  if (wardError || !ward) {
    return null;
  }

  return ward;
}

function getRequestedWardId(req) {
  return (
    req.query?.wardId ||
    req.body?.wardId ||
    null
  );
}

async function isAdmin(userId) {
  const {
    data: profile,
    error,
  } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .single();

  return (
    !error &&
    profile?.role === "admin"
  );
}

async function getRoster(wardId) {
  /*
   * IMPORTANT:
   * Do NOT select "id".
   * Your ward_rosters table does not have an id column.
   */
  const {
    data,
    error,
  } = await supabaseAdmin
    .from("ward_rosters")
    .select(
      "ward_id, roster, updated_by"
    )
    .eq("ward_id", wardId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  return data || null;
}

async function saveRoster(
  wardId,
  roster,
  userId
) {
  /*
   * First check whether the ward already has
   * a roster row.
   */
  const existing =
    await getRoster(wardId);

  if (existing) {
    const {
      data,
      error,
    } = await supabaseAdmin
      .from("ward_rosters")
      .update({
        roster,
        updated_by: userId,
      })
      .eq("ward_id", wardId)
      .select(
        "ward_id, roster, updated_by"
      )
      .single();

    if (error) {
      throw new Error(error.message);
    }

    return data;
  }

  /*
   * No roster exists yet, so create it.
   */
  const {
    data,
    error,
  } = await supabaseAdmin
    .from("ward_rosters")
    .insert({
      ward_id: wardId,
      roster,
      updated_by: userId,
    })
    .select(
      "ward_id, roster, updated_by"
    )
    .single();

  if (error) {
    throw new Error(error.message);
  }

  return data;
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
      await getProfile(user.id);

    if (!profile) {
      return res.status(403).json({
        error:
          "User profile is not configured",
      });
    }

    let wardId = null;
    let ward = null;

    /*
     * ADMINISTRATOR
     *
     * Admin can work with the ward selected
     * from the Ward Manager dashboard.
     */
    if (profile.role === "admin") {
      wardId = getRequestedWardId(req);

      if (!wardId) {
        return res.status(400).json({
          error:
            "Ward ID is required",
        });
      }

      const {
        data: wardData,
        error: wardError,
      } = await supabaseAdmin
        .from("wards")
        .select(
          "id, ward_name, ward_code, username, active"
        )
        .eq("id", wardId)
        .single();

      if (wardError || !wardData) {
        return res.status(404).json({
          error: "Ward not found",
        });
      }

      ward = wardData;
    }

    /*
     * WARD USER
     *
     * Ward users can ONLY access their own ward.
     */
    else if (profile.role === "ward") {
      ward =
        await getWardForUser(user.id);

      if (!ward) {
        return res.status(403).json({
          error:
            "Ward user is not assigned to a ward",
        });
      }

      if (!ward.active) {
        return res.status(403).json({
          error:
            "This ward login is inactive",
        });
      }

      wardId = ward.id;
    }

    else {
      return res.status(403).json({
        error: "Invalid user role",
      });
    }

    /*
     * GET = load roster
     */
    if (req.method === "GET") {
      const data =
        await getRoster(wardId);

      return res.status(200).json({
        ok: true,
        ward: {
          id: ward.id,
          ward_name: ward.ward_name,
          ward_code: ward.ward_code,
          username: ward.username,
          active: ward.active,
        },
        roster:
          data?.roster || {},
        updated_by:
          data?.updated_by || null,
      });
    }

    /*
     * POST / PUT = save roster
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
        typeof roster !== "object" ||
        Array.isArray(roster)
      ) {
        return res.status(400).json({
          error:
            "A valid roster object is required",
        });
      }

      const saved =
        await saveRoster(
          wardId,
          roster,
          user.id
        );

      return res.status(200).json({
        ok: true,
        ward: {
          id: ward.id,
          ward_name: ward.ward_name,
          ward_code: ward.ward_code,
          username: ward.username,
          active: ward.active,
        },
        roster:
          saved.roster || {},
        updated_by:
          saved.updated_by || null,
        message:
          "Roster saved successfully",
      });
    }

    return res.status(405).json({
      error: "Method not allowed",
    });

  } catch (error) {
    console.error(
      "Ward roster error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Server error while loading/saving roster",
    });
  }
}
