import fs from 'fs/promises';
import path from 'path';
import matter from 'gray-matter';

export interface ParsedMarkdown {
  path: string;
  relativePath: string;
  content: string;
  frontmatter: Record<string, any>;
  metadata: {
    title: string;
    h1?: string;
    h2?: string;
    h3?: string;
  };
}

/**
 * Parse a markdown file and extract content + metadata
 * @param filePath Absolute path to the markdown file
 * @param repoPath Path to the repository root
 * @returns Parsed markdown document
 */
export async function parseMarkdownFile(
  filePath: string,
  repoPath: string
): Promise<ParsedMarkdown> {
  // Read file content
  const fileContent = await fs.readFile(filePath, 'utf-8');

  // Parse frontmatter (if exists)
  const { data: frontmatter, content: markdown } = matter(fileContent);

  // Calculate relative path from repo root
  const relativePath = path.relative(repoPath, filePath);

  // Extract headers from markdown
  const headers = extractHeaders(markdown);

  // Determine title (priority: frontmatter.title > h1 > filename)
  const title =
    frontmatter.title ||
    headers.h1 ||
    path.basename(filePath, '.md');

  return {
    path: filePath,
    relativePath,
    content: markdown,
    frontmatter,
    metadata: {
      title,
      h1: headers.h1,
      h2: headers.h2,
      h3: headers.h3
    }
  };
}

/**
 * Extract headers from markdown content
 */
function extractHeaders(markdown: string): { h1?: string; h2?: string; h3?: string } {
  const h1Match = markdown.match(/^#\s+(.+)$/m);
  const h2Match = markdown.match(/^##\s+(.+)$/m);
  const h3Match = markdown.match(/^###\s+(.+)$/m);

  return {
    h1: h1Match?.[1]?.trim(),
    h2: h2Match?.[1]?.trim(),
    h3: h3Match?.[1]?.trim()
  };
}

/**
 * Parse multiple markdown files
 */
export async function parseMarkdownFiles(
  filePaths: string[],
  repoPath: string
): Promise<ParsedMarkdown[]> {
  return Promise.all(
    filePaths.map(filePath => parseMarkdownFile(filePath, repoPath))
  );
}
