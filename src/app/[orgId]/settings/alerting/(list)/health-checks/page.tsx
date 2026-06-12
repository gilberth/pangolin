import HealthChecksTable from "@app/components/HealthChecksTable";
import DismissableBanner from "@app/components/DismissableBanner";
import { internal } from "@app/lib/api";
import { authCookieHeader } from "@app/lib/api/cookies";
import { ListHealthChecksResponse } from "@server/routers/healthChecks/types";
import { GetResourceResponse } from "@server/routers/resource/getResource";
import { GetSiteResponse } from "@server/routers/site/getSite";
import type ResponseT from "@server/types/Response";
import { HeartPulse } from "lucide-react";
import type { Metadata } from "next";
import { getTranslations } from "next-intl/server";

export const metadata: Metadata = {
    title: "Health Checks"
};

type AlertingHealthChecksPageProps = {
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

function appendListFilters(
    apiSp: URLSearchParams,
    searchParams: URLSearchParams
) {
    const query = searchParams.get("query");
    if (query) apiSp.set("query", query);

    const hcMode = searchParams.get("hcMode");
    if (
        hcMode === "http" ||
        hcMode === "tcp" ||
        hcMode === "snmp" ||
        hcMode === "ping"
    ) {
        apiSp.set("hcMode", hcMode);
    }

    const hcHealth = searchParams.get("hcHealth");
    if (
        hcHealth === "healthy" ||
        hcHealth === "unhealthy" ||
        hcHealth === "unknown"
    ) {
        apiSp.set("hcHealth", hcHealth);
    }

    const hcEnabled = searchParams.get("hcEnabled");
    if (hcEnabled === "true" || hcEnabled === "false") {
        apiSp.set("hcEnabled", hcEnabled);
    }

    const siteId = parsePositiveInt(searchParams.get("siteId") ?? undefined);
    if (siteId) {
        apiSp.set("siteId", String(siteId));
    }

    const resourceId = parsePositiveInt(
        searchParams.get("resourceId") ?? undefined
    );
    if (resourceId) {
        apiSp.set("resourceId", String(resourceId));
    }
}

export default async function AlertingHealthChecksPage(
    props: AlertingHealthChecksPageProps
) {
    const params = await props.params;
    const searchParams = new URLSearchParams(await props.searchParams);

    const page = Math.max(
        1,
        parsePositiveInt(searchParams.get("page") ?? undefined) ?? 1
    );
    const pageSize = Math.max(
        1,
        parsePositiveInt(searchParams.get("pageSize") ?? undefined) ?? 20
    );
    const pageIndex = page - 1;

    const apiSp = new URLSearchParams();
    apiSp.set("limit", String(pageSize));
    apiSp.set("offset", String(pageIndex * pageSize));
    appendListFilters(apiSp, searchParams);

    let healthChecks: ListHealthChecksResponse["healthChecks"] = [];
    let pagination: ListHealthChecksResponse["pagination"] = {
        total: 0,
        limit: pageSize,
        offset: pageIndex * pageSize
    };

    const siteIdParam = parsePositiveInt(
        searchParams.get("siteId") ?? undefined
    );
    const resourceIdParam = parsePositiveInt(
        searchParams.get("resourceId") ?? undefined
    );

    const header = await authCookieHeader();

    try {
        const res = await internal.get(
            `/org/${params.orgId}/health-checks?${apiSp.toString()}`,
            header
        );
        const responseData = (res.data as ResponseT<ListHealthChecksResponse>)
            .data;
        if (responseData) {
            healthChecks = responseData.healthChecks;
            pagination = responseData.pagination;
        }
    } catch {
        // leave defaults
    }

    let initialFilterSite: {
        siteId: number;
        name: string;
        type: string;
    } | null = null;
    if (siteIdParam) {
        try {
            const siteRes = await internal.get(`/site/${siteIdParam}`, header);
            const s = (siteRes.data as ResponseT<GetSiteResponse>).data;
            if (s && s.orgId === params.orgId) {
                initialFilterSite = {
                    siteId: s.siteId,
                    name: s.name,
                    type: s.type
                };
            }
        } catch {
            // leave null
        }
    }

    let initialFilterResource: {
        name: string;
        resourceId: number;
        fullDomain: string | null;
        niceId: string;
        ssl: boolean;
        wildcard: boolean;
    } | null = null;
    if (resourceIdParam) {
        try {
            const resourceRes = await internal.get(
                `/resource/${resourceIdParam}`,
                header
            );
            const r = (resourceRes.data as ResponseT<GetResourceResponse>).data;
            if (r && r.orgId === params.orgId) {
                initialFilterResource = {
                    name: r.name,
                    resourceId: r.resourceId,
                    fullDomain: r.fullDomain,
                    niceId: r.niceId,
                    ssl: r.ssl,
                    wildcard: r.wildcard
                };
            }
        } catch {
            // leave null
        }
    }

    const t = await getTranslations();

    return (
        <div className="space-y-6">
            <DismissableBanner
                storageKey="alerting-health-checks-banner-dismissed"
                version={1}
                title={t("alertingHealthChecksBannerTitle")}
                titleIcon={
                    <HeartPulse className="w-5 h-5 text-primary shrink-0" />
                }
                description={t("alertingHealthChecksBannerDescription")}
            />
            <HealthChecksTable
                orgId={params.orgId}
                healthChecks={healthChecks}
                rowCount={pagination.total}
                pagination={{
                    pageIndex,
                    pageSize
                }}
                initialFilterSite={initialFilterSite}
                initialFilterResource={initialFilterResource}
            />
        </div>
    );
}
