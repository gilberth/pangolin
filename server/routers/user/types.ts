import type { UserOrg } from "@server/db";

export type AddUserRoleResponse = {
    userId: string;
    roleId: number;
};

/** Legacy POST /role/:roleId/add/:userId response shape (membership + effective role). */
export type AddUserRoleLegacyResponse = UserOrg & { roleId: number };

export type SetUserOrgRolesParams = {
    orgId: string;
    userId: string;
};

export type SetUserOrgRolesBody = {
    roleIds: number[];
};
