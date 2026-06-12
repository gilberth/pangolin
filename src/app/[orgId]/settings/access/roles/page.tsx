import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import { AxiosResponse } from "axios";
import { GetOrgResponse } from "@server/routers/org";
import OrgProvider from "@app/providers/OrgProvider";
import { ListRolesResponse } from "@server/routers/role";
import RolesTable, { type RoleRow } from "@app/components/RolesTable";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import { getTranslations } from "next-intl/server";
import { getCachedOrg } from "@app/lib/api/getCachedOrg";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Roles"
};

type RolesPageProps = {
    params: Promise<{ orgId: string }>;
    searchParams: Promise<Record<string, string>>;
};

export const dynamic = "force-dynamic";

export default async function RolesPage(props: RolesPageProps) {
    const params = await props.params;
    const searchParams = new URLSearchParams(await props.searchParams);

    let roles: ListRolesResponse["roles"] = [];
    let pagination: ListRolesResponse["pagination"] = {
        total: 0,
        page: 1,
        pageSize: 20
    };
    let hasInvitations = false;

    const res = await internal
        .get<
            AxiosResponse<ListRolesResponse>
        >(`/org/${params.orgId}/roles?${searchParams.toString()}`, await authCookieHeader())
        .catch((e) => {});

    if (res && res.status === 200) {
        roles = res.data.data.roles;
        pagination = res.data.data.pagination;
    }

    const invitationsRes = await internal
        .get<
            AxiosResponse<{
                pagination: { total: number };
            }>
        >(
            `/org/${params.orgId}/invitations?limit=1&offset=0`,
            await authCookieHeader()
        )
        .catch((e) => {});

    if (invitationsRes && invitationsRes.status === 200) {
        hasInvitations = invitationsRes.data.data.pagination.total > 0;
    }

    let org: GetOrgResponse | null = null;
    const orgRes = await getCachedOrg(params.orgId);

    if (orgRes && orgRes.status === 200) {
        org = orgRes.data.data;
    }

    const roleRows: RoleRow[] = roles;
    const t = await getTranslations();

    return (
        <>
            <SettingsSectionTitle
                title={t("accessRolesManage")}
                description={t("accessRolesDescription")}
            />
            <OrgProvider org={org}>
                <RolesTable
                    roles={roleRows}
                    rowCount={pagination.total}
                    pagination={{
                        pageIndex: pagination.page - 1,
                        pageSize: pagination.pageSize
                    }}
                />
            </OrgProvider>
        </>
    );
}
