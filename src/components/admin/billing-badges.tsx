import { Badge, type BadgeProps } from "@/components/ui/badge";
import type { SubscriptionState } from "@/lib/billing/subscription";
import type { OrgRole } from "@/lib/auth/permissions";

/** Subscription state → badge colour. Active is growth (moss), trialing is
 *  attention (amber), expired is muted (outline). */
export function StateBadge({ state }: { state: SubscriptionState }) {
  const map = {
    active: { variant: "moss", label: "Active" },
    trialing: { variant: "amber", label: "Trialing" },
    expired: { variant: "outline", label: "Expired" },
  } as const;
  const { variant, label } = map[state];
  return <Badge variant={variant}>{label}</Badge>;
}

/** Marks an org as "active" without a real Stripe subscription behind it —
 *  i.e. an admin-granted free subscription. */
export function CompedBadge() {
  return <Badge variant="sky">Free</Badge>;
}

/** Org role badge — shared between the admin org and user detail pages. */
export const ORG_ROLE_VARIANT: Record<OrgRole, BadgeProps["variant"]> = {
  owner: "amber",
  admin: "default",
  contributor: "moss",
  viewer: "sky",
};

/** Platform role badge — super_admin stands out, everyone else is plain. */
export function RoleBadge({ role }: { role: "super_admin" | "user" }) {
  if (role === "super_admin") return <Badge variant="amber">Super admin</Badge>;
  return <Badge variant="outline">User</Badge>;
}

/** Account status badge — suspended reads as a warning. */
export function UserStatusBadge({ status }: { status: "active" | "suspended" }) {
  if (status === "suspended") return <Badge variant="bark">Suspended</Badge>;
  return <Badge variant="moss">Active</Badge>;
}
