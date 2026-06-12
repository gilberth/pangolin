"use client";

import { useState, useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { formatAxiosError } from "@app/lib/api";
import { toast } from "@app/hooks/useToast";
import { useTranslations } from "next-intl";
import { Button } from "@app/components/ui/button";
import {
    Credenza,
    CredenzaBody,
    CredenzaClose,
    CredenzaContent,
    CredenzaFooter,
    CredenzaHeader,
    CredenzaTitle
} from "@app/components/Credenza";
import {
    Form,
    FormControl,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@app/components/ui/form";
import { Input } from "@app/components/ui/input";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot
} from "@app/components/ui/input-otp";
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp";
import type {
    DeleteMyAccountPreviewResponse,
    DeleteMyAccountCodeRequestedResponse,
    DeleteMyAccountSuccessResponse
} from "@server/routers/auth/deleteMyAccount";
import { AxiosResponse } from "axios";

type DeleteAccountConfirmDialogProps = {
    open: boolean;
    setOpen: (open: boolean) => void;
};

export default function DeleteAccountConfirmDialog({
    open,
    setOpen
}: DeleteAccountConfirmDialogProps) {
    const { env } = useEnvContext();
    const api = createApiClient({ env });
    const router = useRouter();
    const t = useTranslations();

    const passwordSchema = useMemo(
        () =>
            z.object({
                password: z.string().min(1, { message: t("passwordRequired") })
            }),
        [t]
    );

    const codeSchema = useMemo(
        () =>
            z.object({
                code: z.string().length(6, { message: t("pincodeInvalid") })
            }),
        [t]
    );

    const [step, setStep] = useState<0 | 1 | 2>(0);
    const [loading, setLoading] = useState(false);
    const [loadingPreview, setLoadingPreview] = useState(false);
    const [preview, setPreview] =
        useState<DeleteMyAccountPreviewResponse | null>(null);
    const [passwordValue, setPasswordValue] = useState("");

    const passwordForm = useForm<z.infer<typeof passwordSchema>>({
        resolver: zodResolver(passwordSchema),
        defaultValues: { password: "" }
    });

    const codeForm = useForm<z.infer<typeof codeSchema>>({
        resolver: zodResolver(codeSchema),
        defaultValues: { code: "" }
    });

    useEffect(() => {
        if (open && step === 0 && !preview) {
            setLoadingPreview(true);
            api.post<AxiosResponse<DeleteMyAccountPreviewResponse>>(
                "/auth/delete-my-account",
                {}
            )
                .then((res) => {
                    if (res.data?.data?.preview) {
                        setPreview(res.data.data);
                    }
                })
                .catch((err) => {
                    toast({
                        variant: "destructive",
                        title: t("deleteAccountError"),
                        description: formatAxiosError(
                            err,
                            t("deleteAccountError")
                        )
                    });
                    setOpen(false);
                })
                .finally(() => setLoadingPreview(false));
        }
    }, [open, step, preview, api, setOpen, t]);

    function reset() {
        setStep(0);
        setPreview(null);
        setPasswordValue("");
        passwordForm.reset();
        codeForm.reset();
    }

    async function handleContinueToPassword() {
        setStep(1);
    }

    async function handlePasswordSubmit(
        values: z.infer<typeof passwordSchema>
    ) {
        setLoading(true);
        setPasswordValue(values.password);
        try {
            const res = await api.post<
                | AxiosResponse<DeleteMyAccountCodeRequestedResponse>
                | AxiosResponse<DeleteMyAccountSuccessResponse>
            >("/auth/delete-my-account", { password: values.password });

            const data = res.data?.data;

            if (data && "codeRequested" in data && data.codeRequested) {
                setStep(2);
            } else if (data && "success" in data && data.success) {
                toast({
                    title: t("deleteAccountSuccess"),
                    description: t("deleteAccountSuccessMessage")
                });
                setOpen(false);
                reset();
                router.push("/auth/login");
                router.refresh();
            }
        } catch (err) {
            toast({
                variant: "destructive",
                title: t("deleteAccountError"),
                description: formatAxiosError(err, t("deleteAccountError"))
            });
        } finally {
            setLoading(false);
        }
    }

    async function handleCodeSubmit(values: z.infer<typeof codeSchema>) {
        setLoading(true);
        try {
            const res = await api.post<
                AxiosResponse<DeleteMyAccountSuccessResponse>
            >("/auth/delete-my-account", {
                password: passwordValue,
                code: values.code
            });

            if (res.data?.data?.success) {
                toast({
                    title: t("deleteAccountSuccess"),
                    description: t("deleteAccountSuccessMessage")
                });
                setOpen(false);
                reset();
                router.push("/auth/login");
                router.refresh();
            }
        } catch (err) {
            toast({
                variant: "destructive",
                title: t("deleteAccountError"),
                description: formatAxiosError(err, t("deleteAccountError"))
            });
        } finally {
            setLoading(false);
        }
    }

    return (
        <Credenza
            open={open}
            onOpenChange={(val) => {
                setOpen(val);
                if (!val) reset();
            }}
        >
            <CredenzaContent>
                <CredenzaHeader>
                    <CredenzaTitle>
                        {t("deleteAccountConfirmTitle")}
                    </CredenzaTitle>
                </CredenzaHeader>
                <CredenzaBody>
                    <div className="space-y-4">
                        {step === 0 && (
                            <>
                                {loadingPreview ? (
                                    <p className="text-sm text-muted-foreground">
                                        {t("loading")}...
                                    </p>
                                ) : preview ? (
                                    <>
                                        <p className="text-sm text-muted-foreground">
                                            {t("deleteAccountConfirmMessage")}
                                        </p>
                                        <div className="rounded-md bg-muted p-3 space-y-2">
                                            <p className="text-sm font-medium">
                                                {t(
                                                    "deleteAccountPreviewAccount"
                                                )}
                                            </p>
                                            {preview.orgs.length > 0 && (
                                                <>
                                                    <p className="text-sm font-medium mt-2">
                                                        {t(
                                                            "deleteAccountPreviewOrgs"
                                                        )}
                                                    </p>
                                                    <ul className="list-disc list-inside text-sm text-muted-foreground space-y-1">
                                                        {preview.orgs.map(
                                                            (org) => (
                                                                <li
                                                                    key={
                                                                        org.orgId
                                                                    }
                                                                >
                                                                    {org.name ||
                                                                        org.orgId}
                                                                </li>
                                                            )
                                                        )}
                                                    </ul>
                                                </>
                                            )}
                                        </div>
                                        <p className="text-sm font-semibold text-destructive">
                                            {t("cannotbeUndone")}
                                        </p>
                                    </>
                                ) : null}
                            </>
                        )}

                        {step === 1 && (
                            <Form {...passwordForm}>
                                <form
                                    id="delete-account-password-form"
                                    onSubmit={passwordForm.handleSubmit(
                                        handlePasswordSubmit
                                    )}
                                    className="space-y-4"
                                >
                                    <FormField
                                        control={passwordForm.control}
                                        name="password"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    {t("password")}
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="password"
                                                        autoComplete="current-password"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                </form>
                            </Form>
                        )}

                        {step === 2 && (
                            <div className="space-y-4">
                                <div className="text-center">
                                    <p className="text-sm text-muted-foreground">
                                        {t("otpAuthDescription")}
                                    </p>
                                </div>
                                <Form {...codeForm}>
                                    <form
                                        id="delete-account-code-form"
                                        onSubmit={codeForm.handleSubmit(
                                            handleCodeSubmit
                                        )}
                                        className="space-y-4"
                                    >
                                        <FormField
                                            control={codeForm.control}
                                            name="code"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormControl>
                                                        <div className="flex justify-center">
                                                            <InputOTP
                                                                maxLength={6}
                                                                {...field}
                                                                pattern={
                                                                    REGEXP_ONLY_DIGITS_AND_CHARS
                                                                }
                                                                onChange={(
                                                                    value: string
                                                                ) => {
                                                                    field.onChange(
                                                                        value
                                                                    );
                                                                }}
                                                            >
                                                                <InputOTPGroup>
                                                                    <InputOTPSlot
                                                                        index={
                                                                            0
                                                                        }
                                                                    />
                                                                    <InputOTPSlot
                                                                        index={
                                                                            1
                                                                        }
                                                                    />
                                                                    <InputOTPSlot
                                                                        index={
                                                                            2
                                                                        }
                                                                    />
                                                                    <InputOTPSlot
                                                                        index={
                                                                            3
                                                                        }
                                                                    />
                                                                    <InputOTPSlot
                                                                        index={
                                                                            4
                                                                        }
                                                                    />
                                                                    <InputOTPSlot
                                                                        index={
                                                                            5
                                                                        }
                                                                    />
                                                                </InputOTPGroup>
                                                            </InputOTP>
                                                        </div>
                                                    </FormControl>
                                                    <FormMessage />
                                                </FormItem>
                                            )}
                                        />
                                    </form>
                                </Form>
                            </div>
                        )}
                    </div>
                </CredenzaBody>
                <CredenzaFooter>
                    <CredenzaClose asChild>
                        <Button variant="outline">{t("close")}</Button>
                    </CredenzaClose>
                    {step === 0 && preview && !loadingPreview && (
                        <Button
                            variant="destructive"
                            onClick={handleContinueToPassword}
                        >
                            {t("continue")}
                        </Button>
                    )}
                    {step === 1 && (
                        <Button
                            variant="destructive"
                            type="submit"
                            form="delete-account-password-form"
                            loading={loading}
                            disabled={loading}
                        >
                            {t("deleteAccountButton")}
                        </Button>
                    )}
                    {step === 2 && (
                        <Button
                            variant="destructive"
                            type="submit"
                            form="delete-account-code-form"
                            loading={loading}
                            disabled={loading}
                        >
                            {t("deleteAccountButton")}
                        </Button>
                    )}
                </CredenzaFooter>
            </CredenzaContent>
        </Credenza>
    );
}
