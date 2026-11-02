import Database from "better-sqlite3";
import path from "path";
import { APP_PATH, configFilePath1, configFilePath2 } from "@server/lib/consts";
import fs from "fs";
import * as yaml from "js-yaml";

const version = "1.5.0";
const location = path.join(APP_PATH, "db", "db.sqlite");

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    const db = new Database(location);

    try {
        db.pragma("foreign_keys = OFF");
        db.transaction(() => {
            db.exec(`
               ALTER TABLE 'sites' ADD 'dockerSocketEnabled' integer DEFAULT true NOT NULL;
            `);
        })(); // <-- executes the transaction immediately
        db.pragma("foreign_keys = ON");
        console.log(`Migrated database schema`);
    } catch (e) {
        console.log("Unable to migrate database schema");
        throw e;
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

        if (rawConfig.cors?.headers) {
            const headers = JSON.parse(JSON.stringify(rawConfig.cors.headers));
            rawConfig.cors.allowed_headers = headers;
            delete rawConfig.cors.headers;
        }

        // Write the updated YAML back to the file
        const updatedYaml = yaml.dump(rawConfig);
        fs.writeFileSync(filePath, updatedYaml, "utf8");

        console.log(`Migrated CORS headers to allowed_headers`);
    } catch (e) {
        console.log(`Unable to migrate config file. Error: ${e}`);
    }

    console.log(`${version} migration complete`);
}
