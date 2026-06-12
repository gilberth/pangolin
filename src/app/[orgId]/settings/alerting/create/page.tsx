"use client";

import AlertRuleGraphEditor from "@app/components/alert-rule-editor/AlertRuleGraphEditor";
import HeaderTitle from "@app/components/SettingsSectionTitle";
import { defaultFormValues } from "@app/lib/alertRuleForm";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { usePaidStatus } from "@app/hooks/usePaidStatus";
import { tierMatrix } from "@server/lib/billing/tierMatrix";
import { useParams, useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { useEffect } from "react";

export default function NewAlertRulePage() {
    const params = useParams();
    const orgId = params.orgId as string;
    const t = useTranslations();
    const { isPaidUser } = usePaidStatus();
    const isPaid = isPaidUser(tierMatrix.alertingRules);
    const { env } = useEnvContext();
    const router = useRouter();
    const disableEnterpriseFeatures = env.flags.disableEnterpriseFeatures;

    useEffect(() => {
        if (disableEnterpriseFeatures) {
            router.replace(`/${orgId}/settings/alerting/rules`);
        }
    }, [disableEnterpriseFeatures, orgId, router]);

    if (disableEnterpriseFeatures) {
        return null;
    }

    return (
        <>
            <HeaderTitle
                title={t("alertingCreateRule")}
                description={t("alertingRuleCredenzaDescription")}
            />
            <AlertRuleGraphEditor
                orgId={orgId}
                initialValues={defaultFormValues()}
                isNew
                disabled={!isPaid}
            />
        </>
    );
}
