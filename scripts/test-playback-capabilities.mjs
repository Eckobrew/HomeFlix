import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

const source = await readFile(new URL('../src/lib/playback-capabilities.ts', import.meta.url), 'utf8');
const output = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ES2020, target: ts.ScriptTarget.ES2020 } }).outputText;
const { browserPlaybackParameters } = await import(`data:text/javascript;base64,${Buffer.from(output).toString('base64')}`);
const codecs = browserPlaybackParameters(mime => mime.includes('avc1') || mime.includes('av01') || mime === 'audio/mpeg' ? 'probably' : '');
assert.equal(codecs.get('receiver'), 'browser');
assert.equal(codecs.get('videoCodecs'), 'h264,av1');
assert.equal(codecs.get('audioCodecs'), 'mp3');
assert.ok(!codecs.get('videoCodecs').includes('hevc'));
assert.equal(browserPlaybackParameters(() => '').get('videoCodecs'), '');
console.log('Browser capability checks passed: advertised codecs follow actual decoder support.');
