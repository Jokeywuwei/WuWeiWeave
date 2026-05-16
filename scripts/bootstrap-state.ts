import { createDefaultDaemon } from "@wuweiweave/core";

const daemon = await createDefaultDaemon();
console.log(JSON.stringify(await daemon.getDashboardState(), null, 2));
