function clearCookie(name) {
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0`;
}

export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  res.setHeader("Set-Cookie", [
    clearCookie("sb_access_token"),
    clearCookie("sb_refresh_token"),
    clearCookie("duty_auth"),
  ]);

  return res.status(200).json({
    ok: true,
  });
}
