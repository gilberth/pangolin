import { Pool, PoolConfig } from "pg";

export function createPoolConfig(
    connectionString: string,
    maxConnections: number,
    idleTimeoutMs: number,
    connectionTimeoutMs: number
): PoolConfig {
    return {
        connectionString,
        max: maxConnections,
        idleTimeoutMillis: idleTimeoutMs,
        connectionTimeoutMillis: connectionTimeoutMs,
        // TCP keepalive to prevent silent connection drops by NAT gateways,
        // load balancers, and other intermediate network devices (e.g. AWS
        // NAT Gateway drops idle TCP connections after ~350s)
        keepAlive: true,
        keepAliveInitialDelayMillis: 10000, // send first keepalive after 10s of idle
        // Allow connections to be released and recreated more aggressively
        // to avoid stale connections building up
        allowExitOnIdle: false
    };
}

export function attachPoolErrorHandlers(pool: Pool, label: string): void {
    pool.on("error", (err) => {
        // This catches errors on idle clients in the pool. Without this
        // handler an unexpected disconnect would crash the process.
        console.error(
            `Unexpected error on idle ${label} database client: ${err.message}`
        );
    });

    pool.on("connect", (client) => {
        // Set a statement timeout on every new connection so a single slow
        // query can't block the pool forever
        client.query("SET statement_timeout = '30s'").catch((err: Error) => {
            console.warn(
                `Failed to set statement_timeout on ${label} client: ${err.message}`
            );
        });
    });
}

export function createPool(
    connectionString: string,
    maxConnections: number,
    idleTimeoutMs: number,
    connectionTimeoutMs: number,
    label: string
): Pool {
    const pool = new Pool(
        createPoolConfig(
            connectionString,
            maxConnections,
            idleTimeoutMs,
            connectionTimeoutMs
        )
    );
    attachPoolErrorHandlers(pool, label);
    return pool;
}
