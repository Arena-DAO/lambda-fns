import axios from "axios";
import type { GuildMember, User } from "discord.js";

const DISCORD_API_URL =
	process.env.DISCORD_API_URL || "https://discord.com/api";
const DAO_GUILD_ID = process.env.GUILD_ID || "935952657884008518";
const DISCORD_BOT_TOKEN = process.env.DISCORD_BOT_TOKEN;
const DISCORD_DEFAULT_ROLE =
	process.env.DISCORD_DEFAULT_ROLE || "1041894768931782686";

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

/**
 * Adds a user to a Discord guild using their OAuth2 access token.
 * @param userId - The ID of the user to add
 * @param accessToken - OAuth2 access token with guilds.join scope
 * @returns The added guild member object or undefined if user was already a member
 */
export const addGuildMember = async (
	userId: string,
	accessToken: string,
): Promise<GuildMember | undefined> => {
	try {
		const response = await axios.put(
			`${DISCORD_API_URL}/guilds/${DAO_GUILD_ID}/members/${userId}`,
			{
				access_token: accessToken,
				roles: [DISCORD_DEFAULT_ROLE],
			},
			{
				headers: {
					Authorization: `Bot ${DISCORD_BOT_TOKEN}`,
				},
			},
		);

		// Return undefined if user was already a member (204 No Content)
		if (response.status === 204) {
			return undefined;
		}

		// Return the guild member object for new members (201 Created)
		return response.data;
	} catch (error: any) {
		console.error(
			"Error adding guild member:",
			error.response?.data || error.message,
		);

		if (error.response?.data?.code === 30001) {
			// User is at max guilds of 100
			return undefined;
		}

		throw new Error("Failed to add user to guild.");
	}
};
