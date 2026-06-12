import { db, roles, userOrgRoles } from "@server/db";
import { and, eq } from "drizzle-orm";

/**
 * Get all role IDs a user has in an organization.
 * Returns empty array if the user has no roles in the org (callers must treat as no access).
 */
export async function getUserOrgRoleIds(
    userId: string,
    orgId: string
): Promise<number[]> {
    const rows = await db
        .select({ roleId: userOrgRoles.roleId })
        .from(userOrgRoles)
        .where(
            and(
                eq(userOrgRoles.userId, userId),
                eq(userOrgRoles.orgId, orgId)
            )
        );
    return rows.map((r) => r.roleId);
}

export async function getUserOrgRoles(
    userId: string,
    orgId: string
): Promise<{ roleId: number; roleName: string }[]> {
    const rows = await db
        .select({ roleId: userOrgRoles.roleId, roleName: roles.name })
        .from(userOrgRoles)
        .innerJoin(roles, eq(userOrgRoles.roleId, roles.roleId))
        .where(
            and(eq(userOrgRoles.userId, userId), eq(userOrgRoles.orgId, orgId))
        );
    return rows;
}
