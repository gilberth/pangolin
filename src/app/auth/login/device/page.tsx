import { verifySession } from "@app/lib/auth/verifySession";
import { redirect } from "next/navigation";
import DeviceLoginForm from "@/components/DeviceLoginForm";
import { getUserDisplayName } from "@app/lib/getUserDisplayName";
import { cache } from "react";
import { cleanRedirect } from "@app/lib/cleanRedirect";
import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Authorize Device"
};

export const dynamic = "force-dynamic";

type Props = {
    searchParams: Promise<{ code?: string; user?: string; authPath?: string }>;
};

function deviceRedirectSearchParams(params: {
    code?: string;
    user?: string;
}): string {
    const search = new URLSearchParams();
    if (params.code) search.set("code", params.code);
    if (params.user) search.set("user", params.user);
    const q = search.toString();
    return q ? `?${q}` : "";
}

export default async function DeviceLoginPage({ searchParams }: Props) {
    const user = await verifySession({ forceLogin: true });

    const params = await searchParams;
    const code = params.code || "";
    const defaultUser = params.user;

    if (!user) {
        const redirectDestination = `/auth/login/device${deviceRedirectSearchParams({ code, user: params.user })}`;
        const authPath = cleanRedirect(params.authPath || "/auth/login");
        const loginUrl = new URL(authPath, "http://x");
        loginUrl.searchParams.set("forceLogin", "true");
        loginUrl.searchParams.set("redirect", redirectDestination);
        if (defaultUser) loginUrl.searchParams.set("user", defaultUser);
        redirect(loginUrl.pathname + loginUrl.search);
    }

    const userName = user
        ? getUserDisplayName({
              name: user.name,
              username: user.username
          })
        : "";

    return (
        <DeviceLoginForm
            userEmail={user?.email || ""}
            userName={userName}
            initialCode={code}
            userQueryParam={defaultUser}
        />
    );
}
