import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { PerplexityClient } from './perplexityClient';
import { CodeChunk, CodebaseAnalysis, GenerationProgress } from './types';

export class ReadmeGenerator {
    private readonly perplexityClient: PerplexityClient;
    private readonly workspaceRoot: string;

    constructor(workspaceRoot: string) {
        this.workspaceRoot = workspaceRoot;
        this.perplexityClient = new PerplexityClient();
    }

    /**
     * Generate README from analysis results and code chunks
     */
    async generateReadme(
        analysis: CodebaseAnalysis,
        chunks: CodeChunk[],
        progressCallback: (progress: GenerationProgress) => void
    ): Promise<string> {
        try {
            console.log('🤖 Starting README generation process...');
            
            progressCallback({
                stage: 'generating',
                message: 'Initializing AI generation...',
                percentage: 0
            });

            // Step 1: Generate content for each chunk
            const generatedChunks = await this.processChunks(chunks, progressCallback);
            
            // Step 2: Assemble the final README
            progressCallback({
                stage: 'generating',
                message: 'Assembling final README...',
                percentage: 90
            });

            const finalReadme = this.assembleReadme(generatedChunks, analysis);
            
            progressCallback({
                stage: 'generating',
                message: 'README generation completed!',
                percentage: 100
            });

            console.log('✅ README generation completed successfully');
            return finalReadme;

        } catch (error) {
            console.error('❌ README generation failed:', error);
            throw new Error(`Failed to generate README: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Process all code chunks through AI
     */
    private async processChunks(
        chunks: CodeChunk[],
        progressCallback: (progress: GenerationProgress) => void
    ): Promise<string[]> {
        const generatedChunks: string[] = [];
        const totalChunks = chunks.length;

        console.log(`📦 Processing ${totalChunks} code chunks through AI...`);

        for (let i = 0; i < chunks.length; i++) {
            const chunk = chunks[i];
            const isFirstChunk = i === 0;
            
            progressCallback({
                stage: 'generating',
                message: `Generating content for chunk ${i + 1}/${totalChunks}...`,
                percentage: Math.floor((i / totalChunks) * 80) // 0-80% for chunk processing
            });

            try {
                console.log(`🤖 Processing chunk ${i + 1}/${totalChunks}: ${chunk.description}`);
                
                const generatedContent = await this.perplexityClient.generateReadmeChunk(chunk, isFirstChunk);
                generatedChunks.push(generatedContent);
                
                console.log(`✅ Chunk ${i + 1} processed successfully`);
                
                // Add small delay to avoid rate limiting
                if (i < chunks.length - 1) {
                    await new Promise(resolve => setTimeout(resolve, 1000));
                }

            } catch (error) {
                console.error(`❌ Failed to process chunk ${i + 1}:`, error);
                
                // Continue with other chunks even if one fails
                const fallbackContent = this.createFallbackContent(chunk, isFirstChunk);
                generatedChunks.push(fallbackContent);
            }
        }

        return generatedChunks;
    }

    /**
     * Create fallback content when AI generation fails
     */
    private createFallbackContent(chunk: CodeChunk, isFirstChunk: boolean): string {
        if (isFirstChunk) {
            return `# Project README

## Overview
This is an auto-generated README for your project.

## Files Analyzed
${chunk.files.map(file => `- ${file.path}`).join('\n')}

*Note: This content was generated as a fallback due to AI processing issues.*`;
        } else {
            return `\n## Additional Components\n\n*Additional project components detected but could not be processed by AI.*`;
        }
    }

    /**
     * Assemble the final README from generated chunks
     */
    private assembleReadme(generatedChunks: string[], analysis: CodebaseAnalysis): string {
        console.log('📝 Assembling final README content...');
        
        // Start with the first chunk (should contain the main README structure)
        let finalReadme = generatedChunks[0] || '';
        
        // Add additional chunks if they exist
        for (let i = 1; i < generatedChunks.length; i++) {
            const additionalContent = generatedChunks[i];
            if (additionalContent && additionalContent.trim()) {
                finalReadme += '\n\n' + additionalContent;
            }
        }

        // Add metadata footer
        finalReadme += this.addMetadataFooter(analysis);
        
        return finalReadme;
    }

    /**
     * Add metadata footer to the README
     */
    private addMetadataFooter(analysis: CodebaseAnalysis): string {
        return `

---

*This README was automatically generated by README AI Generator*

**Analysis Summary:**
- Project Type: ${analysis.projectType}
- Files Analyzed: ${analysis.totalFiles}
- Languages: ${analysis.languages.join(', ')}
- Dependencies: ${analysis.dependencies.length} found

*Generated on ${new Date().toLocaleDateString()}*`;
    }

    /**
     * Save README to workspace
     */
    async saveReadme(content: string, filename: string = 'README.md'): Promise<string> {
        try {
            const readmePath = path.join(this.workspaceRoot, filename);
            
            // Check if README already exists
            if (fs.existsSync(readmePath)) {
                const backupPath = path.join(this.workspaceRoot, `README.backup.${Date.now()}.md`);
                fs.copyFileSync(readmePath, backupPath);
                console.log(`📁 Backed up existing README to: ${backupPath}`);
            }

            // Write the new README
            fs.writeFileSync(readmePath, content, 'utf8');
            console.log(`💾 README saved to: ${readmePath}`);
            
            return readmePath;
        } catch (error) {
            console.error('❌ Failed to save README:', error);
            throw new Error(`Failed to save README: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Preview README content in a new document
     */
    async previewReadme(content: string): Promise<void> {
        try {
            const doc = await vscode.workspace.openTextDocument({
                content,
                language: 'markdown'
            });
            
            await vscode.window.showTextDocument(doc, { preview: true });
            console.log('👀 README preview opened');
        } catch (error) {
            console.error('❌ Failed to preview README:', error);
            throw new Error(`Failed to preview README: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    /**
     * Validate generated README content
     */
    validateReadmeContent(content: string): { isValid: boolean; issues: string[] } {
        const issues: string[] = [];
        
        if (!content || content.trim().length === 0) {
            issues.push('README content is empty');
        }
        
        if (content.length < 100) {
            issues.push('README content is too short (less than 100 characters)');
        }
        
        if (!content.includes('#')) {
            issues.push('README should contain at least one heading');
        }
        
        if (!content.includes('##')) {
            issues.push('README should contain at least one subheading');
        }
        
        return {
            isValid: issues.length === 0,
            issues
        };
    }
}
