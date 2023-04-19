const repl = require( 'repl' );
const debug = require( 'debug' )( 'graphmaker:repl' );
const fs = require( 'fs' );
const path = require( 'path' );
const os = require( 'os' );
const { parseArgs } = require( 'util' );
const omit = require( '@stdlib/utils-omit' );
const { version: VERSION } = require( './../package.json' );
const { initializeGraph, updateGraph, redo, resetGraph, undo, save, task, setGraph } = require( './index.js' );
const USAGE_TXT = fs.readFileSync( path.resolve( __dirname, '..', 'docs', 'usage.txt' ), 'utf8' );

const CONFIG_FILE = '.graphmaker.json';
const DEFAULT_CONFIG = {
    draft: false,
    width: 500,
    height: 500,
    provider: 'OpenAI',
    OpenAI: {
        apiKey: null,
        model: 'gpt-3.5-turbo'
    }
};

function homeDirectoryFile( fname ) {
    return path.join( os.homedir(), fname );
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
            OpenAI: { apiKey: process.env.OPENAI_API_KEY, model: 'gpt-3.5-turbo' }
        };
    }
    /* eslint-enable no-process-env */
    config = {
        ...config,
        ...omit( clKeys, [ 'apiKey', 'model' ] )
    };
    if ( clKeys.apiKey || clKeys.model ) {
        config[ config.provider ] = { apiKey: clKeys.apiKey || config.apiKey, model: clKeys.model || config.model };
    }
    if ( !config[ config.provider ]?.apiKey ) {
        console.log( 'An API key for model provider `'+config.provider+'` needs to be set with the :config command before building a graph.');
    }
    return config;
}

const clOptions = {
    provider: {
        type: 'string',
        short: 'p'
    },
    model: {
        type: 'string',
        short: 'm',
    },
    apiKey: {
        type: 'string',
        short: 'a'
    },
    width: {
        type: 'string',
        short: 'w'
    },
    height: {
        type: 'string',
        short: 'h'
    },
    draft: {
        type: 'boolean',
        short: 'd'
    },
    config: {
        type: 'string',
        short: 'c'
    },
    version: {
        type: 'boolean',
        short: 'v'
    },
    help: {
        type: 'boolean',
        short: 'h'
    }
};

function getArgs( options ) {
    const { values } = parseArgs({ options });
    // Process numeric args if present
    if ( values.width !== void 0 ) {
        values.width = parseInt( values.width, 10 );
    }
    if ( values.height !== void 0 ) {
        values.height = parseInt( values.height, 10 );
    }
    return values;
}

function handleErrors( output, callback ) {
    if ( output && output.kind === 'ERRORS' ) {
        output.data.forEach( x => debug( x ) );
        let msg = output.data.map( x => x.message ).join( '\n' );
        msg += '\n';
        msg += 'Context:\n';
        msg += JSON.stringify( output.context, null, 2 );
        callback( null, msg );
        return true;
    }
    return false;
}

const FORMATS = [ 'svg', 'png', 'jpg', 'jpeg', 'pdf', 'json', 'gif', 'webp', 'tiff', 'tikz' ];

let replState = initializeGraph( { apiKey: 'ATTN' } );

const args = getArgs( clOptions );

if ( args.version ) {
    console.log( `${VERSION}`);
    process.exit( 0 );
} else if ( args.help ) {
    console.log( USAGE_TXT );  // ATTN: ADD HELP TEXT
    process.exit( 0 );
}

const graphConfig = readConfig( args, args.config );

const replServer = repl.start({
    prompt: '> ',
    eval: async ( cmd, _context, _name, callback ) => {
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
                if ( arg === void 0 ) {
                    [ replState, output ] = await updateGraph( replState, save( { ...graphConfig, format: 'json', draft: true } ) );
                    return callback( null, JSON.stringify( replState.graph, null, 2 ) );
                } else if ( arg === 'tikz' ) {
                    [ replState, output ] = await updateGraph( replState, save( { ...graphConfig, format: 'tikz', draft: true } ) );
                    return callback( null, output.data );
                } else if ( FORMATS.indexOf( arg ) !== -1 ) {
                    [ replState, output ] = await updateGraph( replState, save({
                        ...graphConfig,
                        format: arg,
                        draft: true
                    }) );
                    if ( handleErrors( output, callback ) ) {
                        return;
                    }
                    // Write to a temporary file:
                    const dir = fs.mkdtempSync( path.join( os.tmpdir(), 'graphmaker-' ) );
                    if ( arg === 'tikz' ) {
                        arg = 'tex';
                    }
                    const filename = path.join( dir, `graph.${arg}` );
                    fs.writeFileSync( filename, output.data );

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
                handleErrors( { kind: 'ERRORS', data: [ new Error( 'unknown output format') ] }, callback );
                break;
            }
            case ':exec':
                cmd = cmd.replace( ':exec', '.load' );
                executeCommand( cmd );
                break;
            case ':load': {
                const json = JSON.parse( fs.readFileSync( arg, 'utf8' ) );
                [ replState ] = await updateGraph( replState, setGraph( json ) );
                callback( null, `Using graph in file ${arg}.` );
                break;
            }
            case ':transcript':
                cmd = cmd.replace( ':transcript', '.save' );
                executeCommand( cmd );
                break;
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
            case ':history': {
                const n = arg ? parseInt( arg, 10 ) : 10;
                const history = replServer.history.
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
                const fileExtension = arg.split( '.' ).pop();
                [ replState, output ] = await updateGraph( replState, save({
                    ...graphConfig,
                    format: fileExtension,
                    draft: false
                }) );
                if ( handleErrors( output, callback ) ) {
                    return;
                }
                fs.writeFileSync( arg, output.data );
                callback( null, 'Saved to file: `' + arg + '`' );
                break;
            }
            case ':help':
                callback( null, 'Commands:\n' +
                    '  <task> - execute a task\n' +
                    '  :save <filename> - save the graph to a file, format is determined by the file extension\n' +
                    '  :show [<format>] - show the graph in a given format\n' +
                    '  :undo - undo the last command\n' +
                    '  :redo - redo the last command\n' +
                    '  :config <option> [<value>] - set a configuration option for the graph or print its value\n' +
                    '  :reset - reset the graph to the initial state\n' +
                    '  :history <n> - show the last n commands (default: 10)\n' +
                    '  :exec <filename> - load a file containing commands\n' +
                    '  :load <filename>.json - load a saved graph as the current state\n' +
                    '  :transcript <filename> - save the transcript to a file\n' +
                    '  :help - show this help message\n' +
                    '  :exit - exit the program' );
                break;
            case ':config': {
                if ( arg === void 0 ) {
                    callback( null, Object.keys( graphConfig )
                        .map( key => {
                            if ( typeof graphConfig[ key ] === 'object' ) {
                                return `${key} = ${JSON.stringify( graphConfig[ key ] )}`;
                            }
                            return `${key} = ${graphConfig[ key ]}`;
                        })
                        .join( '\n' ) );
                    break;
                }
                const [ option, value ] = arg.split( ' ' );
                let optionLabel = option;
                let optionRef = graphConfig;
                if ( option === 'apiKey' || option === 'model' ) {
                    optionLabel = `${graphConfig.provider}.${option}`;
                    if ( !graphConfig[graphConfig.provider] ) {
                        graphConfig[graphConfig.provider] = {
                            apiKey: '',
                            model: ''
                        };
                    }
                    optionRef = graphConfig[graphConfig.provider];
                }
                if ( value === void 0 ) {
                    callback( null, `${optionLabel} = ${optionRef[ option ]}` );
                } else {
                    optionRef[ option ] = value;
                    callback( null, `Set option ${optionLabel} to ${value}.` );
                }
                break;
            }
            case ':exit':
                return process.exit( 0 );
            default:
                [ replState, output ] = await updateGraph( replState, task( cmd ) );
                if ( !handleErrors( output, callback ) ) {
                    callback( null, 'As you wish.' );
                }
                break;
                // callback( null, 'Unknown command: \''+command+'\'' );
        }
    },
    writer: ( output ) => {
        return output;
    }
});

replServer.setupHistory( path.join( os.homedir(), '.graphmaker_history' ), ( err ) => {
    if ( err ) {
        debug( err );
    }
});

function executeCommand(command) {
    replServer.write(`${command}\n`);
}
