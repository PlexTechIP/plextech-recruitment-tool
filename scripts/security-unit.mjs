#!/usr/bin/env node

import assert from 'node:assert/strict'
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { pathToFileURL } from 'node:url'
import { join } from 'node:path'
import ts from 'typescript'
import { PDFDocument, PDFName } from 'pdf-lib'

async function loadTypeScriptModule(relativePath) {
  // Compile the real TypeScript module into a temporary ESM file so this test
  // also works on Node 20, which cannot import .ts files directly. Keeping the
  // temporary directory under the project root lets Node resolve dependencies
  // from this project's node_modules directory.
  const sourcePath = join(process.cwd(), relativePath)
  const source = await readFile(sourcePath, 'utf8')
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText

  const temporaryDirectory = await mkdtemp(join(process.cwd(), '.security-unit-'))
  const compiledPath = join(temporaryDirectory, 'module.mjs')
  await writeFile(compiledPath, compiled, { encoding: 'utf8', mode: 0o600 })
  return {
    module: await import(`${pathToFileURL(compiledPath).href}?v=${Date.now()}`),
    cleanup: () => rm(temporaryDirectory, { recursive: true, force: true }),
  }
}

function jsonRequest(value, headers = {}) {
  return new Request('http://127.0.0.1:5173/api/test', {
    method: 'POST',
    headers: { 'content-type': 'application/json', ...headers },
    body: JSON.stringify(value),
  })
}

async function responseBody(result) {
  assert.equal(result.ok, false)
  return result.response.json()
}

async function main() {
  const validationModule = await loadTypeScriptModule('src/lib/apiValidation.ts')
  const pdfModule = await loadTypeScriptModule('src/lib/pdfValidation.ts')
  const validation = validationModule.module
  const {
    isEmail,
    isObjectId,
    isSessionId,
    normalizeHttpUrl,
    readJsonArray,
    readJsonObject,
  } = validation
  const { validateResumePdf } = pdfModule.module

  try {
    const valid = await readJsonObject(jsonRequest({ name: 'PlexTech', nested: { ok: true } }))
    assert.equal(valid.ok, true)

    for (const payload of [
      { id: { $ne: null } },
      { 'profile.role': 'admin' },
      JSON.parse('{"__proto__":{"admin":true}}'),
      { nested: { constructor: { prototype: { polluted: true } } } },
    ]) {
      const result = await readJsonObject(jsonRequest(payload))
      assert.equal(result.ok, false, `unsafe payload unexpectedly passed: ${JSON.stringify(payload)}`)
      assert.equal(result.response.status, 400)
    }

    const wrongType = await readJsonArray(jsonRequest({ not: 'an array' }))
    assert.equal(wrongType.ok, false)
    assert.equal(wrongType.response.status, 400)

    const wrongContentType = await readJsonObject(new Request('http://127.0.0.1:5173/api/test', {
      method: 'POST',
      headers: { 'content-type': 'text/plain' },
      body: '{}',
    }))
    assert.equal(wrongContentType.ok, false)
    assert.equal(wrongContentType.response.status, 415)

    const crossOrigin = await readJsonObject(jsonRequest({}, { origin: 'https://attacker.example' }))
    assert.equal(crossOrigin.ok, false)
    assert.equal(crossOrigin.response.status, 403)

    let emitted = false
    const oversizedStream = new ReadableStream({
      pull(controller) {
        if (emitted) return controller.close()
        emitted = true
        controller.enqueue(new TextEncoder().encode(`{"payload":"${'x'.repeat(2048)}"}`))
      },
    })
    const oversized = await readJsonObject(new Request('http://127.0.0.1:5173/api/test', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: oversizedStream,
      duplex: 'half',
    }), 512)
    assert.equal(oversized.ok, false)
    assert.equal(oversized.response.status, 413)
    assert.deepEqual(await responseBody(oversized), { error: 'Request body is too large.' })

    assert.equal(isObjectId('507f1f77bcf86cd799439011'), true)
    assert.equal(isObjectId('$ne'), false)
    assert.equal(isSessionId('AB12CD'), true)
    assert.equal(isSessionId('../BAD'), false)
    assert.equal(isEmail('student@berkeley.edu'), true)
    assert.equal(isEmail('student@berkeley.edu\nattacker@example.com'), false)
    assert.equal(normalizeHttpUrl('javascript:alert(1)'), null)
    assert.equal(normalizeHttpUrl('https://user:pass@example.com'), null)
    assert.equal(normalizeHttpUrl('https://example.com/path'), 'https://example.com/path')

    const validPdf = await PDFDocument.create({ updateMetadata: false })
    validPdf.addPage()
    assert.deepEqual(await validateResumePdf(await validPdf.save()), { ok: true })

    const twoPagePdf = await PDFDocument.create({ updateMetadata: false })
    twoPagePdf.addPage()
    twoPagePdf.addPage()
    assert.equal((await validateResumePdf(await twoPagePdf.save())).ok, false)

    const activePdf = await PDFDocument.create({ updateMetadata: false })
    activePdf.addPage()
    activePdf.catalog.set(PDFName.of('OpenAction'), PDFName.of('JavaScript'))
    assert.equal((await validateResumePdf(await activePdf.save())).ok, false)

    const attachmentPdf = await PDFDocument.create({ updateMetadata: false })
    attachmentPdf.addPage()
    await attachmentPdf.attach(Uint8Array.of(1, 2, 3), 'payload.bin')
    assert.equal((await validateResumePdf(await attachmentPdf.save())).ok, false)

    assert.equal((await validateResumePdf(Uint8Array.of(1, 2, 3))).ok, false)

    console.log('Security unit checks passed.')
  } finally {
    await Promise.all([validationModule.cleanup(), pdfModule.cleanup()])
  }
}

main().catch(error => {
  console.error(error)
  process.exit(1)
})
