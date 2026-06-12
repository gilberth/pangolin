import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
    title: "API Key"
};

export default async function ApiKeysPage(props: {
    params: Promise<{ orgId: string; apiKeyId: string }>;
}) {
    const params = await props.params;
    redirect(
        `/${params.orgId}/settings/api-keys/${params.apiKeyId}/permissions`
    );
}
