interface SiteOriginInput {
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  host?: string | null;
  siteUrl?: string | null;
}

const firstHeaderValue = (value?: string | null) => value?.split(",", 1)[0]?.trim() || undefined;

const toHttpOrigin = (value?: string | null) => {
  if (!value) return undefined;

  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") && url.origin !== "null"
      ? url.origin
      : undefined;
  } catch {
    return undefined;
  }
};

const isLocalHost = (host: string) => /^(?:localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(host);

const toRequestOrigin = ({ forwardedHost, forwardedProto, host }: SiteOriginInput) => {
  const requestHost = firstHeaderValue(forwardedHost) ?? firstHeaderValue(host);
  if (!requestHost) return undefined;

  const requestedProtocol = firstHeaderValue(forwardedProto)?.toLowerCase();
  if (requestedProtocol && requestedProtocol !== "http" && requestedProtocol !== "https") return undefined;

  const protocol = requestedProtocol ?? (isLocalHost(requestHost) ? "http" : "https");

  try {
    const url = new URL(`${protocol}://${requestHost}`);
    if (url.username || url.password || url.pathname !== "/" || url.search || url.hash || url.origin === "null") {
      return undefined;
    }

    return url.origin;
  } catch {
    return undefined;
  }
};

export function resolveSiteOrigin({ forwardedHost, forwardedProto, host, siteUrl }: SiteOriginInput) {
  return toHttpOrigin(siteUrl) ?? toRequestOrigin({ forwardedHost, forwardedProto, host }) ?? "http://localhost:3000";
}
