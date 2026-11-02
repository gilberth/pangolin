import { db } from "../../db/sqlite";
import { configFilePath1, configFilePath2 } from "@server/lib/consts";
import fs from "fs";
import * as yaml from "js-yaml";
import { sql } from "drizzle-orm";
import { domains, orgDomains, resources } from "@server/db";

const version = "1.0.0-beta.15";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    let domain = "";

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

        const baseDomain = rawConfig.app.base_domain;
        const certResolver = rawConfig.traefik.cert_resolver;
        const preferWildcardCert = rawConfig.traefik.prefer_wildcard_cert;

        delete rawConfig.traefik.prefer_wildcard_cert;
        delete rawConfig.traefik.cert_resolver;
        delete rawConfig.app.base_domain;

        rawConfig.domains = {
            domain1: {
                base_domain: baseDomain
            }
        };

        if (certResolver) {
            rawConfig.domains.domain1.cert_resolver = certResolver;
        }

        if (preferWildcardCert) {
            rawConfig.domains.domain1.prefer_wildcard_cert = preferWildcardCert;
        }

        // Write the updated YAML back to the file
        const updatedYaml = yaml.dump(rawConfig);
        fs.writeFileSync(filePath, updatedYaml, "utf8");

        domain = baseDomain;

        console.log(`Moved base_domain to new domains section`);
    } catch (e) {
        console.log(
            `Unable to migrate config file and move base_domain to domains. Error: ${e}`
        );
        throw e;
    }

    try {
        db.transaction((trx) => {
            trx.run(sql`CREATE TABLE 'domains' (
	'domainId' text PRIMARY KEY NOT NULL,
	'baseDomain' text NOT NULL,
	'configManaged' integer DEFAULT false NOT NULL
);`);

            trx.run(sql`CREATE TABLE 'orgDomains' (
    'orgId' text NOT NULL,
    'domainId' text NOT NULL,
    FOREIGN KEY ('orgId') REFERENCES 'orgs'('orgId') ON UPDATE no action ON DELETE cascade,
    FOREIGN KEY ('domainId') REFERENCES 'domains'('domainId') ON UPDATE no action ON DELETE cascade
);`);

            trx.run(
                sql`ALTER TABLE 'resources' ADD 'domainId' text REFERENCES domains(domainId);`
            );
            trx.run(sql`ALTER TABLE 'orgs' DROP COLUMN 'domain';`);
        });

        console.log(`Migrated database schema`);
    } catch (e) {
        console.log("Unable to migrate database schema");
        throw e;
    }

    try {
        await db.transaction(async (trx) => {
            await trx
                .insert(domains)
                .values({
                    domainId: "domain1",
                    baseDomain: domain,
                    configManaged: true
                })
                .execute();
            await trx.update(resources).set({ domainId: "domain1" });
            const existingOrgDomains = await trx.select().from(orgDomains);
            for (const orgDomain of existingOrgDomains) {
                await trx
                    .insert(orgDomains)
                    .values({ orgId: orgDomain.orgId, domainId: "domain1" })
                    .execute();
            }
        });

        console.log(`Updated resources table with new domainId`);
    } catch (e) {
        console.log(
            `Unable to update resources table with new domainId. Error: ${e}`
        );
        return;
    }

    console.log(`${version} migration complete`);
}
