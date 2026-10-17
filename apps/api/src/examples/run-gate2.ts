import {runGate2Example} from './gate2-flow.js';
runGate2Example().then(result=>process.stdout.write(`${JSON.stringify({status:'ok',...result},null,2)}\n`)).catch(()=>{
  process.stderr.write('Gate 2 example failed\n');process.exitCode=1;
});
