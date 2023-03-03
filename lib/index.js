const { Configuration, OpenAIApi } = require( 'openai' );
const AJV = require( 'ajv' );
const { jsonrepair } = require( 'jsonrepair' );
const debug = require( 'debug' )( 'graphmaker' );
const graphSchema = require( './graph-schema.json' );
const toSVG = require( './render/to-svg.js' );

const configuration = new Configuration({
    apiKey: process.env.OPENAI_API_KEY // eslint-disable-line no-process-env
});
const openai = new OpenAIApi( configuration );
const ajv = new AJV();

// Helpers

function baseGraph() {
    return {
        directed: false,
        nodes: {},
        edges: {},
        adjacency: {}
    };
}

function assemblePrompt( graph, prompt ) {
    return `Graph schema: ${JSON.stringify( graphSchema )}
Current graph: ${JSON.stringify( graph )}
Task: ${prompt}
Updated graph (without any comments):
`;
}

function maybe( value ) {
    if ( value === void 0 ) {
        return null;
    }
    return value;
}

// Graph State Initialization

/**
 * Initializes a new graph state.
 *
 * @param config - configuration options
 * @returns the initial graph state
 */
function initializeGraph( config ) {
    const init_graph = baseGraph();
    return {
        graph: init_graph,
        history: [{graph: init_graph, prompt: '', exported: null }],
        historyIndex: 0,
        config: config
    };
}

// Graph State Updates

const updateDispatch = {
    'TASK': updateGraphTask,
    'REDO': updateGraphRedo,
    'UNDO': updateGraphUndo,
    'SAVE': updateGraphSave,
    'SET_GRAPH': updateGraphSet
};

/**
 * Updates the graph state based on the action and payload.
 *
 * @param state - the current state of the graph
 * @param options - the options for the update
 * @param options.action - the action to perform
 * @param options.payload - the payload of the action
 */
async function updateGraph( state, {action, payload} ) {
    return updateDispatch[action]( state, payload );
}

async function updateGraphSet( state, payload ) {
    const isValid = ajv.validate( graphSchema, payload );
    if ( !isValid ) {
        return [ state, {
            kind: 'ERRORS',
            data: maybe( ajv.errors ),
            context: payload
        }];
    }
    const newGraph = payload;
    const newHistory = state.history
        .slice( 0, state.historyIndex + 1 );
    newHistory.push( { graph: newGraph, prompt: '', exported: null } );

    const out = [{
        graph: newGraph,
        history: newHistory,
        historyIndex: state.historyIndex + 1,
        config: state.config
    }, maybe()];
    return out;
}

/**
 * Undos the last command on the graph by updating the graph to the previous graph state in the history.
 *
 * @param state - the current state of the graph
 * @param _ - the payload of the command (unused)
 * @returns promise resolving to the new state of the graph and the output of the command
 */
async function updateGraphUndo( state, _ ) {
    if ( state.historyIndex === 0 ) {
        return [ state, maybe() ];
    }
    const lastGraph = state.history[state.historyIndex - 1].graph;
    const out = [{
        graph: lastGraph,
        history: state.history,
        historyIndex: state.historyIndex - 1,
        config: state.config
    }, maybe()];
    return out;
}

/**
 * Redos the last undone command on the graph by updating the graph to the next graph state in the history.
 *
 * @param state - the current state of the graph
 * @param _ - the payload of the command (unused)
 * @returns  promise resolving to the new state of the graph and the output of the command
 */
async function updateGraphRedo( state, _ ) {
    if ( state.historyIndex === state.history.length - 1 ) {
        return [ state, maybe() ];
    }
    const nextGraph = state.history[state.historyIndex + 1].graph;
    const out = [{
        graph: nextGraph,
        history: state.history,
        historyIndex: state.historyIndex + 1,
        config: state.config
    }, maybe()];
    return out;
}

/**
 * Saves the graph in a given format.
 *
 * @param state - the current state of the graph
 * @param payload - format to save the graph in; one of 'png', 'svg', 'json' (default: 'svg')
 */
async function updateGraphSave( state, payload = 'json' ) {
    if ( payload === 'svg' ) {
        const svg = toSVG( state.graph );
        return [ state, { kind: 'SVG-OUTPUT', data: maybe( svg ) } ];
    } else if ( payload === 'json' ) {
        const output = JSON.stringify( state );  // ATTN: Simple, temporary version of JSON output
        const out = [ state, { kind: 'TEXT-OUTPUT', data: maybe( output ) } ];
        return out;
    }
    const out = [ state, {
        kind: 'ERRORS',
        data: maybe( [ { message: 'Invalid format for save command.' } ] ),
        context: payload
    }];
    return out;
}

/**
 * Updates the graph according to a user's prompt.
 *
 * @param state - the current state of the graph
 * @param payload - the prompt to update the graph with
 * @returns the new state of the graph
 */
async function updateGraphTask( state, payload ) {
    const prompt = assemblePrompt( state.graph, payload );
    try {
        debug( 'Sending prompt to OpenAI:' );
        const completion = await openai.createChatCompletion({
            model: 'gpt-3.5-turbo',
            messages: [
                { role: 'user', content: prompt }
            ],
            'max_tokens': 1500
        });
        const responseGraph = completion.data.choices[ 0 ].message.content;
        debug( 'Received response from OpenAI:' );
        debug( completion.data );
        let newGraph;
        try {
            newGraph = JSON.parse( responseGraph );
        } catch ( error ) {
            newGraph = JSON.parse( jsonrepair( responseGraph ));
        }
        const isValid = ajv.validate( graphSchema, newGraph );
        if ( !isValid ) {
            return [ state, {
                kind: 'ERRORS',
                data: ajv.errors,
                context: responseGraph
            }];
        }
        const newHistory = state.history
            .slice(0, state.historyIndex + 1);
        newHistory.push( { graph: newGraph, prompt: payload, exported: null });
        const newState = {
            graph: newGraph,
            history: newHistory,
            historyIndex:
            state.historyIndex + 1,
            config: state.config
        };
        return [ newState, maybe() ];
    } catch ( error ) {
        debug( 'Error from OpenAI:' );
        debug( error );
        return [ state, { kind: 'ERRORS', data: [ error ]}];
    }
}

// Command Factories
// A Command is a Discriminated Union type representing a
// an operation on the graph state: { type: string, payload: any }

/**
 * Returns a command to change a graph according to a user's prompt.
 */
function task( prompt ) {
    return {
        action: 'TASK',
        payload: prompt
    };
}

/**
 * Returns a command to set the graph to a given graph.
 */
function setGraph( graph ) {
    return {
        action: 'SET_GRAPH',
        payload: graph
    };
}

/**
 * Returns a command to reset the graph to its initial graph.
 */
function resetGraph() {
    return {
        action: 'SET_GRAPH',
        payload: baseGraph()
    };
}

/**
 * Returns a command to redo the last undone command on the graph.
 */
function redo() {
    return {
        action: 'REDO',
        payload: null
    };
}

/**
 * Returns a command to undo the last command on the graph.
 */
function undo() {
    return {
        action: 'UNDO',
        payload: null
    };
}

/**
 * Returns a command to save the graph in a given format.
 */
function save( format ) {
    return {
        action: 'SAVE',
        payload: format
    };
}

module.exports = {
    initializeGraph,
    updateGraph,
    task,
    setGraph,
    resetGraph,
    redo,
    undo,
    save
};
