type SettingsSectionTitleProps = {
    title: string | React.ReactNode;
    description?: string | React.ReactNode;
    size?: "2xl" | "1xl";
};

export default function SettingsSectionTitle({
    title,
    description,
    size
}: SettingsSectionTitleProps) {
    return (
        <div
            className={`space-y-0.5 ${!size || size === "2xl" ? "mb-6 md:mb-6" : ""}`}
        >
            <h2
                className={`text-${
                    size ? size : "2xl"
                } font-semibold tracking-tight`}
            >
                {title}
            </h2>
            {description && (
                <p className="text-muted-foreground">{description}</p>
            )}
        </div>
    );
}
