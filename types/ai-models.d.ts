import type { Graph } from './graph.d.ts';
import type { Config, HistoryElement, TokenInfo } from './index.d.ts';

/**
 * LLM model types.
 */
export type ModelType = 'streaming' | 'single'

/**
 * Options for the AI model factory.
 */
export type aiFactoryOptions = {
    /**
     * Whether to stream the response or get a single response.
     */
    type: ModelType,

    /**
     * Model name to use.
     */
    model: string,

    /**
     * API key to use for the model provider.
     */
    apiKey: string
}

/**
 * Message to send to the LLM model.
 */
export type Message = {
    /**
     * The role of the message.
     */
    role: string;

    /**
     * Message content.
     */
    content: string;
};

/**
 * Abstract class for AI clients.
 */
export abstract class AIClient {
    /**
     * Model used by the AI client.
     */
    protected _model: string;

    /**
     * API key used by the AI client.
     */
    private _apiKey: string;

    /**
     * Request completion from the AI model for the given messages.
     *
     * @param messages - array representing the user's messages
     * @returns promise that resolves with the response from the AI model
     */
    public requestCompletion(messages: Message[]): Promise<string>;

    /**
     * Returns an object containing a token count placeholder and the token limit for the AI model.
     *
     * @param message - message to count tokens
     * @returns object with a token count and token limit
     */
    public countTokens(message: string): TokenInfo;

    /**
     * Makes a request to the AI model to generate a Q&A response to the user's input of how to use the tool.
     *
     * @param query - user's query
     * @returns promise that resolves with the response from the AI model
     */
    public interactiveHelp(query: string): Promise<string>;

    /**
     * Transforms the history of actions taken by the user and the graph states.
     *
     * @param history - array containing the history of actions taken by the user and the graph states
     * @returns Transformed history
     */
    public historyTransformer(history: Message[]): Message[];

    /**
     * Assembles the chat history based on user inputs, graph changes, and actions taken.
     *
     * @param userPrompt - user prompt
     * @param graph - current state of the graph
     * @param history - array containing the history of actions taken by the user and the graph states
     * @param historyIndex - index to start from in the history
     * @param maxLookBack - maximum number of past tasks to include in the output
     * @returns assembled chat history with 'user' and 'assistant' roles, and the content for each
     */
    public assembleChatHistory(userPrompt: string, graph: Graph, history: HistoryElement[], historyIndex: number, maxLookBack?: number): Message[];

    /**
     * Sends a user prompt to the AI model and returns a difference object between the current graph and the new graph.
     *
     * @param userPrompt - user prompt
     * @param params - options for the query including current state of the graph,
     *                 an array containing the history of actions taken by the user and the graph states,
     *                 index to start from in the history, and configuration options for the query
     * @returns promise that resolves with the difference between the current graph and the new graph
     */
    public query(userPrompt: string, params: { graph: Graph, history: HistoryElement[], historyIndex: number, config: Config }): Promise<string>;
}

/**
 * OpenAI API Client.
 *
 * This is a concrete implementation of the abstract AIClient class, specifically for OpenAI.
 */
export class OpenAIClient extends AIClient {
    /**
     * Client for interacting with the OpenAI API.
     */
    private _client: any;

    /**
     * Tokenizer for encoding messages.
     */
    private _tokenizer: any;

    /**
     * Reconfigures the API client with a new key.
     *
     * @param apiKey -new API key to use
     */
    public reset(apiKey: string): void;

    /**
     * Makes a request to the AI model to generate a Q&A response to the user's input of how to use the tool.
     *
     * @param query - user's query
     * @returns promise that resolves with the response from the AI model
     */
    public interactiveHelp(query: string): Promise<string>;

    /**
     * Returns an object containing the number of tokens in a message and the token limit for the AI model.
     *
     * @param message - message to count tokens for
     * @returns an object with a token count and token limit
     */
    public countTokens(message: string): TokenInfo;

    /**
     * Assembles messages for the interactive help prompt.
     *
     * @param userPrompt - user question to answer
     * @returns messages for the interactive help prompt
     */
    public static assembleHelpMessages(userPrompt: string): Message[];
}

/**
 * OpenAI Single Client.
 *
 * This is an implementation of the OpenAIClient class, which making single completion requests.
 */
export class OpenAISingleClient extends OpenAIClient {
    /**
     * Request a completion from the AI model for the given messages.
     *
     * @param messages - array of messages
     * @returns promise that resolves with the response from the AI model
     */
    public requestCompletion(messages: Message[]): Promise<string>;
}

/**
 * OpenAI Streaming Client.
 *
 * This is an implementation of the OpenAIClient class,  specifically for streaming completions instead of making a single completion request.
 */
export class OpenAIStreamingClient extends OpenAIClient {
    /**
     * Creates a token stream from the chat.
     *
     * @param messages - an array of messages
     * @returns async generator that yields the tokens from the chat
     */
    public chatTokenStream(messages: Message[]): AsyncGenerator<string, void, unknown>;

    /**
     * Request a completion from the AI model for the given messages.
     *
     * @param messages - an array of messages
     * @returns promise that resolves with the response from the AI model
     */
    public requestCompletion(messages: Message[]): Promise<string>;
}

/**
 * Creates a function that can be used to generate LLM completions.
 *
 * @param provider - the LLM provider to use
 * @param options - options for the AI model
 * @param options.type - whether to stream the response or get a single response
 * @param options.model - name of the model to use
 * @param options.apiKey - API key to use for the model provider
 * @returns function that can be used to generate LLM completions
 */
export function aiFactory( provider: string, {type, model, apiKey}: aiFactoryOptions ): AIClient;
