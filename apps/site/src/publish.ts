import { publishSite } from "./publisher.js";

const result = await publishSite();
console.log(result.message);
