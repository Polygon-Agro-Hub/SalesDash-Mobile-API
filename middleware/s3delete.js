const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");

const r2Client = new S3Client({
    region: "auto",
    endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
    },
    forcePathStyle: true,
});

/**
 * Deletes a file from R2 using the URL that was returned by uploadFileToS3.
 * Never throws - returns true/false so callers can treat it as best-effort.
 * @param {string} fileUrl - Full file URL stored in the DB.
 * @param {string} [requiredPrefix] - Only delete if the key starts with this (safety guard).
 * @returns {Promise<boolean>}
 */
const deleteFileFromS3 = async (fileUrl, requiredPrefix = "") => {
    try {
        if (!fileUrl) return false;

        const key = decodeURIComponent(new URL(fileUrl).pathname).replace(
            /^\/+/,
            "",
        );
        if (!key) return false;

        if (requiredPrefix && !key.startsWith(requiredPrefix)) {
            console.warn("Skipped R2 delete, key outside allowed prefix:", key);
            return false;
        }

        await r2Client.send(
            new DeleteObjectCommand({
                Bucket: process.env.R2_BUCKET_NAME,
                Key: key,
            }),
        );
        return true;
    } catch (error) {
        console.error("Error deleting from R2:", error);
        return false;
    }
};

module.exports = deleteFileFromS3;