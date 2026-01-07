import fs from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'
import openapiTS, { astToString } from 'openapi-typescript'

const repoRoot = process.cwd()
const specPath = path.join(repoRoot, 'openapi', 'kanidm.json')
const outPath = path.join(repoRoot, 'src', 'api', 'schema.ts')

const spec = JSON.parse(await fs.readFile(specPath, 'utf-8'))
const output = await openapiTS(spec)
const outputText =
  typeof output === 'string' ? output : astToString(output)

await fs.mkdir(path.dirname(outPath), { recursive: true })
await fs.writeFile(outPath, outputText)

console.log(`Generated ${path.relative(repoRoot, outPath)}`)
