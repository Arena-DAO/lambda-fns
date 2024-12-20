import { randomBytes } from "node:crypto";
import {
	DeleteItemCommand,
	DynamoDBClient,
	GetItemCommand,
	UpdateItemCommand,
} from "@aws-sdk/client-dynamodb";
import axios from "axios";
import { decrypt, encrypt } from "./security";

const AUTH_TOKENS_TABLE = process.env.AUTH_TOKENS_TABLE || "AuthTokensTable";
const REGION = process.env.AWS_REGION || "us-east-2";
export const OAUTH2_TOKEN_URL =
	process.env.OAUTH2_TOKEN_URL || "https://discord.com/api/oauth2/token";
export const OAUTH2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID!;
export const OAUTH2_CLIENT_SECRET = process.env.OAUTH2_CLIENT_SECRET!;
export const REDIRECT_URI = "https://api.arenadao.org/callback";

const dynamoDbClient = new DynamoDBClient({ region: REGION });

export type OAuth2State = {
	redirect_uri: string;
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
		if (!state.redirect_uri || !state.wallet_address) {
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
 * Get a valid access token for the given user.
 * Refreshes the token if it is expired.
 * @param userId The ID of the user to retrieve the token for.
 * @returns A valid access token.
 */
export const getValidAccessToken = async (userId: string): Promise<string> => {
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
	await updateTokens(
		userId,
		newTokenData.accessToken,
		newTokenData.refreshToken,
		newTokenData.expirationTime,
	);

	return newTokenData.accessToken;
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
 * Retrieve token data for a given user ID from DynamoDB.
 * @param userId The ID of the user.
 * @returns The token data if found, or null.
 */
export const getTokenData = async (
	userId: string,
): Promise<{
	accessToken: string;
	refreshToken: string;
	expirationTime: number;
} | null> => {
	const command = new GetItemCommand({
		TableName: AUTH_TOKENS_TABLE,
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
		};
	} catch (error: any) {
		console.error("Error fetching token data:", error.message);
		throw new Error("Failed to retrieve token data.");
	}
};

/**
 * Initialize or update tokens for a user in DynamoDB.
 * @param userId The ID of the user.
 * @param accessToken The access token.
 * @param refreshToken The refresh token.
 * @param expirationTime The expiration time of the access token.
 */
export const updateTokens = async (
	userId: string,
	accessToken: string,
	refreshToken: string,
	expirationTime: number,
): Promise<void> => {
	// Encrypt sensitive data
	const encryptedAccessToken = encrypt(accessToken);
	const encryptedRefreshToken = encrypt(refreshToken);

	const command = new UpdateItemCommand({
		TableName: AUTH_TOKENS_TABLE,
		Key: { userId: { S: userId } },
		UpdateExpression:
			"SET accessToken = :accessToken, refreshToken = :refreshToken, expirationTime = :expirationTime",
		ExpressionAttributeValues: {
			":accessToken": { S: encryptedAccessToken },
			":refreshToken": { S: encryptedRefreshToken },
			":expirationTime": { N: expirationTime.toString() },
		},
	});

	await dynamoDbClient.send(command);
};

/**
 * Clear all auth data for a user in DynamoDB by deleting the entire entry.
 * @param userId The ID of the user.
 * @throws Error if clearing the data fails.
 */
export const clearAuthData = async (userId: string): Promise<void> => {
	try {
		const command = new DeleteItemCommand({
			TableName: AUTH_TOKENS_TABLE,
			Key: { userId: { S: userId } },
		});

		await dynamoDbClient.send(command);
	} catch (error) {
		console.error("Error clearing auth data:", error);
		throw new Error("Failed to clear authentication data");
	}
};
