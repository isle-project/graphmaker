
const { Configuration, OpenAIApi } = require( 'openai' );
const { encoding_for_model } = require( '@dqbd/tiktoken' );
const debug = require( 'debug' )( 'graphmaker' );
const deepCopy = require( '@stdlib/utils-copy' );
const papply = require( '@stdlib/utils-papply' );
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY // eslint-disable-line no-process-env
});
const openai = new OpenAIApi( configuration );
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
 * Assembles the chat history based on user inputs, graph changes, and actions taken.
 *
 * @param {string} userPrompt - user prompt
 * @param {Function} tokenCounter - function to count the number of tokens in a string
 * @param {Object} graph - current state of the graph
 * @param {Array} history - an array containing the history of actions taken by the user and the graph states
 * @param {number} historyIndex - index to start from in the history
 * @param {number} [maxLookBack=1] - The maximum number of past tasks to include in the output
 * @returns {Array} assembled chat history with 'user' and 'assistant' roles, and the content for each.
 */
function assembleChatHistory( userPrompt, tokenCounter, graph, history, historyIndex, maxLookBack = 1 ) {
    let nHistoryTokens = 0;
    let maxTokens;
    const out = [
        SYSTEM_MESSAGE
    ];
    const schemaMsg = schemaMessage();
    const tokens = tokenCounter( schemaMsg );
    nHistoryTokens += tokens.tokenCount;
    maxTokens = tokens.limit;
    const promptMsg = assemblePrompt( graph, userPrompt );
    nHistoryTokens += tokenCounter( promptMsg ).tokenCount;
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
 * An asynchronous generator function that streams chat tokens from the OpenAI API.
 *
 * @async
 * @generator
 * @param {string} model - name of the AI model used in the chat
 * @param {Array<Object>} messages - array of message objects to be processed by the chat model
 * @yields {string} token of the response from the AI model.
 * @throws throws an error if there is a problem with the JSON parsing or the OpenAI API.
 */
async function* chatTokenStream( model, messages ) {
    const completion = await openai.createChatCompletion(
        {
            model: model,
            messages: messages,
            stream: true
        },
        {
            responseType: 'stream'
        }
    );
    let chunkCount = 0;
    for await (const chunk of completion.data) {
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

/**
 * Factory function for creating token counters for different provider models.
 *
 * @param {string} provider - name of the AI model provider
 * @param {string} model - specific AI model to use from the provider
 * @returns {Function} function that takes a message and returns an object with the number of tokens  in the message and the token limit for the model
 */
function tokenCounterFactory( provider, model ) {
    switch ( provider.toLowerCase() ) {
        case 'openai': {
            const tokenizer = encoding_for_model( model );
            return (message) => ({
                tokenCount: tokenizer.encode( message ).length,
                limit: OPENAI_TOKEN_LIMITS[ model ]
            });
        }
        default:
            return _ => ({ tokenCount: 0, limit: 1000000 });
    }
}

function assembleHelpMessages( userPrompt ) {
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

function helpFactory( provider, model, type ) {
    switch ( provider.toLowerCase() ) {
        case 'openai': {
            return async (query) => {
                const completion = await openai.createChatCompletion({
                    model,
                    messages: assembleHelpMessages( query )
                }, {
                    timeout: 20000
                });
               return completion.data.choices[ 0 ].message.content;
            };
        }
    }
}

/**
 *
 */
async function streamedChatCompletion( model, messages ) {
    const chunks = [];
    for await (const chunk of chatTokenStream(model, messages)) {
        chunks.push(chunk);
    }
    const out = chunks.join('');
    debug( 'Received response from AI model:' );
    debug( out );
    return out;
}

/**
 * Sends a prompt to a OpenAI chat completion model and returns the response content.
 *
 * @param {Array<object>} messages - messages to send to the model
 * @returns {string} - the response content
 */
async function singleChatCompletion( messages ) {
    const completion = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: messages
    }, {
        timeout: 20000
    });
    return completion.data.choices[ 0 ].message.content;
}

async function memorylessChatGPT( model, userPrompt, { graph, history, historyIndex, config }) {
    debug( 'Sending prompt to OpenAI:' );
    const prompt = assemblePrompt( graph, userPrompt );
    const completion = await openai.createChatCompletion({
        model,
        messages: [
            SYSTEM_MESSAGE,
            {
                role: 'user',
                content: schemaMessage()
            },
            {
                role: 'user',
                content: prompt
            }
        ]
    }, {
        timeout: 20000
    });
    const responseDiff = completion.data.choices[ 0 ].message.content;
    debug( 'Received response from OpenAI:' );
    debug( completion.data );

    return responseDiff;
}

async function serialChatGPT( model, tokenCounter, userPrompt, { graph, history, historyIndex, config }) {
    debug( 'Sending prompt to OpenAI:' );
    const messages = assembleChatHistory( userPrompt, tokenCounter, graph, history, historyIndex );
    debug( 'Chat History:' );
    debug( messages );
    const responseDiff = await streamedChatCompletion( model, messages );
    debug( 'Received response from OpenAI:' );
    debug( responseDiff );
    return responseDiff;
}

/**
 * Creates a function that can be used to generate LLM completions.
 *
 * @param provider - the LLM provider to use
 * @param options - options for the AI model
 * @param options.type - whether to use a memoryless or serial chat
 * @param options.model - the name of the model to use
 * @returns function that can be used to generate LLM completions
 * @type {import('./../types').aiFactory}
 */
function aiFactory( provider, { type, model } ) {
    const tokenCounter = tokenCounterFactory( provider, model );
    const interactiveHelp = helpFactory( provider, model, type );
    provider = provider.toLowerCase();
    switch ( provider ) {
        case 'openai':
            if ( !model ) {
                model = 'gpt-3.5-turbo';
            }
            if ( !type ) {
                type = 'serial';
            }
            if ( type === 'memoryless' ) {
                const fun = papply( memorylessChatGPT, model );
                fun.tokenCounter = tokenCounter;
                fun.interactiveHelp = interactiveHelp;
                return fun;
            } else if ( type === 'serial' ) {
                const fun = papply( serialChatGPT, model, tokenCounter );
                fun.tokenCounter = tokenCounter;
                fun.interactiveHelp = interactiveHelp;
                return fun;
            }
            throw new Error( `Invalid type or model: ${type}, ${model}` );
        default:
            throw new Error( `Invalid provider: ${provider}` );
   }
}

module.exports = {
    aiFactory,
    DEFAULT_EXEC_POLICIES,
    singleChatCompletion,
    streamedChatCompletion
};
