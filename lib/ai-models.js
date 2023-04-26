
const { Configuration, OpenAIApi } = require( 'openai' );
const debug = require( 'debug' )( 'graphmaker' );
const isObject = require( '@stdlib/assert-is-plain-object' );
const isArray = require( '@stdlib/assert-is-array' );
const deepCopy = require( '@stdlib/utils-copy' );
const graphSchema = require( './graph-schema.json' );
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY // eslint-disable-line no-process-env
});
const openai = new OpenAIApi( configuration );
const { TASK, SET_GRAPH } = require( './actions.js' );

const SYSTEM_MESSAGE = {
    role: 'system',
    content: 'You are an AI bot for generating directed and undirected graphs that match a specified JSON schema. You will ensure that a) every node named in the `adjacency` object is present in the `nodes` property, b) every edge named in the `adjacency` object is present in the `edges` property, c) properties for nodes and edges are only set when required. For undirected graphs, each edge should be listed twice in the adjacency object with the same edge name. Positioning requests for the nodes should be treated as requests for corresponding constraints on the node positions.'
};

/**
 * Drops all $ref properties from a JSON object when stringified.
 */
function jsonRefReplacer( key, value ) {
    if ( key === '$ref' ) {
        return void 0;
    }
    return value;
}

const UNIQUE = 'u00z23823724823723823y23823x';

function schemaMessage() {
    const protected = renameKeys( deepCopy( graphSchema ), key => UNIQUE + key );
    const out = `Graph schema: ${JSON.stringify( protected, jsonRefReplacer )
        .replace( new RegExp( '"' + UNIQUE + '(.*?)"', 'g' ), '$1' )}`;
    return out;
}

// ATTN:DOC this is mutating! need to pass a deep copy
function renameKeys( object, transformer ) {
    if ( isArray( object ) ) {
        return object.map( elt => renameKeys( elt, transformer ) );
    }
    if ( isObject( object ) ) {
        const myKeys = Object.keys( object );
        for ( const key of myKeys ) {
            const value = object[key];
            delete object[key];
            const newKey = key.startsWith('$') ? key : transformer( key );
            if ( isObject( value ) || isArray( value ) ) {
                object[newKey] = renameKeys( value, transformer );
            } else {
                object[newKey] = value;
            }
        }
    }
    return object;
}

function assemblePrompt( graph, prompt ) {
    const protected = renameKeys( deepCopy(graph), key => UNIQUE + key );
    let json = JSON.stringify( protected )
        .replace( new RegExp( '"' + UNIQUE + '(.*?)"', 'g' ), '$1' );
    return `Current graph: ${json}
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
    const completion = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: messages
    }, {
        timeout: 20000
    });
    const responseGraph = completion.data.choices[ 0 ].message.content;
    debug( 'Received response from OpenAI:' );
    debug( completion.data );
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
