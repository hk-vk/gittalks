// GitTalks - GitHub API Integration

import type { FetchRepoOutput, RepoFile, FileContent } from "./types";

// Rate limiting configuration
const RATE_LIMIT_CONFIG = {
  maxRetries: 3,
  baseDelayMs: 1000,
  maxDelayMs: 10000,
  chunkDelayMs: 100, // Delay between chunk fetches
};

// Sleep utility
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Exponential backoff with jitter
function getRetryDelay(attempt: number): number {
  const exponentialDelay = RATE_LIMIT_CONFIG.baseDelayMs * Math.pow(2, attempt);
  const jitter = Math.random() * 500;
  return Math.min(exponentialDelay + jitter, RATE_LIMIT_CONFIG.maxDelayMs);
}

// Fetch with retry and rate limit handling
async function fetchWithRetry<T>(
  url: string,
  options: RequestInit,
  parseJson: boolean = true
): Promise<T | null> {
  for (let attempt = 0; attempt < RATE_LIMIT_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetch(url, options);
      
      // Handle rate limiting
      if (response.status === 403 || response.status === 429) {
        const retryAfter = response.headers.get("Retry-After");
        const waitTime = retryAfter 
          ? parseInt(retryAfter) * 1000 
          : getRetryDelay(attempt);
        
        console.log(`[GitHub] Rate limited, waiting ${Math.round(waitTime / 1000)}s...`);
        await sleep(waitTime);
        continue;
      }
      
      if (!response.ok) {
        return null;
      }
      
      return parseJson ? await response.json() : await response.text() as T;
    } catch (error) {
      if (attempt < RATE_LIMIT_CONFIG.maxRetries - 1) {
        const delay = getRetryDelay(attempt);
        console.log(`[GitHub] Request failed, retrying in ${Math.round(delay / 1000)}s...`);
        await sleep(delay);
      }
    }
  }
  return null;
}

// Priority files to fetch content for - enhanced list
const PRIORITY_FILES = [
  // Package managers / Config
  "package.json",
  "tsconfig.json",
  "pyproject.toml",
  "Cargo.toml",
  "go.mod",
  "go.sum",
  "pom.xml",
  "build.gradle",
  "composer.json",
  "Gemfile",
  "requirements.txt",
  "setup.py",
  "setup.cfg",
  // Entry points
  "src/index.ts",
  "src/index.tsx",
  "src/main.ts",
  "src/main.tsx",
  "src/index.js",
  "src/index.jsx",
  "src/main.js",
  "src/App.tsx",
  "src/App.jsx",
  "src/app.ts",
  "src/app.js",
  "app/page.tsx",
  "app/layout.tsx",
  "pages/index.tsx",
  "pages/_app.tsx",
  "main.go",
  "cmd/main.go",
  "main.py",
  "app.py",
  "server.py",
  "src/main.rs",
  "src/lib.rs",
  // Library core files
  "lib/index.ts",
  "lib/main.ts",
  "lib/core.ts",
  "core/index.ts",
  "core/main.ts",
  // Documentation
  "CONTRIBUTING.md",
  "CHANGELOG.md",
  "ARCHITECTURE.md",
  "docs/README.md",
  "docs/index.md",
  "docs/getting-started.md",
  // Config files
  "next.config.js",
  "next.config.ts",
  "vite.config.ts",
  "webpack.config.js",
  "rollup.config.js",
  ".env.example",
];

// Important directories to prioritize
const IMPORTANT_DIRECTORIES = [
  "src",
  "lib",
  "app",
  "core",
  "packages",
  "modules",
  "components",
  "services",
  "api",
  "server",
  "client",
  "internal",
  "pkg",
  "cmd",
];

// Directories to skip or deprioritize
const SKIP_DIRECTORIES = [
  "node_modules",
  ".git",
  ".github",         // GitHub workflows, issue templates, etc.
  "github",          // Sometimes used without dot
  ".gitlab",         // GitLab CI config
  ".circleci",       // CircleCI config
  ".azure-pipelines", // Azure DevOps config
  ".vscode",         // Editor settings
  ".idea",           // JetBrains IDE settings
  "dist",
  "build",
  "out",
  ".next",
  "__pycache__",
  "vendor",
  "target",
  "coverage",
  ".cache",
  "test",
  "tests",
  "__tests__",
  "spec",
  "specs",
  "fixtures",
  "mocks",
  "e2e",
  "cypress",
  "examples",
  "example",
  "demo",
  "demos",
  "docs",
  "documentation",
  "assets",
  "static",
  "public",
  "images",
  "icons",
  "fonts",
  "locales",
  "i18n",
  "translations",
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

// Max file size to fetch (150KB)
const MAX_FILE_SIZE = 150 * 1024;

// Max total content to fetch (1MB for larger repos)
const MAX_TOTAL_CONTENT = 1024 * 1024;

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

// Fetch repository metadata with retry
async function fetchRepoMetadata(
  owner: string,
  name: string
): Promise<GitHubRepo> {
  for (let attempt = 0; attempt < RATE_LIMIT_CONFIG.maxRetries; attempt++) {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${name}`,
      { headers: getHeaders() }
    );

    // Handle rate limiting
    if (response.status === 403 || response.status === 429) {
      const retryAfter = response.headers.get("Retry-After");
      const waitTime = retryAfter 
        ? parseInt(retryAfter) * 1000 
        : getRetryDelay(attempt);
      console.log(`[GitHub] Rate limited on metadata, waiting ${Math.round(waitTime / 1000)}s...`);
      await sleep(waitTime);
      continue;
    }

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Repository ${owner}/${name} not found`);
      }
      throw new Error(`Failed to fetch repository: ${response.statusText}`);
    }

    return response.json();
  }
  throw new Error(`Failed to fetch repository after ${RATE_LIMIT_CONFIG.maxRetries} attempts`);
}

// Fetch README content with retry
async function fetchReadme(owner: string, name: string): Promise<string | null> {
  for (let attempt = 0; attempt < RATE_LIMIT_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${owner}/${name}/readme`,
        { headers: getHeaders() }
      );

      // Handle rate limiting
      if (response.status === 403 || response.status === 429) {
        const waitTime = getRetryDelay(attempt);
        console.log(`[GitHub] Rate limited on README, waiting ${Math.round(waitTime / 1000)}s...`);
        await sleep(waitTime);
        continue;
      }

      if (!response.ok) {
        return null;
      }

      const data: GitHubReadme = await response.json();
      return Buffer.from(data.content, "base64").toString("utf-8");
    } catch {
      if (attempt < RATE_LIMIT_CONFIG.maxRetries - 1) {
        await sleep(getRetryDelay(attempt));
      }
    }
  }
  return null;
}

// Fetch file tree with retry
async function fetchFileTree(
  owner: string,
  name: string,
  branch: string
): Promise<RepoFile[]> {
  for (let attempt = 0; attempt < RATE_LIMIT_CONFIG.maxRetries; attempt++) {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${name}/git/trees/${branch}?recursive=1`,
      { headers: getHeaders() }
    );

    // Handle rate limiting
    if (response.status === 403 || response.status === 429) {
      const waitTime = getRetryDelay(attempt);
      console.log(`[GitHub] Rate limited on file tree, waiting ${Math.round(waitTime / 1000)}s...`);
      await sleep(waitTime);
      continue;
    }

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
  return [];
}

// Fetch raw file content with retry
async function fetchFileContent(
  owner: string,
  name: string,
  branch: string,
  filePath: string
): Promise<string | null> {
  for (let attempt = 0; attempt < RATE_LIMIT_CONFIG.maxRetries; attempt++) {
    try {
      const response = await fetch(
        `https://raw.githubusercontent.com/${owner}/${name}/${branch}/${filePath}`,
        { headers: { "User-Agent": "GitTalks/1.0" } }
      );

      // Handle rate limiting (raw.githubusercontent uses 429)
      if (response.status === 429) {
        const waitTime = getRetryDelay(attempt);
        console.log(`[GitHub] Rate limited on file content, waiting ${Math.round(waitTime / 1000)}s...`);
        await sleep(waitTime);
        continue;
      }

      if (!response.ok) {
        return null;
      }

      return response.text();
    } catch {
      if (attempt < RATE_LIMIT_CONFIG.maxRetries - 1) {
        await sleep(getRetryDelay(attempt));
      }
    }
  }
  return null;
}

// Analyze folder structure and return importance scores
function analyzeFolderStructure(files: RepoFile[]): Map<string, number> {
  const folderScores = new Map<string, number>();
  const folderFileCounts = new Map<string, number>();
  
  // Count files per folder
  for (const file of files) {
    if (file.type === "file") {
      const parts = file.path.split("/");
      for (let i = 1; i <= parts.length - 1; i++) {
        const folderPath = parts.slice(0, i).join("/");
        folderFileCounts.set(folderPath, (folderFileCounts.get(folderPath) || 0) + 1);
      }
    }
  }
  
  // Score folders
  for (const [folder, count] of folderFileCounts) {
    let score = 0;
    const folderName = folder.split("/").pop()?.toLowerCase() || "";
    const depth = folder.split("/").length;
    
    // Boost important directories
    if (IMPORTANT_DIRECTORIES.includes(folderName)) {
      score += 50;
    }
    
    // Penalize skip directories
    if (SKIP_DIRECTORIES.some(skip => folderName === skip || folder.includes(`/${skip}/`))) {
      score -= 100;
    }
    
    // Prefer shallower directories
    score += Math.max(0, 20 - depth * 3);
    
    // Boost directories with moderate file counts (not too few, not too many)
    if (count >= 3 && count <= 30) {
      score += 10;
    }
    
    folderScores.set(folder, score);
  }
  
  return folderScores;
}

// Enhanced file importance scoring with folder context
function scoreFileImportance(file: RepoFile, folderScores: Map<string, number>): number {
  let score = 0;
  const pathLower = file.path.toLowerCase();
  const fileName = file.path.split("/").pop() || "";
  const fileNameLower = fileName.toLowerCase();
  
  // Check if in skip directory - heavily penalize
  for (const skip of SKIP_DIRECTORIES) {
    const skipLower = skip.toLowerCase();
    if (
      pathLower.includes(`/${skipLower}/`) || 
      pathLower.startsWith(`${skipLower}/`) ||
      pathLower.startsWith(`.${skipLower}/`)  // Handle directories starting with dot like .github
    ) {
      return -100;
    }
  }

  // Priority files get highest score
  if (PRIORITY_FILES.some((p) => file.path.endsWith(p) || file.path === p)) {
    score += 150;
  }
  
  // README files are very important
  if (fileNameLower === "readme.md" || fileNameLower === "readme") {
    score += 80;
  }

  // Root level files are more important
  const depth = file.path.split("/").length - 1;
  score += Math.max(0, 25 - depth * 4);

  // Add folder scores
  const parts = file.path.split("/");
  for (let i = 1; i < parts.length; i++) {
    const folderPath = parts.slice(0, i).join("/");
    score += (folderScores.get(folderPath) || 0) / 2;
  }
  
  // Important directory bonuses
  if (pathLower.startsWith("src/")) score += 30;
  if (pathLower.startsWith("lib/")) score += 25;
  if (pathLower.startsWith("app/")) score += 25;
  if (pathLower.startsWith("core/")) score += 20;
  if (pathLower.startsWith("packages/")) score += 20;
  if (pathLower.startsWith("internal/")) score += 15;
  if (pathLower.startsWith("pkg/")) score += 15;
  if (pathLower.startsWith("cmd/")) score += 15;
  if (pathLower.includes("/components/")) score += 10;
  if (pathLower.includes("/services/")) score += 15;
  if (pathLower.includes("/api/")) score += 15;
  if (pathLower.includes("/server/")) score += 15;
  if (pathLower.includes("/client/")) score += 10;
  if (pathLower.includes("/hooks/")) score += 10;
  if (pathLower.includes("/utils/")) score += 8;
  if (pathLower.includes("/helpers/")) score += 8;
  if (pathLower.includes("/types/")) score += 5;
  if (pathLower.includes("/models/")) score += 10;
  if (pathLower.includes("/schemas/")) score += 10;
  if (pathLower.includes("/routes/")) score += 12;
  if (pathLower.includes("/handlers/")) score += 12;
  if (pathLower.includes("/controllers/")) score += 12;
  if (pathLower.includes("/middleware/")) score += 10;

  // Entry point file name patterns
  if (fileNameLower.includes("index.")) score += 15;
  if (fileNameLower.includes("main.")) score += 15;
  if (fileNameLower.includes("app.")) score += 12;
  if (fileNameLower.includes("server.")) score += 12;
  if (fileNameLower.includes("client.")) score += 10;
  if (fileNameLower.includes("core.")) score += 10;
  if (fileNameLower.includes("config.")) score += 8;
  if (fileNameLower.includes("setup.")) score += 8;
  if (fileNameLower.includes("init.")) score += 8;
  
  // File type bonuses
  const ext = "." + (file.path.split(".").pop()?.toLowerCase() || "");
  if (ext === ".ts" || ext === ".tsx") score += 8;
  if (ext === ".js" || ext === ".jsx") score += 6;
  if (ext === ".py") score += 6;
  if (ext === ".go") score += 6;
  if (ext === ".rs") score += 6;
  if (ext === ".java") score += 5;
  if (ext === ".md") score += 3;
  if (ext === ".json") score += 5;
  if (ext === ".yaml" || ext === ".yml") score += 5;
  if (ext === ".toml") score += 5;
  
  // Penalize test/spec files
  if (fileNameLower.includes(".test.") || fileNameLower.includes(".spec.") || fileNameLower.includes("_test.")) {
    score -= 30;
  }
  
  // Penalize generated/lock files
  if (fileNameLower.endsWith(".lock") || fileNameLower.endsWith("-lock.json") || fileNameLower.endsWith("-lock.yaml")) {
    score -= 50;
  }
  if (fileNameLower === "package-lock.json" || fileNameLower === "pnpm-lock.yaml" || fileNameLower === "yarn.lock") {
    score -= 100; // These are very large and not useful for understanding
  }

  return score;
}

// Get dynamic file fetch limits based on repo size
function getFileFetchLimits(fileCount: number): { maxFiles: number; maxTotalContent: number } {
  if (fileCount < 50) {
    // Small repos: fetch more aggressively
    return { maxFiles: 35, maxTotalContent: 600 * 1024 };
  } else if (fileCount < 200) {
    // Medium repos
    return { maxFiles: 50, maxTotalContent: 800 * 1024 };
  } else if (fileCount < 500) {
    // Larger repos
    return { maxFiles: 60, maxTotalContent: 1024 * 1024 };
  } else if (fileCount < 1000) {
    // Large repos
    return { maxFiles: 75, maxTotalContent: 1.2 * 1024 * 1024 };
  } else {
    // Very large repos
    return { maxFiles: 100, maxTotalContent: 1.5 * 1024 * 1024 };
  }
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

  // Get dynamic limits based on repo size
  const limits = getFileFetchLimits(files.length);
  console.log(`[GitHub] Repo has ${files.length} files, fetching up to ${limits.maxFiles} files (${Math.round(limits.maxTotalContent / 1024)}KB max)`);

  // Analyze folder structure for smart file selection
  console.log(`[GitHub] Analyzing folder structure...`);
  const folderScores = analyzeFolderStructure(allFiles);
  
  // Log top folders for debugging
  const topFolders = Array.from(folderScores.entries())
    .filter(([, score]) => score > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 10);
  console.log(`[GitHub] Top folders: ${topFolders.map(([f, s]) => `${f}(${s})`).join(", ")}`);

  // Sort files by importance using folder context
  const sortedFiles = files
    .map((f) => ({ file: f, score: scoreFileImportance(f, folderScores) }))
    .filter(({ score }) => score > -50) // Filter out heavily penalized files
    .sort((a, b) => b.score - a.score);
  
  // Log top files selected
  console.log(`[GitHub] Top files to fetch:`);
  sortedFiles.slice(0, 15).forEach(({ file, score }, i) => {
    console.log(`  ${i + 1}. [${score}] ${file.path}`);
  });

  // Fetch content for top files based on dynamic limits
  const fileContents: FileContent[] = [];
  let totalSize = 0;

  // Chunk the file fetching for parallel processing (faster for large repos)
  const filesToFetch = sortedFiles.slice(0, limits.maxFiles);
  const CHUNK_SIZE = 8; // Fetch 8 files in parallel at a time (reduced from 10 for rate limiting)
  
  for (let i = 0; i < filesToFetch.length; i += CHUNK_SIZE) {
    // Check total content limit before fetching more
    if (totalSize > limits.maxTotalContent) break;
    
    const chunk = filesToFetch.slice(i, i + CHUNK_SIZE);
    
    // Fetch chunk in parallel
    const results = await Promise.all(
      chunk.map(async ({ file }) => {
        // Skip large files
        if (file.size && file.size > MAX_FILE_SIZE) return null;
        
        const content = await fetchFileContent(
          owner,
          name,
          repo.default_branch,
          file.path
        );
        
        if (content) {
          return {
            path: file.path,
            content: content.slice(0, MAX_FILE_SIZE),
            size: content.length,
          };
        }
        return null;
      })
    );
    
    // Add successful fetches to results
    for (const result of results) {
      if (result && totalSize < limits.maxTotalContent) {
        fileContents.push(result);
        totalSize += result.size;
      }
    }
    
    // Add delay between chunks to prevent rate limiting
    if (i + CHUNK_SIZE < filesToFetch.length && totalSize < limits.maxTotalContent) {
      await sleep(RATE_LIMIT_CONFIG.chunkDelayMs);
    }
  }

  console.log(`[GitHub] Fetched ${fileContents.length} files (${Math.round(totalSize / 1024)}KB total)`);

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
