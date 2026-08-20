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

async function requireAdmin(req) {
  const token =
    getAccessToken(req);

  if (!token) {
    return {
      error: {
        status: 401,
        message: "Not authenticated",
      },
    };
  }

  const {
    data: { user },
    error: authError,
  } =
    await supabaseAdmin.auth.getUser(
      token
    );

  if (authError || !user) {
    return {
      error: {
        status: 401,
        message: "Not authenticated",
      },
    };
  }

  const {
    data: profile,
    error: profileError,
  } =
    await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .single();

  if (
    profileError ||
    profile?.role !== "admin"
  ) {
    return {
      error: {
        status: 403,
        message:
          "Administrator access required",
      },
    };
  }

  return {
    user,
    error: null,
  };
}

export default async function handler(req, res) {
  if (
    req.method !== "DELETE" &&
    req.method !== "POST"
  ) {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  try {
    const auth =
      await requireAdmin(req);

    if (auth.error) {
      return res.status(
        auth.error.status
      ).json({
        error:
          auth.error.message,
      });
    }

    const { wardId } =
      req.body || {};

    if (!wardId) {
      return res.status(400).json({
        error:
          "Ward ID is required",
      });
    }

    const {
      data: membership,
      error: membershipError,
    } =
      await supabaseAdmin
        .from("ward_members")
        .select("user_id")
        .eq("ward_id", wardId)
        .maybeSingle();

    if (membershipError) {
      return res.status(400).json({
        error:
          membershipError.message,
      });
    }

    const wardUserId =
      membership?.user_id ||
      null;

    const {
      error: wardError,
    } =
      await supabaseAdmin
        .from("wards")
        .delete()
        .eq("id", wardId);

    if (wardError) {
      return res.status(400).json({
        error: wardError.message,
      });
    }

    if (wardUserId) {
      await supabaseAdmin
        .from("profiles")
        .delete()
        .eq("user_id", wardUserId);

      const {
        error: authDeleteError,
      } =
        await supabaseAdmin.auth.admin.deleteUser(
          wardUserId
        );

      if (authDeleteError) {
        console.error(
          "Auth user deletion failed:",
          authDeleteError
        );
      }
    }

    return res.status(200).json({
      ok: true,
      message:
        "Ward deleted successfully",
    });

  } catch (error) {
    console.error(
      "Delete ward error:",
      error
    );

    return res.status(500).json({
      error:
        "Server error while deleting ward",
    });
  }
}
