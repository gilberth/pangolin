"use client";

import { useState, useCallback, useEffect } from "react";
import { AxiosResponse } from "axios";
import { GetCertificateResponse } from "@server/routers/certificates/types";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";

type UseCertificateProps = {
    orgId: string;
    domainId: string;
    fullDomain: string;
    autoFetch?: boolean;
    polling?: boolean;
    pollingInterval?: number;
};

type UseCertificateReturn = {
    cert: GetCertificateResponse | null;
    certLoading: boolean;
    certError: string | null;
    refreshing: boolean;
    fetchCert: (showLoading?: boolean) => Promise<void>;
    refreshCert: () => Promise<void>;
    clearCert: () => void;
};

export function useCertificate({
    orgId,
    domainId,
    fullDomain,
    autoFetch = true,
    polling = false,
    pollingInterval = 5000
}: UseCertificateProps): UseCertificateReturn {
    const api = createApiClient(useEnvContext());

    const [cert, setCert] = useState<GetCertificateResponse | null>(null);
    const [certLoading, setCertLoading] = useState(false);
    const [certError, setCertError] = useState<string | null>(null);
    const [refreshing, setRefreshing] = useState(false);

    const fetchCert = useCallback(
        async (showLoading = true) => {
            if (!orgId || !domainId || !fullDomain) return;

            if (showLoading) {
                setCertLoading(true);
            }
            try {
                const res = await api.get<
                    AxiosResponse<GetCertificateResponse>
                >(`/org/${orgId}/certificate/${domainId}/${fullDomain}`);
                const certData = res.data.data;
                if (certData) {
                    setCertError(null);
                    setCert(certData);
                }
            } catch (error: any) {
                console.error("Failed to fetch certificate:", error);
                setCertError("Failed");
            } finally {
                if (showLoading) {
                    setCertLoading(false);
                }
            }
        },
        [api, orgId, domainId, fullDomain]
    );

    const refreshCert = useCallback(async () => {
        if (!cert) return;

        setRefreshing(true);
        setCertError(null);
        try {
            await api.post(
                `/org/${orgId}/certificate/${cert.certId}/restart`,
                {}
            );
            // Update status to pending
            setTimeout(() => {
                setCert({ ...cert, status: "pending" });
            }, 500);
        } catch (error: any) {
            console.error("Failed to restart certificate:", error);
            setCertError("Failed to restart");
        } finally {
            setRefreshing(false);
        }
    }, [api, orgId, cert]);

    const clearCert = useCallback(() => {
        setCert(null);
        setCertError(null);
    }, []);

    // Auto-fetch on mount if enabled
    useEffect(() => {
        if (autoFetch && orgId && domainId && fullDomain) {
            fetchCert();
        }
    }, [autoFetch, orgId, domainId, fullDomain, fetchCert]);

    useEffect(() => {
        if (!polling || !orgId || !domainId || !fullDomain) return;

        const POLL_JITTER_MS = 1000;
        let cancelled = false;
        let timeoutId: ReturnType<typeof setTimeout>;

        const scheduleNext = () => {
            const jitter = (Math.random() * 2 - 1) * POLL_JITTER_MS;
            const delayMs = Math.max(
                1000,
                Math.round(pollingInterval + jitter)
            );

            timeoutId = setTimeout(() => {
                if (cancelled) return;
                void fetchCert(false);
                scheduleNext();
            }, delayMs);
        };

        scheduleNext();

        return () => {
            cancelled = true;
            clearTimeout(timeoutId);
        };
    }, [polling, orgId, domainId, fullDomain, pollingInterval, fetchCert]);

    return {
        cert,
        certLoading,
        certError,
        refreshing,
        fetchCert,
        refreshCert,
        clearCert
    };
}
