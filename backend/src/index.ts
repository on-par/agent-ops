import { initTelemetry } from "./telemetry.js";
import { buildApp } from "./app.js";
import { loadConfig, getListenOptions } from "./config.js";
import { createDatabase } from "./db/index.js";

// Initialize OpenTelemetry before anything else
initTelemetry();

async function main(): Promise<void> {
  const config = loadConfig();

  // Create database connection
  const { db } = createDatabase({ url: config.databaseUrl });

  const app = await buildApp({ config, db });

  try {
    const listenOptions = getListenOptions(config);
    await app.listen(listenOptions);
    console.log(`Server listening on http://localhost:${config.port}`);
  } catch (error) {
    app.log.error(error);
    process.exit(1);
  }
}

main();
