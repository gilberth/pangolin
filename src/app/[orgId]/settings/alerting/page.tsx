import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
    title: "Alerting"
};

type AlertingIndexPageProps = {
    params: Promise<{ orgId: string }>;
};

export default async function AlertingIndexPage(props: AlertingIndexPageProps) {
    const params = await props.params;
    redirect(`/${params.orgId}/settings/alerting/rules`);
}
