#!/usr/bin/env node
// garden — `garden <service> <method> [ value ]`. See src/cli.js.
import { main } from '../src/cli.js';

await main(process.argv.slice(2));
