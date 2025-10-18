import axios, { AxiosResponse } from "axios";
import * as vscode from "vscode";
import { CodeChunk, PerplexityRequest, PerplexityResponse } from "./types";

export class PerplexityClient {
    [x: string]: any;
    private readonly apiKey: string;
    private readonly apiURL: string = "https://api.perplexity.ai"
    private readonly model: string = "sonar-medium-online";
    private readonly maxTokens: number = 5000;

    constructor() {
        /**
         * @ hardcoding api key for now, will use vscode secrets later
         */
        this.apiKey = process.env.PERPLEXITY_API_KEY!
    }

    async generateReadmeChunk(chunk: CodeChunk, isFirstChunk: boolean = false) {
        try {
            const systemPrompt = this.createSystemPrompt(isFirstChunk);
            const userPrompt = this.createUserPrompt(chunk);

            const request: PerplexityRequest = {
                model: this.model,
                messages: [
                    { role: "system", content: systemPrompt },
                    { role: "user", content: userPrompt }
                ],
                max_tokens: this.maxTokens,
                temperature: 0.3,
                stream: false
            };

            console.log(`🤖 Making API request for chunk ${chunk.chunkIndex + 1}`);

            const response = await this.makeApiRequest(request);

            return this.extractContentFromResponse(response)
        } catch (error) {
            console.error(`Error generating Readme Chunk ${chunk.chunkIndex}`, error)
            throw new Error(`Failed to generate README chunk: ${error instanceof Error ? error.message : 'Unknown error'}`);
        }
    }

    private createSystemPrompt(isFirstChunk: boolean): string {
        if (isFirstChunk) {
            return `
            You are an expert technical writer and software developer. Your task is to generate a comprehensive, professional README.md file for a software project.

IMPORTANT INSTRUCTIONS:
1. Generate ONLY the README content in proper Markdown format
2. DO NOT include any explanations, comments, or meta-text about the README
3. Start directly with the project title (# Project Name)
4. Include these sections in order:
   - Project Title and Description
   - Features/Key Highlights
   - Installation Instructions
   - Usage Examples
   - API Documentation (if applicable)
   - Configuration
   - Contributing Guidelines
   - License Information

WRITING STYLE:
- Clear, concise, and professional
- Use proper Markdown formatting
- Include code examples where relevant
- Make it engaging for developers
- Assume the reader is technically competent
- Use bullet points and structured formatting

ANALYSIS REQUIREMENTS:
- Identify the project type and main programming language
- Extract key features and functionality
- Identify dependencies and requirements
- Provide accurate installation steps
- Include realistic usage examples based on the actual code`;
        } else {
            return `You are continuing to analyze a codebase for README generation. This is a continuation chunk.

INSTRUCTIONS:
1. Analyze this additional code chunk
2. Extract relevant information for the README
3. Focus on:
   - Additional features not covered in previous chunks
   - API endpoints or methods
   - Configuration options
   - Dependencies and integrations
   - Usage patterns

4. Provide only the relevant content that should be ADDED to the existing README
5. Do not repeat information from previous chunks
6. Use proper Markdown formatting
7. Focus on new insights from this code chunk
            `
        }
    }

    private createUserPrompt(chunk: CodeChunk): string {
        let prompt = `Please analyze this codebase chunk and generate appropriate README content.

CHUNK INFORMATION:
- Chunk ${chunk.chunkIndex + 1}
- Total files in chunk: ${chunk.files.length}
- Description: ${chunk.description}

CODE FILES:`;

        for (const file of chunk.files) {
            prompt += `\n--- FILE: ${file.path} (${file.language}) ---\n`
            prompt += file.content.substring(0, 5000); //limiting to first 5000 characters to overly bigger prompts

            if (file.content.length > 5000) {
                prompt += `\n... (truncated)`
            }
            prompt += `\n`;
        }

        if (chunk.chunkIndex === 0) {
            prompt += `\nBased on this code analysis, generate a complete, professional README.md file. Make it comprehensive but concise, focusing on what developers need to know to understand, install, and use this project.`;
        } else {
            prompt += `\nThis is additional code from the project. Analyze it and provide any additional README content that should be included based on new features, APIs, or functionality discovered in this chunk.`;
        }

        return prompt;
    }

    private async makeApiRequest(request: PerplexityRequest): Promise<PerplexityResponse> {
        try {
            const response: AxiosResponse<PerplexityResponse> = await axios.post(
                `${this.apiURL}/chat/completions`,
                request,
                {
                    headers: {
                        'Authorization': `Bearer ${this.apiKey}`,
                        'Content-Type': 'application/json'
                    },
                    timeout: 60000
                }
            )

            if (response.status !== 200) {
                throw new Error(`API request failed with status ${response.status}: ${response.statusText}`);
            }

            return response.data;
        } catch (error) {
            if (axios.isAxiosError(error)) {
                if (error.response?.status === 401) {
                    throw new Error('Invalid API key. Please check your Perplexity API key configuration.');
                } else if (error.response?.status === 429) {
                    throw new Error('API rate limit exceeded. Please wait and try again.');
                } else if (error.response?.status === 400) {
                    throw new Error('Invalid request format. Please check your input.');
                }
            }
            throw error;
        }
    }

    private extractContentFromResponse(response: PerplexityResponse): string {
        if (!response.choices || response.choices.length === 0) {
            throw new Error('No response choices returned from API');
        }
        const choice = response.choices[0];
        if (!choice.message || !choice.message.content) {
            throw new Error('No message content in API response choice');
        }
        return choice.message.content.trim();
    }

    public estimateTokenCount(text: string): number {
        return Math.ceil(text.length / 4);
    }

    public validateAPIKey(): boolean {
        return !!this.apiKey && this.apiKey.trim() !== '' && this.apiKey !== process.env.PERPLEXITY_API_KEY
    }

    async testConnection(): Promise<boolean> {
        try {
            const testRequest: PerplexityRequest = {
                model: this.model,
                messages: [
                    {role: 'user', content: 'Hello, this is a test message.'}
                ], max_tokens: 50
            }

            await this.makeApiRequest(testRequest);
            return true;
        } catch (error) {
            console.error('API connection test failed:', error);
            return false;
        }
    }
}