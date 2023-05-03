
const { Configuration, OpenAIApi } = require( 'openai' );
const debug = require( 'debug' )( 'graphmaker' );
const deepCopy = require( '@stdlib/utils-copy' );
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY // eslint-disable-line no-process-env
});
const openai = new OpenAIApi( configuration );
const { stringifyGraphForModel, noQuoteKeysStringify } = require( './graph-mutations.js' );
const graphSchema = require( './graph-schema.json' );
const { TASK, SET_GRAPH } = require( './actions.js' );

const SYSTEM_MESSAGE = {
    role: 'system',
    content: 'You are an AI bot for generating directed and undirected graphs that match a specified JSON schema. You will ensure that a) every node named in the `adjacency` object is present in the `nodes` property, b) every edge named in the `adjacency` object is present in the `edges` property, c) properties for nodes and edges are only set when required. For undirected graphs, each edge should be listed twice in the adjacency object with the same edge name. Positioning requests for the nodes should be treated as requests for corresponding constraints on the node positions.'
};

function schemaMessage() {
    const schema = deepCopy( graphSchema );
    delete schema._positions;
    return `Graph schema: ${noQuoteKeysStringify( schema )}`;
}

function assemblePrompt( graph, prompt ) {
    return `Current graph: ${stringifyGraphForModel( graph )}
Task: ${prompt}
Updated graph (minified, without any comments):
`;
}

function assembleChatHistory( userPrompt, graph, history, historyIndex, maxLookBack = 3 ) {
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
                ++task;
            }
        }
        out.push({
            role: 'user',
            content: schemaMessage()
        });
        for ( let i = idx; i <= historyIndex; ++i ) {
            if ( history[i].action === TASK ) {
                --task;
                out.push({
                    role: 'user',
                    content: history[i].payload
                });
                if ( task <= maxLookBack ) {
                    out.push({
                        role: 'assistant',
                        content: JSON.stringify( history[i].graph )
                    });
                }
            }
        }
        out.push( { role: 'user', content: assemblePrompt( graph, userPrompt, false ) });
    }
    return out;
}

async function* chatTokenStream( messages ) {
    const completion = await openai.createChatCompletion(
        {
            model: 'gpt-3.5-turbo',
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

async function streamedChatCompletion( messages ) {
    const chunks = [];
    for await (const chunk of chatTokenStream(messages)) {
        chunks.push(chunk);
    }
    const out = chunks.join('');
    console.log( 'OUT:' );
    console.log( out );
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

async function memorylessChatGPT( userPrompt, { graph, history, historyIndex, config }) {
    debug( 'Sending prompt to OpenAI:' );
    const prompt = assemblePrompt( graph, userPrompt );
    const completion = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
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
    const responseGraph = completion.data.choices[ 0 ].message.content;
    debug( 'Received response from OpenAI:' );
    debug( completion.data );

    return responseGraph;
}

async function serialChatGPT( userPrompt, { graph, history, historyIndex, config }) {
    debug( 'Sending prompt to OpenAI:' );
    const messages = assembleChatHistory( userPrompt, graph, history, historyIndex );
    debug( 'Chat History:' );
    debug( messages );
    const responseGraph = await streamedChatCompletion( messages );
    debug( 'Received response from OpenAI:' );
    debug( responseGraph );
    return responseGraph;
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
            if ( type === 'memoryless' && model === 'gpt-3.5-turbo' ) {
                return memorylessChatGPT;
            } else if ( type === 'serial' && model === 'gpt-3.5-turbo' ) {
                return serialChatGPT;
            }
            throw new Error( `Invalid type or model: ${type}, ${model}` );
        default:
            throw new Error( `Invalid provider: ${provider}` );
   }
}


module.exports = aiFactory;
