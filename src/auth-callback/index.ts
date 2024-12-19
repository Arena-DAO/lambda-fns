import type { APIGatewayProxyEvent, APIGatewayProxyResult } from "aws-lambda";
import axios from "axios";
import {
	OAUTH2_CLIENT_ID,
	OAUTH2_CLIENT_SECRET,
	REDIRECT_URI,
	SESSION_EXPIRATION_SECONDS,
	createSession,
	decodeOAuth2State,
	getDiscordProfileFromToken,
} from "src/auth-shared";
import { updateChainState } from "../auth-shared/neutron";

const OAUTH2_TOKEN_URL =
	process.env.OAUTH2_TOKEN_URL || "https://discord.com/api/oauth2/token";

export const handler = async (
	event: APIGatewayProxyEvent,
): Promise<APIGatewayProxyResult> => {
	try {
		const queryParams = event.queryStringParameters || {};
		const stateString = queryParams.state;
		const code = queryParams.code;

		if (!stateString || !code) {
			return {
				statusCode: 400,
				headers: {
					"Content-Type": "application/json",
					"Cache-Control": "no-store",
				},
				body: JSON.stringify({ error: "Code was not sent in OAuth2 flow." }),
			};
		}

		const state = decodeOAuth2State(stateString);

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
			},
		);

		const { access_token, refresh_token, expires_in } = tokenResponse.data;

		// Get discord user id
		const profile = await getDiscordProfileFromToken(access_token);

		// Store the tokens securely
		const expirationTime = Math.floor(Date.now() / 1000) + expires_in;
		const sessionToken = await createSession(
			profile.id,
			access_token,
			refresh_token,
			expirationTime,
		);

		// Update the chain state
		const result = await updateChainState(state.wallet_address, profile);

		return {
			statusCode: 302,
			headers: {
				"Set-Cookie": `sessionToken=${sessionToken}; HttpOnly; Secure; SameSite=Strict; Path=/; Max-Age=${SESSION_EXPIRATION_SECONDS}`,
				Location: `https://arenadao.org/oauth/callback?redirect_uri=${encodeURIComponent(state.redirect_uri)}`,
				"Cache-Control": "no-store",
			},
			body: JSON.stringify({
				success: true,
				txHash: result?.transactionHash,
				message: "Operation completed successfully.",
			}),
		};
	} catch (error: any) {
		console.error("Error in auth-callback handler:", error);
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
