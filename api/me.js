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

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const user =
      await getCurrentUser(req);

    if (!user) {
      return res.status(401).json({
        error: "Not authenticated",
      });
    }

    const {
      data: profile,
      error: profileError,
    } =
      await supabaseAdmin
        .from("profiles")
        .select(
          "user_id, username, display_name, role"
        )
        .eq("user_id", user.id)
        .single();

    if (profileError || !profile) {
      return res.status(403).json({
        error: "User profile is not configured",
      });
    }

    let ward = null;
    let wardId = null;

    if (profile.role === "ward") {
      const {
        data: membership,
        error: membershipError,
      } =
        await supabaseAdmin
          .from("ward_members")
          .select("ward_id")
          .eq("user_id", user.id)
          .maybeSingle();

      if (
        membershipError ||
        !membership?.ward_id
      ) {
        return res.status(403).json({
          error:
            "Ward user is not assigned to a ward",
        });
      }

      wardId = membership.ward_id;

      const {
        data: wardData,
        error: wardError,
      } =
        await supabaseAdmin
          .from("wards")
          .select(
            "id, ward_name, ward_code, username, active"
          )
          .eq("id", wardId)
          .single();

      if (wardError || !wardData) {
        return res.status(403).json({
          error: "Ward not found",
        });
      }

      if (!wardData.active) {
        return res.status(403).json({
          error: "This ward login is inactive",
        });
      }

      ward = wardData;
    }

    return res.status(200).json({
      ok: true,

      user: {
        id: user.id,

        username:
          profile.username,

        name:
          profile.display_name ||
          profile.username,

        role:
          profile.role,

        ward,

        ward_id: wardId,
      },
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error:
        "Server error while checking authentication",
    });
  }
}
