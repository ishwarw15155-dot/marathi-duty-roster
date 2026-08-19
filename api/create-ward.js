import { supabaseAdmin } from "./_supabaseAdmin.js";

function getToken(req) {
  const cookie = req.headers.cookie || "";
  const match = cookie.match(/(?:^|;\s*)duty_auth=([^;]+)/);
  return match ? decodeURIComponent(match[1]) : null;
}

async function getCurrentUser(req) {
  const token = getToken(req);

  if (!token) {
    return null;
  }

  const {
    data: { user },
    error,
  } = await supabaseAdmin.auth.getUser(token);

  if (error || !user) {
    return null;
  }

  return user;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const user = await getCurrentUser(req);

    if (!user) {
      return res.status(401).json({
        error: "Not authenticated",
      });
    }

    // Check that the logged-in user is an administrator.
    const { data: profile, error: profileError } =
      await supabaseAdmin
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .single();

    if (
      profileError ||
      !profile ||
      profile.role !== "admin"
    ) {
      return res.status(403).json({
        error: "Administrator access required",
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

    // Prevent duplicate ward usernames.
    const { data: existingWard } =
      await supabaseAdmin
        .from("wards")
        .select("id")
        .eq("username", username)
        .maybeSingle();

    if (existingWard) {
      return res.status(409).json({
        error: "This username is already assigned to a ward",
      });
    }

    // Create the Supabase Auth account.
    const {
      data: authData,
      error: authError,
    } = await supabaseAdmin.auth.admin.createUser({
      email: `${username}@ward.local`,
      password,
      email_confirm: true,
    });

    if (authError) {
      return res.status(400).json({
        error: authError.message,
      });
    }

    const wardUser = authData.user;

    // Create the ward.
    const {
      data: ward,
      error: wardError,
    } = await supabaseAdmin
      .from("wards")
      .insert({
        ward_name: wardName,
        ward_code: wardCode || null,
        username,
      })
      .select()
      .single();

    if (wardError) {
      // Roll back the Auth user if ward creation failed.
      await supabaseAdmin.auth.admin.deleteUser(
        wardUser.id
      );

      return res.status(400).json({
        error: wardError.message,
      });
    }

    // Create the ward profile.
    const {
      error: newProfileError,
    } = await supabaseAdmin
      .from("profiles")
      .insert({
        user_id: wardUser.id,
        username,
        display_name: wardName,
        role: "ward",
      });

    if (newProfileError) {
      await supabaseAdmin
        .from("wards")
        .delete()
        .eq("id", ward.id);

      await supabaseAdmin.auth.admin.deleteUser(
        wardUser.id
      );

      return res.status(400).json({
        error: newProfileError.message,
      });
    }

    // Connect the user to exactly one ward.
    const {
      error: memberError,
    } = await supabaseAdmin
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

    // Create an empty roster for the new ward.
    const {
      error: rosterError,
    } = await supabaseAdmin
      .from("ward_rosters")
      .insert({
        ward_id: ward.id,
        roster: {},
        updated_by: user.id,
      });

    if (rosterError) {
      // The ward/user can still exist if only the
      // initial empty roster creation failed.
      console.error(rosterError);
    }

    return res.status(201).json({
      ok: true,
      ward: {
        id: ward.id,
        ward_name: ward.ward_name,
        ward_code: ward.ward_code,
        username: ward.username,
      },
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Server error while creating ward",
    });
  }
}
