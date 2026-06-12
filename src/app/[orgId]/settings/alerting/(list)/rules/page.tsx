import AlertingRulesTable from "@app/components/AlertingRulesTable";
import DismissableBanner from "@app/components/DismissableBanner";
import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import type { ListAlertRulesResponse } from "@server/routers/alertRule/types";
import { AxiosResponse } from "axios";
import { BellRing } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
    title: "Alerting"
};

type AlertingRulesPageProps = {
    params: Promise<{ orgId: string }>;
    searchParams: Promise<Record<string, string>>;
};

export const dynamic = "force-dynamic";

function parsePositiveInt(s: string | undefined): number | undefined {
    if (!s) return undefined;
    const n = Number(s);
    if (!Number.isInteger(n) || n <= 0) return undefined;
    return n;
}

export default async function AlertingRulesPage(props: AlertingRulesPageProps) {
    const params = await props.params;
    const searchParams = new URLSearchParams(await props.searchParams);

    const page = Math.max(1, parsePositiveInt(searchParams.get("page") ?? undefined) ?? 1);
    const pageSize = Math.max(
        1,
        parsePositiveInt(searchParams.get("pageSize") ?? undefined) ?? 20
    );
    const pageIndex = page - 1;
    const query = searchParams.get("query") ?? undefined;
    const sortBy = searchParams.get("sort_by") ?? undefined;
    const order = searchParams.get("order") ?? undefined;
    const enabled = searchParams.get("enabled");
    const enabledParam =
        enabled === "true" || enabled === "false" ? enabled : undefined;
    const siteId = parsePositiveInt(searchParams.get("siteId") ?? undefined);
    const resourceId = parsePositiveInt(
        searchParams.get("resourceId") ?? undefined
    );
    const healthCheckId = parsePositiveInt(
        searchParams.get("healthCheckId") ?? undefined
    );

    const apiSp = new URLSearchParams();
    apiSp.set("limit", String(pageSize));
    apiSp.set("offset", String(pageIndex * pageSize));
    if (query) apiSp.set("query", query);
    if (siteId != null) apiSp.set("siteId", String(siteId));
    if (resourceId != null) apiSp.set("resourceId", String(resourceId));
    if (healthCheckId != null)
        apiSp.set("healthCheckId", String(healthCheckId));
    if (sortBy) {
        apiSp.set("sort_by", sortBy);
        if (order) apiSp.set("order", order);
    }
    if (enabledParam) apiSp.set("enabled", enabledParam);

    let alertRules: ListAlertRulesResponse["alertRules"] = [];
    let pagination: ListAlertRulesResponse["pagination"] = {
        total: 0,
        limit: pageSize,
        offset: pageIndex * pageSize
    };
    try {
        const res = await internal.get<AxiosResponse<ListAlertRulesResponse>>(
            `/org/${params.orgId}/alert-rules?${apiSp.toString()}`,
            await authCookieHeader()
        );
        const responseData = res.data.data;
        alertRules = responseData.alertRules;
        pagination = responseData.pagination;
    } catch {
        // leave defaults
    }

    const t = await getTranslations();

    return (
        <div className="space-y-6">
            <DismissableBanner
                storageKey="alerting-rules-banner-dismissed"
                version={1}
                title={t("alertingRulesBannerTitle")}
                titleIcon={
                    <BellRing className="w-5 h-5 text-primary shrink-0" />
                }
                description={t("alertingRulesBannerDescription")}
            />
            <AlertingRulesTable
                orgId={params.orgId}
                alertRules={alertRules}
                rowCount={pagination.total}
            />
        </div>
    );
}
