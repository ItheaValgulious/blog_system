import { createServer } from "node:http";

import { createApp } from "./app.js";
import { getDefaultSettings } from "./config.js";

const settings = getDefaultSettings();
const app = createApp(settings);
const server = createServer(app);

server.listen(settings.port, () => {
  console.log(`Blog system API listening on http://localhost:${settings.port}`);
});
