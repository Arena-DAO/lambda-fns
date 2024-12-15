import { DynamoDBClient, GetItemCommand, UpdateItemCommand } from "@aws-sdk/client-dynamodb";
import axios from "axios";

const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE!;
const REGION = process.env.AWS_REGION || "us-east-1";
const OAUTH2_TOKEN_URL = process.env.OAUTH2_TOKEN_URL!;
const OAUTH2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID!;
const OAUTH2_CLIENT_SECRET = process.env.OAUTH2_CLIENT_SECRET!;
const DISCORD_API_URL = "https://discord.com/api";

const dynamoDbClient = new DynamoDBClient({ region: REGION });

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
    await updateTokenData(userId, newTokenData.accessToken, newTokenData.refreshToken, newTokenData.expirationTime);

    return newTokenData.accessToken;
};

/**
 * Refresh the access token using the refresh token.
 * @param refreshToken The refresh token to use.
 * @returns A new access token and its expiration time.
 */
const refreshAccessToken = async (refreshToken: string): Promise<{ accessToken: string; refreshToken: string; expirationTime: number }> => {
    try {
        const params = new URLSearchParams({
            grant_type: "refresh_token",
            refresh_token: refreshToken,
            client_id: OAUTH2_CLIENT_ID,
            client_secret: OAUTH2_CLIENT_SECRET,
        });

        const response = await axios.post(OAUTH2_TOKEN_URL, params, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded'
            }
        });

        const { access_token, refresh_token, expires_in } = response.data;
        const expirationTime = Math.floor(Date.now() / 1000) + expires_in;

        return {
            accessToken: access_token,
            refreshToken: refresh_token,
            expirationTime,
        };
    } catch (error: any) {
        console.error("Error refreshing access token:", error.response?.data || error.message);
        throw new Error("Failed to refresh access token.");
    }
};

/**
 * Retrieve token data for a given user ID from DynamoDB.
 * @param userId The ID of the user.
 * @returns The token data if found, or null.
 */
const getTokenData = async (userId: string): Promise<{ accessToken: string; refreshToken: string; expirationTime: number } | null> => {
    const command = new GetItemCommand({
        TableName: DYNAMODB_TABLE,
        Key: { userId: { S: userId } },
    });

    const response = await dynamoDbClient.send(command);

    if (!response.Item) {
        return null;
    }

    return {
        accessToken: response.Item.accessToken.S!,
        refreshToken: response.Item.refreshToken.S!,
        expirationTime: parseInt(response.Item.expirationTime.N!, 10),
    };
};

/**
 * Update token data for a given user ID in DynamoDB.
 * @param userId The ID of the user.
 * @param accessToken The new access token.
 * @param refreshToken The new refresh token.
 * @param expirationTime The new expiration time.
 */
export const updateTokenData = async (userId: string, accessToken: string, refreshToken: string, expirationTime: number): Promise<void> => {
    const command = new UpdateItemCommand({
        TableName: DYNAMODB_TABLE,
        Key: { userId: { S: userId } },
        UpdateExpression: "SET accessToken = :accessToken, refreshToken = :refreshToken, expirationTime = :expirationTime",
        ExpressionAttributeValues: {
            ":accessToken": { S: accessToken },
            ":refreshToken": { S: refreshToken },
            ":expirationTime": { N: expirationTime.toString() },
        },
    });

    await dynamoDbClient.send(command);
};

/**
 * Fetch the Discord ID using the Bearer token from Discord API.
 * @param token - The Bearer token from the Authorization header.
 * @returns The Discord ID of the user.
 */
export const getDiscordIdFromToken = async (token: string): Promise<string> => {
    try {
        const response = await axios.get(DISCORD_API_URL + "/users/@me", {
            headers: {
                Authorization: `Bearer ${token}`,
            },
        });

        if (!response.data || !response.data.id) {
            throw new Error("Failed to fetch Discord ID from the API.");
        }

        return response.data.id;
    } catch (error: any) {
        console.error("Error fetching Discord ID:", error.response?.data || error.message);
        throw new Error("Failed to fetch Discord ID from the API.");
    }
};


export default {
    getValidAccessToken,
};
