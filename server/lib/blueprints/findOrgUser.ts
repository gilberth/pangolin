import { and, asc, eq, or } from "drizzle-orm";
import { Transaction, User, userOrgs, users } from "@server/db";

export async function findOrgUsersByIdentifier(
    trx: Transaction,
    orgId: string,
    identifier: string
): Promise<User[]> {
    const matches = await trx
        .select()
        .from(users)
        .innerJoin(userOrgs, eq(users.userId, userOrgs.userId))
        .where(
            and(
                or(eq(users.username, identifier), eq(users.email, identifier)),
                eq(userOrgs.orgId, orgId)
            )
        )
        .orderBy(asc(users.dateCreated), asc(users.userId));

    return matches.map((match) => match.user);
}

export async function resolveOrgUserIds(
    trx: Transaction,
    orgId: string,
    identifiers: string[]
): Promise<string[]> {
    const userIds = new Set<string>();
    for (const identifier of identifiers) {
        const matchedUsers = await findOrgUsersByIdentifier(
            trx,
            orgId,
            identifier
        );
        for (const user of matchedUsers) {
            userIds.add(user.userId);
        }
    }
    return [...userIds];
}
