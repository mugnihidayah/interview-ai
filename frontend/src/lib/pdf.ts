import * as pdfjsLib from "pdfjs-dist";

// Use a locally bundled worker to avoid cross-origin/dynamic-import failures.
if (typeof window !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    "pdfjs-dist/build/pdf.worker.min.mjs",
    import.meta.url
  ).toString();
}

/**
 * Extract text content from a PDF file client-side.
 * The PDF is NOT uploaded to the server - only the extracted text is sent.
 */
export async function extractTextFromPDF(file: File): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const uint8Array = new Uint8Array(arrayBuffer);

  const pdf = await pdfjsLib.getDocument({
    data: uint8Array,
    useSystemFonts: true,
  }).promise;

  const textParts: string[] = [];

  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();

    const pageText = textContent.items
      .filter((item) => "str" in item)
      .map((item) => (item as { str: string }).str)
      .join(" ");

    textParts.push(pageText);
  }

  const fullText = textParts.join("\n\n").trim();

  if (fullText.length < 50) {
    throw new Error(
      "Could not extract enough text from the PDF. The file might be scanned/image-based. Please paste your resume text manually."
    );
  }

  return fullText;
}

/**
 * Validate file before processing
 */
export function validatePDFFile(file: File): string | null {
  if (file.type !== "application/pdf") {
    return "Please upload a PDF file.";
  }

  // 10MB max
  const maxSize = 10 * 1024 * 1024;
  if (file.size > maxSize) {
    return "File size must be less than 10MB.";
  }

  return null; // valid
}
