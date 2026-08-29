import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { install, setMode, uninstall } from '../src/installer.js';
function withTempHome(fn){const previous=process.env.CODEX_HOME;const home=fs.mkdtempSync(path.join(os.tmpdir(),'codex-lattice-'));process.env.CODEX_HOME=home;try{return fn(home)}finally{if(previous===undefined)delete process.env.CODEX_HOME;else process.env.CODEX_HOME=previous;fs.rmSync(home,{recursive:true,force:true})}}
test('single mode restores baseline instead of forcing a model',()=>withTempHome((home)=>{const config=path.join(home,'config.toml');fs.writeFileSync(config,'model = "custom-model"\n');install('adaptive');setMode('single');assert.equal(fs.readFileSync(config,'utf8'),'model = "custom-model"\n')}));
test('adaptive mode refuses unmanaged agents table instead of creating invalid TOML',()=>withTempHome((home)=>{const config=path.join(home,'config.toml');fs.writeFileSync(config,'[agents]\nenabled = false\n');assert.throws(()=>install('adaptive'),/existing unmanaged \[agents\]/);assert.equal(fs.readFileSync(config,'utf8'),'[agents]\nenabled = false\n')}));
test('uninstall removes only managed configuration',()=>withTempHome((home)=>{const config=path.join(home,'config.toml');fs.writeFileSync(config,'model = "custom-model"\n');install('adaptive');uninstall();assert.equal(fs.readFileSync(config,'utf8'),'model = "custom-model"\n')}));
