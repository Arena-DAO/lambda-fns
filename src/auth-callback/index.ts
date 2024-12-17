import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import axios from "axios";
import { getDiscordProfileFromToken, OAUTH2_CLIENT_ID, OAUTH2_CLIENT_SECRET, REDIRECT_URI, updateTokenData } from "src/auth-shared";

const OAUTH2_TOKEN_URL = process.env.OAUTH2_TOKEN_URL || "https://discord.com/api/oauth2/token";

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        const queryParams = event.queryStringParameters || {};
        const state = queryParams.state;
        const code = queryParams.code;

        if (!state || !code) {
            return {
                statusCode: 400,
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store'
                },
                body: JSON.stringify({ error: "State and code are required." }),
            };
        }

        // Exchange the authorization code for tokens
        const tokenResponse = await axios.post(
            OAUTH2_TOKEN_URL,
            new URLSearchParams({
                grant_type: "authorization_code",
                code,
                redirect_uri: REDIRECT_URI,
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
        const profile = await getDiscordProfileFromToken(access_token);

        // Store the tokens securely
        const expirationTime = Math.floor(Date.now() / 1000) + expires_in;
        await updateTokenData(profile.id, access_token, refresh_token, expirationTime);

        return {
            statusCode: 302,
            headers: {
                'Location': `https://arenadao.org/oauth/callback?state=${state}`,
                'Cache-Control': 'no-store',
            },
            body: "",
        };
    } catch (error: any) {
        console.error("Error in auth-callback handler:", error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store'
            },
            body: JSON.stringify({
                error: "Internal server error",
                message: error.message
            }),
        };
    }
};
