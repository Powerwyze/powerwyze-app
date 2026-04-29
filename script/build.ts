import { build as esbuild } from "esbuild";
import { build as viteBuild } from "vite";
import { mkdir, writeFile, rm } from "node:fs/promises";

async function buildAll() {
  // 1. Clean output
  await rm("dist", { recursive: true, force: true });

  // 2. Build frontend with Vite
  console.log("building client...");
  await viteBuild();

  // 3. Bundle the API function with esbuild so ALL relative imports are resolved
  console.log("bundling API function...");
  await esbuild({
    entryPoints: ["api/[[...path]].ts"],
    platform: "node",
    bundle: true,
    format: "esm",
    outfile: "dist/api-bundle.mjs",
    alias: { "@shared": "./shared" },
    // Keep these as external (large native modules or Vercel-provided)
    external: ["twilio"],
    logLevel: "info",
    minify: false,
  });

  // 4. Write Vercel Build Output API v3 structure
  console.log("writing Vercel output structure...");
  
  // Create .vercel/output directory
  await mkdir(".vercel/output/static", { recursive: true });
  await mkdir(".vercel/output/functions/api.func", { recursive: true });
  
  // Copy static files
  const { cp } = await import("node:fs/promises");
  await cp("dist/public", ".vercel/output/static", { recursive: true });
  
  // Read the bundled function
  const { readFile } = await import("node:fs/promises");
  const bundle = await readFile("dist/api-bundle.mjs", "utf-8");
  
  // Write the function handler
  // Vercel requires a specific wrapper for ESM functions
  await writeFile(".vercel/output/functions/api.func/index.mjs", bundle);
  
  // Write the function config
  await writeFile(".vercel/output/functions/api.func/.vc-config.json", JSON.stringify({
    runtime: "nodejs20.x",
    handler: "index.mjs",
    launcherType: "Nodejs",
    shouldAddHelpers: false,
    experimentalResponseStreaming: false
  }, null, 2));
  
  // Write the overall config
  await writeFile(".vercel/output/config.json", JSON.stringify({
    version: 3,
    routes: [
      { src: "^/api(/.*)?$", dest: "/api" },
      { handle: "filesystem" },
      { src: "^/(?!api).*", dest: "/index.html" }
    ]
  }, null, 2));
  
  console.log("done!");
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
