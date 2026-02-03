// GitTalks - GitHub API Integration

import type { FetchRepoOutput, RepoFile, FileContent } from "./types";

// Priority files to fetch content for
const PRIORITY_FILES = [
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "pom.xml",
  "src/index.ts",
  "src/main.ts",
  "src/index.js",
  "src/main.js",
  "main.go",
  "main.py",
  "app.py",
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "docs/README.md",
  "lib/index.ts",
  "lib/main.ts",
];

// File extensions we're interested in
const RELEVANT_EXTENSIONS = [
  ".md",
  ".mdx",
  ".txt",
  ".rst",
  ".ts",
  ".tsx",
  ".js",
  ".jsx",
  ".py",
  ".go",
  ".rs",
  ".java",
  ".json",
  ".yaml",
  ".yml",
  ".toml",
];

// Max file size to fetch (100KB)
const MAX_FILE_SIZE = 100 * 1024;

// Max total content to fetch (500KB)
const MAX_TOTAL_CONTENT = 500 * 1024;

interface GitHubRepo {
  description: string | null;
  language: string | null;
  topics: string[];
  stargazers_count: number;
  forks_count: number;
  default_branch: string;
  license: { name: string } | null;
}

interface GitHubReadme {
  content: string;
  encoding: string;
}

interface GitHubTreeItem {
  path: string;
  type: "blob" | "tree";
  size?: number;
}

interface GitHubTree {
  tree: GitHubTreeItem[];
  truncated: boolean;
}

// Parse repo URL or owner/name format
export function parseRepoUrl(input: string): { owner: string; name: string } {
  // Handle full URL
  const urlMatch = input.match(
    /github\.com\/([^\/]+)\/([^\/\?#]+)/
  );
  if (urlMatch) {
    return { owner: urlMatch[1], name: urlMatch[2].replace(/\.git$/, "") };
  }

  // Handle owner/name format
  const simpleMatch = input.match(/^([^\/]+)\/([^\/]+)$/);
  if (simpleMatch) {
    return { owner: simpleMatch[1], name: simpleMatch[2] };
  }

  throw new Error(
    "Invalid repository format. Use owner/repo or full GitHub URL."
  );
}

// Create headers for GitHub API
function getHeaders(): HeadersInit {
  const headers: HeadersInit = {
    Accept: "application/vnd.github.v3+json",
    "User-Agent": "GitTalks/1.0",
  };

  if (process.env.GITHUB_PAT) {
    headers["Authorization"] = `Bearer ${process.env.GITHUB_PAT}`;
  }

  return headers;
}

// Fetch repository metadata
async function fetchRepoMetadata(
  owner: string,
  name: string
): Promise<GitHubRepo> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${name}`,
    { headers: getHeaders() }
  );

  if (!response.ok) {
    if (response.status === 404) {
      throw new Error(`Repository ${owner}/${name} not found`);
    }
    throw new Error(`Failed to fetch repository: ${response.statusText}`);
  }

  return response.json();
}

// Fetch README content
async function fetchReadme(owner: string, name: string): Promise<string | null> {
  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${name}/readme`,
      { headers: getHeaders() }
    );

    if (!response.ok) {
      return null;
    }

    const data: GitHubReadme = await response.json();
    return Buffer.from(data.content, "base64").toString("utf-8");
  } catch {
    return null;
  }
}

// Fetch file tree
async function fetchFileTree(
  owner: string,
  name: string,
  branch: string
): Promise<RepoFile[]> {
  const response = await fetch(
    `https://api.github.com/repos/${owner}/${name}/git/trees/${branch}?recursive=1`,
    { headers: getHeaders() }
  );

  if (!response.ok) {
    return [];
  }

  const data: GitHubTree = await response.json();

  return data.tree
    .filter((item) => {
      // Only include files with relevant extensions or priority files
      if (item.type === "blob") {
        const ext = "." + item.path.split(".").pop()?.toLowerCase();
        return (
          RELEVANT_EXTENSIONS.includes(ext) ||
          PRIORITY_FILES.some((p) => item.path.endsWith(p))
        );
      }
      return item.type === "tree";
    })
    .map((item) => ({
      path: item.path,
      type: item.type === "blob" ? "file" : "dir",
      size: item.size,
    }));
}

// Fetch raw file content
async function fetchFileContent(
  owner: string,
  name: string,
  branch: string,
  filePath: string
): Promise<string | null> {
  try {
    const response = await fetch(
      `https://raw.githubusercontent.com/${owner}/${name}/${branch}/${filePath}`,
      { headers: { "User-Agent": "GitTalks/1.0" } }
    );

    if (!response.ok) {
      return null;
    }

    return response.text();
  } catch {
    return null;
  }
}

// Score file importance for fetching
function scoreFileImportance(file: RepoFile): number {
  let score = 0;

  // Priority files get highest score
  if (PRIORITY_FILES.some((p) => file.path.endsWith(p))) {
    score += 100;
  }

  // Root level files are more important
  const depth = file.path.split("/").length - 1;
  score += Math.max(0, 10 - depth * 2);

  // Certain directories are more important
  if (file.path.startsWith("src/")) score += 20;
  if (file.path.startsWith("lib/")) score += 15;
  if (file.path.startsWith("app/")) score += 15;
  if (file.path.includes("core/")) score += 10;
  if (file.path.includes("utils/")) score += 5;

  // Config files
  if (file.path.endsWith(".json")) score += 5;
  if (file.path.endsWith(".yaml") || file.path.endsWith(".yml")) score += 5;
  if (file.path.endsWith(".toml")) score += 5;

  // Entry points
  if (file.path.includes("index.")) score += 10;
  if (file.path.includes("main.")) score += 10;

  return score;
}

// Main fetch function
export async function fetchRepository(
  owner: string,
  name: string
): Promise<FetchRepoOutput> {
  // Fetch repo metadata and readme in parallel
  const [repo, readme] = await Promise.all([
    fetchRepoMetadata(owner, name),
    fetchReadme(owner, name),
  ]);

  // Fetch file tree
  const allFiles = await fetchFileTree(owner, name, repo.default_branch);

  // Filter to only files (not directories)
  const files = allFiles.filter((f) => f.type === "file");

  // Sort files by importance and select top ones to fetch content
  const sortedFiles = files
    .map((f) => ({ file: f, score: scoreFileImportance(f) }))
    .sort((a, b) => b.score - a.score);

  // Fetch content for top files (up to 20 files or MAX_TOTAL_CONTENT)
  const fileContents: FileContent[] = [];
  let totalSize = 0;

  for (const { file } of sortedFiles.slice(0, 25)) {
    // Skip large files
    if (file.size && file.size > MAX_FILE_SIZE) continue;

    // Check total content limit
    if (totalSize > MAX_TOTAL_CONTENT) break;

    const content = await fetchFileContent(
      owner,
      name,
      repo.default_branch,
      file.path
    );

    if (content) {
      fileContents.push({
        path: file.path,
        content: content.slice(0, MAX_FILE_SIZE),
        size: content.length,
      });
      totalSize += content.length;
    }
  }

  return {
    readme,
    description: repo.description,
    language: repo.language,
    topics: repo.topics || [],
    stars: repo.stargazers_count,
    forks: repo.forks_count,
    files: allFiles,
    fileContents,
    defaultBranch: repo.default_branch,
    license: repo.license?.name || null,
  };
}
