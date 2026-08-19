import { supabaseAdmin } from "./_supabaseAdmin.js";

function getCookie(req, name) {
  const cookie = req.headers.cookie || "";

  const match = cookie.match(
    new RegExp(
      "(?:^|;\\s*)" +
        name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&") +
        "=([^;]*)"
    )
  );

  return match
    ? decodeURIComponent(match[1])
    : null;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const accessToken = getCookie(
      req,
      "sb_access_token"
    );

    if (!accessToken) {
      return res.status(401).json({
        error: "Not authenticated",
      });
    }

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(
      accessToken
    );

    if (userError || !user) {
      return res.status(401).json({
        error: "Not authenticated",
      });
    }

    const {
      data: profile,
      error: profileError,
    } = await supabaseAdmin
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

    if (profile.role === "ward") {
      const {
        data: membership,
        error: membershipError,
      } = await supabaseAdmin
        .from("ward_members")
        .select("ward_id")
        .eq("user_id", user.id)
        .single();

      if (
        membershipError ||
        !membership
      ) {
        return res.status(403).json({
          error: "No ward is assigned to this user",
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
        .eq("id", membership.ward_id)
        .single();

      if (wardError || !wardData) {
        return res.status(403).json({
          error: "Ward not found",
        });
      }

      if (wardData.active === false) {
        return res.status(403).json({
          error: "This ward account is inactive",
        });
      }

      ward = wardData;
    }

    return res.status(200).json({
      ok: true,
      user: {
        id: user.id,
        username: profile.username,
        name:
          profile.display_name ||
          profile.username,
        role: profile.role,
        ward,
      },
    });
  } catch (error) {
    console.error("Me API error:", error);

    return res.status(500).json({
      error: "Server error",
    });
  }
}
