import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { GitignoreParser } from './gitignoreParser';
import { PerplexityClient } from './perplexityClient';
import { CodeChunk, FileInfo, GenerationProgress, ProjectStructure, CodebaseAnalysis } from './types';

export class CodebaseAnalyzer {
    private workspaceRoot: string;
    private gitignoreParser: GitignoreParser;
    private perplexityClient: PerplexityClient;
    private maxFileSize: number;
    private maxTokensPerChunk: number = 5000;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.gitignoreParser = new GitignoreParser(workspaceRoot);
        this.perplexityClient = new PerplexityClient();

        const config = vscode.workspace.getConfiguration('readmeGenerator');
        this.maxFileSize = config.get<number>('maxFileSize', 1048576);
    }

    private async discoverFiles(): Promise<string[]> {
        const files: string[] = [];

        const traverseDirectory = (dirPath: string): void => {
            try {
                const entries = fs.readdirSync(dirPath, { withFileTypes: true })

                for (const entry of entries) {
                    const fullPath = path.join(dirPath, entry.name);

                    if (entry.isDirectory()) {
                        if (!this.gitignoreParser.shouldIgnore(fullPath)) {
                            traverseDirectory(fullPath);
                        }
                    } else if (entry.isFile()) {
                        if (!this.gitignoreParser.shouldIgnore(fullPath) &&
                            !this.gitignoreParser.isBinaryFile(fullPath)) {
                            files.push(fullPath);
                        }
                    }
                }
            } catch (error) {
                console.error(`Error reading directory ${dirPath}:`, error);
            }
        };

        traverseDirectory(this.workspaceRoot);
        return files;
    }

    private isMainFile(filePath: string): boolean {
        const fileName = path.basename(filePath).toLowerCase();
        const mainFilePatterns = [
            'main.', 'index.', 'app.', 'server.', 'client.',
            'package.json', 'requirements.txt', 'setup.py',
            'dockerfile', 'docker-compose.yml', 'makefile',
            'readme.md', 'readme.txt', 'license', 'changelog.md'
        ];

        return mainFilePatterns.some(pattern =>
            fileName.startsWith(pattern) || fileName === pattern
        );
    }

    private async processFiles(
        filePaths: string[],
        progressCallback: (progress: GenerationProgress) => void
    ): Promise<FileInfo[]> {
        const fileInfos: FileInfo[] = [];

        for (let i = 0; i < filePaths.length; i++) {
            const filePath = filePaths[i];

            try {
                const stats = fs.statSync(filePath);

                if (stats.size > this.maxFileSize) {
                    console.log(`⚠️ Skipping large file: ${filePath}`);
                    continue;
                }

                const content = fs.readFileSync(filePath, 'utf8');
                const language = this.gitignoreParser.getLanguageFromExtension(filePath);
                const isMainFile = this.isMainFile(filePath);

                const fileInfo: FileInfo = {
                    path: path.relative(this.workspaceRoot, filePath),
                    content,
                    size: stats.size,
                    language,
                    isMainFile
                };

                fileInfos.push(fileInfo);

                if (i % 10 === 0 || i === filePaths.length - 1) {
                    const fileName = path.basename(filePath);
                    console.log(`📄 Processing: ${fileName} (${i + 1}/${filePaths.length})`);
                    
                    progressCallback({
                        stage: 'analyzing',
                        message: `Processing files... (${i + 1}/${filePaths.length})`,
                        percentage: 25 + (30 * (i + 1) / filePaths.length),
                        currentFile: fileName,
                        totalFiles: filePaths.length,
                        processedFiles: i + 1
                    });
                }

            } catch (error) {
                console.error(`Error processing file ${filePath}:`, error);
            }
        }

        return fileInfos;
    }

    private determineProjectType(fileInfos: FileInfo[], languages: string[]): string {
        const hasFile = (name: string) => fileInfos.some(f => path.basename(f.path).toLowerCase() === name);
        const hasExtension = (ext: string) => fileInfos.some(f => f.path.endsWith(ext));

        console.log('🔍 Detecting project type...');
        
        if (hasFile('package.json')) {
            console.log('📦 Found package.json - Node.js project detected');
            if (hasExtension('.jsx') || hasExtension('.tsx')) {
                console.log('⚛️ React components found - React Application');
                return 'React Application';
            }
            if (hasExtension('.vue')) {
                console.log('🟢 Vue components found - Vue.js Application');
                return 'Vue.js Application';
            }
            if (hasFile('next.config.js') || hasFile('next.config.ts')) {
                console.log('⚡ Next.js config found - Next.js Application');
                return 'Next.js Application';
            }
            console.log('📦 Node.js Application');
            return 'Node.js Application';
        }

        if (hasFile('setup.py') || hasFile('requirements.txt')) {
            console.log('🐍 Python project detected');
            if (hasFile('manage.py')) {
                console.log('🌐 Django framework detected - Django Application');
                return 'Django Application';
            }
            console.log('🐍 Python Project');
            return 'Python Project';
        }

        if (hasFile('pom.xml')) {
            console.log('☕ Maven Java project detected');
            return 'Maven Java Project';
        }
        if (hasFile('build.gradle')) {
            console.log('☕ Gradle Java project detected');
            return 'Gradle Java Project';
        }
        if (hasFile('go.mod')) {
            console.log('🐹 Go module detected');
            return 'Go Module';
        }
        if (hasFile('cargo.toml')) {
            console.log('🦀 Rust project detected');
            return 'Rust Project';
        }
        if (hasFile('pubspec.yaml')) {
            console.log('📱 Flutter application detected');
            return 'Flutter Application';
        }

        if (languages.length > 0) {
            console.log(`💻 ${languages[0]} project detected`);
            return `${languages[0]} Project`;
        }

        console.log('📁 Generic software project detected');
        return 'Software Project';
    }

    private analyzeProjectStructure(fileInfos: FileInfo[]): CodebaseAnalysis {
        const languages = new Set<string>();
        const mainFiles: string[] = [];
        const dependencies: string[] = [];
        const frameworks: string[] = [];
        let totalSize = 0;

        const structure: ProjectStructure = {
            directories: [],
            importantFiles: [],
            configFiles: [],
            sourceFiles: [],
            testFiles: [],
            documentationFiles: []
        };

        for (const file of fileInfos) {
            totalSize += file.size;
            languages.add(file.language);

            if (file.isMainFile) {
                mainFiles.push(file.path);
                structure.importantFiles.push(file.path);
            }

            // Extract dependencies from package.json
            if (path.basename(file.path).toLowerCase() === 'package.json') {
                try {
                    const packageJson = JSON.parse(file.content);
                    if (packageJson.dependencies) {
                        dependencies.push(...Object.keys(packageJson.dependencies));
                    }
                    if (packageJson.devDependencies) {
                        dependencies.push(...Object.keys(packageJson.devDependencies));
                    }
                } catch (error) {
                    console.error('Error parsing package.json:', error);
                }
            }

            // Extract Python dependencies
            if (file.path.toLowerCase().includes('requirements.txt')) {
                const lines = file.content.split('\n');
                for (const line of lines) {
                    const dep = line.trim().split('==')[0].split('>=')[0].split('<=')[0];
                    if (dep && !dep.startsWith('#')) {
                        dependencies.push(dep);
                    }
                }
            }
        }

        const uniqueDirs = new Set<string>();
        for (const file of fileInfos) {
            const dir = path.dirname(file.path);
            if (dir && dir !== '.') {
                uniqueDirs.add(dir);
            }
        }
        structure.directories = Array.from(uniqueDirs);

        const projectType = this.determineProjectType(fileInfos, Array.from(languages));

        return {
            totalFiles: fileInfos.length,
            totalSize,
            languages: Array.from(languages).filter(lang => lang !== 'Unknown'),
            mainFiles,
            dependencies: Array.from(new Set(dependencies)),
            frameworks: Array.from(new Set(frameworks)),
            projectType,
            structure
        };
    }

    private createChunk(files: FileInfo[], totalTokens: number, chunkIndex: number): CodeChunk {
        const languages = new Set(files.map(f => f.language));
        const hasMainFiles = files.some(f => f.isMainFile);

        let description = `Chunk ${chunkIndex + 1}`;
        if (hasMainFiles) {
            description += ' (contains main files)';
        }
        description += ` - ${Array.from(languages).join(', ')} files`;

        return {
            files,
            totalTokens,
            chunkIndex,
            description
        };
    }

    private createCodeChunks(fileInfos: FileInfo[]): CodeChunk[] {
        const chunks: CodeChunk[] = [];
        let currentChunk: FileInfo[] = [];
        let currentTokens = 0;
        let chunkIndex = 0;

        const sortedFiles = fileInfos.sort((a, b) => {
            if (a.isMainFile && !b.isMainFile) return -1;
            if (!a.isMainFile && b.isMainFile) return 1;
            return b.size - a.size;
        });

        for (const file of sortedFiles) {
            const fileTokens = this.perplexityClient.estimateTokenCount(file.content);

            if (currentTokens + fileTokens > this.maxTokensPerChunk && currentChunk.length > 0) {
                chunks.push(this.createChunk(currentChunk, currentTokens, chunkIndex));
                currentChunk = [];
                currentTokens = 0;
                chunkIndex++;
            }

            currentChunk.push(file);
            currentTokens += fileTokens;

            if (fileTokens > this.maxTokensPerChunk) {
                chunks.push(this.createChunk([file], fileTokens, chunkIndex));
                currentChunk = [];
                currentTokens = 0;
                chunkIndex++;
            }
        }

        if (currentChunk.length > 0) {
            chunks.push(this.createChunk(currentChunk, currentTokens, chunkIndex));
        }

        console.log(`📦 Created ${chunks.length} code chunks for processing`);
        return chunks;
    }

    public validateWorkspace(): { isValid: boolean; error?: string } {
        if (!fs.existsSync(this.workspaceRoot)) {
            return { isValid: false, error: 'Workspace root does not exist' };
        }

        if (!this.perplexityClient.validateAPIKey()) {
            return {
                isValid: false,
                error: 'Invalid Perplexity API key. Please configure your API key in settings.'
            };
        }

        return { isValid: true };
    }

    async analyzeCodebase(progressCallback: (progress: GenerationProgress) => void): Promise<{ analysis: CodebaseAnalysis; chunks: CodeChunk[] }> {

        progressCallback({
            stage: 'scanning',
            message: 'Scanning workspace for files...',
            percentage: 10
        });

        console.log('🔍 Discovering files in workspace...');
        const allFiles = await this.discoverFiles();
        console.log(`📁 Found ${allFiles.length} files to analyze`);

        progressCallback({
            stage: 'analyzing',
            message: `Analyzing ${allFiles.length} files...`,
            percentage: 25,
            totalFiles: allFiles.length,
        })

        const fileInfos = await this.processFiles(allFiles, progressCallback);

        progressCallback({
            stage: 'analyzing',
            message: 'Analyzing project structure...',
            percentage: 60
        });

        console.log('📊 Analyzing project structure...');
        const analysis = this.analyzeProjectStructure(fileInfos);
        console.log(`✅ Project type detected: ${analysis.projectType}`);
        console.log(`💻 Languages found: ${analysis.languages.join(', ')}`);
        console.log(`📦 Dependencies: ${analysis.dependencies.length} found`);

        progressCallback({
            stage: 'chunking',
            message: 'Creating code chunks for API processing...',
            percentage: 75
        });

        console.log('📦 Creating code chunks for AI processing...');
        const chunks = this.createCodeChunks(fileInfos);

        progressCallback({
            stage: 'chunking',
            message: `Created ${chunks.length} chunks for processing`,
            percentage: 85
        });

        console.log(`✅ Analysis completed! Created ${chunks.length} chunks for AI processing`);
        return { analysis, chunks };
    }
}