export function getAdmin() {
  return {
    username: process.env.ADMIN_USERNAME || "admin",
    password: process.env.ADMIN_PASSWORD || "change-me",
    name: process.env.ADMIN_NAME || "Administrator",
    role: process.env.ADMIN_ROLE || "admin",
  };
}

export function getSecret() {
  return (
    process.env.DUTY_AUTH_SECRET ||
    "change-this-secret-before-production"
  );
}
