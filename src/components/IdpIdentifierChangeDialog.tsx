"use client";

import ConfirmDeleteDialog from "@app/components/ConfirmDeleteDialog";
import { useTranslations } from "next-intl";

type IdpIdentifierChangeDialogProps = {
    open: boolean;
    setOpen: (open: boolean) => void;
    onConfirm: () => Promise<void>;
};

export default function IdpIdentifierChangeDialog({
    open,
    setOpen,
    onConfirm
}: IdpIdentifierChangeDialogProps) {
    const t = useTranslations();

    return (
        <ConfirmDeleteDialog
            open={open}
            setOpen={setOpen}
            dialog={
                <div className="space-y-2">
                    <p>{t("idpIdentifierChangeDescription")}</p>
                </div>
            }
            buttonText={t("saveGeneralSettings")}
            onConfirm={onConfirm}
            string={t("idpIdentifierChangeConfirmMessage")}
            title={t("idpIdentifierChangeTitle")}
            warningText={t("idpIdentifierChangeWarningText")}
        />
    );
}
