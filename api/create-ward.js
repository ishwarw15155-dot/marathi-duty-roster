import { supabaseAdmin } from "./_supabaseAdmin.js";
import { getSecret } from "./_auth.js";

function getSession(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)duty_auth=([^;]+)/);

  if (!match) return null;

  try {
    const token = decodeURIComponent(match[1]);
    const session = JSON.parse(
      Buffer.from(token, "base64url").toString("utf8")
    );

    if (!session || !session.username || !session.role) {
      return null;
    }

    if (session.secret !== getSecret()) {
      return null;
    }

    return session;
  } catch {
    return null;
  }
}

async function requireAdmin(req) {
  const session = getSession(req);

  if (!session) {
    return {
      session: null,
      error: {
        status: 401,
        message: "Not authenticated",
      },
    };
  }

  if (session.role !== "admin") {
    return {
      session: null,
      error: {
        status: 403,
        message: "Administrator access required",
      },
    };
  }

  return {
    session,
    error: null,
  };
}

async function getAdminUserId(username) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("user_id")
    .eq("username", username)
    .eq("role", "admin")
    .single();

  if (error || !data?.user_id) {
    return null;
  }

  return data.user_id;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const auth = await requireAdmin(req);

    if (auth.error) {
      return res.status(auth.error.status).json({
        error: auth.error.message,
      });
    }

    const {
      wardName,
      wardCode,
      username,
      password,
    } = req.body || {};

    if (!wardName || !username || !password) {
      return res.status(400).json({
        error:
          "Ward name, username and password are required",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        error:
          "Ward password must be at least 6 characters",
      });
    }

    const cleanWardName = wardName.trim();
    const cleanWardCode = wardCode?.trim() || null;
    const cleanUsername = username.trim();

    const {
      data: existingWard,
      error: existingError,
    } = await supabaseAdmin
      .from("wards")
      .select("id")
      .eq("username", cleanUsername)
      .maybeSingle();

    if (existingError) {
      return res.status(500).json({
        error: existingError.message,
      });
    }

    if (existingWard) {
      return res.status(409).json({
        error:
          "This username is already assigned to a ward",
      });
    }

    // Find administrator's real user ID for updated_by.
    const adminUserId = await getAdminUserId(
      auth.session.username
    );

    const {
      data: authData,
      error: authError,
    } = await supabaseAdmin.auth.admin.createUser({
      email: `${cleanUsername}@ward.local`,
      password,
      email_confirm: true,
    });

    if (authError || !authData?.user) {
      return res.status(400).json({
        error:
          authError?.message ||
          "Could not create ward login",
      });
    }

    const wardUser = authData.user;

    const {
      data: ward,
      error: wardError,
    } = await supabaseAdmin
      .from("wards")
      .insert({
        ward_name: cleanWardName,
        ward_code: cleanWardCode,
        username: cleanUsername,
        active: true,
      })
      .select()
      .single();

    if (wardError) {
      await supabaseAdmin.auth.admin.deleteUser(
        wardUser.id
      );

      return res.status(400).json({
        error: wardError.message,
      });
    }

    const { error: profileError } =
      await supabaseAdmin
        .from("profiles")
        .insert({
          user_id: wardUser.id,
          username: cleanUsername,
          display_name: cleanWardName,
          role: "ward",
        });

    if (profileError) {
      await supabaseAdmin
        .from("wards")
        .delete()
        .eq("id", ward.id);

      await supabaseAdmin.auth.admin.deleteUser(
        wardUser.id
      );

      return res.status(400).json({
        error: profileError.message,
      });
    }

    const { error: memberError } =
      await supabaseAdmin
        .from("ward_members")
        .insert({
          user_id: wardUser.id,
          ward_id: ward.id,
        });

    if (memberError) {
      await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("user_id", wardUser.id);

      await supabaseAdmin
        .from("wards")
        .delete()
        .eq("id", ward.id);

      await supabaseAdmin.auth.admin.deleteUser(
        wardUser.id
      );

      return res.status(400).json({
        error: memberError.message,
      });
    }

    const { error: rosterError } =
      await supabaseAdmin
        .from("ward_rosters")
        .insert({
          ward_id: ward.id,
          roster: {},
          updated_by: adminUserId || null,
        });

    if (rosterError) {
      console.error(
        "Initial roster creation failed:",
        rosterError
      );
    }

    return res.status(201).json({
      ok: true,
      ward: {
        id: ward.id,
        ward_name: ward.ward_name,
        ward_code: ward.ward_code,
        username: ward.username,
        active: ward.active,
      },
    });
  } catch (error) {
    console.error("Create ward error:", error);

    return res.status(500).json({
      error:
        error.message ||
        "Server error while creating ward",
    });
  }
}
