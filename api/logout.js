export default function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({
      error: "Method not allowed",
    });
  }

  res.setHeader("Set-Cookie", [
    "sb_access_token=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0",
    "sb_refresh_token=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0",
    "duty_auth=; Path=/; HttpOnly; SameSite=Lax; Secure; Max-Age=0",
  ]);

  return res.status(200).json({
    ok: true,
  });
}
