// Public-demo mode. When DEMO_MODE=true the instance runs as the shared sandbox
// at demo.launchtic.com: visitors are auto-signed-in as the demo user, outbound
// email is suppressed (see packages/email mailer), and risky/destructive
// actions are blocked so nobody can lock the box or abuse it between resets.
import { err } from "./api";

export function isDemoMode(): boolean {
  return process.env.DEMO_MODE === "true";
}

// Shared demo account credentials. The seed creates this user with a bcrypt
// hash of DEMO_PASSWORD; the login page auto-signs-in with the same pair.
export const DEMO_EMAIL = process.env.DEMO_EMAIL ?? "demo@launchtic.com";
export const DEMO_PASSWORD = process.env.DEMO_PASSWORD ?? "launchtic-demo";

// Drop in at the top of a mutation route that does real / destructive /
// outbound work. Returns a 403 in demo mode, else null:
//   const blocked = demoGuard(); if (blocked) return blocked;
export function demoGuard() {
  return isDemoMode() ? err("This action is disabled in the live demo.", 403) : null;
}
