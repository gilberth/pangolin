export type SiteProvisioningKeyListItem = {
    siteProvisioningKeyId: string;
    orgId: string;
    lastChars: string;
    createdAt: string;
    name: string;
    lastUsed: string | null;
    maxBatchSize: number | null;
    numUsed: number;
    validUntil: string | null;
    approveNewSites: boolean;
};

export type ListSiteProvisioningKeysResponse = {
    siteProvisioningKeys: SiteProvisioningKeyListItem[];
    pagination: { total: number; limit: number; offset: number };
};

export type CreateSiteProvisioningKeyResponse = {
    siteProvisioningKeyId: string;
    orgId: string;
    name: string;
    siteProvisioningKey: string;
    lastChars: string;
    createdAt: string;
    lastUsed: string | null;
    maxBatchSize: number | null;
    numUsed: number;
    validUntil: string | null;
    approveNewSites: boolean;
};

export type UpdateSiteProvisioningKeyResponse = {
    siteProvisioningKeyId: string;
    orgId: string;
    name: string;
    lastChars: string;
    createdAt: string;
    lastUsed: string | null;
    maxBatchSize: number | null;
    numUsed: number;
    validUntil: string | null;
    approveNewSites: boolean;
};
