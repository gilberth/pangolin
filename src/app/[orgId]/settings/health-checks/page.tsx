import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
    title: "Health Checks"
};

type LegacyHealthChecksPageProps = {
    params: Promise<{ orgId: string }>;
};

/** @deprecated Use `/settings/alerting/health-checks` */
export default async function LegacyHealthChecksRedirect(
    props: LegacyHealthChecksPageProps
) {
    const params = await props.params;
    redirect(`/${params.orgId}/settings/alerting/health-checks`);
}
