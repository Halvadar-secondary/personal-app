const hostOf = (url: string): string | null => {
  try {
    return new URL(url).host || null;
  } catch {
    return null;
  }
};

/**
 * Where an AI app really comes from, for the consent page: a client's name is
 * self-chosen. A CIMD client id is an HTTPS URL its owner controls; a
 * self-registered (DCR) client is only known by where it sends the code.
 */
export function clientOrigin(client: {
  clientId: string;
  redirectUris: string[];
}): { verified: boolean; host: string } {
  if (client.clientId.startsWith("https://")) {
    const host = hostOf(client.clientId);
    if (host) return { verified: true, host };
  }
  const hosts = [
    ...new Set(
      client.redirectUris.map(hostOf).filter((h): h is string => h !== null),
    ),
  ];
  return {
    verified: false,
    host: hosts.length ? hosts.join(", ") : "an unknown address",
  };
}
