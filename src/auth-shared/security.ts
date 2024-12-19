import crypto from "node:crypto";

// Default values or from environment variables
const ENCRYPTION_KEY = Buffer.from(process.env.ENCRYPTION_KEY!, "hex");

/**
 * Encrypt a string using AES-256-CBC.
 * @param data - The string to encrypt.
 * @returns The encrypted string (includes IV as part of the output).
 */
export const encrypt = (data: string): string => {
	const iv = crypto.randomBytes(16); // Generate a new IV for each encryption
	const cipher = crypto.createCipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
	let encrypted = cipher.update(data, "utf8", "hex");
	encrypted += cipher.final("hex");

	// Return IV + Encrypted data as a single string
	return `${iv.toString("hex")}:${encrypted}`;
};

/**
 * Decrypt a string using AES-256-CBC.
 * @param data - The encrypted string (format: IV:Ciphertext).
 * @returns The decrypted string.
 */
export const decrypt = (data: string): string => {
	const [ivHex, encryptedData] = data.split(":");

	if (!ivHex || !encryptedData) {
		throw new Error("Invalid encrypted data format. Expected IV:Ciphertext.");
	}

	const iv = Buffer.from(ivHex, "hex");
	const decipher = crypto.createDecipheriv("aes-256-cbc", ENCRYPTION_KEY, iv);
	let decrypted = decipher.update(encryptedData, "hex", "utf8");
	decrypted += decipher.final("utf8");

	return decrypted;
};
