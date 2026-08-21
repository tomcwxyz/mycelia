import { NextRequest, NextResponse } from "next/server";
import { requireMembership } from "@/lib/auth/permissions";
import { getAuthenticatedUser, errorResponse } from "@/lib/utils/api";
import { createContextOAuthState } from "@/lib/context/oauth-state";
import { buildGoogleCalendarAuthorisationUrl } from "@/lib/context/google-api";

export async function GET(request: NextRequest) {
  try {
    const user = await getAuthenticatedUser();
    const organisationId = request.nextUrl.searchParams.get("organisationId");
    const requestedReturnTo = request.nextUrl.searchParams.get("returnTo");

    if (!organisationId) {
      return errorResponse("organisationId is required", 422);
    }

    await requireMembership(user.id, organisationId, "contributor");

    const returnTo =
      requestedReturnTo?.startsWith("/") === true
        ? requestedReturnTo
        : "/";
    const state = createContextOAuthState({
      userId: user.id,
      organisationId,
      returnTo,
    });

    return NextResponse.redirect(buildGoogleCalendarAuthorisationUrl(state));
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    if (message === "Not authenticated") return errorResponse(message, 401);
    if (message.includes("Not a member") || message.includes("Insufficient role")) {
      return errorResponse("Forbidden", 403);
    }
    if (message.includes("not configured") || message.includes("must be set")) {
      return errorResponse("Google Calendar connection is not configured", 503);
    }
    console.error("Google Calendar connect failed", error);
    return errorResponse("Could not start Google Calendar connection", 500);
  }
}
