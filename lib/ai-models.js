
const { Configuration, OpenAIApi } = require( 'openai' );
const debug = require( 'debug' )( 'graphmaker' );
const deepCopy = require( '@stdlib/utils-copy' );
const papply = require( '@stdlib/utils-papply' );
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY // eslint-disable-line no-process-env
});
const openai = new OpenAIApi( configuration );
const { stringifyGraphForModel, noQuoteKeysStringify } = require( './graph-mutations.js' );
const graphSchema = require( './graph-schema.json' );
const { TASK, SET_GRAPH } = require( './actions.js' );

const DEFAULT_EXEC_POLICIES = {
    'gpt-3.5-turbo': 'incremental',
    'gpt-4': 'batch'
};

const SYSTEM_MESSAGE = {
    role: 'system',
    content: 'You are an AI bot for generating directed and undirected graphs that match a specified JSON schema. You will ensure that a) every node named in the `adjacency` object is present in the `nodes` property, b) every edge named in the `adjacency` object is present in the `edges` property, c) properties for nodes and edges are only set when required. For undirected graphs, each edge should be listed twice in the adjacency object with the same edge name. Positioning requests for the nodes should be treated as requests for corresponding constraints on the node positions.\n\nFor each user request, you will generate a JSON object that represents the difference between the current graph and the new graph.\n\nThe keys of the returned object are strings that are either keys from the graph or sequences of such keys separated by dots that represent a nested key path in the graph. The values are the new objects within the graph for those key paths, with `null` indicating that the key should be removed. For existing array elements, use the array index as the key part to update the element. To append a new element to an array, use `push` as the final key segment.'
};

function schemaMessage() {
    const schema = deepCopy( graphSchema );
    delete schema.properties._positions;
    return `Graph schema: ${noQuoteKeysStringify( schema )}`;
}

const EXAMPLES = `
add three nodes => { "nodes.A": {}, "nodes.B": {}, "nodes.C": {} }
add an edge from A to B => { "edges.AB": {}, "adjacency.A.push": { "sourceNode": "A", "targetNode": "B", "edge": "AB" }, adjacency.B.push": { "sourceNode": "A", "targetNode": "B", "edge": "AB" } }
make the graph directed => { "directed": true }
`;

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

function assembleChatHistory( userPrompt, graph, history, historyIndex, maxLookBack = 1 ) {
    const out = [
        SYSTEM_MESSAGE
    ];
    if ( history.length <= 1 ) {
        out.push({
            role: 'user',
            content: schemaMessage()
        });
        out.push({
            role: 'user',
            content: assemblePrompt( graph, userPrompt )
        });
    } else {
        let idx = historyIndex;
        let task = 0;
        for ( let i = historyIndex; i >= 0; --i ) {
            if ( history[i].action === SET_GRAPH ) {
                break;
            } else if ( history[i].action === TASK ) {
                idx = i;
                task += 1;
            }
        }
        out.push({
            role: 'user',
            content: schemaMessage()
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
        out.push( { role: 'user', content: assemblePrompt( graph, userPrompt, false ) });
    }
    return out;
}

async function* chatTokenStream( model, messages ) {
    const completion = await openai.createChatCompletion(
        {
            model: model,
            messages: messages,
            stream: true
        },
        {
            responseType: 'stream',
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
            process.stdout.write( '.' );
        }
    }
}

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

async function serialChatGPT( model, userPrompt, { graph, history, historyIndex, config }) {
    debug( 'Sending prompt to OpenAI:' );
    const messages = assembleChatHistory( userPrompt, graph, history, historyIndex );
    debug( 'Chat History:' );
    debug( messages );
    const responseDiff = await streamedChatCompletion( model, messages );
    debug( 'Received response from OpenAI:' );
    debug( responseDiff );
    return responseDiff;
}

function aiFactory( provider, { type, model } ) {
   switch ( provider.toLowerCase() ) {
        case 'openai':
            if ( !model ) {
                model = 'gpt-3.5-turbo';
            }
            if ( !type ) {
                type = 'serial';
            }
            if ( type === 'memoryless' ) {
                return papply( memorylessChatGPT, model );
            } else if ( type === 'serial' ) {
                return papply( serialChatGPT, model );
            }
            throw new Error( `Invalid type or model: ${type}, ${model}` );
        default:
            throw new Error( `Invalid provider: ${provider}` );
   }
}


module.exports = {
    aiFactory,
    DEFAULT_EXEC_POLICIES
};
