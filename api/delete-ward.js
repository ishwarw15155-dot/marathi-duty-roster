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

  const { data: profile, error } =
    await supabaseAdmin
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
  if (req.method !== "DELETE") {
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

    const { wardId } = req.body || {};

    if (!wardId) {
      return res.status(400).json({
        error: "Ward ID is required",
      });
    }

    // Find the ward user before deleting the ward.
    const {
      data: membership,
      error: membershipError,
    } = await supabaseAdmin
      .from("ward_members")
      .select("user_id")
      .eq("ward_id", wardId)
      .maybeSingle();

    if (membershipError) {
      return res.status(400).json({
        error: membershipError.message,
      });
    }

    const wardUserId = membership?.user_id || null;

    // Delete the ward.
    // Related roster, history and membership rows are
    // removed through ON DELETE CASCADE.
    const {
      error: wardError,
    } = await supabaseAdmin
      .from("wards")
      .delete()
      .eq("id", wardId);

    if (wardError) {
      return res.status(400).json({
        error: wardError.message,
      });
    }

    // Delete the ward's profile.
    if (wardUserId) {
      await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("user_id", wardUserId);

      // Finally delete the actual Supabase Auth account.
      const {
        error: authDeleteError,
      } =
        await supabaseAdmin.auth.admin.deleteUser(
          wardUserId
        );

      if (authDeleteError) {
        console.error(
          "Ward Auth user deletion failed:",
          authDeleteError
        );
      }
    }

    return res.status(200).json({
      ok: true,
      message: "Ward deleted successfully",
    });
  } catch (error) {
    console.error(error);

    return res.status(500).json({
      error: "Server error while deleting ward",
    });
  }
}
