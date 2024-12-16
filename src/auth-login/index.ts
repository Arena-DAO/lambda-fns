import { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";

const OAUTH2_AUTHORIZE_URL = process.env.OAUTH2_AUTHORIZE_URL || "https://discord.com/oauth2/authorize";
const OAUTH2_CLIENT_ID = process.env.OAUTH2_CLIENT_ID!;
const OAUTH2_SCOPES = process.env.SCOPES!;
const ALLOWED_REDIRECT_URIS = (process.env.ALLOWED_REDIRECT_URIS || "").split(",");

export const handler = async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    try {
        // Retrieve `state` and `redirect_uri` from query parameters
        const queryParams = event.queryStringParameters || {};
        const state = queryParams.state;
        const redirectUri = queryParams.redirect_uri;

        if (!state || !redirectUri) {
            return {
                statusCode: 400,
                body: JSON.stringify({ error: "State and redirect_uri are required." }),
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

        // Construct the authorization URL
        const authUrl = new URL(OAUTH2_AUTHORIZE_URL);
        authUrl.searchParams.append("client_id", OAUTH2_CLIENT_ID);
        authUrl.searchParams.append("redirect_uri", redirectUri);
        authUrl.searchParams.append("response_type", "code");
        authUrl.searchParams.append("scope", OAUTH2_SCOPES);
        authUrl.searchParams.append("state", state);

        return {
            statusCode: 302,
            headers: { Location: authUrl.toString() },
            body: "",
        };
    } catch (error: any) {
        console.error("Error in auth-login handler:", error);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Internal server error." }),
        };
    }
};
