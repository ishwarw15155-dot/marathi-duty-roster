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

async function requireAdmin(req) {
  const user = await getCurrentUser(req);

  if (!user) {
    return {
      user: null,
      error: {
        status: 401,
        message: "Not authenticated",
      },
    };
  }

  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", user.id)
    .single();

  if (error || profile?.role !== "admin") {
    return {
      user: null,
      error: {
        status: 403,
        message: "Administrator access required",
      },
    };
  }

  return {
    user,
    error: null,
  };
}

export default async function handler(req, res) {
  if (req.method !== "PATCH") {
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
      wardId,
      wardName,
      wardCode,
      username,
      password,
      active,
    } = req.body || {};

    if (!wardId) {
      return res.status(400).json({
        error: "Ward ID is required",
      });
    }

    const { data: ward, error: wardFindError } =
      await supabaseAdmin
        .from("wards")
        .select("*")
        .eq("id", wardId)
        .single();

    if (wardFindError || !ward) {
      return res.status(404).json({
        error: "Ward not found",
      });
    }

    const newUsername =
      typeof username === "string" && username.trim()
        ? username.trim()
        : ward.username;

    const newWardName =
      typeof wardName === "string" && wardName.trim()
        ? wardName.trim()
        : ward.ward_name;

    const newWardCode =
      typeof wardCode === "string" && wardCode.trim()
        ? wardCode.trim()
        : null;

    // If username is being changed, make sure it isn't
    // already used by another ward.
    if (newUsername !== ward.username) {
      const { data: duplicate } =
        await supabaseAdmin
          .from("wards")
          .select("id")
          .eq("username", newUsername)
          .neq("id", wardId)
          .maybeSingle();

      if (duplicate) {
        return res.status(409).json({
          error:
            "This username is already assigned to another ward",
        });
      }
    }

    // Update the ward record.
    const { data: updatedWard, error: updateError } =
      await supabaseAdmin
        .from("wards")
        .update({
          ward_name: newWardName,
          ward_code: newWardCode,
          username: newUsername,
          ...(typeof active === "boolean"
            ? { active }
            : {}),
        })
        .eq("id", wardId)
        .select()
        .single();

    if (updateError) {
      return res.status(400).json({
        error: updateError.message,
      });
    }

    // Find the user assigned to this ward.
    const {
      data: membership,
      error: membershipError,
    } = await supabaseAdmin
      .from("ward_members")
      .select("user_id")
      .eq("ward_id", wardId)
      .single();

    if (membershipError || !membership) {
      return res.status(500).json({
        error:
          "Ward user account could not be found",
      });
    }

    const wardUserId = membership.user_id;

    // Update username/email when username changes.
    if (newUsername !== ward.username) {
      const { error: authUpdateError } =
        await supabaseAdmin.auth.admin.updateUserById(
          wardUserId,
          {
            email: `${newUsername}@ward.local`,
          }
        );

      if (authUpdateError) {
        return res.status(400).json({
          error: authUpdateError.message,
        });
      }
    }

    // Update password only if administrator entered one.
    if (
      typeof password === "string" &&
      password.length > 0
    ) {
      if (password.length < 6) {
        return res.status(400).json({
          error:
            "Ward password must be at least 6 characters",
        });
      }

      const { error: passwordError } =
        await supabaseAdmin.auth.admin.updateUserById(
          wardUserId,
          {
            password,
          }
        );

      if (passwordError) {
        return res.status(400).json({
          error: passwordError.message,
        });
      }
    }

    // Keep the profile synchronized.
    await supabaseAdmin
      .from("profiles")
      .update({
        username: newUsername,
        display_name: newWardName,
      })
      .eq("user_id", wardUserId);

    return res.status(200).json({
      ok: true,
      ward: updatedWard,
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Server error while updating ward",
    });
  }
}
