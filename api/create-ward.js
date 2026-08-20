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

async function isAdmin(userId) {
  const {
    data: profile,
    error,
  } =
    await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .single();

  return (
    !error &&
    profile &&
    profile.role === "admin"
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
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

    const admin =
      await isAdmin(user.id);

    if (!admin) {
      return res.status(403).json({
        error:
          "Administrator access required",
      });
    }

    const {
      wardName,
      wardCode,
      username,
      password,
    } = req.body || {};

    if (
      !wardName ||
      !username ||
      !password
    ) {
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

    const cleanWardName =
      wardName.trim();

    const cleanWardCode =
      wardCode?.trim() || null;

    const cleanUsername =
      username.trim();

    const {
      data: existingWard,
      error: existingError,
    } =
      await supabaseAdmin
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

    const {
      data: authData,
      error: authError,
    } =
      await supabaseAdmin.auth.admin.createUser({
        email: `${cleanUsername}@ward.local`,
        password,
        email_confirm: true,
      });

    if (
      authError ||
      !authData?.user
    ) {
      return res.status(400).json({
        error:
          authError?.message ||
          "Could not create ward login",
      });
    }

    const wardUser =
      authData.user;

    const {
      data: ward,
      error: wardError,
    } =
      await supabaseAdmin
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

    const {
      error: profileError,
    } =
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

    const {
      error: memberError,
    } =
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

    const {
      error: rosterError,
    } =
      await supabaseAdmin
        .from("ward_rosters")
        .insert({
          ward_id: ward.id,
          roster: {},
          updated_by: user.id,
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
    console.error(
      "Create ward error:",
      error
    );

    return res.status(500).json({
      error:
        error.message ||
        "Server error while creating ward",
    });
  }
}
