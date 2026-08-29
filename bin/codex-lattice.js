#!/usr/bin/env node
import {spawnSync} from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import {buildPlan} from '../src/policy.js';
import {install,setMode,uninstall,codexHome} from '../src/installer.js';

const [cmd,...args]=process.argv.slice(2);
function help(){console.log(`CodexLattice\n\nCommands:\n  install [adaptive|single]\n  mode <adaptive|single>\n  explain <task>\n  run <task>\n  doctor\n  uninstall\n`)}
function orchestrationPrompt(task,plan){
return `You are running under CodexLattice adaptive orchestration.\n\nUSER TASK:\n${task}\n\nROUTE PLAN (quality-first; cost minimized only inside the near-optimal quality set):\n${JSON.stringify(plan,null,2)}\n\nPOLICY:\n1. Preserve correctness and user requirements before optimizing cost.\n2. Plan first for non-trivial work. Use lattice_planner when architectural ambiguity/risk justifies it.\n3. Use lattice_explorer in parallel only for independent repository questions; do not fan out serial dependencies.\n4. Use lattice_implementer for bounded workstreams. Prefer deterministic tests/static checks over model voting.\n5. Use lattice_reviewer for material changes or whenever deterministic validation is incomplete, agents disagree, or risk is elevated.\n6. Escalate model/effort only on evidence of failure, unresolved ambiguity, or high risk. Stop spawning agents when additional work is unlikely to change the result.\n7. If the task is simple, it is valid to do it directly without subagents.\n8. Return one coherent final result, including tests/checks performed and unresolved risks.\n`}
try {
  if(!cmd||['-h','--help','help'].includes(cmd)){help();process.exit(0)}
  if(cmd==='install'){console.log(JSON.stringify(install(args[0]||'adaptive'),null,2));process.exit(0)}
  if(cmd==='mode'){console.log(JSON.stringify(setMode(args[0]),null,2));process.exit(0)}
  if(cmd==='uninstall'){console.log(JSON.stringify(uninstall(),null,2));process.exit(0)}
  if(cmd==='explain'){const task=args.join(' '); console.log(JSON.stringify(buildPlan(task),null,2));process.exit(0)}
  if(cmd==='doctor'){
    const home=codexHome(); const config=path.join(home,'config.toml');
    console.log(JSON.stringify({codexHome:home,configExists:fs.existsSync(config),codexOnPath:spawnSync('codex',['--version'],{encoding:'utf8'}).status===0},null,2));process.exit(0)
  }
  if(cmd==='run'){
    const task=args.join(' '); if(!task) throw new Error('run requires a task');
    const plan=buildPlan(task); const prompt=orchestrationPrompt(task,plan);
    const r=spawnSync('codex',['exec',prompt],{stdio:'inherit'}); process.exit(r.status??1);
  }
  help(); process.exit(1);
} catch(e){console.error(`codex-lattice: ${e.message}`);process.exit(1)}
