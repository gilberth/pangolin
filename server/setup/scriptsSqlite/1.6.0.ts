import { APP_PATH, configFilePath1, configFilePath2 } from "@server/lib/consts";
import Database from "better-sqlite3";
import fs from "fs";
import * as yaml from "js-yaml";
import path from "path";

const version = "1.6.0";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    const location = path.join(APP_PATH, "db", "db.sqlite");
    const db = new Database(location);

    try {
        db.pragma("foreign_keys = OFF");
        db.transaction(() => {
            db.exec(`
              UPDATE 'user' SET email = LOWER(email);
              UPDATE 'user' SET username = LOWER(username);
            `);
        })(); // <-- executes the transaction immediately
        db.pragma("foreign_keys = ON");
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
        console.log(
            `Unable to migrate config file. Please do it manually. Error: ${e}`
        );
    }

    console.log(`${version} migration complete`);
}
