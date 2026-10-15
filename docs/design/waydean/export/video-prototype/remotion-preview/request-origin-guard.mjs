const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "::1"]);

function parseHostAuthority(value) {
  if (typeof value !== "string" || !value || value !== value.trim()) return null;

  try {
    const url = new URL(`http://${value}`);
    const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash) return null;
    if (!LOOPBACK_HOSTS.has(hostname)) return null;
    return { hostname, port: Number(url.port || 80) };
  } catch {
    return null;
  }
}

export function isAllowedLocalRequest({ host, origin, port }) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) return false;

  const requestAuthority = parseHostAuthority(host);
  if (!requestAuthority || requestAuthority.port !== port) return false;
  if (origin === undefined) return true;
  if (typeof origin !== "string" || !origin || origin !== origin.trim()) return false;

  try {
    const parsedOrigin = new URL(origin);
    const originHostname = parsedOrigin.hostname.toLowerCase().replace(/^\[|\]$/g, "");
    const originPort = Number(parsedOrigin.port || 80);
    return parsedOrigin.protocol === "http:" &&
      !parsedOrigin.username &&
      !parsedOrigin.password &&
      parsedOrigin.pathname === "/" &&
      !parsedOrigin.search &&
      !parsedOrigin.hash &&
      LOOPBACK_HOSTS.has(originHostname) &&
      originHostname === requestAuthority.hostname &&
      originPort === requestAuthority.port &&
      originPort === port;
  } catch {
    return false;
  }
}
