"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
    Form,
    FormControl,
    FormDescription,
    FormField,
    FormItem,
    FormLabel,
    FormMessage
} from "@/components/ui/form";
import {
    Card,
    CardContent,
    CardDescription,
    CardHeader,
    CardTitle
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { createApiClient, formatAxiosError } from "@app/lib/api";
import { useEnvContext } from "@app/hooks/useEnvContext";
import { useTranslations } from "next-intl";
import Image from "next/image";
import { passwordSchema } from "@server/auth/passwordSchema";

const formSchema = z
    .object({
        setupToken: z.string().min(1, "Setup token is required"),
        email: z.string().email({ message: "Invalid email address" }),
        password: passwordSchema,
        confirmPassword: z.string()
    })
    .refine((data) => data.password === data.confirmPassword, {
        path: ["confirmPassword"],
        message: "Passwords do not match"
    });

export default function InitialSetupPage() {
    const router = useRouter();
    const api = createApiClient(useEnvContext());
    const t = useTranslations();

    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [checking, setChecking] = useState(true);

    const form = useForm({
        resolver: zodResolver(formSchema),
        defaultValues: {
            setupToken: "",
            email: "",
            password: "",
            confirmPassword: ""
        }
    });

    async function onSubmit(values: z.infer<typeof formSchema>) {
        setLoading(true);
        setError(null);
        try {
            const res = await api.put("/auth/set-server-admin", {
                setupToken: values.setupToken,
                email: values.email,
                password: values.password
            });
            if (res && res.status === 200) {
                router.replace("/");
                return;
            }
        } catch (e) {
            setError(formatAxiosError(e, t("setupErrorCreateAdmin")));
        }
        setLoading(false);
    }

    return (
        <Card className="w-full max-w-md mx-auto mt-12">
            <CardHeader>
                <div className="flex flex-row items-center justify-center">
                    <Image
                        src="/logo/pangolin_orange.svg"
                        alt={t("pangolinLogoAlt")}
                        width={100}
                        height={100}
                    />
                </div>
                <div className="text-center space-y-1">
                    <h1 className="text-2xl font-semibold mt-1">
                        {t("initialSetupTitle")}
                    </h1>
                    <CardDescription>
                        {t("initialSetupDescription")}
                    </CardDescription>
                </div>
            </CardHeader>
            <CardContent>
                <Form {...form}>
                    <form
                        onSubmit={form.handleSubmit(onSubmit)}
                        className="space-y-4"
                    >
                        <FormField
                            control={form.control}
                            name="setupToken"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t("setupToken")}</FormLabel>
                                    <FormControl>
                                        <Input {...field} autoComplete="off" />
                                    </FormControl>
                                    <FormDescription>
                                        {t("setupTokenDescription")}
                                    </FormDescription>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="email"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t("email")}</FormLabel>
                                    <FormControl>
                                        <Input
                                            {...field}
                                            autoComplete="username"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        <FormField
                            control={form.control}
                            name="password"
                            render={({ field }) => (
                                <FormItem>
                                    <FormLabel>{t("password")}</FormLabel>
                                    <FormControl>
                                        <Input
                                            type="password"
                                            {...field}
                                            autoComplete="new-password"
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
                                        {t("confirmPassword")}
                                    </FormLabel>
                                    <FormControl>
                                        <Input
                                            type="password"
                                            {...field}
                                            autoComplete="new-password"
                                        />
                                    </FormControl>
                                    <FormMessage />
                                </FormItem>
                            )}
                        />
                        {error && (
                            <Alert variant="destructive">
                                <AlertDescription>{error}</AlertDescription>
                            </Alert>
                        )}
                        <Button
                            type="submit"
                            className="w-full"
                            disabled={loading}
                        >
                            {t("createAdminAccount")}
                        </Button>
                    </form>
                </Form>
            </CardContent>
        </Card>
    );
}
