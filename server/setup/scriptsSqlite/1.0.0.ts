import { APP_PATH } from "@server/lib/consts";
import fs from "fs";
import * as yaml from "js-yaml";
import path from "path";
import { z } from "zod";
import { fromZodError } from "zod-validation-error";

const version = "1.0.0";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    try {
        const traefikPath = path.join(
            APP_PATH,
            "traefik",
            "traefik_config.yml"
        );

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

        traefikConfig.experimental.plugins.badger.version = "v1.0.0";

        const updatedTraefikYaml = yaml.dump(traefikConfig);

        fs.writeFileSync(traefikPath, updatedTraefikYaml, "utf8");

        console.log(
            "Updated the version of Badger in your Traefik configuration to 1.0.0"
        );
    } catch (e) {
        console.log(
            "We were unable to update the version of Badger in your Traefik configuration. Please update it manually."
        );
        console.error(e);
    }

    console.log(`${version} migration complete`);
}
