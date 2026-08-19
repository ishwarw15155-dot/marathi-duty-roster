import { getAdmin, getSecret } from "./_auth.js";

function send(res, status, body, headers = {}) {
  Object.entries(headers).forEach(([key, value]) => {
    res.setHeader(key, value);
  });

  return res.status(status).json(body);
}

export default function handler(req, res) {
  if (req.method !== "POST") {
    return send(res, 405, {
      error: "Method not allowed",
    });
  }

  const { username, password } = req.body || {};

  const admin = getAdmin();

  // One-user login
  if (
    username !== admin.username ||
    password !== admin.password
  ) {
    return send(res, 401, {
      error: "Invalid username or password",
    });
  }

  const sessionData = {
    username: admin.username,
    name: admin.name,
    role: admin.role,
    secret: getSecret(),
  };

  const token = Buffer.from(
    JSON.stringify(sessionData)
  ).toString("base64url");

  return send(
    res,
    200,
    {
      ok: true,
      user: {
        username: admin.username,
        name: admin.name,
        role: admin.role,
      },
    },
    {
      "Set-Cookie":
        `duty_auth=${token}; ` +
        "Path=/; " +
        "HttpOnly; " +
        "SameSite=Lax; " +
        "Secure; " +
        "Max-Age=604800",
    }
  );
}
