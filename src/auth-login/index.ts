import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import { OAUTH2_CLIENT_ID, REDIRECT_URI } from "src/auth-shared";

const OAUTH2_AUTHORIZE_URL = process.env.OAUTH2_AUTHORIZE_URL || "https://discord.com/oauth2/authorize";
const OAUTH2_SCOPES = process.env.SCOPES!;

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        // Retrieve `state` and `redirect_uri` from query parameters
        const queryParams = event.queryStringParameters || {};
        const state = queryParams.state;

        if (!state) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "State parameter is required" }),
                headers: {
                    'Content-Type': 'application/json',
                    'Cache-Control': 'no-store'
                }
            };
        }
        // Construct the authorization URL
        const authUrl = new URL(OAUTH2_AUTHORIZE_URL);
        authUrl.searchParams.append("client_id", OAUTH2_CLIENT_ID);
        authUrl.searchParams.append("redirect_uri", REDIRECT_URI);
        authUrl.searchParams.append("response_type", "code");
        authUrl.searchParams.append("scope", OAUTH2_SCOPES);
        authUrl.searchParams.append("state", state);

        return {
            statusCode: 302,
            headers: {
                'Location': authUrl.toString(),
                'Cache-Control': 'no-store',
                'Pragma': 'no-cache'
            },
            body: ""
        };
    } catch (error: any) {
        console.error("Error in auth-login handler:", error);
        return {
            statusCode: 500,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store'
            },
            body: JSON.stringify({
                error: "Internal server error",
                message: error.message
            })
        };
    }
};
