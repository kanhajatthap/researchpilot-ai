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
};

export default nextConfig;
