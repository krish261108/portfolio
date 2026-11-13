// Renders the film's narration from src/data.js into public/vo/.
// Each line becomes its own AAC file, so its subtitle can sit exactly on it.
//
//   npm run voiceover                         Kokoro neural voice (default: am_michael)
//   VOICE=af_heart npm run voiceover          another Kokoro voice (am_* male, af_* female)
//   SPEED=0.9 npm run voiceover               slower, more dramatic delivery
//   ENGINE=say VOICE=Daniel npm run voiceover the built-in macOS voices instead
//
// Kokoro lives in scripts/voice-tools (install once with
// `npm --prefix scripts/voice-tools install`; the first render downloads its
// ~163 MB model). To use your own recordings, drop files named like the ones
// this writes (opening-1.m4a, act-3-2.m4a, ...) into public/vo/ and run with
// ENGINE=recorded to rebuild only the manifest from them.
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { tmpdir } from 'node:os'
import { voiceover } from '../src/data.js'

// fileURLToPath, not .pathname: the project folder has a space in its name.
const OUT = fileURLToPath(new URL('../public/vo/', import.meta.url))
const TOOLS = fileURLToPath(new URL('./voice-tools/', import.meta.url))
const hasKokoro = existsSync(join(TOOLS, 'node_modules', 'kokoro-js'))
const ENGINE = process.env.ENGINE || (hasKokoro ? 'kokoro' : 'say')
const VOICE = process.env.VOICE || (ENGINE === 'kokoro' ? 'am_michael' : 'Daniel')
const SPEED = Number(process.env.SPEED || 0.95)
const RATE = process.env.RATE || '172' // words per minute, for `say`
const TMP = mkdtempSync(join(tmpdir(), 'vo-'))

mkdirSync(OUT, { recursive: true })

const duration = (file) => {
  const info = execFileSync('afinfo', [file], { encoding: 'utf8' })
  const m = info.match(/estimated duration:\s*([\d.]+)/)
  return m ? Math.round(parseFloat(m[1]) * 1000) / 1000 : 0
}

// Curly quotes and apostrophes read fine on screen; give the speech engines
// plain ones.
const speakable = (text) => text.replace(/[’‘]/g, "'").replace(/[“”]/g, '"')

// AAC at 44.1 kHz, constant 128 kbps: clean on any speaker, ~20 KB a second.
const encode = (src, dest) =>
  execFileSync('afconvert', ['-f', 'm4af', '-d', 'aac@44100', '-s', '0', '-b', '128000', '--src-complexity', 'bats', '-r', '127', src, dest])

const entries = Object.entries(voiceover).flatMap(([key, lines]) =>
  lines.map((text, i) => ({ key, i, text, name: `${key}-${i + 1}.m4a` }))
)

if (ENGINE === 'kokoro') {
  if (!hasKokoro) throw new Error('Kokoro is not installed: npm --prefix scripts/voice-tools install')
  const jobs = entries.map((e) => ({ text: speakable(e.text), out: join(TMP, e.name.replace('.m4a', '.wav')) }))
  const spec = join(TMP, 'jobs.json')
  writeFileSync(spec, JSON.stringify({ voice: VOICE, speed: SPEED, jobs }))
  // NODE_USE_ENV_PROXY: lets Node's fetch reach Hugging Face through a proxy
  // if the model still has to be downloaded.
  execFileSync(process.execPath, [join(TOOLS, 'render.mjs'), spec], {
    stdio: ['ignore', 'inherit', 'inherit'],
    env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
  })
  entries.forEach((e, n) => encode(jobs[n].out, join(OUT, e.name)))
} else if (ENGINE === 'say') {
  for (const e of entries) {
    const aiff = join(TMP, e.name.replace('.m4a', '.aiff'))
    execFileSync('say', ['-v', VOICE, '-r', RATE, '--file-format=AIFF', '--data-format=BEI16@44100', '-o', aiff, speakable(e.text)])
    encode(aiff, join(OUT, e.name))
  }
} else if (ENGINE !== 'recorded') {
  throw new Error(`Unknown ENGINE "${ENGINE}" (kokoro | say | recorded)`)
}

const manifest = {
  engine: ENGINE,
  voice: ENGINE === 'recorded' ? 'recorded' : VOICE,
  // Played back slightly slower and deeper for the robotic `say` voices; a
  // neural voice or a real recording plays as rendered.
  playbackRate: ENGINE === 'say' ? 0.94 : 1,
  lines: {},
}
for (const e of entries) {
  const target = join(OUT, e.name)
  if (!existsSync(target)) throw new Error(`Missing ${target}`)
  ;(manifest.lines[e.key] ||= [])[e.i] = { file: `/vo/${e.name}`, text: e.text, duration: duration(target) }
}

writeFileSync(join(OUT, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
rmSync(TMP, { recursive: true, force: true })
console.log(`${ENGINE === 'recorded' ? 'Indexed' : `Rendered with ${ENGINE} "${VOICE}":`} ${entries.length} lines -> public/vo/`)
