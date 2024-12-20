// build.ts
import * as esbuild from "esbuild";

const baseConfig: esbuild.BuildOptions = {
	platform: "node",
	target: "node18",
	format: "cjs",
	bundle: true,
	minify: true,
	sourcemap: false,
	// Don't bundle aws-sdk as it's provided by Lambda
	external: ["aws-sdk"],
};

async function build() {
	await esbuild.build({
		...baseConfig,
		entryPoints: [
			"src/auth-login/index.ts",
			"src/auth-callback/index.ts",
			"src/auth-logout/index.ts",
		],
		outdir: "dist",
	});
}

build().catch((err) => {
	console.error(err);
	process.exit(1);
});
