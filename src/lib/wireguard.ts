export function generateWireGuardConfig(
    privateKey: string,
    publicKey: string,
    subnet: string,
    address: string,
    endpoint: string,
    listenPort: string | number
): string {
    const addressWithoutCidr = address.split("/")[0];
    const port = typeof listenPort === "number" ? listenPort : listenPort;

    return `[Interface]
Address = ${subnet}
ListenPort = 51820
PrivateKey = ${privateKey}

[Peer]
PublicKey = ${publicKey}
AllowedIPs = ${addressWithoutCidr}/32
Endpoint = ${endpoint}:${port}
PersistentKeepalive = 5`;
}

export function generateObfuscatedWireGuardConfig(options?: {
    subnet?: string | null;
    address?: string | null;
    endpoint?: string | null;
    listenPort?: number | string | null;
}): string {
    const obfuscate = (
        value: string | null | undefined,
        length: number = 20
    ): string => {
        return value || "•".repeat(length);
    };

    const obfuscateKey = (value: string | null | undefined): string => {
        return value || "•".repeat(44); // Base64 key length
    };

    const subnet = options?.subnet || obfuscate(null, 20);
    const subnetWithCidr = subnet.includes("•")
        ? `${subnet}/32`
        : subnet.includes("/")
          ? subnet
          : `${subnet}/32`;
    const address = options?.address
        ? options.address.split("/")[0]
        : obfuscate(null, 20);
    const endpoint = obfuscate(options?.endpoint, 20);
    const listenPort = options?.listenPort
        ? typeof options.listenPort === "number"
            ? options.listenPort
            : options.listenPort
        : 51820;

    return `[Interface]
Address = ${subnetWithCidr}
ListenPort = 51820
PrivateKey = ${obfuscateKey(null)}

[Peer]
PublicKey = ${obfuscateKey(null)}
AllowedIPs = ${address}/32
Endpoint = ${endpoint}:${listenPort}
PersistentKeepalive = 5`;
}
