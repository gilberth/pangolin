import Database from "better-sqlite3";
import path from "path";
import fs from "fs";
import * as yaml from "js-yaml";
import { encodeBase32LowerCaseNoPadding } from "@oslojs/encoding";
import { APP_PATH, configFilePath1, configFilePath2 } from "@server/lib/consts";

const version = "1.3.0";
const location = path.join(APP_PATH, "db", "db.sqlite");

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    const db = new Database(location);

    try {
        db.pragma("foreign_keys = OFF");
        db.transaction(() => {
            db.exec(`
                CREATE TABLE 'apiKeyActions' (
                    'apiKeyId' text NOT NULL,
                    'actionId' text NOT NULL,
                    FOREIGN KEY ('apiKeyId') REFERENCES 'apiKeys'('apiKeyId') ON UPDATE no action ON DELETE cascade,
                    FOREIGN KEY ('actionId') REFERENCES 'actions'('actionId') ON UPDATE no action ON DELETE cascade
                );

                CREATE TABLE 'apiKeyOrg' (
                    'apiKeyId' text NOT NULL,
                    'orgId' text NOT NULL,
                    FOREIGN KEY ('apiKeyId') REFERENCES 'apiKeys'('apiKeyId') ON UPDATE no action ON DELETE cascade,
                    FOREIGN KEY ('orgId') REFERENCES 'orgs'('orgId') ON UPDATE no action ON DELETE cascade
                );

                CREATE TABLE 'apiKeys' (
                    'apiKeyId' text PRIMARY KEY NOT NULL,
                    'name' text NOT NULL,
                    'apiKeyHash' text NOT NULL,
                    'lastChars' text NOT NULL,
                    'dateCreated' text NOT NULL,
                    'isRoot' integer DEFAULT false NOT NULL
                );

                CREATE TABLE 'hostMeta' (
                    'hostMetaId' text PRIMARY KEY NOT NULL,
                    'createdAt' integer NOT NULL
                );

                CREATE TABLE 'idp' (
                    'idpId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                    'name' text NOT NULL,
                    'type' text NOT NULL,
                    'defaultRoleMapping' text,
                    'defaultOrgMapping' text,
                    'autoProvision' integer DEFAULT false NOT NULL
                );

                CREATE TABLE 'idpOidcConfig' (
                    'idpOauthConfigId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                    'idpId' integer NOT NULL,
                    'clientId' text NOT NULL,
                    'clientSecret' text NOT NULL,
                    'authUrl' text NOT NULL,
                    'tokenUrl' text NOT NULL,
                    'identifierPath' text NOT NULL,
                    'emailPath' text,
                    'namePath' text,
                    'scopes' text NOT NULL,
                    FOREIGN KEY ('idpId') REFERENCES 'idp'('idpId') ON UPDATE no action ON DELETE cascade
                );

                CREATE TABLE 'idpOrg' (
                    'idpId' integer NOT NULL,
                    'orgId' text NOT NULL,
                    'roleMapping' text,
                    'orgMapping' text,
                    FOREIGN KEY ('idpId') REFERENCES 'idp'('idpId') ON UPDATE no action ON DELETE cascade,
                    FOREIGN KEY ('orgId') REFERENCES 'orgs'('orgId') ON UPDATE no action ON DELETE cascade
                );

                CREATE TABLE 'licenseKey' (
                    'licenseKeyId' text PRIMARY KEY NOT NULL,
                    'instanceId' text NOT NULL,
                    'token' text NOT NULL
                );

                CREATE TABLE '__new_user' (
                    'id' text PRIMARY KEY NOT NULL,
                    'email' text,
                    'username' text NOT NULL,
                    'name' text,
                    'type' text NOT NULL,
                    'idpId' integer,
                    'passwordHash' text,
                    'twoFactorEnabled' integer DEFAULT false NOT NULL,
                    'twoFactorSecret' text,
                    'emailVerified' integer DEFAULT false NOT NULL,
                    'dateCreated' text NOT NULL,
                    'serverAdmin' integer DEFAULT false NOT NULL,
                    FOREIGN KEY ('idpId') REFERENCES 'idp'('idpId') ON UPDATE no action ON DELETE cascade
                );

                INSERT INTO '__new_user'(
                    "id", "email", "username", "name", "type", "idpId", "passwordHash",
                    "twoFactorEnabled", "twoFactorSecret", "emailVerified", "dateCreated", "serverAdmin"
                )
                SELECT
                    "id",
                    "email",
                    COALESCE("email", 'unknown'),
                    NULL,
                    'internal',
                    NULL,
                    "passwordHash",
                    "twoFactorEnabled",
                    "twoFactorSecret",
                    "emailVerified",
                    "dateCreated",
                    "serverAdmin"
                FROM 'user';

                DROP TABLE 'user';
                ALTER TABLE '__new_user' RENAME TO 'user';

                ALTER TABLE 'resources' ADD 'stickySession' integer DEFAULT false NOT NULL;
                ALTER TABLE 'resources' ADD 'tlsServerName' text;
                ALTER TABLE 'resources' ADD 'setHostHeader' text;

                CREATE TABLE 'exitNodes_new' (
                    'exitNodeId' integer PRIMARY KEY AUTOINCREMENT NOT NULL,
                    'name' text NOT NULL,
                    'address' text NOT NULL,
                    'endpoint' text NOT NULL,
                    'publicKey' text NOT NULL,
                    'listenPort' integer NOT NULL,
                    'reachableAt' text
                );

                INSERT INTO 'exitNodes_new' (
                    'exitNodeId', 'name', 'address', 'endpoint', 'publicKey', 'listenPort', 'reachableAt'
                )
                SELECT
                    exitNodeId,
                    name,
                    address,
                    endpoint,
                    pubicKey,
                    listenPort,
                    reachableAt
                FROM exitNodes;

                DROP TABLE 'exitNodes';
                ALTER TABLE 'exitNodes_new' RENAME TO 'exitNodes';
            `);
        })(); // <-- executes the transaction immediately
        db.pragma("foreign_keys = ON");
        console.log(`Migrated database schema`);
    } catch (e) {
        console.log("Unable to migrate database schema");
        throw e;
    }

    // Update config file
    try {
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

        const fileContents = fs.readFileSync(filePath, "utf8");
        const rawConfig = yaml.load(fileContents) as any;

        if (!rawConfig.server.secret) {
            rawConfig.server.secret = generateIdFromEntropySize(32);
        }

        const updatedYaml = yaml.dump(rawConfig);
        fs.writeFileSync(filePath, updatedYaml, "utf8");

        console.log(`Added new config option: server.secret`);
    } catch (e) {
        console.log(
            `Unable to add new config option: server.secret. Please add it manually.`
        );
        console.error(e);
    }

    console.log(`${version} migration complete`);
}

function generateIdFromEntropySize(size: number): string {
    const buffer = crypto.getRandomValues(new Uint8Array(size));
    return encodeBase32LowerCaseNoPadding(buffer);
}
