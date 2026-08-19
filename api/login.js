import { supabaseAdmin } from "./_supabaseAdmin.js";

function send(res, status, body, headers = {}) {
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  return res.status(status).json(body);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return send(res, 405, {
      error: "Method not allowed",
    });
  }

  try {
    const { username, password } = req.body || {};

    if (!username || !password) {
      return send(res, 400, {
        error: "Username and password are required",
      });
    }

    /*
     * Supabase Auth uses email/password.
     *
     * Our application displays a username, so internally
     * we use:
     *
     * admin      -> admin@hospital.local
     * ward26     -> ward26@ward.local
     */
    let email;

    if (username === "admin") {
      email = "admin@hospital.local";
    } else {
      email = `${username.trim()}@ward.local`;
    }

    const {
      data,
      error,
    } = await supabaseAdmin.auth.signInWithPassword({
      email,
      password,
    });

    if (error || !data?.session || !data?.user) {
      return send(res, 401, {
        error: "Invalid username or password",
      });
    }

    const accessToken = data.session.access_token;
    const refreshToken = data.session.refresh_token;

    /*
     * Store both Supabase tokens in HttpOnly cookies.
     * The browser cannot read these cookies from JavaScript.
     */

    const cookies = [
      `sb_access_token=${encodeURIComponent(accessToken)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=3600`,
      `sb_refresh_token=${encodeURIComponent(refreshToken)}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000`,
    ];

    /*
     * Get application profile.
     */
    const {
      data: profile,
      error: profileError,
    } = await supabaseAdmin
      .from("profiles")
      .select(
        "user_id, username, display_name, role"
      )
      .eq("user_id", data.user.id)
      .single();

    if (profileError || !profile) {
      return send(res, 403, {
        error: "User profile is not configured",
      });
    }

    /*
     * Ward user:
     * Find exactly which ward belongs to this user.
     */
    let ward = null;

    if (profile.role === "ward") {
      const {
        data: membership,
        error: membershipError,
      } = await supabaseAdmin
        .from("ward_members")
        .select("ward_id")
        .eq("user_id", data.user.id)
        .single();

      if (
        membershipError ||
        !membership
      ) {
        return send(res, 403, {
          error: "No ward is assigned to this user",
        });
      }

      const {
        data: wardData,
      } = await supabaseAdmin
        .from("wards")
        .select(
          "id, ward_name, ward_code, username, active"
        )
        .eq("id", membership.ward_id)
        .single();

      if (!wardData) {
        return send(res, 403, {
          error: "Ward not found",
        });
      }

      if (wardData.active === false) {
        return send(res, 403, {
          error: "This ward account is inactive",
        });
      }

      ward = wardData;
    }

    return send(
      res,
      200,
      {
        ok: true,

        user: {
          id: data.user.id,
          username: profile.username,
          name:
            profile.display_name ||
            profile.username,
          role: profile.role,
          ward,
        },
      },
      {
        "Set-Cookie": cookies,
      }
    );
  } catch (error) {
    console.error("Login error:", error);

    return send(res, 500, {
      error: "Server error during login",
    });
  }
}
