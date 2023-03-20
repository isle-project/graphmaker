
const { Configuration, OpenAIApi } = require( 'openai' );
const debug = require( 'debug' )( 'graphmaker' );
const graphSchema = require( './graph-schema.json' );
const { baseGraph } = require( './utils.js' );
const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY // eslint-disable-line no-process-env
});
const openai = new OpenAIApi( configuration );
const { TASK, SET_GRAPH } = require( './actions.js' );

function assemblePrompt( graph, prompt, includeSchema = true ) {
    let out;
    if ( includeSchema ) {
        const schemaStr = `Graph schema: ${JSON.stringify( graphSchema )}`;
        out = schemaStr;
    } else {
        out = '';
    }
    return `${out}
Current graph: ${JSON.stringify( graph )}
Task: ${prompt}
Updated graph (without any comments):
`;
}

function assembleChatHistory( userPrompt, graph, history, maxLookBack = 3 ) {
    const out = [
        {
            role: 'system',
            content: 'You are an AI bot for generating directed and undirected graphs that match a specified JSON schema. You will ensure that a) every node named in the `adjacency` object is present in the `nodes` property, b) every edge named in the `adjacency` object is present in the `edges` property, c) properties for nodes and edges are only set when required. For undirected graphs, each edge should be listed twice in the adjacency object with the same edge name.'
        }
    ];
    if ( history.length <= 1 ) {
        out.push({
            role: 'user',
            content: assemblePrompt( graph, userPrompt )
        });
    } else {
        let idx = history.length - 1;
        for ( let i = history.length - 1, task = 0; i >= 1 && task < maxLookBack; --i ) {
            if ( history[i].action === SET_GRAPH ) {
                break;
            } else if ( history[i].action === TASK ) {
                idx = i;
                ++task;
            }
        }
        const base = (idx === 1) ? baseGraph() : history[idx - 1].graph;
        out.push({
            role: 'user',
            content: assemblePrompt( base, history[idx].payload )
        });
        out.push( { role: 'assistant', content: JSON.stringify( history[idx].graph ) } );
        for ( let i = idx+1; i < history.length; ++i ) {
            if ( history[i].action === TASK ) {
                out.push({
                    role: 'user',
                    content: history[i].payload
                });
                out.push({
                    role: 'assistant',
                    content: JSON.stringify( history[i].graph )
                });
            }
        }
        out.push( { role: 'user', content: assemblePrompt( graph, userPrompt, false ) });
    }
    return out;
}

async function memorylessChatGPT( userPrompt, { graph, history, config }) {
    debug( 'Sending prompt to OpenAI:' );
    const prompt = assemblePrompt( graph, userPrompt );

    const completion = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: [
            { role: 'user', content: prompt }
        ]
    });
    const responseGraph = completion.data.choices[ 0 ].message.content;
    debug( 'Received response from OpenAI:' );
    debug( completion.data );

    return responseGraph;
}

async function serialChatGPT( userPrompt, { graph, history, config }) {
    debug( 'Sending prompt to OpenAI:' );
    const messages = assembleChatHistory( userPrompt, graph, history );
    debug( messages );
    const completion = await openai.createChatCompletion({
        model: 'gpt-3.5-turbo',
        messages: messages
    });
    const responseGraph = completion.data.choices[ 0 ].message.content;
    debug( 'Received response from OpenAI:' );
    debug( completion.data );
    return responseGraph;
}

function aiFactory( { provider, type, model } ) {
   switch ( provider ) {
        case 'openai':
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


module.exports = aiFactory({ provider: 'openai', type: 'serial', model: 'gpt-3.5-turbo' });
