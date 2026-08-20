import { createClient } from "@supabase/supabase-js";
import {
  getSupabaseConfig,
  getAdmin,
} from "./_auth.js";
import { supabaseAdmin } from "./_supabaseAdmin.js";

function send(res, status, body) {
  return res.status(status).json(body);
}

function setAuthCookies(res, session) {
  const cookies = [];

  if (session?.access_token) {
    cookies.push(
      `sb_access_token=${encodeURIComponent(
        session.access_token
      )}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=3600`
    );
  }

  if (session?.refresh_token) {
    cookies.push(
      `sb_refresh_token=${encodeURIComponent(
        session.refresh_token
      )}; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=2592000`
    );
  }

  res.setHeader("Set-Cookie", cookies);
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return send(res, 405, {
      error: "Method not allowed",
    });
  }

  try {
    const {
      username,
      password,
    } = req.body || {};

    if (!username || !password) {
      return send(res, 400, {
        error: "Username and password are required",
      });
    }

    const cleanUsername = String(username).trim();

    let profile = null;

    /*
     * First check the admin account.
     */
    const admin = getAdmin();

    if (cleanUsername === admin.username) {
      profile = {
        username: admin.username,
        display_name: admin.name,
        role: "admin",
        user_id: null,
        ward_id: null,
        email:
          admin.email ||
          "admin@hospital.local",
      };
    } else {
      /*
       * Otherwise find the ward user.
       */
      const {
        data,
        error,
      } = await supabaseAdmin
        .from("profiles")
        .select(
          "user_id, username, display_name, role"
        )
        .eq("username", cleanUsername)
        .maybeSingle();

      if (error) {
        console.error(
          "Profile lookup error:",
          error
        );

        return send(res, 500, {
          error: "Unable to find user profile",
        });
      }

      if (!data) {
        return send(res, 401, {
          error: "Invalid username or password",
        });
      }

      profile = data;

      /*
       * Ward must be assigned to exactly one ward.
       */
      if (profile.role === "ward") {
        const {
          data: membership,
          error: membershipError,
        } = await supabaseAdmin
          .from("ward_members")
          .select("ward_id")
          .eq("user_id", profile.user_id)
          .maybeSingle();

        if (membershipError) {
          console.error(
            membershipError
          );

          return send(res, 500, {
            error:
              "Unable to find ward assignment",
          });
        }

        if (!membership?.ward_id) {
          return send(res, 403, {
            error:
              "User is not assigned to a ward",
          });
        }

        const {
          data: ward,
          error: wardError,
        } = await supabaseAdmin
          .from("wards")
          .select(
            "id, ward_name, ward_code, username, active"
          )
          .eq("id", membership.ward_id)
          .single();

        if (wardError || !ward) {
          return send(res, 403, {
            error: "Ward not found",
          });
        }

        if (!ward.active) {
          return send(res, 403, {
            error: "This ward login is inactive",
          });
        }

        profile.ward_id = ward.id;
        profile.ward = ward;
      }
    }

    /*
     * Find the actual Supabase Auth email.
     */
    let authEmail = profile.email;

    if (!authEmail && profile.user_id) {
      const {
        data: authResult,
        error: authLookupError,
      } =
        await supabaseAdmin.auth.admin.getUserById(
          profile.user_id
        );

      if (
        !authLookupError &&
        authResult?.user?.email
      ) {
        authEmail = authResult.user.email;
      }
    }

    /*
     * Admin user normally uses the configured admin
     * email. Ward accounts use username@ward.local.
     */
    if (!authEmail) {
      if (profile.role === "ward") {
        authEmail = `${cleanUsername}@ward.local`;
      } else {
        authEmail = `${cleanUsername}@hospital.local`;
      }
    }

    const {
      url,
      key,
    } = getSupabaseConfig();

    const supabaseAuth = createClient(
      url,
      key,
      {
        auth: {
          persistSession: false,
          autoRefreshToken: false,
        },
      }
    );

    const {
      data: authData,
      error: authError,
    } =
      await supabaseAuth.auth.signInWithPassword({
        email: authEmail,
        password,
      });

    if (authError || !authData?.session) {
      console.error(
        "Supabase login error:",
        authError
      );

      return send(res, 401, {
        error: "Invalid username or password",
      });
    }

    /*
     * Store the real Supabase access token.
     */
    setAuthCookies(
      res,
      authData.session
    );

    return send(res, 200, {
      ok: true,
      user: {
        id:
          profile.user_id ||
          authData.user.id,

        username:
          profile.username,

        name:
          profile.display_name ||
          profile.username,

        role:
          profile.role,

        ward:
          profile.ward || null,

        ward_id:
          profile.ward_id || null,
      },
    });

  } catch (error) {
    console.error(
      "Login error:",
      error
    );

    return send(res, 500, {
      error:
        error.message ||
        "Server error during login",
    });
  }
}
