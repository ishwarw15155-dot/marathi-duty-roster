import { getAdmin } from "./_auth.js";

export default function handler(req, res) {
  const cookie = req.headers.cookie || "";

  const match = cookie.match(
    /(?:^|;\s*)duty_auth=([^;]+)/
  );

  if (!match) {
    return res.status(401).json({
      authenticated: false,
    });
  }

  const admin = getAdmin();

  return res.status(200).json({
    authenticated: true,
    user: {
      username: admin.username,
      name: admin.name,
      role: admin.role,
    },
  });
}
