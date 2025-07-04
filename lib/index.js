/**
 * @template A
 * @typedef {{nothing: null} | { just: A; }} MaybeType<A>
 *
 * @typedef {import('./../types').Action} Action
 * @typedef {import('./../types').Config} Config
 * @typedef {import('./../types').GraphState} GraphState
 * @typedef {import('./../types').UpdateError} UpdateError
 * @typedef {import('./../types').BinaryOutput} BinaryOutput
 * @typedef {import('./../types').TextOutput} TextOutput
 *
 *
 * @template A, T
 * @typedef {import('./../types').ActionPayload} ActionPayload<A,T>

 */

const debug = require( 'debug' )( 'graphmaker' );
const deepCopy = require( '@stdlib/utils-copy' );
const graphSchema = require( './spec/graph-schema.json' );
const hasOwnProp = require( '@stdlib/assert-has-own-property' );
const objectKeys = require( '@stdlib/utils-keys' );

const { aiFactory } = require( './ai-models.js' );
const { baseGraph, ValidationError } = require( './utils.js' );
const Maybe = require('./maybe.js');
const { nodePositions } = require( './node-positions.js' );
const { populateGraph, sanitizeGraph } = require( './graph-mutations.js' );
const toSVG = require( './render/to-svg.js' );
const toTikZ = require( './render/to-tikz.js' );


// Modules to be loaded on-demand

let ajvWithDefaults;
let jsonrepair;
let sharp;
let PDF;
let AJV;
let ajv;


// Constants

const { CONVERT
      , REDO
      , RESET_POSITIONS
      , SET_GRAPH
      , TASK
      , UNDO
      } = require( './spec/actions.json' );
const MAX_RETRIES = 3;


// Helpers

function sleep( ms ) {
    return new Promise( resolve => setTimeout( resolve, ms ) );
}


// Graph State Initialization

/**
 * Initializes a new graph state.
 *
 * @param config - configuration options
 * @returns the initial graph state
 *
 * @type {import('./../types').initializeGraph}
 */
function initializeGraph( config ) {
    const init_graph = baseGraph();
    return {
        graph: init_graph,
        history: [{
            graph: init_graph,
            payload: '',
            action: SET_GRAPH,
            diff: JSON.stringify(init_graph)
        }],
        historyIndex: 0,
        config: config
    };
}

// Graph State Updates

const updateDispatch = {
    [TASK]: updateGraphTask,
    [REDO]: updateGraphRedo,
    [UNDO]: updateGraphUndo,
    [CONVERT]: updateGraphConvert,
    [SET_GRAPH]: updateGraphSet,
    [RESET_POSITIONS]: updateGraphResetPositions,
};

/**
 * Updates the graph state based on the action and payload.
 *
 * @param state - the current state of the graph
 * @param options - the options for the update
 * @param options.action - the action to perform
 * @param options.payload - the payload of the action
 * @returns updated state and maybe output from the command
 * @type {import('./../types').updateGraph}
 */
async function updateGraph( state, {action, payload} ) {
    return updateDispatch[action]( state, payload );
}

/**
 * Updates the graph state based to a new graph.
 *
 * @param state - current state of the graph
 * @param payload - the new graph
 * @returns promise resolving to the new state of the graph and the output of the command
 */
async function updateGraphSet( state, payload ) {
    if ( !ajv ) {
        AJV = require( 'ajv' );
        ajv = new AJV({
            strict: false,
            coerceTypes: true,
            removeAdditional: true
        });
    }
    const isValid = ajv.validate( graphSchema, payload );
    if ( !isValid ) {
        return [ state, Maybe.just({
            kind: 'ERRORS',
            data: ajv.errors,
            context: payload
        }) ];
    }
    const newGraph = payload;
    let diff = deepCopy(newGraph);

    // For all top level keys in state.graph that are not in newGraph, add a value null to diff for that key:
    const keys = objectKeys( state.graph );
    for ( let i = 0; i < keys.length; i++ ) {
        const key = keys[i];
        if ( !hasOwnProp( newGraph, key ) ) {
            diff[key] = null;
        }
    }
    const newHistory = state.history
        .slice( 0, state.historyIndex + 1 );
    newHistory.push( { diff, graph: newGraph, payload: '', action: SET_GRAPH } );

    const out = [{
        graph: newGraph,
        history: newHistory,
        historyIndex: state.historyIndex + 1,
        config: state.config
    }, Maybe.nothing];
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
        return [ state, Maybe.nothing ];
    }
    const lastGraph = state.history[state.historyIndex - 1].graph;
    const out = [{
        graph: lastGraph,
        history: state.history,
        historyIndex: state.historyIndex - 1,
        config: state.config
    }, Maybe.nothing];
    return out;
}

/**
 * Resets the positions of the nodes in the graph.
 *
 * @param state - the current state of the graph
 * @param _ - the payload of the command (unused)
 * @returns promise resolving to the new state of the graph and the output of the command
 */
async function updateGraphResetPositions( state, _ ) {
    const newGraph = deepCopy( state.graph );
    delete newGraph._positions;
    const newHistory = state.history
        .slice( 0, state.historyIndex + 1 );
    newHistory.push({
        diff: { _positions: null },
        graph: newGraph,
        payload: '',
        action: RESET_POSITIONS
    });
    const out = [{
        graph: newGraph,
        history: newHistory,
        historyIndex: state.historyIndex + 1,
        config: state.config
    }, Maybe.nothing];
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
        return [ state, Maybe.nothing ];
    }
    const nextGraph = state.history[state.historyIndex + 1].graph;
    const out = [{
        graph: nextGraph,
        history: state.history,
        historyIndex: state.historyIndex + 1,
        config: state.config
    }, Maybe.nothing];
    return out;
}

/**
 * Expresses the graph in a specified format.
 * The updated graph state is changed to include updates node positions, and
 * the output is the converted graph in the specified format (unless an error occurs).
 *
 * @param state - the current state of the graph
 * @param config - the graph config payload
 * @returns {Promise<[GraphState, Output]>} a pair consisting of an updated graph state with
 *     positions possibly (re)computed and an output object giving a converted graph or
 *     an error.
 */
async function updateGraphConvert( state, config ) {
    const { format = 'json', draft = false, _publicOnly = false } = config; // eslint-disable-line no-unused-vars
    const removePrivate = ( key, value ) => key.startsWith( '_' ) ? void 0 : value;
    const populatedGraph = populateGraph( state.graph ); // TODO: handle position reset handling
    if ( !ajvWithDefaults ) {
        AJV = require( 'ajv' );
        ajvWithDefaults = new AJV({
            strict: false,
            coerceTypes: true,
            useDefaults: true,
            removeAdditional: true
        });
    }
    ajvWithDefaults.validate( graphSchema, populatedGraph );

    if ( format === 'json' ) {
        const output = JSON.stringify( state.graph, _publicOnly ? removePrivate : null, 2 );
        const out = [ state, Maybe.just({ kind: 'TEXT-OUTPUT', data: output }) ];
        return out;
    }
    // Case: Rendering to a graphical format
    const { positions, converged, maxForce } = nodePositions( populatedGraph, { ambient: 0.1, orientation: config.orientation } );
    debug( 'nodePositions:', positions );
    debug( 'converged:', converged );
    debug( 'maxForce:', maxForce );
    populatedGraph._positions = objectKeys( populatedGraph.nodes ).reduce( (obj, node, index) => {
        obj[node] = [ ...positions[index] ];
        return obj;
    }, {} );
    state.graph._positions = populatedGraph._positions; // Note: shared data
    if ( format === 'svg' ) {
        try {
            debug( 'Saving graph as SVG...' );
            const svg = await toSVG( populatedGraph, positions, config );
            return [ state, Maybe.just({ kind: 'SVG-OUTPUT', data: svg }) ];
        } catch ( error ) {
            return [ state, Maybe.just({
                kind: 'ERRORS',
                data: [ error ],
                context: format
            }) ];
        }
    }
    else if ( format === 'pdf' ) {
        if ( !sharp ) {
            sharp = require( 'sharp' );
        }
        if ( !PDF ) {
            PDF = require( 'sharp-pdf' );
        }
        try {
            const svg = await toSVG( populatedGraph, positions, {
                ...config,
                justSVG: true
            });
            const inst = await sharp( Buffer.from( svg ) );
            const arraybuffer = await PDF.sharpsToPdf( [ inst ], {
                type: 'arraybuffer'
            }, {
                imageOptions: {
                    format: 'JPEG',
                    width: config.width,
                    height: config.height,
                    compression: 'FAST',
                    fit: false
                },
                pdfOptions: {
                    compress: true,
                    putOnlyUsedFonts: true,
                    format: [ config.width, config.height ],
                }
            });
            const out = Buffer.from( arraybuffer );
            return [ state, Maybe.just({ kind: 'PDF-OUTPUT', data: out }) ];
        }
        catch ( error ) {
            return [ state, Maybe.just({
                kind: 'ERRORS',
                data: [ error ],
                context: format
            }) ];
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
        if ( !sharp ) {
            sharp = require( 'sharp' );
        }
        try {
            const svg = await toSVG( populatedGraph, positions, config );
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
            return [ state, Maybe.just({ kind: 'IMAGE-OUTPUT', data: buff }) ];
        } catch ( error ) {
            return [ state, Maybe.just({
                kind: 'ERRORS',
                data: [ error ],
                context: format
            }) ];
        }
    }
    else if ( format === 'tex' ) {
        const tikz = toTikZ( populatedGraph, positions, config );
        const out = [ state, Maybe.just({ kind: 'TEXT-OUTPUT', data: tikz }) ];
        return out;
    }
    const out = [ state, Maybe.just({
        kind: 'ERRORS',
        data: [ { message: 'Invalid format for save command.' } ],
        context: format
    }) ];
    return out;
}

/**
 * Updates the graph according to a user's prompt.
 *
 * @param state - the current state of the graph
 * @param payload - the prompt to update the graph with
 * @returns {[GraphState, MaybeType<{kind: string, data: any}>]} the new state of the graph
 */
async function updateGraphTask( state, payload ) {
    let graphDiff;
    let newGraph;
    let retries = 0;
    let savedError;
    if ( !jsonrepair ) {
        jsonrepair = require( 'jsonrepair' ).jsonrepair;
    }
    if ( !ajv ) {
        AJV = require( 'ajv' );
        ajv = new AJV({
            strict: false,
            coerceTypes: true,
            removeAdditional: true
        });
    }
    while ( retries < MAX_RETRIES ) {
        try {
            graphDiff = await payload.oracle.query( payload.prompt, state );
            newGraph = sanitizeGraph( graphDiff, state.graph, ajv, jsonrepair );
            break;
        } catch ( error ) {
            if ( error instanceof ValidationError ) {
                debug( 'Validation error:' + error.message + '(' + JSON.stringify( error.data ) + ', ' + JSON.stringify( error.context ) + ')' );
            } else {
                debug( 'Error from model provider:' + error.message );
            }
            ++retries;
            savedError = error;
            debug( 'Retrying...' );
            await sleep( 2**retries * 100 );
        }
    }
    if ( retries === MAX_RETRIES ) {
        debug( 'Error from model provider:' );
        debug( savedError );
        debug( 'Graph diff:' );
        debug( graphDiff );
        debug( 'New graph:' );
        debug( newGraph );
        return [ state, Maybe.just({ kind: 'ERRORS', data: [ savedError ] }) ];
    }
    const newHistory = state.history
        .slice(0, state.historyIndex + 1);
    newHistory.push({
        diff: graphDiff,
        graph: newGraph,
        payload: payload.prompt,
        action: TASK,
        promptTokens: payload.oracle.countTokens( payload.prompt ) // ATTN: guard against missing `countTokens` method
    });
    const newState = {
        graph: newGraph,
        history: newHistory,
        historyIndex: state.historyIndex + 1,
        config: state.config
    };
    return [ newState, Maybe.nothing ];
}


// Command Factories
// A Command is a Discriminated Union type representing a
// an operation on the graph state: { type: string, payload: any }

/**
 * Returns a command to change a graph according to a user's prompt.
 *
 *  @type {import('./../types').task}
 */
function task( prompt, oracle ) {
    return {
        action: TASK,
        payload: {
            prompt,
            oracle
        }
    };
}

/**
 * Returns a command to set the graph to a given graph.
 *
 * @type {import('./../types').setGraph}
 */
function setGraph( graph ) {
    return {
        action: SET_GRAPH,
        payload: graph
    };
}

/**
 * Returns a command to reset the graph to its initial graph.
 *
 * @type {import('./../types').resetGraph}
 */
function resetGraph() {
    return {
        action: SET_GRAPH,
        payload: baseGraph()
    };
}

/**
 * Returns a command to clear the _positions information in the current graph.
 *
 * @type {import('./../types').resetPositions}
 */
function resetPositions() {
    return {
        action: RESET_POSITIONS,
        payload: null
    };
}

/**
 * Returns a command to redo the last undone command on the graph.
 *
 * @type {import('./../types').redo}
 */
function redo() {
    return {
        action: REDO,
        payload: null
    };
}

/**
 * Returns a command to undo the last command on the graph.
 *
 * @type {import('./../types').undo}
 */
function undo() {
    return {
        action: UNDO,
        payload: null
    };
}

/**
 * Returns a command to convert the graph to a given format.
 * @param config - configuration options for formatting
 * @type {import('./../types').convert}
 */
function convert( config ) {
    return {
        action: CONVERT,
        payload: config
    };
}

module.exports = {
    initializeGraph,
    updateGraph,
    task,
    setGraph,
    resetGraph,
    resetPositions,
    redo,
    undo,
    convert,
    aiFactory
};
