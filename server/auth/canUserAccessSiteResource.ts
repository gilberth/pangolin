import { db } from "@server/db";
import { and, eq, inArray } from "drizzle-orm";
import { roleSiteResources, userSiteResources } from "@server/db";

export async function canUserAccessSiteResource({
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
                  .from(roleSiteResources)
                  .where(
                      and(
                          eq(roleSiteResources.siteResourceId, resourceId),
                          inArray(roleSiteResources.roleId, roleIds)
                      )
                  )
                  .limit(1)
            : [];

    if (roleResourceAccess.length > 0) {
        return true;
    }

    const userResourceAccess = await db
        .select()
        .from(userSiteResources)
        .where(
            and(
                eq(userSiteResources.userId, userId),
                eq(userSiteResources.siteResourceId, resourceId)
            )
        )
        .limit(1);

    if (userResourceAccess.length > 0) {
        return true;
    }

    return false;
}
