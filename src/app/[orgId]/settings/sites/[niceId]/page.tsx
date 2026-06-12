import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
    title: "Site"
};

export default async function SitePage(props: {
    params: Promise<{ orgId: string; niceId: string }>;
}) {
    const params = await props.params;
    redirect(`/${params.orgId}/settings/sites/${params.niceId}/general`);
}
