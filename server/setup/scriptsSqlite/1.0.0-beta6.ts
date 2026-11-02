import { configFilePath1, configFilePath2 } from "@server/lib/consts";
import fs from "fs";
import * as yaml from "js-yaml";

export default async function migration() {
    console.log("Running setup script 1.0.0-beta.6...");

    try {
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
        if (!rawConfig.server) {
            throw new Error(`Invalid config file: server is missing.`);
        }

        // Update the config
        rawConfig.server.cors = {
            origins: [rawConfig.app.dashboard_url],
            methods: ["GET", "POST", "PUT", "DELETE", "PATCH"],
            headers: ["X-CSRF-Token", "Content-Type"],
            credentials: false
        };

        // Write the updated YAML back to the file
        const updatedYaml = yaml.dump(rawConfig);
        fs.writeFileSync(filePath, updatedYaml, "utf8");
    } catch (error) {
        console.log(
            "We were unable to add CORS to your config file. Please add it manually."
        );
        console.error(error);
    }

    console.log("Done.");
}
