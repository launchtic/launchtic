import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { SlugConflictError } from "./funnels/slug-validation";

export function ok<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function err(message: string, status = 400) {
  return NextResponse.json({ success: false, error: message }, { status });
}

export function handleError(error: unknown, context?: Record<string, string>) {
  if (error instanceof ZodError) {
    return err(error.errors.map((e) => `${e.path.join(".")}: ${e.message}`).join(", "), 400);
  }
  // Prisma unique constraint violation (P2002)
  if (isPrismaError(error, "P2002")) {
    const fields = ((error as any).meta?.target as string[] | undefined) ?? [];
    const message = context?.[fields.join(",")] ?? `Duplicate value on: ${fields.join(", ")}`;
    return err(message, 409);
  }
  // Slug uniqueness violation (per-URL-space rule, see slug-validation.ts)
  if (error instanceof SlugConflictError) {
    return err(error.message, 409);
  }
  const message = error instanceof Error ? error.message : "Internal server error";
  console.error("[API Error]", error);
  return err(message, 500);
}

function isPrismaError(error: unknown, code: string): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    (error as any).code === code
  );
}

import { auth } from "./auth";

export async function getWorkspaceId(): Promise<string | null> {
  const session = await auth();
  return (session as any)?.workspaceId ?? null;
}

export async function getUserId(): Promise<string | null> {
  const session = await auth();
  return session?.user?.id ?? null;
}
