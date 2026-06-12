export type GetCertificateResponse = {
    certId: number;
    domain: string;
    domainId: string;
    wildcard: boolean;
    domainType: string;
    status: string; // pending, requested, valid, expired, failed
    expiresAt: string | null;
    lastRenewalAttempt: Date | null;
    createdAt: number;
    updatedAt: number;
    errorMessage?: string | null;
    renewalCount: number;
};