"use client";

import AlertRuleGraphEditor from "@app/components/alert-rule-editor/AlertRuleGraphEditor";
import HeaderTitle from "@app/components/SettingsSectionTitle";
import { apiResponseToFormValues } from "@app/lib/alertRuleForm";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { toast } from "@app/hooks/useToast";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";
import type { AxiosResponse } from "axios";
import type { GetAlertRuleResponse } from "@server/routers/alertRule/types";
import type { AlertRuleFormValues } from "@app/lib/alertRuleForm";

export default function EditAlertRulePage() {
    const t = useTranslations();
    const params = useParams();
    const router = useRouter();
    const orgId = params.orgId as string;
    const ruleIdParam = params.ruleId as string;
    const alertRuleId = parseInt(ruleIdParam, 10);

    const api = createApiClient(useEnvContext());
    const { isPaidUser } = usePaidStatus();
    const isPaid = isPaidUser(tierMatrix.alertingRules);

    const [formValues, setFormValues] = useState<
        AlertRuleFormValues | null | undefined
    >(undefined);

    useEffect(() => {
        if (isNaN(alertRuleId)) {
            router.replace(`/${orgId}/settings/alerting/rules`);
            return;
        }

        api.get<AxiosResponse<GetAlertRuleResponse>>(
            `/org/${orgId}/alert-rule/${alertRuleId}`
        )
            .then((res) => {
                const rule = res.data.data;
                setFormValues(apiResponseToFormValues(rule));
            })
            .catch((e) => {
                toast({
                    title: t("error"),
                    description: formatAxiosError(e),
                    variant: "destructive"
                });
                setFormValues(null);
            });
    }, [orgId, alertRuleId]);

    useEffect(() => {
        if (formValues === null) {
            router.replace(`/${orgId}/settings/alerting/rules`);
        }
    }, [formValues, orgId, router]);

    if (formValues === undefined) {
        return (
            <>
                <HeaderTitle
                    title={t("alertingEditRule")}
                    description={t("alertingRuleCredenzaDescription")}
                />
            </>
        );
    }

    if (formValues === null) {
        return null;
    }

    return (
        <>
            <HeaderTitle
                title={t("alertingEditRule")}
                description={t("alertingRuleCredenzaDescription")}
            />
            <AlertRuleGraphEditor
                key={alertRuleId}
                orgId={orgId}
                alertRuleId={alertRuleId}
                initialValues={formValues}
                isNew={false}
                disabled={!isPaid}
            />
        </>
    );
}
