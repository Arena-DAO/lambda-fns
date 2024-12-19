import { randomBytes } from "node:crypto";
import {
	DynamoDBClient,
	GetItemCommand,
	UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import axios from "axios";
import type { User } from "discord.js";
import { decrypt, encrypt } from "./security";

const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE || "AuthTokensTable";
const REGION = process.env.AWS_REGION || "us-east-2";
const DISCORD_API_URL =
	process.env.DISCORD_API_URL || "https://discord.com/api";
export const OAUTH2_TOKEN_URL =
	process.env.OAUTH2_TOKEN_URL || "https://discord.com/api/oauth2/token";
export const OAUTH2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID!;
export const OAUTH2_CLIENT_SECRET = process.env.OAUTH2_CLIENT_SECRET!;
export const REDIRECT_URI = "https://api.arenadao.org/callback";
export const SESSION_EXPIRATION_SECONDS = 86400; // 1 day

const dynamoDbClient = new DynamoDBClient({ region: REGION });

export type OAuth2State = {
	redirect_url: string;
	wallet_address: string;
};

/**
 * Encodes the OAuth2 state object into a URL-safe string
 * @param state The state object to encode
 * @returns URL-safe string representing the state
 */
export function encodeOAuth2State(state: OAuth2State): string {
	return Buffer.from(JSON.stringify(state)).toString("base64url");
}

/**
 * Decodes a state string back into an OAuth2State object
 * @param stateString The encoded state string to decode
 * @returns The decoded OAuth2State object
 * @throws Error if the state string is invalid
 */
export function decodeOAuth2State(stateString: string): OAuth2State {
	try {
		const decoded = Buffer.from(stateString, "base64url").toString();
		const state = JSON.parse(decoded) as OAuth2State;

		// Validate the decoded state has the required properties
		if (!state.redirect_url || !state.wallet_address) {
			throw new Error("Invalid state object structure");
		}

		return state;
	} catch (error) {
		throw new Error(
			`Failed to decode OAuth2 state: ${error instanceof Error ? error.message : "Invalid state"}`,
		);
	}
}

/**
 * Generate a new session token.
 * @returns A secure session token.
 */
const generateSessionToken = (): string => {
	return randomBytes(32).toString("hex");
};

/**
 * Get a valid access token for the given user.
 * Refreshes the token if it is expired.
 * @param userId The ID of the user to retrieve the token for.
 * @returns A valid access token.
 */
const getValidAccessToken = async (userId: string): Promise<string> => {
	// Fetch token data from DynamoDB
	const tokenData = await getTokenData(userId);

	if (!tokenData) {
		throw new Error(`No token data found for user ID: ${userId}`);
	}

	const { accessToken, refreshToken, expirationTime } = tokenData;

	// Check if the token is expired
	const currentTime = Math.floor(Date.now() / 1000);
	if (currentTime < expirationTime) {
		return accessToken;
	}

	// Token is expired: Refresh it
	const newTokenData = await refreshAccessToken(refreshToken);

	// Update DynamoDB with the new token data
	await createSession(
		userId,
		newTokenData.accessToken,
		newTokenData.refreshToken,
		newTokenData.expirationTime,
	);

	return newTokenData.accessToken;
};

export const getValidAccessTokenWithSession = async (
	userId: string,
	sessionToken: string,
): Promise<string> => {
	const isSessionValid = await validateAndRefreshSession(userId, sessionToken);

	if (!isSessionValid) {
		throw new Error("Session token is invalid or expired.");
	}

	return await getValidAccessToken(userId); // Use existing logic to get a valid access token
};

/**
 * Refresh the access token using the refresh token.
 * @param refreshToken The refresh token to use.
 * @returns A new access token and its expiration time.
 */
const refreshAccessToken = async (
	refreshToken: string,
): Promise<{
	accessToken: string;
	refreshToken: string;
	expirationTime: number;
}> => {
	try {
		const params = new URLSearchParams({
			grant_type: "refresh_token",
			refresh_token: refreshToken,
			client_id: OAUTH2_CLIENT_ID,
			client_secret: OAUTH2_CLIENT_SECRET,
		});

		const response = await axios.post(OAUTH2_TOKEN_URL, params, {
			headers: {
				"Content-Type": "application/x-www-form-urlencoded",
			},
		});

		const { access_token, refresh_token, expires_in } = response.data;
		const expirationTime = Math.floor(Date.now() / 1000) + expires_in;

		return {
			accessToken: access_token,
			refreshToken: refresh_token,
			expirationTime,
		};
	} catch (error: any) {
		console.error(
			"Error refreshing access token:",
			error.response?.data || error.message,
		);
		throw new Error("Failed to refresh access token.");
	}
};

/**
 * Retrieve token and session data for a given user ID from DynamoDB.
 * @param userId The ID of the user.
 * @returns The token and session data if found, or null.
 */
const getTokenData = async (
	userId: string,
): Promise<{
	accessToken: string;
	refreshToken: string;
	expirationTime: number;
	sessionToken: string;
	sessionExpirationTime: number;
} | null> => {
	const command = new GetItemCommand({
		TableName: DYNAMODB_TABLE,
		Key: { userId: { S: userId } },
	});

	try {
		const response = await dynamoDbClient.send(command);

		if (!response.Item) {
			return null; // No data found for this user
		}

		// Decrypt sensitive data
		return {
			accessToken: decrypt(response.Item.accessToken.S!),
			refreshToken: decrypt(response.Item.refreshToken.S!),
			expirationTime: Number.parseInt(response.Item.expirationTime.N!, 10),
			sessionToken: decrypt(response.Item.sessionToken.S!),
			sessionExpirationTime: Number.parseInt(
				response.Item.sessionExpirationTime.N!,
				10,
			),
		};
	} catch (error: any) {
		console.error("Error fetching token data:", error.message);
		throw new Error("Failed to retrieve token data.");
	}
};

/**
 * Create a new session for a user in DynamoDB.
 * @param userId The ID of the user.
 * @param accessToken The access token.
 * @param refreshToken The refresh token.
 * @param expirationTime The expiration time of the access token.
 */
export const createSession = async (
	userId: string,
	accessToken: string,
	refreshToken: string,
	expirationTime: number,
): Promise<string> => {
	const sessionToken = generateSessionToken();
	const sessionExpirationTime =
		Math.floor(Date.now() / 1000) + SESSION_EXPIRATION_SECONDS; // 1 day session expiry

	// Encrypt sensitive data
	const encryptedAccessToken = encrypt(accessToken);
	const encryptedRefreshToken = encrypt(refreshToken);
	const encryptedSessionToken = encrypt(sessionToken);

	const command = new UpdateItemCommand({
		TableName: DYNAMODB_TABLE,
		Key: { userId: { S: userId } },
		UpdateExpression:
			"SET accessToken = :accessToken, refreshToken = :refreshToken, expirationTime = :expirationTime, sessionToken = :sessionToken, sessionExpirationTime = :sessionExpirationTime",
		ExpressionAttributeValues: {
			":accessToken": { S: encryptedAccessToken },
			":refreshToken": { S: encryptedRefreshToken },
			":expirationTime": { N: expirationTime.toString() },
			":sessionToken": { S: encryptedSessionToken },
			":sessionExpirationTime": { N: sessionExpirationTime.toString() },
		},
	});

	await dynamoDbClient.send(command);
	return sessionToken;
};

/**
 * Validate and refresh a session token.
 * @param userId The ID of the user.
 * @param sessionToken The session token to validate.
 * @returns True if the session is valid, otherwise false.
 */
export const validateAndRefreshSession = async (
	userId: string,
	sessionToken: string,
): Promise<boolean> => {
	const tokenData = await getTokenData(userId);

	if (!tokenData || tokenData.sessionToken !== sessionToken) {
		return false;
	}

	const currentTime = Math.floor(Date.now() / 1000);

	if (currentTime > tokenData.sessionExpirationTime) {
		return false; // Session expired
	}

	// Refresh session expiration time (sliding expiry)
	const newSessionExpirationTime = currentTime + SESSION_EXPIRATION_SECONDS; // Extend by 1 day

	const command = new UpdateItemCommand({
		TableName: DYNAMODB_TABLE,
		Key: { userId: { S: userId } },
		UpdateExpression: "SET sessionExpirationTime = :sessionExpirationTime",
		ExpressionAttributeValues: {
			":sessionExpirationTime": { N: newSessionExpirationTime.toString() },
		},
	});

	await dynamoDbClient.send(command);
	return true;
};

/**
 * Fetch the Discord ID using the Bearer token from Discord API.
 * @param token - The Bearer token from the Authorization header.
 * @returns The Discord ID of the user.
 */
export const getDiscordProfileFromToken = async (
	token: string,
): Promise<User> => {
	try {
		const response = await axios.get(`${DISCORD_API_URL}/users/@me`, {
			headers: {
				Authorization: `Bearer ${token}`,
			},
		});

		if (!response.data || !response.data) {
			throw new Error("Failed to fetch Discord ID from the API.");
		}

		return response.data;
	} catch (error: any) {
		console.error(
			"Error fetching Discord ID:",
			error.response?.data || error.message,
		);
		throw new Error("Failed to fetch Discord ID from the API.");
	}
};
