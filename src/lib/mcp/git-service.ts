import { execFile } from 'node:child_process';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

export interface GitStatusResult {
  branch: string;
  isClean: boolean;
  modifiedFiles: string[];
  recentCommits: string[];
}

export interface SaveNoteResult {
  filePath: string;
  relativePath: string;
  bytesWritten: number;
  committed: boolean;
  commitHash?: string;
  message?: string;
}

/**
 * Execute a git command safely with timeout.
 */
async function runGit(args: string[]): Promise<string> {
  try {
    const { stdout } = await execFileAsync('git', args, {
      cwd: process.cwd(),
      timeout: 10000,
    });
    return stdout.trim();
  } catch (error: unknown) {
    const err = error as { stderr?: string; message?: string };
    throw new Error(err?.stderr || err?.message || 'Git command failed');
  }
}

/**
 * Get current repository status and branch.
 */
export async function getGitStatus(): Promise<GitStatusResult> {
  try {
    const [branch, porcelain, log] = await Promise.all([
      runGit(['branch', '--show-current']).catch(() => 'main'),
      runGit(['status', '--porcelain']).catch(() => ''),
      runGit(['log', '-n', '3', '--oneline']).catch(() => ''),
    ]);

    const modified = porcelain
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    const commits = log
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0);

    return {
      branch: branch || 'main',
      isClean: modified.length === 0,
      modifiedFiles: modified,
      recentCommits: commits,
    };
  } catch {
    return {
      branch: 'main',
      isClean: true,
      modifiedFiles: [],
      recentCommits: [],
    };
  }
}

/**
 * Save a research note as Markdown and optionally commit it to Git.
 */
export async function saveResearchNote(
  title: string,
  content: string,
  commitMessage?: string
): Promise<SaveNoteResult> {
  const notesDir = path.join(process.cwd(), 'data', 'research-notes');
  await fs.mkdir(notesDir, { recursive: true });

  const sanitizedName =
    title
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || 'research-note';

  const fileName = `${sanitizedName}.md`;
  const fullPath = path.join(notesDir, fileName);
  const relativePath = path.join('data', 'research-notes', fileName).replace(/\\/g, '/');

  const fileHeader = `---
title: "${title.replace(/"/g, '\\"')}"
date: "${new Date().toISOString()}"
generator: "ResearchPilot AI Agent"
---

`;

  const finalContent = fileHeader + content.trim() + '\n';
  await fs.writeFile(fullPath, finalContent, 'utf-8');

  let committed = false;
  let commitHash: string | undefined;
  const msg = commitMessage || `docs(research): add ${title} research notes`;

  try {
    await runGit(['add', relativePath]);
    const commitOutput = await runGit([
      '-c',
      'user.name=ResearchPilot Agent',
      '-c',
      'user.email=agent@researchpilot.ai',
      'commit',
      '-m',
      msg,
    ]);
    committed = true;
    const match = commitOutput.match(/\[([^\s\]]+)\s+([a-f0-9]+)\]/);
    if (match) {
      commitHash = match[2];
    }
  } catch {
    // If commit fails (e.g. no changes to commit or git lock), file is still safely saved
    committed = false;
  }

  return {
    filePath: fullPath,
    relativePath,
    bytesWritten: Buffer.byteLength(finalContent, 'utf-8'),
    committed,
    commitHash,
    message: committed ? `Successfully committed note as ${relativePath}` : `Saved file to ${relativePath}`,
  };
}

/**
 * List recent research notes commits.
 */
export async function getResearchNotesLog(): Promise<Array<{ hash: string; message: string }>> {
  try {
    const output = await runGit([
      'log',
      '-n',
      '5',
      '--oneline',
      '--',
      'data/research-notes',
    ]);
    if (!output) return [];
    return output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)
      .map((line) => {
        const parts = line.split(' ');
        return {
          hash: parts[0],
          message: parts.slice(1).join(' '),
        };
      });
  } catch {
    return [];
  }
}
