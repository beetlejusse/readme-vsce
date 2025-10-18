// extension.ts - Main VS Code extension entry point

import * as vscode from 'vscode';
import * as path from 'path';
import { CodebaseAnalyzer } from './codebaseAnalyzer';

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
