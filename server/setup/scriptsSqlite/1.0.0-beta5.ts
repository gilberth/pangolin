import { APP_PATH, configFilePath1, configFilePath2 } from "@server/lib/consts";
import fs from "fs";
import * as yaml from "js-yaml";
import path from "path";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

export default async function migration() {
    console.log("Running setup script 1.0.0-beta.5...");

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
    rawConfig.server.resource_access_token_param = "p_token";

    // Write the updated YAML back to the file
    const updatedYaml = yaml.dump(rawConfig);
    fs.writeFileSync(filePath, updatedYaml, "utf8");

    // then try to update badger in traefik config

    try {
        const traefikPath = path.join(
            APP_PATH,
            "traefik",
            "traefik_config.yml"
        );

        // read the traefik file
        // look for the badger middleware
        // set the version to v1.0.0-beta.2
        /*
experimental:
  plugins:
    badger:
      moduleName: "github.com/fosrl/badger"
      version: "v1.0.0-beta.2"
        */

        const schema = z.object({
            experimental: z.object({
                plugins: z.object({
                    badger: z.object({
                        moduleName: z.string(),
                        version: z.string()
                    })
                })
            })
        });

        const traefikFileContents = fs.readFileSync(traefikPath, "utf8");
        const traefikConfig = yaml.load(traefikFileContents) as any;

        const parsedConfig = schema.safeParse(traefikConfig);

        if (!parsedConfig.success) {
            throw new Error(fromZodError(parsedConfig.error).toString());
        }

        traefikConfig.experimental.plugins.badger.version = "v1.0.0-beta.2";

        const updatedTraefikYaml = yaml.dump(traefikConfig);

        fs.writeFileSync(traefikPath, updatedTraefikYaml, "utf8");

        console.log(
            "Updated the version of Badger in your Traefik configuration to v1.0.0-beta.2."
        );
    } catch (e) {
        console.log(
            "We were unable to update the version of Badger in your Traefik configuration. Please update it manually."
        );
        console.error(e);
    }

    console.log("Done.");
}
