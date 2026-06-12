import { APP_PATH } from "@server/lib/consts";
import Database from "better-sqlite3";
import path from "path";

const version = "1.18.4";

export default async function migration() {
    console.log(`Running setup script ${version}...`);

    const location = path.join(APP_PATH, "db", "db.sqlite");
    const db = new Database(location);

    try {
        db.pragma("foreign_keys = OFF");

        db.transaction(() => {
            db.prepare(
                `
                ALTER TABLE 'connectionAuditLog' ADD 'clientEndpoint' text;
                `
            ).run();
            db.prepare(
                `
                ALTER TABLE 'eventStreamingDestinations' ADD 'lastError' text;
                `
            ).run();
            db.prepare(
                `
                ALTER TABLE 'eventStreamingDestinations' ADD 'lastErrorAt' integer;
                `
            ).run();
        })();

        db.pragma("foreign_keys = ON");

        console.log("Migrated database");
    } catch (e) {
        console.log("Failed to migrate db:", e);
        throw e;
    }

    console.log(`${version} migration complete`);
}
