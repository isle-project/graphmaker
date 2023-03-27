const AJV = require( 'ajv' );
const { jsonrepair } = require( 'jsonrepair' );
const debug = require( 'debug' )( 'graphmaker' );
const sharp = require( 'sharp' );
const PDF = require( 'sharp-pdf' );
const deepCopy = require( '@stdlib/utils-copy' );
const graphSchema = require( './graph-schema.json' );
const toSVG = require( './render/to-svg.js' );
const toTikZ = require( './render/to-tikz.js' );
const modelRequest = require( './ai-models.js' );
const { baseGraph } = require( './utils.js' );
const { SAVE, SET_GRAPH, TASK, UNDO, REDO } = require( './actions.js' );
const ajv = new AJV({
    strict: false,
    coerceTypes: true,
    removeAdditional: true
});
const ajvWithDefaults = new AJV({
    strict: false,
    coerceTypes: true,
    useDefaults: true,
    removeAdditional: true
});

// Helpers

function maybe( value ) {
    if ( value === void 0 ) {
        return null;
    }
    return value;
}

function sleep( ms ) {
    return new Promise( resolve => setTimeout( resolve, ms ) );
}

const MAX_RETRIES = 3;

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
        history: [{graph: init_graph, payload: '', action: null }],
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
    newHistory.push( { graph: newGraph, payload: '', action: null } );

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

function populateGraph( inputGraph ) {
    const graph = deepCopy( inputGraph );
    const adjacency = graph.adjacency;
    const edges = graph.edges;

    // Ensure that all edges mentioned in adjacency are in the edges object
    Object.keys(adjacency).forEach((node) => {
        adjacency[node].forEach((item) => {
            const edgeName = item.edge;
            if ( !Object.prototype.hasOwnProperty.call( edges, edgeName) ) {
                edges[edgeName] = {}; // Add the missing edge with an empty object
            }
        });
    });
    return graph;
}

/**
 * Saves the graph in a given format.
 *
 * @param state - the current state of the graph
 * @param config - the graph config payload
 */
async function updateGraphSave( state, config ) {
    const { format = 'json', draft = false } = config;
    const populatedGraph = populateGraph( state.graph );
    ajvWithDefaults.validate( graphSchema, populatedGraph );
    if ( format === 'svg' ) {
        try {
            debug( 'Saving graph as SVG...' );
            const svg = toSVG( populatedGraph, config );
            return [ state, { kind: 'SVG-OUTPUT', data: maybe( svg ) } ];
        } catch ( error ) {
            return [ state, {
                kind: 'ERRORS',
                data: maybe( [ error ] ),
                context: format
            }];
        }
    }
    else if ( format === 'pdf' ) {
        try {
            const svg = toSVG( populatedGraph, {
                ...config,
                justSVG: true
            });
            const inst = await sharp( Buffer.from( svg ) );
            const arraybuffer = await PDF.sharpsToPdf( [ inst ],  {
                type: 'arraybuffer'
            });
            const out = Buffer.from( arraybuffer );
            return [ state, { kind: 'PDF-OUTPUT', data: maybe( out ) } ];
        }
        catch ( error ) {
            return [ state, {
                kind: 'ERRORS',
                data: maybe( [ error ] ),
                context: format
            }];
        }
    }
    else if (
        format === 'png' ||
        format === 'jpg' ||
        format === 'jpeg' ||
        format === 'gif' ||
        format === 'webp' ||
        format === 'tiff'
    ) {
        try {
            const svg = toSVG( populatedGraph, config );
            const inst = await sharp( Buffer.from( svg ) );
            let buff;
            switch ( format ) {
            case 'png':
                buff = await inst.png().toBuffer();
                break;
            case 'jpg':
            case 'jpeg':
                buff = await inst.jpeg().toBuffer();
                break;
            case 'gif':
                buff = await inst.gif().toBuffer();
                break;
            case 'webp':
                buff = await inst.webp().toBuffer();
                break;
            case 'tiff':
                buff = await inst.tiff().toBuffer();
                break;
            default:
                throw new Error( 'Invalid image format.' );
            }
            return [ state, { kind: 'IMAGE-OUTPUT', data: maybe( buff ) } ];
        } catch ( error ) {
            return [ state, {
                kind: 'ERRORS',
                data: maybe( [ error ] ),
                context: format
            }];
        }
    }
    else if ( format === 'tikz' ) {
        const tikz = toTikZ( populatedGraph, config );
        const out = [ state, { kind: 'TEXT-OUTPUT', data: maybe( tikz ) } ];
        return out;
    }
    else if ( format === 'json' ) {
        const output = JSON.stringify( state.graph, null, 2 );
        const out = [ state, { kind: 'TEXT-OUTPUT', data: maybe( output ) } ];
        return out;
    }
    const out = [ state, {
        kind: 'ERRORS',
        data: maybe( [ { message: 'Invalid format for save command.' } ] ),
        context: format
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
    let responseGraph;
    let newGraph;
    let retries = 0;
    let savedError;
    while ( retries < MAX_RETRIES ) {
        try {
            responseGraph = await modelRequest( payload, state );
            try {
                newGraph = JSON.parse( responseGraph );
                break;
            } catch ( error ) {
                savedError = error;
                try {
                    newGraph = JSON.parse( jsonrepair( responseGraph ));
                    break;
                } catch ( err ) {
                    ++retries;
                    await sleep( 2**retries * 100 );
                    continue;
                }
            }
        } catch ( error ) {
            ++retries;
            savedError = error;
            await sleep( 2**retries * 100 );
        }
    }
    if ( retries === MAX_RETRIES ) {
        debug( 'Error from model provider:' );
        debug( savedError );
        return [ state, { kind: 'ERRORS', data: [ savedError ]}];
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
    newHistory.push( { graph: newGraph, payload, action: 'TASK' });
    const newState = {
        graph: newGraph,
        history: newHistory,
        historyIndex:
        state.historyIndex + 1,
        config: state.config
    };
    return [ newState, maybe() ];
}

// Command Factories
// A Command is a Discriminated Union type representing a
// an operation on the graph state: { type: string, payload: any }

/**
 * Returns a command to change a graph according to a user's prompt.
 */
function task( prompt ) {
    return {
        action: TASK,
        payload: prompt
    };
}

/**
 * Returns a command to set the graph to a given graph.
 */
function setGraph( graph ) {
    return {
        action: SET_GRAPH,
        payload: graph
    };
}

/**
 * Returns a command to reset the graph to its initial graph.
 */
function resetGraph() {
    return {
        action: SET_GRAPH,
        payload: baseGraph()
    };
}

/**
 * Returns a command to redo the last undone command on the graph.
 */
function redo() {
    return {
        action: REDO,
        payload: null
    };
}

/**
 * Returns a command to undo the last command on the graph.
 */
function undo() {
    return {
        action: UNDO,
        payload: null
    };
}

/**
 * Returns a command to save the graph in a given format.
 */
function save( config ) {
    return {
        action: SAVE,
        payload: config
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
