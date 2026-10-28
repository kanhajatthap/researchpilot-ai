import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Keep these server-only dependencies out of the bundler and load them with
   * native Node.js `require`.
   *
   * `pdfjs-dist` dynamically imports its worker module (`.mjs`) at runtime. When
   * it is bundled by Next/Turbopack the rewritten path points at a chunk that
   * does not exist (`.next/dev/server/chunks/pdf.worker.mjs`), and PDF text
   * extraction fails with "Setting up fake worker failed", which made every
   * upload fail. Externalising the package lets Node resolve the worker from
   * node_modules on disk.
   *
   * `chromadb` is a server-only HTTP client and is safest left unbundled too.
   */
  serverExternalPackages: ["pdfjs-dist", "chromadb", "pg"],

  /**
   * `pdfjs-dist` resolves its worker with a runtime dynamic `import()` that
   * Next's output file tracing cannot see. On Vercel the package itself is
   * present in `/var/task/node_modules` but the worker file was not, so every
   * PDF upload failed with:
   *
   *   Setting up fake worker failed: Cannot find module
   *   '/var/task/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'
   *
   * Ship the worker (and standard fonts) with the routes that parse PDFs.
   */
  outputFileTracingIncludes: {
    "/api/documents": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
    ],
    "/api/documents/**": [
      "./node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs",
      "./node_modules/pdfjs-dist/standard_fonts/**/*",
    ],
  },
};

export default nextConfig;
