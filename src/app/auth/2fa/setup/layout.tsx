import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Set Up 2FA"
};

export default function TwoFactorSetupLayout({
    children
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
