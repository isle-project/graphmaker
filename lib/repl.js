const repl = require( 'repl' );
const debug = require( 'debug' )( 'graphmaker:repl' );
const fs = require( 'fs' );
const path = require( 'path' );
const os = require( 'os' );
const { initializeGraph, updateGraph, redo, resetGraph, undo, save, task, setGraph } = require( './index.js' );

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

const FORMATS = [ 'svg', 'png', 'jpg', 'jpeg', 'pdf', 'json', 'gif', 'webp', 'tiff' ];

let replState = initializeGraph( { apiKey: 'ATTN' } );

const replServer = repl.start({
    prompt: '> ',
    eval: async ( cmd, _context, _name, callback ) => {
        cmd = cmd.trim();
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
                    [ replState, output ] = await updateGraph( replState, save( { format: 'json', draft: true } ) );
                    return callback( null, JSON.stringify( replState.graph, null, 2 ) );
                } else if ( FORMATS.indexOf( arg ) !== -1 ) {
                    [ replState, output ] = await updateGraph( replState, save({
                        format: arg,
                        draft: true
                    }) );
                    if ( handleErrors( output, callback ) ) {
                        return;
                    }
                    // Write the SVG to a temporary file:
                    const dir = fs.mkdtempSync( path.join( os.tmpdir(), 'graphmaker-' ) );
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
                    '  :reset - reset the graph to the initial state\n' +
                    '  :history <n> - show the last n commands (default: 10)\n' +
                    '  :exec <filename> - load a file containing commands\n' +
                    '  :load <filename>.json - load a saved graph as the current state\n',
                    '  :transcript <filename> - save the transcript to a file\n' +
                    '  :help - show this help message\n' +
                    '  :exit - exit the program' );
                break;
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
