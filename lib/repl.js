/* eslint-disable no-console, no-process-exit */
/*
 * @template A
 * @typedef {{nothing: null} | { just: A; }} MaybeType<A>
 */

const align = require( 'align-text' );
const debug = require( 'debug' )( 'graphmaker:repl' );
const execSync = require( 'child_process' ).execSync;
const format = require( '@stdlib/string-format' );
const merge = require( '@stdlib/utils-merge' );
const fs = require( 'fs' );
const readline = require('readline/promises');
const repl = require( 'repl' );
const omit = require( '@stdlib/utils-omit' );
const os = require( 'os' );
const { parseArgs } = require( 'util' );
const path = require( 'path' );
const semverCompare = require( 'semver-compare' );
const { table, getBorderCharacters } = require( 'table' );

const { aiFactory
      , convert
      , initializeGraph
      , redo
      , resetGraph
      , resetPositions
      , setGraph
      , task
      , undo
      , updateGraph
      } = require( './index.js' );
const Maybe = require( './maybe.js' );
const { summarize
      , autoSummarizer
      } = require( './graph-summary.js' );


// Constants

const clOptions = require( './spec/cli-options.json' );
const COMMAND_DATA = require('./spec/repl-commands.json');
const COMMANDS = COMMAND_DATA.map(x => x.command);
const CONFIG_FILE = '.graphmaker.json';
const DEFAULT_CONFIG = require( './spec/default-config.json' );
const { DEFAULT_EXEC_POLICIES } = require( './ai-models.js' );
const FORMATS = require('./spec/output-formats.json'); //
const PROMPT = '> ';
const RESPONSES = [
    'As you wish.',
    'All set.',
    'Ready for more.',
    'I\'ve got this.',
    'Stick a fork in me, I\'m done.',
    'Task complete.',
    'I\'m sorry, Dave. I\'m afraid that I did that.'
];
const { version: VERSION } = require( './../package.json' );

let isReadingInSubShell = false;

// Helpers

/**
 * Selects an element from an array uniformatly at random.
 *
 * @param {Array<any>} items - an arbitrary array of positive length
 * @returns {any} a random element of the array; if the array has
 *     zero length returns undefined.
 */
function randomChoice( items ) {
    return items[ Math.floor(items.length * Math.random()) ];
}

/**
 * Prepend a file name with the user's home directory.
 *
 * @param {string} fname - file name
 * @returns {string} home directory file path
 */
function homeDirectoryFile( fname ) {
    return path.join( os.homedir(), fname );
}

/**
 * Provides unified error handling for the main REPL loop
 *
 * @template A
 * @param {MaybeType<A>} output - If present, has the form
 *    Just {kind: string, data: any, ...}. Here, we are concerned only
 *    with kind === 'ERRORS', in which case data is a list
 *    of error objects.
 * @param {Function} callback - a node-REPL compatible callback function,
 *    takes an output message as the second argument
 * @returns {boolean} true if an error was handled, otherwise false
 */
function handleErrors( maybeOutput, callback ) {
    if ( Maybe.isNothing(maybeOutput) ) {
        return false;
    }
    const output = maybeOutput.toValue();
    if ( output && output.kind === 'ERRORS' ) {
        // ATTN: Handle things more sensibly
        output.data.forEach( x => debug( x ) );
        if ( output.data.some( e => e.message === 'Request failed with status code 401' ) ) {
            callback( null, 'Authorization failure at AI client; check your API Key and set it using the :config command.' );
            return true;
        }
        let msg = output.data.map( x => JSON.stringify( x ) ).join( '\n' );
        msg += '\n';
        msg += 'Context:\n';
        msg += JSON.stringify( output.context, null, 2 );
        callback( null, `Graphmaker had difficulty fulfilling your request. Please try again, but if that fails, send the message below to support:\n\n${msg}` );
        return true;
    }
    return false;
}

/**
 * Checks for a newer version of graphmaker.
 *
 * If a newer version is available, a message is printed to the console.
 */
function checkAvailableVersion() {
    try {
        const newVersion = execSync( 'npm view graphmaker version', {
            stdio: [ 'pipe', 'pipe', 'ignore' ]
        })
            .toString()
            .trim();
        if ( semverCompare( newVersion, VERSION ) > 0 ) {
            const msg = `A newer version of GraphMaker (${newVersion} > ${VERSION}) is available. Type 'npm update -g graphmaker' at the terminal prompt to upgrade.`;
            console.log( msg );
        }
    } catch ( _ ) {
        debug( 'Unable to check for newer version of GraphMaker.' );
    }
}


// Input/Output and Argument Handling

/**
 * Prints a welcome message to the console and checks for a newer version of GraphMaker.
 */
function welcomeActions() {
    console.log( `This is GraphMaker version ${VERSION}.` );
    console.log( 'Start creating a graph or type \':help\' for a list of available commands.' );
    checkAvailableVersion();
}

/**
 * Collects repl configuration settings.
 *
 * In priority order, CONFIG_FILE < environment < command line.
 * The setting with the :config command in repl takes priority over all.
 *
 */
function readConfig( clKeys, configFile = homeDirectoryFile( CONFIG_FILE ) ) {
    let config = { ...DEFAULT_CONFIG };
    try {
        config = { ...config, ...JSON.parse( fs.readFileSync( configFile, 'utf8' ) ) };
    } catch ( _ ) {
        debug( `No config file present: ${configFile}` );
    }
    /* eslint-disable no-process-env */
    if ( process.env.OPENAI_API_KEY ) {
        config = {
            ...config,
            provider: 'OpenAI',
            OpenAI: {
                ...DEFAULT_CONFIG.OpenAI,
                apiKey: process.env.OPENAI_API_KEY
            }
        };
    }
    /* eslint-enable no-process-env */
    config = {
        ...config,
        ...omit( clKeys, [ 'apiKey', 'model' ] )
    };
    if ( clKeys.apiKey || clKeys.model ) {
        config[ config.provider ] = { apiKey: clKeys.apiKey || config.apiKey, model: clKeys.model || config.model, exec: config.exec };
    }
    if ( !config[ config.provider ]?.apiKey ) {
        console.log( 'An API key for model provider `'+config.provider+'` needs to be set with the :config command before building a graph.');
    }
    return config;
}

/**
 * Prints a usage message to the console showing all available commands.
 */
function printUsage() {
    const out = [];
    out.push( 'Usage: graphmaker [options]' );
    out.push( '' );
    out.push( 'Options:' );
    out.push( '' );
    const rows = Object.keys( clOptions ).map( key => {
        const row = [];
        const opt = clOptions[ key ];
        const arg = opt.type === 'string' ? (' ' + (opt.tag || 'ARG')) : '';
        if ( opt.short ) {
            row.push( '-'+opt.short+', --'+key+arg );
        } else {
            row.push( '--'+key+arg );
        }
        row.push( opt.description );
        return row;
    });
    out.push( table( rows, {
        border: getBorderCharacters('void'),
        columnDefault: {
          paddingLeft: 2,
          paddingRight: 2
        },
        columns: {
          0: {
            alignment: 'left',
            width: 30
          },
          1: {
            alignment: 'left',
            width: 50
          }
        }
    }) );
    out.push( '' );
    return out.join( '\n' );
}

/**
 * Processes command line arguments and returns them as a key-value pair object.
 * If `width` or `height` values are provided, they are parsed to integers.
 *
 * @param {Object} options - options object to be parsed by `parseArgs`
 * @returns {Object} values - processed values from the command line arguments
 */
function getArgs( options ) {
    const { values } = parseArgs({ options });

    // Process numeric arguments if present:
    if ( values.width !== void 0 ) {
        values.width = parseInt( values.width, 10 );
    }
    if ( values.height !== void 0 ) {
        values.height = parseInt( values.height, 10 );
    }
    return values;
}

async function saveFile( fileName, contents, yesSaveResponse = 'File saved: ', noSaveResponse = 'File not saved: ' ) {
    if ( fs.existsSync( fileName ) ) {
        isReadingInSubShell = true;
        process.stdout.write( `The file ${fileName} already exists.\nWould you like to overwrite it? (yes/no) ` );
        const readlineInterface = readline.createInterface({
            input: process.stdin,
            output: null,
            historySize: 0,
            prompt: '? ',
            terminal: false
        });
        const answer = await readlineInterface.question( '' );
        isReadingInSubShell = false;
        if ( answer.toLocaleLowerCase() !== 'yes' ) {
            return noSaveResponse + fileName;
        }
    }
    try {
        fs.writeFileSync( fileName, contents );
    } catch ( e ) {
        return `Could not save ${fileName} due to system error: ${e.message}.`;
    }
    return yesSaveResponse + fileName;
}

/** ATTN */
async function showTextOutput( format, replState, prefix='', suffix='' ) {
    format = format.toLowerCase();
    const [ _, output ] = await updateGraph( replState, convert( { ...replState.config, format: 'json', draft: true, _publicOnly: true } ) );
    switch ( format ) {
        case 'tex':
        case 'latex':
        case 'json':
            return output.get('data', '');

        default:
            throw new Error(`Format ${format} does not support text output` );
    }
}

/**
 * Constructs output string with configured autoshow text and optional prefix.
 *
 * @param {Object} replState -- current graph and history state
 * @param {String} [baseOutput=''] -- output text to use in the absence of autoshow
 * @param {String} [prefix=''] -- optional text to display before the autoshow text;
 *     a newline is automatically added to this text if the string is not empty.
 *     Note that prefix is *only included* with autoshow.
 *
 * @returns {String} output text to display including autoshow if appropriate;
 *     when autoshow is not displayed, this just returns baseOutput.
 *
 */
async function autoshowText( replState, baseOutput='', { prefix='', beginHistoryIndex, endHistoryIndex } = {} ) {
    const textFormats = [ 'tex', 'latex', 'json' ];
    const summaryFormats = [ 'auto', 'graph', 'nodes', 'edges', 'decorations', 'constraints', 'data' ];
    const init = prefix && (prefix + '\n');
    let autoshow = '';
    if ( replState.config.autoshow === 'auto' ) {
        const indices = (beginHistoryIndex !== void 0 || endHistoryIndex !== void 0)   // The endHistoryIndex is exclusive
            ? [beginHistoryIndex || 0, endHistoryIndex || replState.historyIndex + 1]
            : [replState.historyIndex, replState.historyIndex + 1];
        let aggregatedDiff = {};
        for ( let i = indices[0]; i < indices[1]; i++ ) {
            aggregatedDiff = merge( aggregatedDiff, JSON.parse( replState.history[i].diff ) );
        }
        const summarizer = autoSummarizer( aggregatedDiff );
        autoshow = init + summarizer(replState.graph) + '\n';
    } else if ( replState.config.autoshow && summaryFormats.includes(replState.config.autoshow) ) {
        autoshow = init + summarize( replState.config.autoshow, replState.graph) + '\n';
    } else if ( replState.config.autoshow && textFormats.includes(replState.config.autoshow) ) {
        autoshow = init + showTextOutput( replState.config.autoshow, replState ) + '\n';
    }
    return autoshow + baseOutput;
}


// Startup Processing

const args = getArgs( clOptions );
if ( args.version ) {
    console.log( `${VERSION}`);
    process.exit( 0 );
} else if ( args.help ) {
    console.log( printUsage() );
    process.exit( 0 );
}

let modelRequest, replState;  // eslint-disable-line one-var
{
    const graphConfig = readConfig( args, args.config );
    modelRequest = graphConfig.provider ? aiFactory( graphConfig.provider, graphConfig[graphConfig.provider] ) : null;
    replState = initializeGraph( graphConfig );
}

welcomeActions();


// Main Evaluator

async function replEval( cmd, callback, server, noCallback = false ) {
    server.setPrompt( PROMPT );
    if ( isReadingInSubShell ) {
        return void 0;
    }
    cmd = cmd.trim();
    if ( cmd === '' ) {
        return callback( null, '' );
    }

    const idx = cmd.indexOf( ' ' );
    let command;
    let arg;
    if ( idx !== -1 ) {
        command = cmd.substring( 0, idx );
        arg = cmd.substring( idx + 1 ).trimStart();
    } else {
        command = cmd;
    }
    let output;
    switch ( command ) {
        case ':show': {
            const summaryFormats = [ 'auto', 'graph', 'nodes', 'edges', 'decorations', 'constraints', 'data' ];
            if ( arg === void 0 ) {
                arg = replState.config.format;
            }
            if ( arg === 'json' ) {
                [ replState, output ] = await updateGraph( replState, convert( { ...replState.config, format: 'json', draft: true, _publicOnly: true } ) );
                return callback( null, output.get('data', '') );
            } else if ( arg === 'tex' || arg === 'latex' ) {
                [ replState, output ] = await updateGraph( replState, convert( { ...replState.config, format: 'tex', draft: true } ) );
                return callback( null, output.get('data', '') );
            } else if ( summaryFormats.includes(arg) ) {
                return callback( null, summarize( arg, replState.graph ) );
            } else if ( FORMATS.indexOf( arg ) !== -1 ) {
                [ replState, output ] = await updateGraph( replState, convert({
                    ...replState.config,
                    format: arg,
                    draft: true
                }) );
                if ( handleErrors( output, callback ) ) {
                    return;
                }
                // Write to a temporary file:
                const dir = fs.mkdtempSync( path.join( os.tmpdir(), 'graphmaker-' ) );
                const filename = path.join( dir, `graph.${arg}` );
                fs.writeFileSync( filename, output.get('data', '') );

                // Open the SVG in the default browser with Node.js child_process (cross-platform):
                const { exec } = require( 'child_process' );
                if ( process.platform === 'win32' ) {
                    exec( `start ${filename}` );
                }
                else if ( process.platform === 'darwin' ) {
                    exec( `open ${filename}` );
                }
                else {
                    // Case: Linux
                    exec( `xdg-open ${filename}` );
                }
                return callback( null, 'Graph rendered.' );
            }
            handleErrors( Maybe.just({
                kind: 'ERRORS',
                data: [ new Error( 'unknown output format') ]
            }), callback );
            break;
        }
        case ':exec-batch':
        case ':exec': {
            const configExec = replState.config[replState.config.provider]['exec'];
            const model = replState.config[replState.config.provider]['model'];
            const batch = command === ':exec-batch' || configExec === 'batch' || (configExec === 'auto' && DEFAULT_EXEC_POLICIES[model] === 'batch');
            const prefixMatch = arg.match( /prefix=(['"`])([\s\S]*?)\1/ );
            const suffixMatch = arg.match( /suffix=(['"`])([\s\S]*?)\1/ );
            const prefix = prefixMatch ? prefixMatch[ 2 ] : '';
            const suffix = suffixMatch ? suffixMatch[ 2 ] : '';
            let file = prefixMatch ? arg.replace( prefixMatch[ 0 ], '' ) : arg;
            file = suffixMatch ? file.replace( suffixMatch[ 0 ], '' ) : file;
            file = file.trim();
            const RE_LINE_COMMENT = /^\s*(?:#.*)?(?:\r?\n)+/mg;
            const beginHistoryIndex = replState.historyIndex;
            let execCmds = fs.readFileSync( file, 'utf8' )
                .replace( RE_LINE_COMMENT, '' )
                .trim();
            if ( batch ) {
                execCmds = execCmds.split( /^\s*(:.*\n)/m );
                execCmds[ 0 ] = prefix + '\n' + execCmds[ 0 ];
                execCmds[ execCmds.length - 1 ] = execCmds[ execCmds.length - 1 ] + '\n' + suffix;
            } else {
                execCmds = execCmds.split( /(?:\r?\n)(?!\s)/m );
                if ( prefix ) {
                    // To add prefix as separate command use instead: execCmds.unshift( prefix + '\n' );
                    execCmds[ 0 ] = prefix + '\n' + execCmds[ 0 ];
                }
                if ( suffix ) {
                    // To append suffix to last command use instead: execCmds[ execCmds.length - 1 ] = execCmds[ execCmds.length - 1 ] + '\n' + suffix;
                    execCmds.push( suffix + '\n' );
                }
            }
            const textOutput = [];  // We currently discard intermediate exec output
            for ( let i = 0; i < execCmds.length; i++ ) {
                await replEval( execCmds[ i ], ( _, out ) => textOutput.push( out ), server, true );
            }
            const response = await autoshowText( replState, `Executed commands in file ${file}.`, { beginHistoryIndex });
            callback( null, response );
            break;
        }
        case ':load': {
            const json = JSON.parse( fs.readFileSync( arg, 'utf8' ) );
            [ replState ] = await updateGraph( replState, setGraph( json ) );
            callback( null, `Using graph in file ${arg}.` );
            break;
        }
        case ':multiline':
            server.editorMode = true;
            callback( null, 'Now in multiline mode. Use Ctrl-D to finish and Ctrl-C to cancel.' );
            server.setPrompt( '' );
            server.prompt( );
            break;
        case ':transcript': {
            const transcript = server.lines.join( '\n' );
            callback( null, await saveFile( arg, transcript, 'Saved transcript to file: ' ) );
            break;
        }
        case ':undo':
            [ replState ] = await updateGraph( replState, undo() );
            callback( null, 'Moved back one step.' );
            break;
        case ':redo':
            [ replState, output ] = await updateGraph( replState, redo() );
            callback( null, 'Moved forward one step.' );
            break;
        case ':reset':
            [ replState ] = await updateGraph( replState, resetGraph() );
            callback( null, 'Reset graph to initial state.' );
            break;
        case ':reposition':
            [ replState ] = await updateGraph( replState, resetPositions() );
            callback( null, 'Graph positions will be recomputed as needed.' );
            break;
        case ':history': {
            const n = arg ? parseInt( arg, 10 ) : 10;
            const history = server.history.
                filter( ( x, idx ) => !x.startsWith( '.' ) && idx > 0 ).
                reduce( (hist, item) => {
                    if ( item !== hist[hist.length - 1] ) {
                        hist.push( item );
                    }
                    return hist;
                }, [] ).
                slice( 0, n );
            callback( null, history.join( '\n' ) );
            break;
        }
        case ':save': {
            const parts = arg.split( '.' );
            const fileExtension = parts.length > 1 ? parts.pop() : replState.config.format;
            [ replState, output ] = await updateGraph( replState, convert({
                ...replState.config,
                format: fileExtension,
                draft: false
            }) );
            if ( handleErrors( output, callback ) ) {
                return;
            }
            callback( null, await saveFile( arg, output.get('data', '') ) );
            break;
        }
        case ':config': {
            let match;
            if ( arg === void 0 ) {
                callback( null, Object.keys( replState.config )
                    .map( key => {
                        if ( typeof replState.config[ key ] === 'object' ) {
                            return `${key} = ${JSON.stringify( replState.config[ key ] )}`;
                        }
                        return `${key} = ${replState.config[ key ]}`;
                    })
                    .join( '\n' ) );
                break;
            }
            let [ option, value ] = arg.split( ' ' );
            let optionLabel = option;
            let optionRef = replState.config;
            let optionKey = option;
            const baseProviderConfig = { apiKey: '', model: '', type: 'streaming', exec: 'auto' };
            if ( option === 'apiKey' || option === 'model' || option === 'type' || option === 'exec' ) {
                optionLabel = `${replState.config.provider}.${option}`;
                if ( !replState.config[replState.config.provider] ) {
                    replState.config[replState.config.provider] = baseProviderConfig;
                }
                optionRef = replState.config[replState.config.provider];
            } else if ( (match = /^([^.]+)\.(apiKey|model|exec)$/.exec( option )) ) { // eslint-disable-line no-cond-assign
                if ( replState.config[ match[1] ] === void 0 ) {
                    replState.config[ match[1] ] = baseProviderConfig;
                }
                optionLabel = match[ 0 ];
                optionRef = replState.config[ match[1] ];
                optionKey = match[ 2 ];
            }
            if ( value === void 0 ) {
                callback( null, `${optionLabel} = ${optionRef[ optionKey ]}\n(${clOptions[ optionKey ].description})` );
            } else {
                const optType = clOptions[ optionKey ].trueType || clOptions[ optionKey ].type;
                const yes = [ 'true', 'yes', '1', 'y', 't'];
                const no = ['false', 'no', '0', 'n', 'f'];
                switch ( optType ) {
                    case 'number':
                        if ( !/^[1-9][0-9]*$/.test( value ) ) {
                            return callback( null, `Invalid value for option ${optionLabel}: ${value}. Must be a positive integer.` );
                        }
                        value = parseInt( value, 10 );
                        break;
                    case 'boolean': {
                        value = value.toLowerCase();
                        const truthy = yes.includes( value );
                        if ( !truthy && !no.includes( value ) ) {
                            return callback( null, `Invalid value for option ${optionLabel}: ${value}. Must be either 'true'/'yes'/'1' or 'false'/'no'/'0'.` );
                        }
                        value = truthy;
                        break;
                    }
                    case 'string':
                        if ( clOptions[ optionKey ].enum && !clOptions[ optionKey ].enum.includes( value ) ) {
                            return callback( null, `Invalid value for option ${optionLabel}: ${value}. Must be one of: ${clOptions[ optionKey ].enum.join( ', ' )}.` );
                        }
                        break;
                    case 'maybe-string':
                        value = value.toLowerCase();
                        if ( no.includes( value ) ) {
                            value = false;
                        } else if ( yes.includes( value ) ) {
                            value = DEFAULT_CONFIG.autoshow;
                        } else if ( clOptions[ optionKey ].enum && !clOptions[ optionKey ].enum.includes( value ) ) {
                            return callback( null, `Invalid value for option ${optionLabel}: ${value}. Must be one of: ${clOptions[ optionKey ].enum.join( ', ' )}.` );
                        }
                        break;
                    default:
                        break;
                }
                optionRef[ optionKey ] = value;
                if ( option === 'provider' && replState.config[value] === void 0 ) {
                    replState.config[ value ] = baseProviderConfig;
                    return callback(null, `'apiKey' and 'model' for provider ${value} need to be set before executing a task.` );
                } else if ( option === 'provider' || optionKey === 'apiKey' || optionKey === 'model' || optionKey === 'type' ) {
                    try {
                        modelRequest = aiFactory( replState.config.provider, replState.config[replState.config.provider] );
                    } catch ( err ) {
                        debug( 'Cannot reset modelRequest in :config command.');
                    }
                }
                if ( !noCallback ) {
                    callback( null, `Set option ${optionLabel} to ${value}.` );
                }
            }
            break;
        }
        case ':exit':
            return process.exit( 0 );
        case ':help': {
            if ( arg ) {
                modelRequest.interactiveHelp( arg )
                    .then( help => {
                        callback( null, help );
                    })
                    .catch( err => {
                        callback( null, err.message );
                    });
                return;
            }
            const rows = [
                [ '<task>', 'Execute a task' ],
                ...COMMAND_DATA.map( x => [ `${x.command} ${x.args}`, x.usage ])
            ];
            const help = table( rows, {
                border: getBorderCharacters('void'),
                columnDefault: {
                    paddingLeft: 2,
                    paddingRight: 2
                },
                columns: {
                    0: {
                        alignment: 'left',
                        width: 28
                    },
                    1: {
                        alignment: 'left',
                        width: 52
                    }
                }
            });
            callback( null, 'Commands:\n\n' + help );
            break;
        }
        case ':intro':
            callback( null, 'ATTN: Introductory explanation.');
            break;
        case ':examples': {
            const manifest = require( './../examples/manifest.json' );
            const readlineInterface = readline.createInterface( {
                input: process.stdin,
                output: null,
                historySize: 0,
                prompt: '? ',
                terminal: false
            } );
            isReadingInSubShell = true;
            while ( true ) {
                for ( let i = 1; i <= manifest.length; ++i ) {
                    process.stdout.write( `${format('%2d. ', i)}${manifest[i-1].name}\n` );
                }
                process.stdout.write( ' q. Exit examples\n');
                process.stdout.write( 'Which example would you like to see? ' );
                const answer = await readlineInterface.question( '' );
                if ( answer === 'q' ) {
                    break;
                }
                const choice = parseInt( answer, 10 );
                if ( choice > 0 && choice <= manifest.length ) {
                    const dir = path.join( __dirname, '..', 'examples', manifest[choice-1].path );
                    const fPath = path.join( dir, 'tasks.txt' );
                    const tasks = fs.readFileSync( fPath, 'utf8' );
                    process.stdout.write( align( tasks, 4 ) );
                    process.stdout.write( '\n' );
                    process.stdout.write( 'Do you want to run this example? (y/n) ' );
                    const run = await readlineInterface.question( '' );
                    if ( run.toLowerCase() === 'y' ) {
                        // Load the resulting graph from running the example's tasks:
                        const json = JSON.parse( fs.readFileSync( path.join( dir, 'graph.json' ), 'utf8' ) );
                        [ replState ] = await updateGraph( replState, setGraph( json ) );

                        // Show the graph (as in :show with the default format)
                        isReadingInSubShell = false;
                        await replEval( ':show', () => null, server );
                        isReadingInSubShell = true;
                    }
                } else {
                    process.stdout.write( 'Invalid example specified.\n' );
                }
            }
            isReadingInSubShell = false;
            callback( null, '' );
            break;
        }
        default:
            if ( cmd.startsWith( ':' ) ) {
                return callback( null, `Unknown command: '${cmd}'. Type ':help' to see the list of commands.` );
            }
            [ replState, output ] = await updateGraph( replState, task( cmd, modelRequest ) );
            if ( !handleErrors( output, callback ) && !noCallback ) {
                callback( null, await autoshowText( replState, randomChoice(RESPONSES) ) );
            }
            break;
    }
}


// Completion Handling

/**
 * Generates file path completions for the given argument.
 *
 * @param {string} arg - argument to complete
 * @param {string[]} fileExtensions - file extensions to filter by
 * @returns {Object} object with `hits` and `prefix` properties
 */
function filePathCompletion( arg, fileExtensions ) {
    const noArg = !arg;
    let sepIndex = noArg ? -1 : arg.lastIndexOf( '/' );
    let cwd;
    let prefix;
    if ( noArg || sepIndex === -1  ) {
        cwd = '.';
        prefix = arg || '';
    } else {
        cwd = arg.slice(0, sepIndex);
        prefix = arg.slice(sepIndex + 1);
    }
    const files = fs.readdirSync( cwd );
    const hits = files
        .filter( ( f ) => {
            if ( !f.startsWith( prefix ) ) {
                return false;
            }
            const stat = fs.statSync( path.posix.join( cwd, f ) );
            return !stat.isFile() || !fileExtensions || fileExtensions.some( ( ext ) => f.endsWith( '.' + ext ) );
        });
    return { hits, prefix };
}


// Main Event Loop

const replServer = repl.start({
    prompt: PROMPT,
    eval: async ( cmd, _context, _name, callback ) => {
        try {
            return await replEval( cmd, callback, replServer );
        } catch ( err ) {
            console.log( err );  // ATTN: Handle this better
            callback( null, 'Graphmaker had a problem completing your task, please try again.' );
        }
    },
    writer: ( output ) => {
        return output;
    },
    completer: ( line ) => {
        if ( !line.startsWith( ':' ) ) {
            return [ [], line ];
        }
        if ( line.startsWith( ':show' ) ) {
            const hits = FORMATS.map( ( f ) => `:show ${f}` ).filter( ( c ) => c.startsWith( line ) );
            return [ hits, line ];
        }
        if ( line.startsWith( ':config' ) ) {
            const hits = Object.keys( clOptions )
                .map( ( o ) => `:config ${o}` )
                .filter( ( c ) => c.startsWith( line ) );
            return [ hits, line ];
        }
        if ( line.startsWith( ':exec' ) ) {
            if ( line === ':exec' || !line.charAt(5).match(/\s/) ) {
                return [ [':exec '], line ];
            }
            const RE = /(pre|suf)fix=(['"`])([\s\S]*?)\2/g;
            RE.lastIndex = ':exec'.length + 1;
            let match;
            let gotPrefix = false;
            let gotSuffix = false;

            // Move past :exec initially
            let pos = RE.lastIndex;
            while ( ( match = RE.exec( line ) ) !== null ) { // eslint-disable-line no-cond-assign
                if ( match[1] === 'pre' ) {
                    gotPrefix = true;
                }
                else if ( match[1] === 'suf' ) {
                    gotSuffix = true;
                }
                pos = RE.lastIndex;
            }
            if ( line.length === pos ) {
                return [ [line + ' '], line ];
            }
            match = line.substring( pos ).match( /^\s*/ );
            pos += match ? match[ 0 ].length : 0;
            let arg = line.substring( pos );
            let initial = line.slice( 0, pos );

            if ( !gotPrefix && arg.match( /^p(?:r(?:e(?:f(?:i(?:x)?)?)?)?)/ ) ) {
                if ( arg.includes('=') ) {
                    return [ [], line ];
                }
                return [ [ initial + arg + 'prefix='.slice(arg.length) ], line ];
            }
            if ( !gotSuffix && arg.match( /^s(?:u(?:f(?:f(?:i(?:x)?)?)?)?)/ ) ) {
                if ( arg.includes( '=' ) ) {
                    return [ [], line ];
                }
                return [ [ initial + arg + 'suffix='.slice(arg.length) ], line ];
            }
            const { hits, prefix } = filePathCompletion( arg, ['txt'] );
            return [ hits.map( h => line + h.slice(prefix.length) ), line ];
        }
        if (
            line.startsWith( ':transcript' ) ||
            line.startsWith( ':load' ) ||
            line.startsWith( ':save' )
        ) {
            const match = /^\s*(:[a-z]+)\s+(.*)\s*$/.exec( line );
            if ( !match ) {
                return [ [line + ' '], line ];
            }
            const cmd = match[1];
            const arg = match[2];
            const extensions = {
                ':transcript': ['txt'],
                ':load': ['json'],
                ':save': FORMATS
             };
            const { hits, prefix } = filePathCompletion( arg, extensions[cmd] );
            return [ hits.map( h => line + h.slice(prefix.length) ), line ];
        }
        if ( /^:save\s*.*\.[a-z]*$/.test( line ) ) {
            const baseName = line.substring( 0, line.lastIndexOf( '.' )+1 );
            const hits = FORMATS.map( ( f ) => `${baseName}${f}` ).filter( ( c ) => c.startsWith( line ) );
            return [ hits, line ];
        }
        const hits = COMMANDS.filter((c) => c.startsWith(line));
        return [ hits, line ];
    },
    terminal: true
});

replServer.setupHistory( path.join( os.homedir(), '.graphmaker_history' ), ( err ) => {
    if ( err ) {
        debug( err );
    }
   debug('REPL history setup completed');
});

replServer.on( 'SIGINT', () => {
    replServer.setPrompt( PROMPT );
    replServer.prompt();
});
