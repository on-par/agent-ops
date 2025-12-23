import { initTelemetry } from "./telemetry.js";
import { buildApp } from "./app.js";
import { loadConfig, getListenOptions } from "./config.js";

// Initialize OpenTelemetry before anything else
initTelemetry();

async function main(): Promise<void> {
  const config = loadConfig();
  const app = await buildApp({ config });

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
