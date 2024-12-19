import {
	type ExecuteResult,
	SigningCosmWasmClient,
} from "@cosmjs/cosmwasm-stargate";
import { DirectSecp256k1HdWallet } from "@cosmjs/proto-signing";
import { GasPrice } from "@cosmjs/stargate";
import type { User } from "discord.js";
import {
	ArenaDiscordIdentityClient,
	ArenaDiscordIdentityQueryClient,
} from "src/codegen/ArenaDiscordIdentity.client";
import { DiscordProfile } from "src/codegen/ArenaDiscordIdentity.types";

const CONTRACT_ADDRESS =
	process.env.CONTRACT_ADDRESS ||
	"neutron178d4vnfyuthyttes4h0z68t6vx7es3vq5mlq0h9laexvq6vtsnqql9ut8t";
const FAUCET_MNEMONIC = process.env.FAUCET_MNEMONIC!;
const RPC_ENDPOINT =
	process.env.RPC_ENDPOINT || "https://neutron-rpc.publicnode.com:443";
const GAS_PRICE = process.env.GAS_PRICE || "0.0053untrn";
const BECH32_PREFIX = process.env.BECH32_PREFIX || "neutron";

/**
 * Updates the chain state by executing the `set_profile` method on the smart contract.
 *
 * @param {string} addr - The wallet address to associate with the profile.
 * @param {DiscordProfile} profile - The Discord profile to set, including id, avatar, and username.
 * @returns {Promise<ExecuteResult>} - The result of the contract execution.
 * @throws {Error} - If the execution fails.
 */
export async function updateChainState(
	addr: string,
	profile: User,
): Promise<ExecuteResult | null> {
	try {
		// Initialize the wallet
		const wallet = await DirectSecp256k1HdWallet.fromMnemonic(FAUCET_MNEMONIC, {
			prefix: BECH32_PREFIX,
		});

		// Initialize the client
		const cosmWasmClient = await SigningCosmWasmClient.connectWithSigner(
			RPC_ENDPOINT,
			wallet,
			{
				gasPrice: GasPrice.fromString(GAS_PRICE),
			},
		);

		// Get the wallet's account details
		const account = (await wallet.getAccounts())[0];

		// Query for current profile
		const queryClient = new ArenaDiscordIdentityQueryClient(
			cosmWasmClient,
			CONTRACT_ADDRESS,
		);
		const currentProfile = await queryClient.discordProfile({ addr: addr });

		// Check if update is needed
		if (
			currentProfile &&
			currentProfile.user_id === profile.id &&
			currentProfile.avatar_hash === profile.avatar &&
			currentProfile.username === profile.username
		) {
			console.log("Profile is already up to date, skipping transaction");
			return null;
		}

		const client = new ArenaDiscordIdentityClient(
			cosmWasmClient,
			account.address,
			CONTRACT_ADDRESS,
		);
		const result = await client.setProfile({
			addr: addr,
			discordProfile: {
				user_id: profile.id,
				avatar_hash: profile.avatar,
				username: profile.username,
			},
		});

		return result;
	} catch (error: any) {
		console.error("Failed to update chain state:", error);
		throw new Error(`Failed to update chain state: ${error.message}`);
	}
}
