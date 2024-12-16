import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import axios from "axios";
import { getDiscordIdFromToken, updateTokenData } from "src/auth-shared";

const OAUTH2_TOKEN_URL = process.env.OAUTH2_TOKEN_URL || "https://discord.com/api/oauth2/token";
const OAUTH2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID!;
const OAUTH2_CLIENT_SECRET = process.env.OAUTH2_CLIENT_SECRET!;
const ALLOWED_REDIRECT_URIS = (process.env.ALLOWED_REDIRECT_URIS || "").split(",");

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const queryParams = event.queryStringParameters || {};
        const state = queryParams.state;
        const code = queryParams.code;
        const redirectUri = queryParams.redirect_uri;

        if (!state || !code || !redirectUri) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "State, code, and redirect_uri are required." }),
            };
        }

        // Validate the provided `redirect_uri`
        if (!ALLOWED_REDIRECT_URIS.includes(redirectUri)) {
            console.error("Invalid redirect_uri:", redirectUri);
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "Invalid redirect_uri." }),
            };
        }

        // Exchange the authorization code for tokens
        const tokenResponse = await axios.post(
            OAUTH2_TOKEN_URL,
            new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: redirectUri,
                client_id: OAUTH2_CLIENT_ID,
                client_secret: OAUTH2_CLIENT_SECRET,
            }).toString(),
            {
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                },
            }
        );

        const { access_token, refresh_token, expires_in } = tokenResponse.data;

        // Get discord user id
        const userId = await getDiscordIdFromToken(access_token);

        // Store the tokens securely
        const expirationTime = Math.floor(Date.now() / 1000) + expires_in;
        await updateTokenData(userId, access_token, refresh_token, expirationTime);

        return {
            statusCode: 200,
            body: JSON.stringify({ success: true, access_token, refresh_token, expires_in, state }),
        };
    } catch (error: any) {
        console.error("Error in auth-callback handler:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal server error." }),
        };
    }
};
