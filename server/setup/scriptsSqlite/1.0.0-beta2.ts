import { configFilePath1, configFilePath2 } from "@server/lib/consts";
import fs from "fs";
import * as yaml from "js-yaml";

export default async function migration() {
    console.log("Running setup script 1.0.0-beta.2...");

    // Determine which config file exists
    const filePaths = [configFilePath1, configFilePath2];
    let filePath = "";
    for (const path of filePaths) {
        if (fs.existsSync(path)) {
            filePath = path;
            break;
        }
    }

    if (!filePath) {
        throw new Error(
            `No config file found (expected config.yml or config.yaml).`
        );
    }

    // Read and parse the YAML file
    const fileContents = fs.readFileSync(filePath, "utf8");
    const rawConfig = yaml.load(fileContents) as any;

    // Validate the structure
    if (!rawConfig.app || !rawConfig.app.base_url) {
        throw new Error(`Invalid config file: app.base_url is missing.`);
    }

    // Move base_url to dashboard_url and calculate base_domain
    const baseUrl = rawConfig.app.base_url;
    rawConfig.app.dashboard_url = baseUrl;
    rawConfig.app.base_domain = getBaseDomain(baseUrl);

    // Remove the old base_url
    delete rawConfig.app.base_url;

    // Write the updated YAML back to the file
    const updatedYaml = yaml.dump(rawConfig);
    fs.writeFileSync(filePath, updatedYaml, "utf8");

    console.log("Done.");
}

function getBaseDomain(url: string): string {
    const newUrl = new URL(url);
    const hostname = newUrl.hostname;
    const parts = hostname.split(".");

    if (parts.length <= 2) {
        return parts.join(".");
    }

    return parts.slice(-2).join(".");
}
