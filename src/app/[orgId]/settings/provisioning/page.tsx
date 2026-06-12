import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
    title: "Provisioning"
};

type ProvisioningPageProps = {
    params: Promise<{ orgId: string }>;
};

export default async function ProvisioningPage(props: ProvisioningPageProps) {
    const params = await props.params;
    redirect(`/${params.orgId}/settings/provisioning/keys`);
}
