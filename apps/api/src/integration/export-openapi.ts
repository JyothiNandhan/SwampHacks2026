import { openApiDocument } from './openapi.js';
process.stdout.write(`${JSON.stringify(openApiDocument(),null,2)}\n`);
