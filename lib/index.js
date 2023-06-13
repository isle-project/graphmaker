const debug = require( 'debug' )( 'graphmaker' );
const objectKeys = require( '@stdlib/utils-keys' );
const hasOwnProp = require( '@stdlib/assert-has-own-property' );
const deepCopy = require( '@stdlib/utils-copy' );
const omitBy = require( '@stdlib/utils/omit-by' );
const isObject = require( '@stdlib/assert-is-plain-object' );
const graphSchema = require( './spec/graph-schema.json' );
const toSVG = require( './render/to-svg.js' );
const toTikZ = require( './render/to-tikz.js' );
const { nodePositions } = require( './node-positions.js' );
const { aiFactory } = require( './ai-models.js' );
const { baseGraph, deepSet } = require( './utils.js' );
const { fixGraph, populateGraph } = require( './graph-mutations.js' );
const { SAVE, SET_GRAPH, RESET_POSITIONS, TASK, UNDO, REDO } = require( './spec/actions.json' );

let ajvWithDefaults;
let jsonrepair;
let sharp;
let PDF;
let AJV;
let ajv;

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
        history: [{
            graph: init_graph,
            payload: '',
            action: SET_GRAPH,
            diff: init_graph
        }],
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
    'SET_GRAPH': updateGraphSet,
    'RESET_POSITIONS': updateGraphResetPositions,
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
        return [ state, {
            kind: 'ERRORS',
            data: maybe( ajv.errors ),
            context: payload
        }];
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
 * @param config - the graph config payload
 */
async function updateGraphSave( state, config ) {
    const { format = 'json', draft = false } = config;
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
        const output = JSON.stringify( state.graph, null, 2 );
        const out = [ state, { kind: 'TEXT-OUTPUT', data: maybe( output ) } ];
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
            return [ state, { kind: 'IMAGE-OUTPUT', data: maybe( buff ) } ];
        } catch ( error ) {
            return [ state, {
                kind: 'ERRORS',
                data: maybe( [ error ] ),
                context: format
            }];
        }
    }
    else if ( format === 'tex' ) {
        const tikz = toTikZ( populatedGraph, positions, config );
        const out = [ state, { kind: 'TEXT-OUTPUT', data: maybe( tikz ) } ];
        return out;
    }
    const out = [ state, {
        kind: 'ERRORS',
        data: maybe( [ { message: 'Invalid format for save command.' } ] ),
        context: format
    }];
    return out;
}

class ValidationError extends Error {
    constructor( message, data, context ) {
        super( message );
        this.data = data;
        this.context = context;
    }
}

/**
 * Corrects for AI models (mistaken) tendency to include extraneous null values in diffs.
 * This removes any keys from a diff value object whose associated value is null.
 *
 * @param {any} change - the value associated with a particular diff key
 * @returns {any} if `change` is an object, return the object with keys omitted that
 *     are associated with null values; otherwise, return `change` itself.
 */
function repairDiff( change ) {
    return isObject( change ) ? omitBy( change, (_, val ) => val === null ) : change;
}

/**
 * Assembles a graph object by applying the changes from a diff object to a graph.
 *
 * @param {Object} graph - the graph to be updated
 * @param {Object} changes - the changes to be applied
 * @returns {Object} the updated graph
 */
function assembleGraphFromDiff( graph, changes ) {
    const outGraph = deepCopy( graph );
    const base = baseGraph();
    for ( const key in changes ) {
        if ( hasOwnProp( changes, key ) ) {
            const props = key.split( '.' );
            if ( props.includes( '' ) ) {
                throw new ValidationError( 'Invalid property path.', changes, key );
            }
            deepSet(
                outGraph,
                props,
                true,
                true,
                (changes[ key ] === null) ? (base[key] !== void 0  ? base[key] : void 0) : repairDiff( changes[ key ] )
            );
        }
    }
    return outGraph;
}

/**
 * Sanitizes a graph by applying the changes from a diff string and validating the result.
 *
 * @param {string} diffStr - the diff string of changes to be applied
 * @param {Object} graph - the graph to be updated
 * @param {Object} validator - the AJV JSON schema validator to be used to validate the updated graph; assumed to have a `validate` method
 * @returns {Object} the updated graph
 */
function sanitizeGraph( diffStr, graph, validator ) {
    let changes;
    try {
        changes = JSON.parse( diffStr );
    } catch ( parseError ) {
        try {
            changes = JSON.parse( jsonrepair( diffStr ));
        } catch ( repairError ) {
            throw parseError;
        }
    }
    console.log( '\n------- In Sanitize Graph' );
    console.log( 'Changes:' );
    console.log( JSON.stringify( changes ) );
    const newGraph = fixGraph( assembleGraphFromDiff( graph, changes ) );
    console.log( 'newGraph:' );
    console.log( JSON.stringify( newGraph ) );
    console.log( '-------\n' );
    const isValid = validator.validate( graphSchema, newGraph );
    if ( !isValid ) {
        throw new ValidationError( 'Invalid graph', ajv.errors, newGraph );
    }
    return newGraph;
}

/**
 * Updates the graph according to a user's prompt.
 *
 * @param state - the current state of the graph
 * @param payload - the prompt to update the graph with
 * @returns the new state of the graph
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
            graphDiff = await payload.oracle( payload.prompt, state );
            newGraph = sanitizeGraph( graphDiff, state.graph, ajv );
            break;
        } catch ( error ) {
            if ( error instanceof ValidationError ) {
                debug( 'Validation error:' + error.message + '(' + JSON.stringify( error.data ) + ', ' + JSON.stringify( error.context ) + ')' );
            } else {
                debug( 'Error from model provider:' + error.message );
            }
            ++retries;
            savedError = error;
            console.log( 'Working...' );
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
        return [ state, { kind: 'ERRORS', data: [ savedError ]}];
    }
    const newHistory = state.history
        .slice(0, state.historyIndex + 1);
    newHistory.push({
        diff: graphDiff,
        graph: newGraph,
        payload: payload.prompt,
        action: TASK,
        promptTokens: payload.oracle.tokenCounter( payload.prompt ) // ATTN: guard against missing tokenCounter
    });
    const newState = {
        graph: newGraph,
        history: newHistory,
        historyIndex: state.historyIndex + 1,
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
 * Returns a command to clear the _positions information in the current graph.
 */
function resetPositions() {
    return {
        action: RESET_POSITIONS,
        payload: null
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
    resetPositions,
    redo,
    undo,
    save,
    aiFactory
};
