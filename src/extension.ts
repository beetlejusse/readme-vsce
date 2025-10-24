// extension.ts - Main VS Code extension entry point

import * as vscode from 'vscode';
import * as path from 'path';
import { CodebaseAnalyzer } from './codebaseAnalyzer';
import { ReadmeGenerator } from './readmeGenerator';

/**
 * Extension activation
 */
export function activate(context: vscode.ExtensionContext) {
    console.log('🚀 README AI Generator extension is now active!');

    // Register the main command
    const generateCommand = vscode.commands.registerCommand(
        'readme.README',
        async () => {
            await generateReadme();
        }
    );
	
    context.subscriptions.push(generateCommand);

    // Show welcome message on first activation
    const hasShownWelcome = context.globalState.get('hasShownWelcome', false);
    
    if (!hasShownWelcome) {
        showWelcomeMessage(context);
    }
}

/**
 * Extension deactivation
 */
export function deactivate() {
    console.log('👋 README AI Generator extension deactivated');
}

/**
 * Main README generation function
 */
async function generateReadme(): Promise<void> {
    try {
        // Step 1: Validate workspace
        const workspaceFolder = getWorkspaceFolder();
        if (!workspaceFolder) {
            vscode.window.showErrorMessage(
                'Please open a workspace or folder to generate a README.'
            );
            return;
        }

        const workspaceRoot = workspaceFolder.uri.fsPath;
        console.log(`📁 Working in: ${workspaceRoot}`);

        // Step 2: Show confirmation dialog
        const shouldProceed = await showConfirmationDialog();
        if (!shouldProceed) {
            return;
        }

        // Step 3: Check API key configuration
        const analyzer = new CodebaseAnalyzer(workspaceRoot);
        const validation = analyzer.validateWorkspace();
        
        if (!validation.isValid) {
            vscode.window.showErrorMessage(
                `❌ ${validation.error}`,
                'Configure API Key'
            ).then(action => {
                if (action === 'Configure API Key') {
                    vscode.commands.executeCommand('workbench.action.openSettings', 'readmeGenerator.perplexityApiKey');
                }
            });
            return;
        }

        // Step 4: Start analysis with progress tracking
        await performAnalysis(analyzer, workspaceRoot);

    } catch (error) {
        handleError(error);
    }
}

/**
 * Show confirmation dialog
 */
async function showConfirmationDialog(): Promise<boolean> {
    const answer = await vscode.window.showInformationMessage(
        '🤖 Do you want us to read this codebase and make README for it?\n\nThis will analyze all files in your workspace and generate a comprehensive README using AI.',
        { modal: true },
        'Yes, Generate README',
        'Cancel'
    );

    return answer === 'Yes, Generate README';
}

/**
 * Get current workspace folder
 */
function getWorkspaceFolder(): vscode.WorkspaceFolder | undefined {
    const workspaceFolders = vscode.workspace.workspaceFolders;
    
    if (!workspaceFolders || workspaceFolders.length === 0) {
        return undefined;
    }

    if (workspaceFolders.length > 1) {
        return workspaceFolders[0];
    }

    return workspaceFolders[0];
}


/**
 * Handle errors gracefully
 */
function handleError(error: any): void {
    console.error('README generation error:', error);
    
    let errorMessage = 'An unexpected error occurred';
    
    if (error instanceof Error) {
        errorMessage = error.message;
    }

    if (errorMessage.includes('API key')) {
        vscode.window.showErrorMessage(
            `❌ ${errorMessage}`,
            'Configure API Key'
        ).then(action => {
            if (action === 'Configure API Key') {
                vscode.commands.executeCommand('workbench.action.openSettings', 'readmeGenerator.perplexityApiKey');
            }
        });
    } else if (errorMessage.includes('rate limit')) {
        vscode.window.showErrorMessage(
            `❌ ${errorMessage}\n\nPlease wait a few minutes before trying again.`
        );
    } else if (errorMessage.includes('cancelled')) {
        vscode.window.showInformationMessage('README generation cancelled');
    } else {
        vscode.window.showErrorMessage(
            `❌ Failed to generate README: ${errorMessage}`,
            'Show Details'
        ).then(action => {
            if (action === 'Show Details') {
                console.error('Full error details:', error);
            }
        });
    }
}

/**
 * Perform the complete analysis process with progress tracking
 */
async function performAnalysis(analyzer: CodebaseAnalyzer, workspaceRoot: string): Promise<void> {
    try {
        console.log('🔍 Starting codebase analysis...');
        
        // Show initial progress
        vscode.window.showInformationMessage('🔍 Starting codebase analysis...');
        
        // Create progress indicator
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "README AI Generator",
            cancellable: true
        }, async (progress, token) => {
            return new Promise<void>((resolve, reject) => {
                let lastIncrement = 0;
                
                token.onCancellationRequested(() => {
                    console.log('❌ Analysis cancelled by user');
                    reject(new Error('Analysis cancelled by user'));
                });

                // Start analysis with progress callback
                analyzer.analyzeCodebase((progressInfo) => {
                    const progressMessage = getProgressMessage(progressInfo);
                    progress.report({
                        message: progressMessage,
                        increment: progressInfo.percentage - lastIncrement
                    });
                    lastIncrement = progressInfo.percentage;
                    
                    console.log(`📊 ${progressMessage} (${progressInfo.percentage}%)`);
                }).then(async (result) => {
                    // Show analysis completion notification
                    await showAnalysisResults(result.analysis, result.chunks, workspaceRoot);
                    resolve();
                }).catch((error) => {
                    console.error('Analysis failed:', error);
                    reject(error);
                });
            });
        });

    } catch (error) {
        if (error instanceof Error && error.message === 'Analysis cancelled by user') {
            vscode.window.showInformationMessage('❌ Analysis cancelled');
        } else {
            handleError(error);
        }
    }
}

/**
 * Get user-friendly progress message
 */
function getProgressMessage(progressInfo: { stage: string; currentFile?: string; processedFiles?: number; totalFiles?: number; percentage: number }): string {
    switch (progressInfo.stage) {
        case 'scanning':
            return `🔍 Scanning workspace for files...`;
        case 'analyzing':
            if (progressInfo.currentFile) {
                return `📄 Analyzing ${progressInfo.currentFile}... (${progressInfo.processedFiles}/${progressInfo.totalFiles})`;
            }
            return `📊 Analyzing ${progressInfo.totalFiles} files...`;
        case 'chunking':
            return `📦 Creating code chunks for AI processing...`;
        case 'generating':
            return `🤖 Generating README content with AI...`;
        case 'previewing':
            return `👀 Preparing README preview...`;
        case 'saving':
            return `💾 Saving README file...`;
        default:
            return `⚙️ Processing...`;
    }
}

/**
 * Show analysis results and project type
 */
async function showAnalysisResults(
    analysis: { 
        projectType: string; 
        totalFiles: number; 
        totalSize: number; 
        languages: string[]; 
        mainFiles: string[]; 
        dependencies: string[]; 
        frameworks: string[]; 
        structure: { 
            directories: string[]; 
            importantFiles: string[]; 
            configFiles: string[]; 
            sourceFiles: string[]; 
            testFiles: string[]; 
            documentationFiles: string[] 
        } 
    },
    chunks: any[],
    workspaceRoot: string
): Promise<void> {
    const { projectType, totalFiles, languages, dependencies } = analysis;
    
    console.log('✅ Analysis completed successfully!');
    console.log(`📊 Project Type: ${projectType}`);
    console.log(`📁 Total Files: ${totalFiles}`);
    console.log(`💻 Languages: ${languages.join(', ')}`);
    console.log(`📦 Dependencies: ${dependencies.length} found`);
    
    // Show informative notification
    const message = `✅ Your codebase is: **${projectType}**\n\n` +
                   `📁 ${totalFiles} files analyzed\n` +
                   `💻 Languages: ${languages.join(', ')}\n` +
                   `📦 ${dependencies.length} dependencies found`;
    
    const action = await vscode.window.showInformationMessage(
        message,
        'Generate README',
        'View Details',
        'Cancel'
    );
    
    if (action === 'Generate README') {
        // Start actual README generation
        await generateReadmeContent(analysis, chunks, workspaceRoot);
    } else if (action === 'View Details') {
        // Show detailed analysis in a new document
        showDetailedAnalysis(analysis);
    }
}

/**
 * Generate README content using AI
 */
async function generateReadmeContent(analysis: any, chunks: any[], workspaceRoot: string): Promise<void> {
    try {
        console.log('🤖 Starting README generation with AI...');
        
        const readmeGenerator = new ReadmeGenerator(workspaceRoot);
        
        // Show progress during generation
        await vscode.window.withProgress({
            location: vscode.ProgressLocation.Notification,
            title: "README AI Generator",
            cancellable: true
        }, async (progress, token) => {
            return new Promise<void>((resolve, reject) => {
                let lastIncrement = 0;
                
                token.onCancellationRequested(() => {
                    console.log('❌ README generation cancelled by user');
                    reject(new Error('README generation cancelled by user'));
                });

                // Generate README with progress tracking
                readmeGenerator.generateReadme(analysis, chunks, (progressInfo) => {
                    const progressMessage = getProgressMessage(progressInfo);
                    progress.report({
                        message: progressMessage,
                        increment: progressInfo.percentage - lastIncrement
                    });
                    lastIncrement = progressInfo.percentage;
                    
                    console.log(`🤖 ${progressMessage} (${progressInfo.percentage}%)`);
                }).then(async (readmeContent) => {
                    // Validate content
                    const validation = readmeGenerator.validateReadmeContent(readmeContent);
                    
                    if (!validation.isValid) {
                        console.warn('⚠️ README validation issues:', validation.issues);
                    }
                    
                    // Show preview and save options
                    await showReadmePreview(readmeContent, readmeGenerator, workspaceRoot);
                    resolve();
                }).catch((error) => {
                    console.error('❌ README generation failed:', error);
                    reject(error);
                });
            });
        });

    } catch (error) {
        if (error instanceof Error && error.message === 'README generation cancelled by user') {
            vscode.window.showInformationMessage('❌ README generation cancelled');
        } else {
            handleError(error);
        }
    }
}

/**
 * Show README preview and handle save options
 */
async function showReadmePreview(readmeContent: string, readmeGenerator: ReadmeGenerator, workspaceRoot: string): Promise<void> {
    try {
        // Show preview
        await readmeGenerator.previewReadme(readmeContent);
        
        // Ask user what to do next
        const action = await vscode.window.showInformationMessage(
            '✅ README generated successfully! What would you like to do?',
            'Save README',
            'Preview & Edit',
            'Regenerate',
            'Cancel'
        );
        
        if (action === 'Save README') {
            await saveReadme(readmeContent, readmeGenerator, workspaceRoot);
        } else if (action === 'Preview & Edit') {
            // Keep the preview open for editing
            vscode.window.showInformationMessage('📝 README is now open for editing. Save it when you\'re done!');
        } else if (action === 'Regenerate') {
            // Restart the generation process
            vscode.window.showInformationMessage('🔄 Regenerating README...');
            // Note: This would require passing analysis and chunks again
            // For now, just show a message
            vscode.window.showInformationMessage('To regenerate, please run the command again.');
        }
        
    } catch (error) {
        console.error('❌ Failed to show README preview:', error);
        handleError(error);
    }
}

/**
 * Save README to workspace
 */
async function saveReadme(readmeContent: string, readmeGenerator: ReadmeGenerator, workspaceRoot: string): Promise<void> {
    try {
        const savedPath = await readmeGenerator.saveReadme(readmeContent);
        
        vscode.window.showInformationMessage(
            `✅ README saved successfully!\n\n📁 Location: ${path.basename(savedPath)}`,
            'Open README',
            'Open Folder'
        ).then(action => {
            if (action === 'Open README') {
                vscode.workspace.openTextDocument(savedPath).then(doc => {
                    vscode.window.showTextDocument(doc);
                });
            } else if (action === 'Open Folder') {
                vscode.commands.executeCommand('revealFileInOS', vscode.Uri.file(savedPath));
            }
        });
        
    } catch (error) {
        console.error('❌ Failed to save README:', error);
        vscode.window.showErrorMessage(`Failed to save README: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
}

/**
 * Show detailed analysis in a new document
 */
function showDetailedAnalysis(analysis: { 
    projectType: string; 
    totalFiles: number; 
    totalSize: number; 
    languages: string[]; 
    mainFiles: string[]; 
    dependencies: string[]; 
    frameworks: string[]; 
    structure: { 
        directories: string[]; 
        importantFiles: string[]; 
        configFiles: string[]; 
        sourceFiles: string[]; 
        testFiles: string[]; 
        documentationFiles: string[] 
    } 
}): void {
    const { projectType, totalFiles, totalSize, languages, mainFiles, dependencies, frameworks, structure } = analysis;
    
    const content = `# Codebase Analysis Results

## Project Overview
- **Type**: ${projectType}
- **Total Files**: ${totalFiles}
- **Total Size**: ${(totalSize / 1024 / 1024).toFixed(2)} MB
- **Languages**: ${languages.join(', ')}

## Main Files
${mainFiles.map((file: string) => `- ${file}`).join('\n')}

## Dependencies
${dependencies.slice(0, 20).map((dep: string) => `- ${dep}`).join('\n')}
${dependencies.length > 20 ? `\n... and ${dependencies.length - 20} more` : ''}

## Project Structure
- **Directories**: ${structure.directories.length}
- **Important Files**: ${structure.importantFiles.length}
- **Config Files**: ${structure.configFiles.length}
- **Source Files**: ${structure.sourceFiles.length}
- **Test Files**: ${structure.testFiles.length}
- **Documentation Files**: ${structure.documentationFiles.length}

---
*Generated by README AI Generator*`;

    vscode.workspace.openTextDocument({ content, language: 'markdown' })
        .then(doc => vscode.window.showTextDocument(doc));
}

/**
 * Show welcome message on first activation
 */
function showWelcomeMessage(context: vscode.ExtensionContext): void {
    vscode.window.showInformationMessage(
        '🎉 Welcome to README AI Generator!\n\nUse Ctrl+Shift+P and search for "Generate README" to get started.',
        'Generate README Now',
        'Configure Settings',
        "Don't Show Again"
    ).then(action => {
        if (action === 'Generate README Now') {
            vscode.commands.executeCommand('readme.generate');
        } else if (action === 'Configure Settings') {
            vscode.commands.executeCommand('workbench.action.openSettings', 'readmeGenerator');
        } else if (action === "Don't Show Again") {
            context.globalState.update('hasShownWelcome', true);
        }
    });
}
