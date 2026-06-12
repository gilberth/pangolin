import { ApprovalFeed } from "@app/components/ApprovalFeed";
import { PaidFeaturesAlert } from "@app/components/PaidFeaturesAlert";
import SettingsSectionTitle from "@app/components/SettingsSectionTitle";
import ApprovalsBanner from "@app/components/ApprovalsBanner";
import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import { getCachedOrg } from "@app/lib/api/getCachedOrg";
import type { ApprovalItem } from "@app/lib/queries";
import OrgProvider from "@app/providers/OrgProvider";
import type { GetOrgResponse } from "@server/routers/org";
import type { ListRolesResponse } from "@server/routers/role";
import type { AxiosResponse } from "axios";
import { getTranslations } from "next-intl/server";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Approvals"
};

export interface ApprovalFeedPageProps {
    params: Promise<{ orgId: string }>;
}

export default async function ApprovalFeedPage(props: ApprovalFeedPageProps) {
    const params = await props.params;

    let org: GetOrgResponse | null = null;
    const orgRes = await getCachedOrg(params.orgId);

    if (orgRes && orgRes.status === 200) {
        org = orgRes.data.data;
    }

    // Fetch roles to check if approvals are enabled
    let hasApprovalsEnabled = false;
    const rolesRes = await internal
        .get<
            AxiosResponse<ListRolesResponse>
        >(`/org/${params.orgId}/roles`, await authCookieHeader())
        .catch((e) => {});

    if (rolesRes && rolesRes.status === 200) {
        hasApprovalsEnabled = rolesRes.data.data.roles.some(
            (role) => role.requireDeviceApproval === true
        );
    }

    const t = await getTranslations();

    return (
        <>
            <SettingsSectionTitle
                title={t("accessApprovalsManage")}
                description={t("accessApprovalsDescription")}
            />

            <ApprovalsBanner />

            <PaidFeaturesAlert tiers={tierMatrix.deviceApprovals} />

            <OrgProvider org={org}>
                <div className="container mx-auto max-w-12xl">
                    <ApprovalFeed
                        orgId={params.orgId}
                        hasApprovalsEnabled={hasApprovalsEnabled}
                    />
                </div>
            </OrgProvider>
        </>
    );
}
