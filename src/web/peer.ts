// Home Assistant's Ingress proxy; it has already checked who the user is.
// Localhost is for trying the panel out on a dev machine.
const ALLOWED_PEERS = new Set(["172.30.32.2", "127.0.0.1", "::1"]);

export function peerAllowed(address: string | undefined): boolean {
  if (!address) return false;
  return ALLOWED_PEERS.has(address.replace(/^::ffff:/, ""));
}
