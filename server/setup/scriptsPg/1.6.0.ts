import { db } from "@server/db/pg/driver";
import { configFilePath1, configFilePath2 } from "@server/lib/consts";
import { sql } from "drizzle-orm";
import fs from "fs";
import * as yaml from "js-yaml";

const version = "1.6.0";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    try {
        db.execute(sql`UPDATE 'user' SET email = LOWER(email);`);
        db.execute(sql`UPDATE 'user' SET username = LOWER(username);`);
        console.log(`Migrated database schema`);
    } catch (e) {
        console.log("Unable to make all usernames and emails lowercase");
        console.log(e);
    }

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

        if (rawConfig.server?.trust_proxy) {
            rawConfig.server.trust_proxy = 1;
        }

        // Write the updated YAML back to the file
        const updatedYaml = yaml.dump(rawConfig);
        fs.writeFileSync(filePath, updatedYaml, "utf8");

        console.log(`Set trust_proxy to 1 in config file`);
    } catch (e) {
        console.log(`Unable to migrate config file. Error: ${e}`);
    }

    console.log(`${version} migration complete`);
}
