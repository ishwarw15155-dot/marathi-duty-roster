export function getAdmin() {
  return {
    username:
      process.env.ADMIN_USERNAME || "admin",

    password:
      process.env.ADMIN_PASSWORD || "change-me",

    name:
      process.env.ADMIN_NAME || "Administrator",

    role:
      process.env.ADMIN_ROLE || "admin",
  };
}

export function getSecret() {
  return (
    process.env.DUTY_AUTH_SECRET ||
    "change-this-secret-before-production"
  );
}

/*
 * Read and validate the custom duty_auth session cookie.
 *
 * This is NOT a Supabase access token.
 * It is the session created by api/login.js.
 */
export function getSession(req) {
  const cookie = req.headers.cookie || "";

  const match = cookie.match(
    /(?:^|;\s*)duty_auth=([^;]+)/
  );

  if (!match) {
    return null;
  }

  try {
    const token = decodeURIComponent(match[1]);

    const session = JSON.parse(
      Buffer.from(token, "base64url").toString("utf8")
    );

    if (!session) {
      return null;
    }

    if (!session.username) {
      return null;
    }

    if (!session.role) {
      return null;
    }

    /*
     * login.js puts the server secret inside the
     * session. This prevents a user from simply
     * changing role to "admin".
     */
    if (session.secret !== getSecret()) {
      return null;
    }

    return session;
  } catch (error) {
    console.error("Invalid duty_auth session:", error);
    return null;
  }
}

export function requireAdmin(req) {
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
