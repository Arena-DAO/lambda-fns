import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import {
	OAUTH2_CLIENT_ID,
	REDIRECT_URI,
	encodeOAuth2State,
} from "src/auth-shared";

const OAUTH2_AUTHORIZE_URL =
	process.env.OAUTH2_AUTHORIZE_URL || "https://discord.com/oauth2/authorize";
const OAUTH2_SCOPES = process.env.SCOPES!;

export const handler = async (
	event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
	try {
		// Retrieve `redirect_uri` and `wallet_address` (or other params) from query parameters
		const queryParams = event.queryStringParameters || {};
		const redirectUri = queryParams.redirect_uri;
		const walletAddress = queryParams.wallet_address;

		if (!redirectUri || !walletAddress) {
			return {
				statusCode: 400,
				body: JSON.stringify({
					error: "redirect_uri and wallet_address are required",
				}),
				headers: {
					"Content-Type": "application/json",
					"Cache-Control": "no-store",
				},
			};
		}

		// Construct the state object
		const state = {
			redirect_uri: redirectUri,
			wallet_address: walletAddress,
		};

		// Encode the state parameter
		const encodedState = encodeOAuth2State(state);

		// Construct the authorization URL
		const authUrl = new URL(OAUTH2_AUTHORIZE_URL);
		authUrl.searchParams.append("client_id", OAUTH2_CLIENT_ID);
		authUrl.searchParams.append("redirect_uri", REDIRECT_URI);
		authUrl.searchParams.append("response_type", "code");
		authUrl.searchParams.append("scope", OAUTH2_SCOPES);
		authUrl.searchParams.append("state", encodedState);

		return {
			statusCode: 302,
			headers: {
				Location: authUrl.toString(),
				"Cache-Control": "no-store",
				Pragma: "no-cache",
			},
			body: "",
		};
	} catch (error: any) {
		console.error("Error in auth-login handler:", error);
		return {
			statusCode: 500,
			headers: {
				"Content-Type": "application/json",
				"Cache-Control": "no-store",
			},
			body: JSON.stringify({
				error: "Internal server error",
				message: error.message,
			}),
		};
	}
};
