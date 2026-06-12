import { verifySession } from "@app/lib/auth/verifySession";
import { redirect } from "next/navigation";
import { build } from "@server/build";
import { cache } from "react";
import DeleteAccountClient from "./DeleteAccountClient";
import { getTranslations } from "next-intl/server";
import { getUserDisplayName } from "@app/lib/getUserDisplayName";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Delete Account"
};

export const dynamic = "force-dynamic";

export default async function DeleteAccountPage() {
    const getUser = cache(verifySession);
    const user = await getUser({ skipCheckVerifyEmail: true });

    if (!user) {
        redirect("/auth/login");
    }

    const t = await getTranslations();
    const displayName = getUserDisplayName({ user });

    return (
        <div className="space-y-4">
            <h1 className="text-xl font-semibold">{t("deleteAccount")}</h1>
            <DeleteAccountClient displayName={displayName} />
        </div>
    );
}
