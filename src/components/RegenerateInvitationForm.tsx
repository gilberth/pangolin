import { Button } from "@app/components/ui/button";
import {
    Credenza,
    CredenzaBody,
    CredenzaClose,
    CredenzaContent,
    CredenzaDescription,
    CredenzaFooter,
    CredenzaHeader,
    CredenzaTitle
} from "@app/components/Credenza";
import { useState, useEffect } from "react";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useOrgContext } from "@app/hooks/useOrgContext";
import { toast } from "@app/hooks/useToast";
import CopyTextBox from "@app/components/CopyTextBox";
import { Checkbox } from "@app/components/ui/checkbox";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue
} from "@app/components/ui/select";
import { Label } from "@app/components/ui/label";
import { useTranslations } from "next-intl";

type RegenerateInvitationFormProps = {
    open: boolean;
    setOpen: (open: boolean) => void;
    invitation: {
        id: string;
        email: string;
        roleIds: number[];
        roleLabels: string[];
    } | null;
    onRegenerate: (updatedInvitation: {
        id: string;
        email: string;
        expiresAt: string;
        roleLabels: string[];
        roleIds: number[];
    }) => void;
};

export default function RegenerateInvitationForm({
    open,
    setOpen,
    invitation,
    onRegenerate
}: RegenerateInvitationFormProps) {
    const [loading, setLoading] = useState(false);
    const [inviteLink, setInviteLink] = useState<string | null>(null);
    const [sendEmail, setSendEmail] = useState(true);
    const [validHours, setValidHours] = useState(72);
    const api = createApiClient(useEnvContext());
    const { org } = useOrgContext();

    const t = useTranslations();

    const validForOptions = [
        { hours: 24, name: t("day", { count: 1 }) },
        { hours: 48, name: t("day", { count: 2 }) },
        { hours: 72, name: t("day", { count: 3 }) },
        { hours: 96, name: t("day", { count: 4 }) },
        { hours: 120, name: t("day", { count: 5 }) },
        { hours: 144, name: t("day", { count: 6 }) },
        { hours: 168, name: t("day", { count: 7 }) }
    ];

    useEffect(() => {
        if (open) {
            setSendEmail(true);
            setValidHours(72);
        }
    }, [open]);

    async function handleRegenerate() {
        if (!invitation) return;

        if (!org?.org.orgId) {
            toast({
                variant: "destructive",
                title: t("orgMissing"),
                description: t("orgMissingMessage"),
                duration: 5000
            });
            return;
        }

        setLoading(true);

        try {
            const res = await api.post(`/org/${org.org.orgId}/create-invite`, {
                email: invitation.email,
                roleIds: invitation.roleIds,
                validHours,
                sendEmail,
                regenerate: true
            });

            if (res.status === 200) {
                const link = res.data.data.inviteLink;
                setInviteLink(link);

                if (sendEmail) {
                    toast({
                        variant: "default",
                        title: t("inviteRegenerated"),
                        description: t("inviteSent", {
                            email: invitation.email
                        }),
                        duration: 5000
                    });
                } else {
                    toast({
                        variant: "default",
                        title: t("inviteRegenerated"),
                        description: t("inviteGenerate", {
                            email: invitation.email
                        }),
                        duration: 5000
                    });
                }

                onRegenerate({
                    id: invitation.id,
                    email: invitation.email,
                    expiresAt: new Date(
                        res.data.data.expiresAt
                    ).toISOString(),
                    roleLabels: invitation.roleLabels,
                    roleIds: invitation.roleIds
                });
            }
        } catch (error: any) {
            if (error.response?.status === 409) {
                toast({
                    variant: "destructive",
                    title: t("inviteDuplicateError"),
                    description: t("inviteDuplicateErrorDescription"),
                    duration: 5000
                });
            } else if (error.response?.status === 429) {
                toast({
                    variant: "destructive",
                    title: t("inviteRateLimitError"),
                    description: t("inviteRateLimitErrorDescription"),
                    duration: 5000
                });
            } else {
                toast({
                    variant: "destructive",
                    title: t("inviteRegenerateError"),
                    description: t("inviteRegenerateErrorDescription"),
                    duration: 5000
                });
            }
        } finally {
            setLoading(false);
        }
    }

    return (
        <Credenza
            open={open}
            onOpenChange={(isOpen) => {
                setOpen(isOpen);
                if (!isOpen) {
                    setInviteLink(null);
                }
            }}
        >
            <CredenzaContent>
                <CredenzaHeader>
                    <CredenzaTitle>{t("inviteRegenerate")}</CredenzaTitle>
                    <CredenzaDescription>
                        {t("inviteRegenerateDescription")}
                    </CredenzaDescription>
                </CredenzaHeader>
                <CredenzaBody>
                    {!inviteLink ? (
                        <div>
                            <p>
                                {t("inviteQuestionRegenerate", {
                                    email: invitation?.email || ""
                                })}
                            </p>
                            <div className="flex items-center space-x-2 mt-4">
                                <Checkbox
                                    id="send-email"
                                    checked={sendEmail}
                                    onCheckedChange={(e) =>
                                        setSendEmail(e as boolean)
                                    }
                                />
                                <label htmlFor="send-email">
                                    {t("inviteSentEmail")}
                                </label>
                            </div>
                            <div className="mt-4 space-y-2">
                                <Label>{t("inviteValidityPeriod")}</Label>
                                <Select
                                    value={validHours.toString()}
                                    onValueChange={(value) =>
                                        setValidHours(parseInt(value))
                                    }
                                >
                                    <SelectTrigger className="w-full">
                                        <SelectValue
                                            placeholder={t(
                                                "inviteValidityPeriodSelect"
                                            )}
                                        />
                                    </SelectTrigger>
                                    <SelectContent>
                                        {validForOptions.map((option) => (
                                            <SelectItem
                                                key={option.hours}
                                                value={option.hours.toString()}
                                            >
                                                {option.name}
                                            </SelectItem>
                                        ))}
                                    </SelectContent>
                                </Select>
                            </div>
                        </div>
                    ) : (
                        <div className="space-y-4 max-w-md">
                            <p>{t("inviteRegenerateMessage")}</p>
                            <CopyTextBox text={inviteLink} wrapText={false} />
                        </div>
                    )}
                </CredenzaBody>
                <CredenzaFooter>
                    {!inviteLink ? (
                        <>
                            <CredenzaClose asChild>
                                <Button variant="outline">{t("cancel")}</Button>
                            </CredenzaClose>
                            <Button
                                onClick={handleRegenerate}
                                loading={loading}
                            >
                                {t("inviteRegenerateButton")}
                            </Button>
                        </>
                    ) : (
                        <CredenzaClose asChild>
                            <Button variant="outline">{t("close")}</Button>
                        </CredenzaClose>
                    )}
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>
    );
}
