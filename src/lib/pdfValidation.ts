import {
  PDFArray,
  PDFDict,
  PDFDocument,
  PDFName,
  PDFObject,
  PDFStream,
} from 'pdf-lib'

const MAX_PDF_OBJECTS_TO_INSPECT = 50_000
const MAX_PDF_OBJECT_DEPTH = 30

// Resume PDFs do not need executable actions, multimedia, portfolios, or
// attachments. AcroForm itself is intentionally allowed because many benign
// PDF exporters include an empty or non-executable form dictionary. Dangerous
// form features remain blocked through XFA, SubmitForm, ImportData, JavaScript,
// additional actions, and other active-content names below.
const BLOCKED_PDF_NAMES = new Set([
  'AA',
  'Collection',
  'EF',
  'EmbeddedFile',
  'EmbeddedFiles',
  'Filespec',
  'GoToE',
  'GoToR',
  'ImportData',
  'JavaScript',
  'JS',
  'Launch',
  'Movie',
  'OpenAction',
  'Rendition',
  'RichMedia',
  'Screen',
  'Sound',
  'SubmitForm',
  '3D',
  'XFA',
])

export type PdfValidationResult =
  | { ok: true }
  | { ok: false; error: string }

function decodedName(name: PDFName) {
  try {
    return name.decodeText()
  } catch {
    return name.asString().replace(/^\//, '')
  }
}

function containsBlockedPdfObject(objects: PDFObject[]) {
  const stack = objects.map(object => ({ object, depth: 0 }))
  const visited = new Set<PDFObject>()
  let inspected = 0

  while (stack.length > 0) {
    const current = stack.pop()!
    if (visited.has(current.object)) continue
    visited.add(current.object)
    inspected += 1
    if (inspected > MAX_PDF_OBJECTS_TO_INSPECT || current.depth > MAX_PDF_OBJECT_DEPTH) return true

    if (current.object instanceof PDFName) {
      if (BLOCKED_PDF_NAMES.has(decodedName(current.object))) return true
      continue
    }
    if (current.object instanceof PDFStream) {
      stack.push({ object: current.object.dict, depth: current.depth + 1 })
      continue
    }
    if (current.object instanceof PDFDict) {
      for (const [key, value] of current.object.entries()) {
        if (BLOCKED_PDF_NAMES.has(decodedName(key))) return true
        stack.push({ object: value, depth: current.depth + 1 })
      }
      continue
    }
    if (current.object instanceof PDFArray) {
      for (const value of current.object.asArray()) {
        stack.push({ object: value, depth: current.depth + 1 })
      }
    }
  }

  return false
}

export async function validateResumePdf(bytes: Uint8Array): Promise<PdfValidationResult> {
  let document: PDFDocument
  try {
    document = await PDFDocument.load(bytes, {
      ignoreEncryption: false,
      throwOnInvalidObject: true,
      updateMetadata: false,
      capNumbers: true,
    })
  } catch {
    return { ok: false, error: 'The uploaded resume is not a valid, unencrypted PDF.' }
  }

  if (document.isEncrypted) {
    return { ok: false, error: 'Encrypted PDFs are not accepted.' }
  }
  if (document.getPageCount() !== 1) {
    return { ok: false, error: 'Please upload a one-page resume.' }
  }

  const indirectObjects = document.context.enumerateIndirectObjects().map(([, object]) => object)
  if (containsBlockedPdfObject([document.catalog, ...indirectObjects])) {
    return { ok: false, error: 'PDFs with scripts, embedded files, multimedia, or unsafe actions are not accepted.' }
  }

  return { ok: true }
}
