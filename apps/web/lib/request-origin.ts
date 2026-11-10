export const ownerServeHost = () => process.env.GBOOK_OWNER_MODE === "1"
  ? process.env.GBOOK_OWNER_SERVE_HOST
  : undefined;

export function allowedOrigin(request: Request) {
  const host = request.headers.get("host") ?? "";
  const serveHost = ownerServeHost();
  if (serveHost) return host === serveHost ? `https://${serveHost}` : null;
  const url = new URL(request.url);
  const lanHost = process.env.GBOOK_OWNER_MODE === "1" && process.env.GBOOK_OWNER_LAN_IP
    ? `${process.env.GBOOK_OWNER_LAN_IP}:${process.env.PORT}`
    : null;
  if (lanHost) {
    if (host !== lanHost) return null;
    return `http://${lanHost}`;
  }
  if (!/^(127\.0\.0\.1|localhost):\d{1,5}$/.test(host) ||
    host.split(":")[1] !== url.port) return null;
  return `${url.protocol}//${host}`;
}
