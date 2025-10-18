// gitignoreParser.ts - Parse and apply .gitignore rules

import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { GitignoreRule } from './types';

/**
 * GitignoreParser - Handles .gitignore parsing and file filtering
 */
export class GitignoreParser {
    private rules: GitignoreRule[] = [];
    private workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.loadGitignoreRules();
        this.addDefaultExclusions();
    }

    /**
     * Load .gitignore rules from the workspace
     */
    private loadGitignoreRules(): void {
        const gitignorePath = path.join(this.workspaceRoot, '.gitignore');
        
        if (fs.existsSync(gitignorePath)) {
            try {
                const content = fs.readFileSync(gitignorePath, 'utf8');
                this.parseGitignoreContent(content);
                console.log(`📋 Loaded ${this.rules.length} .gitignore rules`);
            } catch (error) {
                console.error('Error reading .gitignore:', error);
            }
        } else {
            console.log('📋 No .gitignore found, using default exclusions only');
        }
    }

    /**
     * Parse .gitignore content into rules
     */
    private parseGitignoreContent(content: string): void {
        const lines = content.split('\n');
        
        for (const line of lines) {
            const trimmedLine = line.trim();
            
            // Skip empty lines and comments
            if (!trimmedLine || trimmedLine.startsWith('#')) {
                continue;
            }

            const rule: GitignoreRule = {
                pattern: trimmedLine,
                isNegation: trimmedLine.startsWith('!'),
                isDirectory: trimmedLine.endsWith('/')
            };

            // Remove leading ! for negation rules
            if (rule.isNegation) {
                rule.pattern = rule.pattern.substring(1);
            }

            // Remove trailing / for directory rules
            if (rule.isDirectory) {
                rule.pattern = rule.pattern.slice(0, -1);
            }

            this.rules.push(rule);
        }
    }

    /**
     * Add default exclusion patterns that should always be ignored
     */
    private addDefaultExclusions(): void {
        const defaultPatterns = [
            // Version control
            '.git/**',
            '.svn/**',
            '.hg/**',
            '.bzr/**',
            
            // Dependencies
            'node_modules/**',
            'bower_components/**',
            'vendor/**',
            'packages/**',
            
            // Build outputs
            'dist/**',
            'build/**',
            'out/**',
            'target/**',
            'bin/**',
            'obj/**',
            '*.min.js',
            '*.min.css',
            
            // Logs and temporary files
            '*.log',
            '*.tmp',
            '*.temp',
            '*.cache',
            '.DS_Store',
            'Thumbs.db',
            'desktop.ini',
            
            // IDE and editor files
            '.vscode/**',
            '.idea/**',
            '.vs/**',
            '*.swp',
            '*.swo',
            '*.swn',
            '*~',
            
            // Compiled/Binary files
            '*.exe',
            '*.dll',
            '*.so',
            '*.dylib',
            '*.o',
            '*.obj',
            '*.a',
            '*.lib',
            '*.bin',
            
            // Archives
            '*.zip',
            '*.tar',
            '*.tar.gz',
            '*.tgz',
            '*.rar',
            '*.7z',
            '*.bz2',
            '*.xz',
            
            // Images (typically not needed for README generation)
            '*.jpg',
            '*.jpeg',
            '*.png',
            '*.gif',
            '*.bmp',
            '*.ico',
            '*.svg',
            '*.tiff',
            '*.tif',
            '*.webp',
            '*.heic',
            
            // Media files
            '*.mp4',
            '*.avi',
            '*.mov',
            '*.wmv',
            '*.flv',
            '*.webm',
            '*.mkv',
            '*.mp3',
            '*.wav',
            '*.flac',
            '*.aac',
            '*.ogg',
            '*.wma',
            
            // Documents
            '*.pdf',
            '*.doc',
            '*.docx',
            '*.xls',
            '*.xlsx',
            '*.ppt',
            '*.pptx',
            
            // Databases
            '*.sqlite',
            '*.sqlite3',
            '*.db',
            '*.mdb',
            
            // Lock files (usually auto-generated)
            'package-lock.json',
            'yarn.lock',
            'pnpm-lock.yaml',
            'composer.lock',
            'Gemfile.lock',
            'Pipfile.lock',
            'poetry.lock',
            'Cargo.lock',
            
            // Test coverage
            'coverage/**',
            '.nyc_output/**',
            '__coverage__/**',
            
            // Environment and secrets
            '.env',
            '.env.local',
            '.env.*.local',
            '*.pem',
            '*.key',
            '*.crt',
            '*.cer'
        ];

        for (const pattern of defaultPatterns) {
            this.rules.push({
                pattern,
                isNegation: false,
                isDirectory: pattern.includes('**') || pattern.includes('/')
            });
        }
    }

    /**
     * Check if a file should be ignored based on gitignore rules
     */
    public shouldIgnore(filePath: string): boolean {
        const relativePath = path.relative(this.workspaceRoot, filePath);
        const normalizedPath = relativePath.replace(/\\/g, '/');
        
        let shouldIgnore = false;

        for (const rule of this.rules) {
            const matches = this.matchesPattern(normalizedPath, rule.pattern);
            
            if (matches) {
                // If it's a negation rule, don't ignore
                // Otherwise, ignore it
                shouldIgnore = !rule.isNegation;
            }
        }

        return shouldIgnore;
    }

    /**
     * Match a file path against a gitignore pattern
     */
    private matchesPattern(filePath: string, pattern: string): boolean {
        // Handle directory patterns with **
        if (pattern.endsWith('/**')) {
            const dirPattern = pattern.slice(0, -3);
            return filePath.startsWith(dirPattern + '/') || 
                   filePath === dirPattern ||
                   filePath.split('/').some(segment => segment === dirPattern);
        }

        // Handle wildcard patterns
        if (pattern.includes('*')) {
            const regexPattern = pattern
                .replace(/\./g, '\\.')
                .replace(/\*/g, '.*')
                .replace(/\?/g, '.');
            
            const regex = new RegExp('^' + regexPattern + '$');
            
            // Try full path match
            if (regex.test(filePath)) {
                return true;
            }
            
            // Try basename match
            if (regex.test(path.basename(filePath))) {
                return true;
            }
            
            // Try any segment match
            const segments = filePath.split('/');
            return segments.some(segment => regex.test(segment));
        }

        // Exact match or path starts with pattern
        return filePath === pattern || 
               filePath.startsWith(pattern + '/') || 
               path.basename(filePath) === pattern ||
               filePath.split('/').includes(pattern);
    }

    /**
     * Get additional exclusion patterns from VS Code settings
     */
    public getAdditionalExclusions(): string[] {
        const config = vscode.workspace.getConfiguration('readmeGenerator');
        return config.get<string[]>('excludePatterns', []);
    }

    /**
     * Check if file is a binary file based on extension
     */
    public isBinaryFile(filePath: string): boolean {
        const binaryExtensions = [
            // Executables
            '.exe', '.dll', '.so', '.dylib', '.bin', '.obj', '.o', '.a', '.lib',
            
            // Images
            '.jpg', '.jpeg', '.png', '.gif', '.bmp', '.ico', '.svg', '.tiff', 
            '.tif', '.webp', '.heic', '.psd', '.ai',
            
            // Video
            '.mp4', '.avi', '.mov', '.wmv', '.flv', '.webm', '.mkv', '.m4v',
            
            // Audio
            '.mp3', '.wav', '.flac', '.aac', '.ogg', '.wma', '.m4a',
            
            // Archives
            '.zip', '.rar', '.7z', '.tar', '.gz', '.bz2', '.xz', '.tgz',
            
            // Documents
            '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
            
            // Databases
            '.sqlite', '.sqlite3', '.db', '.mdb', '.accdb',
            
            // Fonts
            '.ttf', '.otf', '.woff', '.woff2', '.eot',
            
            // Certificates and keys
            '.pem', '.key', '.crt', '.cer', '.p12', '.pfx',
            
            // Other binary formats
            '.class', '.pyc', '.pyo', '.wasm', '.beam'
        ];

        const extension = path.extname(filePath).toLowerCase();
        return binaryExtensions.includes(extension);
    }

    /**
     * Get programming language from file extension
     */
    public getLanguageFromExtension(filePath: string): string {
        const extension = path.extname(filePath).toLowerCase();
        
        const languageMap: { [key: string]: string } = {
            // JavaScript/TypeScript ecosystem
            '.js': 'JavaScript',
            '.jsx': 'React JSX',
            '.ts': 'TypeScript',
            '.tsx': 'React TSX',
            '.mjs': 'JavaScript Module',
            '.cjs': 'CommonJS',
            
            // Python
            '.py': 'Python',
            '.pyw': 'Python',
            '.pyx': 'Cython',
            
            // Web
            '.html': 'HTML',
            '.htm': 'HTML',
            '.css': 'CSS',
            '.scss': 'SCSS',
            '.sass': 'Sass',
            '.less': 'Less',
            
            // Web frameworks
            '.vue': 'Vue',
            '.svelte': 'Svelte',
            '.astro': 'Astro',
            
            // Java/JVM
            '.java': 'Java',
            '.kt': 'Kotlin',
            '.kts': 'Kotlin Script',
            '.scala': 'Scala',
            '.groovy': 'Groovy',
            '.clj': 'Clojure',
            
            // C/C++/C#
            '.c': 'C',
            '.h': 'C Header',
            '.cpp': 'C++',
            '.cxx': 'C++',
            '.cc': 'C++',
            '.hpp': 'C++ Header',
            '.cs': 'C#',
            
            // Systems programming
            '.rs': 'Rust',
            '.go': 'Go',
            '.zig': 'Zig',
            
            // Mobile
            '.swift': 'Swift',
            '.m': 'Objective-C',
            '.mm': 'Objective-C++',
            '.dart': 'Dart',
            
            // Scripting
            '.php': 'PHP',
            '.rb': 'Ruby',
            '.pl': 'Perl',
            '.lua': 'Lua',
            '.r': 'R',
            
            // Shell
            '.sh': 'Shell',
            '.bash': 'Bash',
            '.zsh': 'Zsh',
            '.fish': 'Fish',
            '.ps1': 'PowerShell',
            '.bat': 'Batch',
            '.cmd': 'Command',
            
            // Functional
            '.ml': 'OCaml',
            '.hs': 'Haskell',
            '.elm': 'Elm',
            '.ex': 'Elixir',
            '.exs': 'Elixir Script',
            '.erl': 'Erlang',
            
            // Config/Data
            '.json': 'JSON',
            '.yaml': 'YAML',
            '.yml': 'YAML',
            '.toml': 'TOML',
            '.xml': 'XML',
            '.ini': 'INI',
            '.cfg': 'Config',
            '.conf': 'Config',
            
            // Documentation
            '.md': 'Markdown',
            '.mdx': 'MDX',
            '.rst': 'reStructuredText',
            '.txt': 'Text',
            
            // Database
            '.sql': 'SQL',
            '.plsql': 'PL/SQL',
            '.psql': 'PostgreSQL',
            
            // Other
            '.dockerfile': 'Docker',
            '.tf': 'Terraform',
            '.hcl': 'HCL',
            '.proto': 'Protocol Buffers',
            '.graphql': 'GraphQL',
            '.gql': 'GraphQL',
            '.sol': 'Solidity',
            '.vim': 'VimScript',
            '.asm': 'Assembly',
            '.s': 'Assembly'
        };

        return languageMap[extension] || 'Unknown';
    }

    /**
     * Check if a file is a configuration file
     */
    public isConfigFile(filePath: string): boolean {
        const configPatterns = [
            'package.json',
            'tsconfig.json',
            'webpack.config',
            'babel.config',
            'jest.config',
            'eslint',
            'prettier',
            '.env',
            'docker',
            'makefile',
            'requirements.txt',
            'setup.py',
            'pyproject.toml',
            'go.mod',
            'cargo.toml',
            'pom.xml',
            'build.gradle',
            'composer.json',
            'gemfile',
            'podfile'
        ];
        
        const fileName = path.basename(filePath).toLowerCase();
        return configPatterns.some(pattern => fileName.includes(pattern));
    }

    /**
     * Check if a file is a test file
     */
    public isTestFile(filePath: string): boolean {
        const testPatterns = [
            '.test.',
            '.spec.',
            '.test.ts',
            '.spec.ts',
            '.test.js',
            '.spec.js',
            '__tests__',
            '/tests/',
            '/test/',
            'test_',
            '_test.'
        ];
        
        const lowerPath = filePath.toLowerCase();
        return testPatterns.some(pattern => lowerPath.includes(pattern));
    }

    /**
     * Check if a file is documentation
     */
    public isDocumentationFile(filePath: string): boolean {
        const docExtensions = ['.md', '.rst', '.txt', '.adoc'];
        const docPatterns = ['readme', 'changelog', 'license', 'contributing', 'docs'];
        
        const fileName = path.basename(filePath).toLowerCase();
        const extension = path.extname(filePath).toLowerCase();
        
        return docExtensions.includes(extension) || 
               docPatterns.some(pattern => fileName.includes(pattern));
    }

    /**
     * Get file category for organization
     */
    public getFileCategory(filePath: string): 'config' | 'test' | 'documentation' | 'source' | 'other' {
        if (this.isConfigFile(filePath)) return 'config';
        if (this.isTestFile(filePath)) return 'test';
        if (this.isDocumentationFile(filePath)) return 'documentation';
        if (this.getLanguageFromExtension(filePath) !== 'Unknown') return 'source';
        return 'other';
    }
}
