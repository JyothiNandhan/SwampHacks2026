import {mkdirSync,lstatSync,chownSync,chmodSync} from 'node:fs';
import {spawn} from 'node:child_process';

// Railway mounts its volume after the image is built, replacing image ownership.
// Initialize only the known evidence directory, then drop privileges before launch.
try {
 if(process.getuid?.()===0){
  mkdirSync('/data/evidence',{recursive:true,mode:0o700});
  if(!lstatSync('/data').isDirectory()||!lstatSync('/data/evidence').isDirectory())throw new Error('INVALID_EVIDENCE_DIRECTORY');
  chownSync('/data',1000,1000);chmodSync('/data',0o700);
  chownSync('/data/evidence',1000,1000);chmodSync('/data/evidence',0o700);
  process.setgroups([]);process.setgid(1000);process.setuid(1000);
 }
 const [command,...args]=process.argv.slice(2);
 if(!command)throw new Error('MISSING_START_COMMAND');
 const child=spawn(command,args,{stdio:'inherit',env:process.env});
 for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>child.kill(signal));
 child.on('error',()=>{console.error('Container command failed to start.');process.exitCode=1;});
 child.on('exit',(code,signal)=>{process.exitCode=code??(signal==='SIGTERM'?143:1);});
}catch{
 console.error('Container initialization failed. Check evidence volume permissions.');
 process.exitCode=1;
}
