import { Terminal } from "lucide-react";
import { useTranslations } from "next-intl";
import { useState } from "react";
import { FaDocker, FaWindows } from "react-icons/fa";
import CopyTextBox from "./CopyTextBox";
import {
    SettingsSection,
    SettingsSectionBody,
    SettingsSectionDescription,
    SettingsSectionHeader,
    SettingsSectionTitle
} from "./Settings";
import { OptionSelect, type OptionSelectOption } from "./OptionSelect";

export type CommandItem = string | { title: string; command: string };

const PLATFORMS = ["unix", "docker", "windows"] as const;

type Platform = (typeof PLATFORMS)[number];

export type OlmInstallCommandsProps = {
    id: string;
    secret: string;
    endpoint: string;
    version?: string;
};

export function OlmInstallCommands({
    id,
    secret,
    endpoint,
    version = "latest"
}: OlmInstallCommandsProps) {
    const t = useTranslations();

    const [platform, setPlatform] = useState<Platform>("unix");
    const [architecture, setArchitecture] = useState(
        () => getArchitectures(platform)[0]
    );

    const commandList: Record<Platform, Record<string, CommandItem[]>> = {
        unix: {
            All: [
                {
                    title: t("install"),
                    command: `curl -fsSL https://static.pangolin.net/get-cli.sh | sudo bash`
                },
                {
                    title: t("run"),
                    command: `sudo pangolin up --id ${id} --secret ${secret} --endpoint ${endpoint} --attach`
                }
            ]
        },
        docker: {
            "Docker Compose": [
                `services:
  pangolin-cli:
    image: fosrl/pangolin-cli
    container_name: pangolin-cli
    restart: unless-stopped
    network_mode: host
    cap_add:
      - NET_ADMIN
    devices:
      - /dev/net/tun:/dev/net/tun
    environment:
      - PANGOLIN_ENDPOINT=${endpoint}
      - CLIENT_ID=${id}
      - CLIENT_SECRET=${secret}`
            ],
            "Docker Run": [
                `docker run -dit --network host --cap-add NET_ADMIN --device /dev/net/tun:/dev/net/tun fosrl/pangolin-cli up client --id ${id} --secret ${secret} --endpoint ${endpoint} --attach`
            ]
        },
        windows: {
            x64: [
                {
                    title: t("install"),
                    command: `# Download and run the installer to install Olm first\n
curl -o olm.exe -L "https://github.com/fosrl/olm/releases/download/${version}/olm_windows_installer.exe"`
                },
                {
                    title: t("run"),
                    command: `olm.exe --id ${id} --secret ${secret} --endpoint ${endpoint}`
                }
            ]
        }
    };

    const commands = commandList[platform][architecture];

    const platformOptions: OptionSelectOption<Platform>[] = PLATFORMS.map(
        (os) => ({
            value: os,
            label: getPlatformName(os),
            icon: getPlatformIcon(os)
        })
    );

    return (
        <SettingsSection>
            <SettingsSectionHeader>
                <SettingsSectionTitle>
                    {t("clientInstallOlm")}
                </SettingsSectionTitle>
                <SettingsSectionDescription>
                    {t("clientInstallOlmDescription")}
                </SettingsSectionDescription>
            </SettingsSectionHeader>
            <SettingsSectionBody>
                <OptionSelect<Platform>
                    label={t("operatingSystem")}
                    options={platformOptions}
                    value={platform}
                    onChange={(os) => {
                        setPlatform(os);
                        const architectures = getArchitectures(os);
                        setArchitecture(architectures[0]);
                    }}
                    cols={5}
                />

                <OptionSelect<string>
                    label={
                        platform === "docker" ? t("method") : t("architecture")
                    }
                    options={getArchitectures(platform).map((arch) => ({
                        value: arch,
                        label: arch
                    }))}
                    value={architecture}
                    onChange={setArchitecture}
                    cols={5}
                    className="mt-4"
                />

                <div className="pt-4">
                    <p className="font-semibold mb-3">{t("commands")}</p>
                    <div className="mt-2 space-y-3">
                        {commands.map((item, index) => {
                            const commandText =
                                typeof item === "string" ? item : item.command;
                            const title =
                                typeof item === "string"
                                    ? undefined
                                    : item.title;

                            return (
                                <div key={index}>
                                    {title && (
                                        <p className="text-sm font-medium mb-1.5">
                                            {title}
                                        </p>
                                    )}
                                    <CopyTextBox
                                        text={commandText}
                                        outline={true}
                                    />
                                </div>
                            );
                        })}
                    </div>
                </div>
            </SettingsSectionBody>
        </SettingsSection>
    );
}

function getArchitectures(platform: Platform) {
    switch (platform) {
        case "unix":
            return ["All"];
        case "windows":
            return ["x64"];
        case "docker":
            return ["Docker Compose", "Docker Run"];
        default:
            return ["x64"];
    }
}

function getPlatformName(platformName: Platform) {
    switch (platformName) {
        case "windows":
            return "Windows";
        case "unix":
            return "Unix & macOS";
        case "docker":
            return "Docker";
        default:
            return "Unix & macOS";
    }
}

function getPlatformIcon(platformName: Platform) {
    switch (platformName) {
        case "windows":
            return <FaWindows className="h-4 w-4 mr-2" />;
        case "unix":
            return <Terminal className="h-4 w-4 mr-2" />;
        case "docker":
            return <FaDocker className="h-4 w-4 mr-2" />;
        default:
            return <Terminal className="h-4 w-4 mr-2" />;
    }
}
