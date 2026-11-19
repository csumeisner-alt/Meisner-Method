/**
 * JS responder ownership shared by nested horizontal surfaces. The account
 * surface reserves the touch before movement, including at account boundaries.
 */
const owners = new Set<object>();
let navigationUntil = 0;

export function reserveInteraction(owner: object) {
  owners.add(owner);
}
export function releaseInteraction(owner: object) {
  owners.delete(owner);
}
export function isInteractionReserved() {
  return owners.size > 0;
}
export function claimMainTabNavigation(now = Date.now()) {
  if (now < navigationUntil) return false;
  navigationUntil = now + 650;
  return true;
}
