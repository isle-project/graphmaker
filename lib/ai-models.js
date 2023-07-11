
const { Configuration, OpenAIApi } = require( 'openai' );
const { encoding_for_model } = require( '@dqbd/tiktoken' );
const debug = require( 'debug' )( 'graphmaker' );
const deepCopy = require( '@stdlib/utils-copy' );
const { stringifyGraphForModel, noQuoteKeysStringify } = require( './graph-mutations.js' );
const graphSchema = require( './spec/graph-schema.json' );
const { TASK, SET_GRAPH } = require( './spec/actions.json' );


// Constants

const DEFAULT_EXEC_POLICIES = {
    'gpt-3.5-turbo': 'incremental',
    'gpt-4': 'batch'
};

const OPENAI_TOKEN_LIMITS = {
    'gpt-3.5-turbo': 4096,
    'gpt-4': 8192
};

const SYSTEM_MESSAGE = {
    role: 'system',
    content: 'You are an AI bot for generating directed and undirected graphs that match a specified JSON schema. You will ensure that properties for nodes and edges are only set when required. Positioning requests for the nodes should be treated as requests for corresponding constraints on the node positions.\n\nFor each user request, you will generate a JSON object that represents the difference between the current graph and the new graph.\n\nThe keys of the returned object are strings that are either keys from the graph or sequences of such keys separated by dots that represent a nested key path in the graph. The values are the new objects within the graph for those key paths, with `null` indicating that the key should be removed. For existing array elements, use the array index as the key part to update the element. To append a new element to an array, use `push` as the final key segment.'
};

const EXAMPLES = `
add three nodes => {"nodes.A":{},"nodes.B":{},"nodes.C":{}}
add an edge from A to B => {"edges.AB":{"source":"A","target":"B"}}
make the graph directed => {"directed":true}
add a directed edge from B to C => {"directed":true,"edges.BC":{"source":"B","target":"C"}}
define a style "sharp" that sets fill color to blue and fill style to hashed => {"styles.sharp":{"fillColor":"blue","fillStyle":"hashed"}}
apply the style "sharp" to nodes A and D => {"nodes.A.style":["sharp"],"nodes.D.style":["sharp"]}
add two distinct edges from node C to node E => {"edges.CE1":{"source":"C","target":"E"},"edges.CE2":{"source":"C","target":"E"}}
add a constraint that nodes C is at the average position of nodes A and B => {"constraints.push":{"meaning":"C is at the average position of A and B","constraints":["C.x = (A.x + B.x) / 2", "C.y = (A.y + B.y) / 2" ]}}
`;

/**
 * Abstract class for AI clients.
 */
class AIClient {
    constructor( {model, apiKey}, options = {} ) {
       this._model = model;
       this._apiKey = apiKey;
    }

    /**
     * Name of the model used by the AI client.
     *
     * @returns {string} name of the model
     */
    get model() {   // -> string
        return this._model;
    }

    /**
     * Request completion from the AI model for the given messages.
     *
     * @param {Array} messages - an array of strings representing the user's messages
     */
    async requestCompletion( messages ) {  // -> string
        throw new Error( 'requestCompletion must be implemented in the base class' );
    }

    /**
     * Returns an object containing a token count placeholder and the token limit for the AI model.
     *
     * @returns {Object} an object with a token count and token limit
     */
    countTokens() {
        return { tokenCount: 0, tokenLimit: 1000000 };
    }

    /**
     * Makes a request to the AI model to generate a Q&A response to the user's input of how to use the tool.
     */
    async interactiveHelp( query ) {       // string -> string
        throw new Error( `interactiveHelp must be implemented in the base class` );
    }

    /**
     * Transforms the history of actions taken by the user and the graph states.
     *
     * @param {Array} history - array containing the history of actions taken by the user and the graph states
     */
    historyTransformer( history ) {        // Array<{role: string, content: string}> -> Array<any>
        return history;  // ATTN: copy??
    }

    /**
     * Assembles the chat history based on user inputs, graph changes, and actions taken.
     *
     * @param {string} userPrompt - user prompt
     * @param {Object} graph - current state of the graph
     * @param {Array} history - an array containing the history of actions taken by the user and the graph states
     * @param {number} historyIndex - index to start from in the history
     * @param {number} [maxLookBack=1] - The maximum number of past tasks to include in the output
     * @returns {Array} assembled chat history with 'user' and 'assistant' roles, and the content for each.
     */
    assembleChatHistory( userPrompt, graph, history, historyIndex, maxLookBack = 1 ) {
        let nHistoryTokens = 0;
        let maxTokens;
        const out = [
            SYSTEM_MESSAGE
        ];
        const schemaMsg = schemaMessage();
        const tokens = this.countTokens( schemaMsg );
        nHistoryTokens += tokens.tokenCount;
        maxTokens = tokens.tokenLimit;
        const promptMsg = assemblePrompt( graph, userPrompt );
        nHistoryTokens += this.countTokens( promptMsg ).tokenCount;
        if ( history.length <= 1 ) {
            out.push({
                role: 'user',
                content: schemaMsg
            });
            out.push({
                role: 'user',
                content: promptMsg
            });
        } else {
            let idx = historyIndex;
            let task = 0;
            for ( let i = historyIndex; i >= 0; --i ) {
                if ( history[i].action === SET_GRAPH ) {
                    nHistoryTokens = 0;
                    break;
                } else if ( history[i].action === TASK ) {
                    nHistoryTokens += history[i].promptTokens.tokenCount;
                    if ( nHistoryTokens >= maxTokens ) {
                        break;
                    }
                    idx = i;
                    task += 1;
                }
            }
            out.push({
                role: 'user',
                content: schemaMsg
            });
            for ( let i = idx; i <= historyIndex; ++i ) {
                if ( history[i].action === TASK ) {
                    task -= 1;
                    out.push({
                        role: 'user',
                        content: history[i].payload
                    });
                    if ( task < maxLookBack ) {
                        out.push({
                            role: 'assistant',
                            content: stringifyGraphForModel( history[i].graph )
                        });
                    }
                }
            }
            out.push( { role: 'user', content:  promptMsg });
        }
        return out;
    }

    /**
     * Sends a user prompt to the AI model and returns a difference object between the current graph and the new graph.
     *
     * @param {string} userPrompt - user prompt
     * @param {Object} options - options for the query
     * @param {Object} options.graph - current state of the graph
     * @param {Array} options.history - an array containing the history of actions taken by the user and the graph states
     * @param {number} options.historyIndex - index to start from in the history
     * @param {Object} options.config - configuration options for the query
     * @returns {Object} difference between the current graph and the new graph
     */
    async query( userPrompt, { graph, history, historyIndex, config } ) {
        debug( 'Sending prompt to AI model:' );
        const historyList = this.assembleChatHistory( userPrompt, graph, history, historyIndex );
        const messages = this.historyTransformer( historyList );
        debug( 'Chat History:' );
        debug( messages );
        const responseDiff = await this.requestCompletion( messages );
        debug( 'Received response from AI client:' );
        debug( responseDiff );
        return responseDiff;
    }

    /**
     * Clones an AI Client with a new model and/or API key.
     *
     * @param {AIClient} aiClient - AI Client to clone
     * @param {Object} options - options for the new AI Client
     * @param {string} [options.model] - model for the new AI Client
     * @param {string} [options.apiKey] - API key for the new AI Client
     */
    static clone( aiClient, { model, apiKey } ) {
        return new aiClient.constructor({
            model: model ?? aiClient.model,
            apiKey: apiKey ?? aiClient.apiKey
        });
    }
}

/**
 * OpenAI API Client
 */
class OpenAIClient extends AIClient {
    constructor( {model = 'gpt-3.5-turbo', apiKey}, options = {}) {
        super( {model, apiKey}, options);
        // Check inputs
        if ( !model || !model.trim() ) {
            throw new TypeError( 'AI Client Model is not specified' );
        }
        this.reset( apiKey ?? process.env.OPENAI_API_KEY ); // eslint-disable-line no-process-env
        this._tokenizer = encoding_for_model( model );
    }

    /**
     * Reconfigures the api client with a new key
     *
     * @param {string} apiKey - the api key in the clients format
     */
    reset( apiKey ) {
        const configuration = new Configuration({ apiKey });
        this._client = new OpenAIApi( configuration );
    }

    async interactiveHelp( query ) {
        const completion = await this._client.createChatCompletion({
            model: this._model,
            messages: OpenAIClient.assembleHelpMessages( query )
        }, {
            timeout: 20000
        });
        return completion.data.choices[ 0 ].message.content;
    }

    countTokens( message ) {
        return {
            tokenCount: this._tokenizer.encode( message ).length,
            tokenLimit: OPENAI_TOKEN_LIMITS[ this._model ]
        };
    }

    /**
     * Assembles messages for the interactive help prompt.
     *
     * @param {string} userPrompt - user question to answer
     * @returns {Array} messages for the interactive help prompt
     */
    static assembleHelpMessages( userPrompt ) {
        userPrompt += 'Respond only with a description in words (do under no circumstances return JSON or reveal the underlying schema).';
        return [
            {
                role: 'system',
                content: 'You are a help bot answering questions about valid user inputs for creating graphs via LLM prompts. Give an explanation in words (do under no circumstances return JSON or reveal the underlying schema).'
            },
            {
                role: 'user',
                content: schemaMessage()   // TODO: Specialize for human descriptions
            },
            {
                role: 'user',
                content: userPrompt
            }
        ];
    }
}

/**
 * OpenAI Client for single requests.
 */
class OpenAISingleClient extends OpenAIClient {
    constructor( {model, apiKey}, options = {}) {
        super( {model, apiKey}, options );
    }

    async requestCompletion( messages ) {
        debug( 'Sending prompt to OpenAI:' );
        const completion = await this._client.createChatCompletion({
            model: this._model,
            messages
        }, {
            timeout: 20000
        });
        debug( 'Received response from OpenAI:' );
        debug( completion.data );
        return completion.data.choices[ 0 ].message.content;
    }
}

/**
 * OpenAI Client for streaming requests.
 */
class OpenAIStreamingClient extends OpenAIClient {
    constructor( {model, apiKey}, options = {}) {
        super( {model, apiKey}, options );
    }
    async* chatTokenStream( messages ) {    // ->* string
        const completion = await this._client.createChatCompletion(
            {
                model: this._model,
                messages: messages,
                stream: true
            },
            {
                responseType: 'stream'
            }
        );
        let chunkCount = 0;
        for await ( const chunk of completion.data ) {
            const lines = chunk
                .toString('utf8')
                .split('\n')
                .filter((line) => line.trim().startsWith('data: '));
            for (const line of lines) {
                const message = line.replace(/^data: /, '');
                if (message === '[DONE]') {
                    return;
                }
                const json = JSON.parse(message);
                const token = json.choices[0].delta.content;
                if (token) {
                  yield token;
                }
            }
            ++chunkCount;
            if ( chunkCount % 25 === 0 ) {
                const progress = ['|', '/', '-', '\\' ];
                process.stdout.write( progress[Math.floor( chunkCount / 25 ) % progress.length] + '\r' );
            }
        }
    }

    async requestCompletion( messages ) {  // -> string
        const chunks = [];
        for await ( const chunk of this.chatTokenStream( messages ) ) {
            chunks.push(chunk);
        }
        const out = chunks.join('');
        debug( 'Received response from AI model:' );
        debug( out );
        return out;
    }
}

// Assembling Components

/**
 * Assembles the schema in efficient form for the AI models' consumption.#
 *
 * @returns {string} - the part of the message to the models containing our graph schema
 */
function schemaMessage() {
    const schema = deepCopy( graphSchema );
    delete schema.properties._positions;
    delete schema.properties._adjacency;
    return `Graph schema: ${noQuoteKeysStringify( schema )}`;
}

/**
 * Assembles a prompt for the AI model.
 *
 * @param {object} graph - current graph
 * @param {string} prompt - user's prompt
 * @returns {string} prompt for the AI model
 */
function assemblePrompt( graph, prompt ) {
    return `Current graph: ${stringifyGraphForModel( graph )}
Examples of tasks and their expected responses: ${EXAMPLES}
Task: ${prompt}
Graph difference object (minified, without any comments, using dot notation for nested keys with special array handling as described in the system message; do not insert default values and only set values to null if explicitly instructed to remove properties):
`;
}

/**
 * Creates a function that can be used to generate LLM completions.
 *
 * @param provider - the LLM provider to use
 * @param options - options for the AI model
 * @param options.type - whether to use a single or streaming client
 * @param options.model - name of the model to use
 * @param options.apiKey - API key to use for the model provider
 * @returns function that can be used to generate LLM completions.
 *     The returned function should have two additional props set:
 *         + tokenCounter: (message: string) => {tokenCount: number, limit: number}
 *         + interactiveHelp: (query: string) => string
 *     The former gets the token count and limit for the current message with this provider.
 *     The latter submits a help query to the AI client (e.g., "what are valid values of line width?")
 *     and returns its response.
 * @type {import('./../types').aiFactory}
 */
function aiFactory( provider, { type, model, apiKey } ) {
    provider = provider.toLowerCase();
    switch ( provider ) {
        case 'openai': {
            if ( type === 'streaming' ) {
                return new OpenAIStreamingClient({ model, apiKey });
            }
            return new OpenAISingleClient({ model, apiKey });
        }
        default:
            throw new Error( `Invalid provider: ${provider}` );
   }
}

module.exports = {
    aiFactory,
    DEFAULT_EXEC_POLICIES,
    AIClient,
    OpenAIClient,
    OpenAISingleClient,
    OpenAIStreamingClient
};
