/**
 * Represents information about a single file in the codebase
 */
export interface FileInfo {
    path: string;
    content: string;
    size: number;
    language: string;
    isMainFile: boolean;
}

/**
 * Complete analysis of the codebase
 */
export interface CodebaseAnalysis {
    totalFiles: number;
    totalSize: number;
    languages: string[];
    mainFiles: string[];
    dependencies: string[];
    frameworks: string[];
    projectType: string;
    structure: ProjectStructure;
}

/**
 * Project structure categorization
 */
export interface ProjectStructure {
    directories: string[];
    importantFiles: string[];
    configFiles: string[];
    sourceFiles: string[];
    testFiles: string[];
    documentationFiles: string[];
}

/**
 * Message format for Perplexity API
 */
export interface PerplexityMessage {
    role: 'system' | 'user' | 'assistant';
    content: string;
}

/**
 * A chunk of code files grouped for API processing
 */
export interface CodeChunk {
    files: FileInfo[];
    totalTokens: number;
    chunkIndex: number;
    description: string;
}

/**
 * README section structure
 */
export interface ReadmeSection {
    title: string;
    content: string;
    order: number;
}

/**
 * Progress information during README generation
 */
export interface GenerationProgress {
    stage: 'scanning' | 'analyzing' | 'chunking' | 'generating' | 'previewing' | 'saving';
    message: string;
    percentage: number;
    currentFile?: string;
    totalFiles?: number;
    processedFiles?: number;
}

/**
 * Extension configuration settings
 */
export interface ExtensionConfig {
    perplexityApiKey: string;
    excludePatterns: string[];
    maxFileSize: number;
    maxTokensPerChunk: number;
    enablePreview: boolean;
}

/**
 * Gitignore rule representation
 */
export interface GitignoreRule {
    pattern: string;
    isNegation: boolean;
    isDirectory: boolean;
}
