export type UserAgentLabels = {
  unknownDevice: string;
  unknownBrowser: string;
  unknownOs: string;
};

/** Résume un user-agent en libellé lisible (« Firefox · Windows »). */
export function describeUserAgent(
  userAgent: string | null | undefined,
  labels: UserAgentLabels,
): string {
  if (!userAgent) return labels.unknownDevice;
  const browser =
    /firefox\//i.test(userAgent) ? "Firefox"
    : /edg\//i.test(userAgent) ? "Edge"
    : /chrome\//i.test(userAgent) ? "Chrome"
    : /safari\//i.test(userAgent) ? "Safari"
    : labels.unknownBrowser;
  const os =
    /windows/i.test(userAgent) ? "Windows"
    : /android/i.test(userAgent) ? "Android"
    : /iphone|ipad|ios/i.test(userAgent) ? "iOS"
    : /mac os/i.test(userAgent) ? "macOS"
    : /linux/i.test(userAgent) ? "Linux"
    : labels.unknownOs;
  return `${browser} · ${os}`;
}
