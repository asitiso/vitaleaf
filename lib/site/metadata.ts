interface SiteOriginInput {
  forwardedHost?: string | null;
  forwardedProto?: string | null;
  host?: string | null;
  siteUrl?: string | null;
}

const firstHeaderValue = (value?: string | null) => value?.split(",", 1)[0]?.trim() || undefined;

export function resolveSiteOrigin({ forwardedHost, forwardedProto, host, siteUrl }: SiteOriginInput) {
  const requestHost = firstHeaderValue(forwardedHost) ?? firstHeaderValue(host);

  if (requestHost) {
    const protocol =
      firstHeaderValue(forwardedProto) ??
      (requestHost.startsWith("localhost") || requestHost.startsWith("127.0.0.1") ? "http" : "https");

    try {
      return new URL(`${protocol}://${requestHost}`).origin;
    } catch {
      // Fall through to a configured deployment URL when proxy headers are malformed.
    }
  }

  if (siteUrl) {
    try {
      return new URL(siteUrl).origin;
    } catch {
      // Keep the storefront renderable when an optional deployment URL is invalid.
    }
  }

  return "http://localhost:3000";
}
