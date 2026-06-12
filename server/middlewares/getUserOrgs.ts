import { Request, Response, NextFunction } from "express";
import { db } from "@server/db";
import { userOrgs, orgs } from "@server/db";
import { eq } from "drizzle-orm";
import createHttpError from "http-errors";
import HttpCode from "@server/types/HttpCode";

export async function getUserOrgs(
    req: Request,
    res: Response,
    next: NextFunction
) {
    const userId = req.user?.userId; // Assuming you have user information in the request

    if (!userId) {
        return next(
            createHttpError(HttpCode.UNAUTHORIZED, "User not authenticated")
        );
    }

    try {
        const userOrganizations = await db
            .select({
                orgId: userOrgs.orgId
            })
            .from(userOrgs)
            .where(eq(userOrgs.userId, userId));

        req.userOrgIds = userOrganizations.map((org) => org.orgId);
        // req.userOrgRoleIds = userOrganizations.reduce((acc, org) => {
        //   acc[org.orgId] = org.role;
        //   return acc;
        // }, {} as Record<number, string>);

        next();
    } catch (error) {
        next(
            createHttpError(
                HttpCode.INTERNAL_SERVER_ERROR,
                "Error retrieving user organizations"
            )
        );
    }
}
