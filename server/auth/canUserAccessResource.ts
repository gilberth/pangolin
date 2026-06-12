import { db } from "@server/db";
import { and, eq, inArray } from "drizzle-orm";
import { roleResources, userResources } from "@server/db";

export async function canUserAccessResource({
    userId,
    resourceId,
    roleIds
}: {
    userId: string;
    resourceId: number;
    roleIds: number[];
}): Promise<boolean> {
    const roleResourceAccess =
        roleIds.length > 0
            ? await db
                  .select()
                  .from(roleResources)
                  .where(
                      and(
                          eq(roleResources.resourceId, resourceId),
                          inArray(roleResources.roleId, roleIds)
                      )
                  )
                  .limit(1)
            : [];

    if (roleResourceAccess.length > 0) {
        return true;
    }

    const userResourceAccess = await db
        .select()
        .from(userResources)
        .where(
            and(
                eq(userResources.userId, userId),
                eq(userResources.resourceId, resourceId)
            )
        )
        .limit(1);

    if (userResourceAccess.length > 0) {
        return true;
    }

    return false;
}
