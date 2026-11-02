import { db } from "../../db/sqlite";
import { configFilePath1, configFilePath2 } from "@server/lib/consts";
import { sql } from "drizzle-orm";
import fs from "fs";
import * as yaml from "js-yaml";

export default async function migration() {
    console.log("Running setup script 1.0.0-beta.12...");

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

        if (!rawConfig.flags) {
            rawConfig.flags = {};
        }

        rawConfig.flags.allow_base_domain_resources = true;

        // Write the updated YAML back to the file
        const updatedYaml = yaml.dump(rawConfig);
        fs.writeFileSync(filePath, updatedYaml, "utf8");

        console.log(`Added new config option: allow_base_domain_resources`);
    } catch (e) {
        console.log(
            `Unable to add new config option: allow_base_domain_resources. This is not critical.`
        );
        console.error(e);
    }

    try {
        db.transaction((trx) => {
            trx.run(sql`ALTER TABLE 'resources' ADD 'isBaseDomain' integer;`);
        });

        console.log(`Added new column: isBaseDomain`);
    } catch (e) {
        console.log("Unable to add new column: isBaseDomain");
        throw e;
    }

    console.log("Done.");
}
