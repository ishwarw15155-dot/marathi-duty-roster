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

export default async function handler(req, res) {
  if (req.method !== "POST" && req.method !== "DELETE") {
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

    const { error: wardError } =
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
    console.error("Delete ward error:", error);

    return res.status(500).json({
      error: "Server error while deleting ward",
    });
  }
}
