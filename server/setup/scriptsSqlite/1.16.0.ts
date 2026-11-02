import { APP_PATH, configFilePath1, configFilePath2 } from "@server/lib/consts";
import { encrypt } from "@server/lib/crypto";
import { generateCA } from "@server/lib/sshCA";
import Database from "better-sqlite3";
import fs from "fs";
import path from "path";
import * as yaml from "js-yaml";

const version = "1.16.0";

function getServerSecret(): string {
    const envSecret = process.env.SERVER_SECRET;

    const configPath = fs.existsSync(configFilePath1)
        ? configFilePath1
        : fs.existsSync(configFilePath2)
          ? configFilePath2
          : null;

    // If no config file but an env secret is set, use the env secret directly
    if (!configPath) {
        if (envSecret && envSecret.length > 0) {
            return envSecret;
        }

        throw new Error(
            "Cannot generate org CA keys: no config file found and SERVER_SECRET env var is not set. " +
                "Expected config.yml or config.yaml in the config directory, or set SERVER_SECRET."
        );
    }

    const configContent = fs.readFileSync(configPath, "utf8");
    const config = yaml.load(configContent) as {
        server?: { secret?: string };
    };

    let secret = config?.server?.secret;
    if (!secret || secret.length === 0) {
        // Fall back to SERVER_SECRET env var if config does not contain server.secret
        if (envSecret && envSecret.length > 0) {
            secret = envSecret;
        }
    }

    if (!secret || secret.length === 0) {
        throw new Error(
            "Cannot generate org CA keys: no server.secret in config and SERVER_SECRET env var is not set. " +
                "Set server.secret in config.yml/config.yaml or set SERVER_SECRET."
        );
    }

    return secret;
}

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    // Ensure server secret exists before running migration (required for org CA key generation)
    getServerSecret();

    const location = path.join(APP_PATH, "db", "db.sqlite");
    const db = new Database(location);

    try {
        db.pragma("foreign_keys = OFF");

        db.transaction(() => {
            // Create roundTripMessageTracker table for tracking message round-trips
            db.prepare(
                `
                CREATE TABLE 'roundTripMessageTracker' (
                    'messageId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                    'clientId' text,
                    'messageType' text,
                    'sentAt' integer NOT NULL,
                    'receivedAt' integer,
                    'error' text,
                    'complete' integer DEFAULT 0 NOT NULL
                );
                `
            ).run();

            // Org SSH CA and billing columns
            db.prepare(`ALTER TABLE 'orgs' ADD 'sshCaPrivateKey' text;`).run();
            db.prepare(`ALTER TABLE 'orgs' ADD 'sshCaPublicKey' text;`).run();
            db.prepare(`ALTER TABLE 'orgs' ADD 'isBillingOrg' integer;`).run();
            db.prepare(`ALTER TABLE 'orgs' ADD 'billingOrgId' text;`).run();

            // Role SSH sudo and unix group columns
            db.prepare(
                `ALTER TABLE 'roles' ADD 'sshSudoMode' text DEFAULT 'none';`
            ).run();
            db.prepare(
                `ALTER TABLE 'roles' ADD 'sshSudoCommands' text DEFAULT '[]';`
            ).run();
            db.prepare(
                `ALTER TABLE 'roles' ADD 'sshCreateHomeDir' integer DEFAULT 1;`
            ).run();
            db.prepare(
                `ALTER TABLE 'roles' ADD 'sshUnixGroups' text DEFAULT '[]';`
            ).run();

            // Site resource auth daemon columns
            db.prepare(
                `ALTER TABLE 'siteResources' ADD 'authDaemonPort' integer DEFAULT 22123;`
            ).run();
            db.prepare(
                `ALTER TABLE 'siteResources' ADD 'authDaemonMode' text DEFAULT 'site';`
            ).run();

            // UserOrg PAM username for SSH
            db.prepare(`ALTER TABLE 'userOrgs' ADD 'pamUsername' text;`).run();

            // Set all admin role sudo to "full"; other roles keep default "none"
            db.prepare(
                `UPDATE 'roles' SET 'sshSudoMode' = 'full' WHERE isAdmin = 1;`
            ).run();
        })();

        db.pragma("foreign_keys = ON");

        const orgRows = db.prepare("SELECT orgId FROM orgs").all() as {
            orgId: string;
        }[];

        // Generate and store encrypted SSH CA keys for all orgs
        const secret = getServerSecret();

        const updateOrgCaKeys = db.prepare(
            "UPDATE orgs SET sshCaPrivateKey = ?, sshCaPublicKey = ? WHERE orgId = ?"
        );

        const failedOrgIds: string[] = [];

        for (const row of orgRows) {
            try {
                const ca = generateCA(`pangolin-ssh-ca-${row.orgId}`);
                const encryptedPrivateKey = encrypt(ca.privateKeyPem, secret);
                updateOrgCaKeys.run(
                    encryptedPrivateKey,
                    ca.publicKeyOpenSSH,
                    row.orgId
                );
            } catch (err) {
                failedOrgIds.push(row.orgId);
                console.error(
                    `Error: No CA was generated for organization "${row.orgId}".`,
                    err instanceof Error ? err.message : err
                );
            }
        }

        if (orgRows.length > 0) {
            const succeeded = orgRows.length - failedOrgIds.length;
            console.log(
                `Generated and stored SSH CA keys for ${succeeded} org(s).`
            );
        }

        if (failedOrgIds.length > 0) {
            console.error(
                `No CA was generated for ${failedOrgIds.length} organization(s): ${failedOrgIds.join(", ")}`
            );
        }

        console.log(`Migrated database`);
    } catch (e) {
        console.log("Failed to migrate db:", e);
        throw e;
    }

    console.log(`${version} migration complete`);
}
