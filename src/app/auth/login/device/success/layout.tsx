import type { Metadata } from "next";

export const metadata: Metadata = {
    title: "Device Authorized"
};

export default function DeviceAuthSuccessLayout({
    children
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
