import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import type { AdminListUsersResponse } from "@server/routers/user/adminListUsers";
import type { ListIdpsResponse } from "@server/routers/idp/listIdps";
import UsersTable, { GlobalUserRow } from "@app/components/AdminUsersTable";
import { Alert, AlertDescription, AlertTitle } from "@app/components/ui/alert";
import { InfoIcon } from "lucide-react";
import { getTranslations } from "next-intl/server";

/** API JSON body shape for `response<T>()` handlers (see `server/lib/response.ts`). */
type ApiPayload<T> = {
    data: T;
    success: boolean;
    error: boolean;
    message: string;
    status: number;
};

type AdminUsersPageProps = {
    searchParams: Promise<Record<string, string>>;
};

export const dynamic = "force-dynamic";

export default async function UsersPage(props: AdminUsersPageProps) {
    const searchParams = new URLSearchParams(await props.searchParams);
    const cookieHeader = await authCookieHeader();

    let rows: AdminListUsersResponse["users"] = [];
    let pagination: AdminListUsersResponse["pagination"] = {
        total: 0,
        page: 1,
        pageSize: 20
    };

    const [usersRes, idpsRes] = await Promise.all([
        internal
            .get<
                ApiPayload<AdminListUsersResponse>
            >(`/users?${searchParams.toString()}`, cookieHeader)
            .catch(() => {}),
        internal
            .get<
                ApiPayload<ListIdpsResponse>
            >(`/idp?limit=500&offset=0`, cookieHeader)
            .catch(() => {})
    ]);

    if (usersRes && usersRes.status === 200) {
        const list = usersRes.data.data;
        rows = list.users;
        pagination = list.pagination;
    }

    const t = await getTranslations();

    const globalIdps =
        idpsRes && idpsRes.status === 200 ? (idpsRes.data.data.idps ?? []) : [];
    const idpFilterOptions = [
        { value: "internal", label: t("idpNameInternal") },
        ...globalIdps.map((i: ListIdpsResponse["idps"][number]) => ({
            value: String(i.idpId),
            label: i.name
        }))
    ];

    const userRows: GlobalUserRow[] = rows.map((row) => {
        return {
            id: row.id,
            email: row.email,
            name: row.name,
            username: row.username,
            type: row.type,
            idpId: row.idpId,
            idpName: row.idpName || t("idpNameInternal"),
            dateCreated: row.dateCreated,
            serverAdmin: row.serverAdmin,
            twoFactorEnabled: row.twoFactorEnabled,
            twoFactorSetupRequested: row.twoFactorSetupRequested
        };
    });

    return (
        <>
            <SettingsSectionTitle
                title={t("userTitle")}
                description={t("userDescription")}
            />
            <Alert className="mb-6">
                <InfoIcon className="h-4 w-4" />
                <AlertTitle className="font-semibold">
                    {t("userAbount")}
                </AlertTitle>
                <AlertDescription>
                    {t("userAbountDescription")}
                </AlertDescription>
            </Alert>
            <UsersTable
                users={userRows}
                rowCount={pagination.total}
                pagination={{
                    pageIndex: pagination.page - 1,
                    pageSize: pagination.pageSize
                }}
                idpFilterOptions={idpFilterOptions}
            />
        </>
    );
}
