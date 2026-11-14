// Only this process imports the published, unmodified HyperFrames CLI.
import {installGuard} from './guard.mjs';
const [cli, ...args] = process.argv.slice(2);
if (args[0] === 'preview') installGuard(port => console.log(JSON.stringify({motionPort:port})));
process.argv = [process.execPath, cli, ...args];
await import(cli);
