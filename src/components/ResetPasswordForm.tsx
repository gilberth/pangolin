"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import {
    InputOTP,
    InputOTPGroup,
    InputOTPSlot
} from "@/components/ui/input-otp";
import { AxiosResponse } from "axios";
import {
    RequestPasswordResetBody,
    RequestPasswordResetResponse,
    ResetPasswordBody,
    ResetPasswordResponse
} from "@server/routers/auth";
import { Loader2, InfoIcon } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "./ui/alert";
import { toast } from "@app/hooks/useToast";
import { useRouter } from "next/navigation";
import { formatAxiosError } from "@app/lib/api";
import { createApiClient } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { REGEXP_ONLY_DIGITS_AND_CHARS } from "input-otp";
import { passwordSchema } from "@server/auth/passwordSchema";
import { cleanRedirect } from "@app/lib/cleanRedirect";
import { useTranslations } from "next-intl";

const requestSchema = z.object({
    email: z.email()
});

export type ResetPasswordFormProps = {
    emailParam?: string;
    tokenParam?: string;
    redirect?: string;
    quickstart?: boolean;
};

export default function ResetPasswordForm({
    emailParam,
    tokenParam,
    redirect,
    quickstart
}: ResetPasswordFormProps) {
    const router = useRouter();

    const [error, setError] = useState<string | null>(null);
    const [successMessage, setSuccessMessage] = useState<string | null>(null);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const t = useTranslations();

    function getState() {
        if (emailParam && !tokenParam) {
            return "request";
        }

        if (emailParam && tokenParam) {
            return "reset";
        }

        return "request";
    }

    const [state, setState] = useState<"request" | "reset" | "mfa">(getState());

    const { env } = useEnvContext();
    const api = createApiClient({ env });

    const formSchema = z
        .object({
            email: z.email({ message: t("emailInvalid") }),
            token: z.string().min(8, { message: t("tokenInvalid") }),
            password: passwordSchema,
            confirmPassword: passwordSchema
        })
        .refine((data) => data.password === data.confirmPassword, {
            path: ["confirmPassword"],
            message: t("passwordNotMatch")
        });

    const mfaSchema = z.object({
        code: z.string().length(6, { message: t("pincodeInvalid") })
    });

    const form = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            email: emailParam || "",
            token: tokenParam || "",
            password: "",
            confirmPassword: ""
        }
    });

    const mfaForm = useForm({
        resolver: zodResolver(mfaSchema),
        defaultValues: {
            code: ""
        }
    });

    const requestForm = useForm({
        resolver: zodResolver(requestSchema),
        defaultValues: {
            email: emailParam || ""
        }
    });

    async function onRequest(data: z.infer<typeof requestSchema>) {
        const { email } = data;

        setIsSubmitting(true);

        const res = await api
            .post<AxiosResponse<RequestPasswordResetResponse>>(
                "/auth/reset-password/request",
                {
                    email
                } as RequestPasswordResetBody
            )
            .catch((e) => {
                setError(formatAxiosError(e, t("errorOccurred")));
                console.error(t("passwordErrorRequestReset"), e);
                setIsSubmitting(false);
            });

        if (res && res.data?.data) {
            setError(null);
            setState("reset");
            setIsSubmitting(false);
            form.setValue("email", email);
        }
    }

    async function onReset(data: any) {
        setIsSubmitting(true);

        const { password, email, token } = form.getValues();
        const { code } = mfaForm.getValues();

        const res = await api
            .post<AxiosResponse<ResetPasswordResponse>>(
                "/auth/reset-password",
                {
                    email,
                    token,
                    newPassword: password,
                    code
                } as ResetPasswordBody
            )
            .catch((e) => {
                setError(formatAxiosError(e, t("errorOccurred")));
                console.error(t("passwordErrorReset"), e);
                setIsSubmitting(false);
            });

        console.log(res);

        if (res) {
            setError(null);

            if (res.data.data?.codeRequested) {
                setState("mfa");
                setIsSubmitting(false);
                mfaForm.reset();
                return;
            }

            setSuccessMessage(
                quickstart
                    ? t("accountSetupSuccess")
                    : t("passwordResetSuccess")
            );

            // Auto-login after successful password reset
            try {
                const loginRes = await api.post("/auth/login", {
                    email: form.getValues("email"),
                    password: form.getValues("password")
                });

                if (loginRes.data.data?.codeRequested) {
                    if (redirect) {
                        router.push(`/auth/login?redirect=${redirect}`);
                    } else {
                        router.push("/auth/login");
                    }
                    return;
                }

                if (loginRes.data.data?.emailVerificationRequired) {
                    try {
                        await api.post("/auth/verify-email/request");
                    } catch (verificationError) {
                        console.error(
                            "Failed to send verification code:",
                            verificationError
                        );
                    }

                    if (redirect) {
                        router.push(`/auth/verify-email?redirect=${redirect}`);
                    } else {
                        router.push("/auth/verify-email");
                    }
                    return;
                }

                // Login successful, redirect
                setTimeout(() => {
                    if (redirect) {
                        const safe = cleanRedirect(redirect);
                        router.push(safe);
                    } else {
                        router.push("/");
                    }
                    setIsSubmitting(false);
                }, 1500);
            } catch (loginError) {
                // Auto-login failed, but password reset was successful
                console.error("Auto-login failed:", loginError);
                setTimeout(() => {
                    if (redirect) {
                        const safe = cleanRedirect(redirect);
                        router.push(safe);
                    } else {
                        router.push("/login");
                    }
                    setIsSubmitting(false);
                }, 1500);
            }
        }
    }

    return (
        <div>
            <Card className="w-full max-w-md">
                <CardHeader>
                    <CardTitle>
                        {quickstart
                            ? t("completeAccountSetup")
                            : t("passwordReset")}
                    </CardTitle>
                    <CardDescription>
                        {quickstart
                            ? t("completeAccountSetupDescription")
                            : t("passwordResetDescription")}
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="space-y-4">
                        {state === "request" && (
                            <>
                                {!env.email.emailEnabled && (
                                    <Alert variant="neutral">
                                        <InfoIcon className="h-4 w-4" />
                                        <AlertTitle className="font-semibold">
                                            {t("passwordResetSmtpRequired")}
                                        </AlertTitle>
                                        <AlertDescription>
                                            {t(
                                                "passwordResetSmtpRequiredDescription"
                                            )}
                                        </AlertDescription>
                                    </Alert>
                                )}
                                {env.email.emailEnabled && (
                                    <Form {...requestForm}>
                                        <form
                                            onSubmit={requestForm.handleSubmit(
                                                onRequest
                                            )}
                                            className="space-y-4"
                                            id="form"
                                        >
                                            <FormField
                                                control={requestForm.control}
                                                name="email"
                                                render={({ field }) => (
                                                    <FormItem>
                                                        <FormLabel>
                                                            {t("email")}
                                                        </FormLabel>
                                                        <FormControl>
                                                            <Input {...field} />
                                                        </FormControl>
                                                        <FormMessage />
                                                        <FormDescription>
                                                            {quickstart
                                                                ? t(
                                                                      "accountSetupSent"
                                                                  )
                                                                : t(
                                                                      "passwordResetSent"
                                                                  )}
                                                        </FormDescription>
                                                    </FormItem>
                                                )}
                                            />
                                        </form>
                                    </Form>
                                )}
                            </>
                        )}

                        {state === "reset" && (
                            <Form {...form}>
                                <form
                                    onSubmit={form.handleSubmit(onReset)}
                                    className="space-y-4"
                                    id="form"
                                >
                                    <FormField
                                        control={form.control}
                                        name="email"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    {t("email")}
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        {...field}
                                                        disabled={
                                                            env.email
                                                                .emailEnabled
                                                        }
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />

                                    {!tokenParam && (
                                        <FormField
                                            control={form.control}
                                            name="token"
                                            render={({ field }) => (
                                                <FormItem>
                                                    <FormLabel>
                                                        {quickstart
                                                            ? t(
                                                                  "accountSetupCode"
                                                              )
                                                            : t(
                                                                  "passwordResetCode"
                                                              )}
                                                    </FormLabel>
                                                    <FormControl>
                                                        <Input
                                                            type="password"
                                                            {...field}
                                                        />
                                                    </FormControl>
                                                    <FormMessage />
                                                    {env.email.emailEnabled && (
                                                        <FormDescription>
                                                            {quickstart
                                                                ? t(
                                                                      "accountSetupCodeDescription"
                                                                  )
                                                                : t(
                                                                      "passwordResetCodeDescription"
                                                                  )}
                                                        </FormDescription>
                                                    )}
                                                </FormItem>
                                            )}
                                        />
                                    )}

                                    <FormField
                                        control={form.control}
                                        name="password"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    {quickstart
                                                        ? t("passwordCreate")
                                                        : t("passwordNew")}
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="password"
                                                        {...field}
                                                    />
                                                </FormControl>
                                                <FormMessage />
                                            </FormItem>
                                        )}
                                    />
                                    <FormField
                                        control={form.control}
                                        name="confirmPassword"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    {quickstart
                                                        ? t(
                                                              "passwordCreateConfirm"
                                                          )
                                                        : t(
                                                              "passwordNewConfirm"
                                                          )}
                                                </FormLabel>
                                                <FormControl>
                                                    <Input
                                                        type="password"
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

                        {state === "mfa" && (
                            <Form {...mfaForm}>
                                <form
                                    onSubmit={mfaForm.handleSubmit(onReset)}
                                    className="space-y-4"
                                    id="form"
                                >
                                    <FormField
                                        control={mfaForm.control}
                                        name="code"
                                        render={({ field }) => (
                                            <FormItem>
                                                <FormLabel>
                                                    {t("pincodeAuth")}
                                                </FormLabel>
                                                <FormControl>
                                                    <div className="flex justify-center">
                                                        <InputOTP
                                                            maxLength={6}
                                                            {...field}
                                                            pattern={
                                                                REGEXP_ONLY_DIGITS_AND_CHARS
                                                            }
                                                        >
                                                            <InputOTPGroup>
                                                                <InputOTPSlot
                                                                    index={0}
                                                                />
                                                                <InputOTPSlot
                                                                    index={1}
                                                                />
                                                                <InputOTPSlot
                                                                    index={2}
                                                                />
                                                                <InputOTPSlot
                                                                    index={3}
                                                                />
                                                                <InputOTPSlot
                                                                    index={4}
                                                                />
                                                                <InputOTPSlot
                                                                    index={5}
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
                        )}

                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}

                        {successMessage && (
                            <Alert variant="success">
                                <AlertDescription>
                                    {successMessage}
                                </AlertDescription>
                            </Alert>
                        )}

                        <div className="space-y-4">
                            {(state === "reset" || state === "mfa") && (
                                <Button
                                    type="submit"
                                    form="form"
                                    className="w-full"
                                    disabled={isSubmitting}
                                >
                                    {isSubmitting && (
                                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                    )}
                                    {state === "reset"
                                        ? quickstart
                                            ? t("completeSetup")
                                            : t("passwordReset")
                                        : t("pincodeSubmit2")}
                                </Button>
                            )}

                            {state === "request" && (
                                <div className="flex flex-col gap-4">
                                    {env.email.emailEnabled && (
                                        <Button
                                            type="submit"
                                            form="form"
                                            className="w-full"
                                            disabled={isSubmitting}
                                        >
                                            {isSubmitting && (
                                                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                                            )}
                                            {quickstart
                                                ? t("accountSetupSubmit")
                                                : t("passwordResetSubmit")}
                                        </Button>
                                    )}
                                    <Button
                                        type="button"
                                        variant="outline"
                                        className="w-full"
                                        onClick={() => {
                                            const email =
                                                requestForm.getValues("email");
                                            if (email) {
                                                form.setValue("email", email);
                                            }
                                            setState("reset");
                                        }}
                                    >
                                        {t("passwordResetAlreadyHaveCode")}
                                    </Button>
                                </div>
                            )}

                            {state === "mfa" && (
                                <Button
                                    type="button"
                                    className="w-full"
                                    variant="outline"
                                    onClick={() => {
                                        setState("reset");
                                        mfaForm.reset();
                                    }}
                                >
                                    {t("passwordBack")}
                                </Button>
                            )}

                            {(state === "mfa" || state === "reset") && (
                                <Button
                                    type="button"
                                    className="w-full"
                                    variant="outline"
                                    onClick={() => {
                                        setState("request");
                                        form.reset();
                                    }}
                                >
                                    {t("backToEmail")}
                                </Button>
                            )}
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}
