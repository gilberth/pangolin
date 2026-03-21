import express from "express";
import jwt from "jsonwebtoken";
import { v4 as uuidv4 } from "uuid";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
app.use(express.json());

// Load private key for signing JWTs
const privateKey = fs.readFileSync(path.join(__dirname, "private.pem"), "utf8");
const publicKey = fs.readFileSync(path.join(__dirname, "public.pem"), "utf8");

// In-memory storage for activated licenses
const activatedLicenses = new Map();

// License configuration - modify these values as needed
const LICENSE_CONFIG = {
    // Valid license keys (add your own)
    validKeys: [
        "PANGOLIN-ENTERPRISE-2024",
        "TEST-LICENSE-KEY-001",
        "GYTECH-PANGOLIN-001"
    ],
    // Default license settings
    defaults: {
        type: "host",
        tier: "enterprise", // 'personal' or 'enterprise'
        maxUsers: 1000, // quantity
        maxSites: 100, // quantity_2
        validDays: 365 // License validity in days
    }
};

// Middleware to log all requests
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
    console.log("Body:", JSON.stringify(req.body, null, 2));
    next();
});

/**
 * Generate a JWT token for a license
 */
function generateLicenseToken(licenseKey, config = {}) {
    const now = Math.floor(Date.now() / 1000);
    const expiresAt = new Date();
    expiresAt.setDate(
        expiresAt.getDate() +
            (config.validDays || LICENSE_CONFIG.defaults.validDays)
    );

    const payload = {
        valid: true,
        type: config.type || LICENSE_CONFIG.defaults.type,
        tier: config.tier || LICENSE_CONFIG.defaults.tier,
        quantity: config.maxUsers || LICENSE_CONFIG.defaults.maxUsers,
        quantity_2: config.maxSites || LICENSE_CONFIG.defaults.maxSites,
        terminateAt: expiresAt.toISOString(),
        iat: now,
        exp: Math.floor(expiresAt.getTime() / 1000)
    };

    console.log("Generating token with payload:", payload);

    return jwt.sign(payload, privateKey, { algorithm: "RS256" });
}

/**
 * POST /api/v1/license/enterprise/activate
 * Activates a new license key
 */
app.post("/api/v1/license/enterprise/activate", (req, res) => {
    const { licenseKey, instanceName } = req.body;

    console.log(`\n=== LICENSE ACTIVATION ===`);
    console.log(`License Key: ${licenseKey}`);
    console.log(`Instance Name: ${instanceName}`);

    // Validate license key
    if (!LICENSE_CONFIG.validKeys.includes(licenseKey)) {
        console.log(`REJECTED: Invalid license key`);
        return res.json({
            data: null,
            success: false,
            error: "Invalid license key",
            message: "The provided license key is not valid",
            status: 400
        });
    }

    // Generate instance ID
    const instanceId = uuidv4();

    // Store the activation
    activatedLicenses.set(licenseKey, {
        instanceId,
        instanceName,
        activatedAt: new Date().toISOString()
    });

    console.log(`ACTIVATED: Instance ID = ${instanceId}`);

    return res.json({
        data: {
            instanceId
        },
        success: true,
        error: "",
        message: "License activated successfully",
        status: 200
    });
});

/**
 * POST /api/v1/license/enterprise/validate
 * Validates license keys (phone home)
 */
app.post("/api/v1/license/enterprise/validate", (req, res) => {
    const { licenseKeys, instanceName } = req.body;

    console.log(`\n=== LICENSE VALIDATION (Phone Home) ===`);
    console.log(`Instance Name: ${instanceName}`);
    console.log(`License Keys:`, licenseKeys);

    const responseKeys = {};

    for (const keyInfo of licenseKeys) {
        const { licenseKey, instanceId } = keyInfo;

        // Check if key is valid
        if (LICENSE_CONFIG.validKeys.includes(licenseKey)) {
            // Generate fresh JWT token
            const token = generateLicenseToken(licenseKey);
            responseKeys[licenseKey] = token;
            console.log(`VALID: ${licenseKey}`);
        } else {
            console.log(`INVALID: ${licenseKey}`);
        }
    }

    return res.json({
        data: {
            licenseKeys: responseKeys
        },
        success: true,
        error: "",
        message: "Validation complete",
        status: 200
    });
});

/**
 * POST /api/v1/license/validate
 * Validates supporter keys
 */
app.post("/api/v1/license/validate", (req, res) => {
    const { licenseKey, githubUsername } = req.body;

    console.log(`\n=== SUPPORTER KEY VALIDATION ===`);
    console.log(`License Key: ${licenseKey}`);
    console.log(`GitHub Username: ${githubUsername}`);

    // For testing, accept any key that starts with "SUPPORTER-"
    const isValid =
        licenseKey.startsWith("SUPPORTER-") ||
        LICENSE_CONFIG.validKeys.includes(licenseKey);

    return res.json({
        data: {
            valid: isValid,
            githubUsername: githubUsername,
            tier: "supporter",
            cutePhrase: "Thank you for supporting Pangolin!"
        },
        success: true,
        error: "",
        message: isValid ? "Valid supporter key" : "Invalid supporter key",
        status: 200
    });
});

/**
 * GET /health
 * Health check endpoint
 */
app.get("/health", (req, res) => {
    res.json({ status: "ok", timestamp: new Date().toISOString() });
});

/**
 * GET /api/v1/keys
 * List all valid keys (for testing)
 */
app.get("/api/v1/keys", (req, res) => {
    res.json({
        validKeys: LICENSE_CONFIG.validKeys,
        activatedLicenses: Object.fromEntries(activatedLicenses)
    });
});

/**
 * POST /api/v1/keys
 * Add a new valid key (for testing)
 */
app.post("/api/v1/keys", (req, res) => {
    const { key } = req.body;
    if (key && !LICENSE_CONFIG.validKeys.includes(key)) {
        LICENSE_CONFIG.validKeys.push(key);
        console.log(`Added new valid key: ${key}`);
    }
    res.json({ validKeys: LICENSE_CONFIG.validKeys });
});

// Start server
const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
    console.log(`\n========================================`);
    console.log(`  Pangolin License Server`);
    console.log(`========================================`);
    console.log(`Server running on http://localhost:${PORT}`);
    console.log(`\nEndpoints:`);
    console.log(`  POST /api/v1/license/enterprise/activate`);
    console.log(`  POST /api/v1/license/enterprise/validate`);
    console.log(`  POST /api/v1/license/validate`);
    console.log(`  GET  /health`);
    console.log(`  GET  /api/v1/keys (list valid keys)`);
    console.log(`  POST /api/v1/keys (add valid key)`);
    console.log(`\nValid License Keys:`);
    LICENSE_CONFIG.validKeys.forEach((key) => console.log(`  - ${key}`));
    console.log(`\nPublic Key (replace in Pangolin):`);
    console.log(publicKey);
    console.log(`========================================\n`);
});
