const fs = require('fs');
const path = require('path');
const readline = require('readline');
const { execSync } = require('child_process');

function contentsCommands( commandFile ) {
    const commands = JSON.parse( fs.readFileSync( commandFile ) );
    commands.sort( (a, b) => a.command.localeCompare( b.command ) );
    const out = [];
    for ( const cmd of commands ) {
        const { command, description, args } = cmd;
        let argStr = args ? ' ' + args : '';
        argStr = argStr.replace( /</g, '&lt;' ).replace( />/g, '&gt;' );
        out.push( `  + __${command}${argStr}__` );
        out.push( `\n    ${description}`);
        out.push( '' );
    }
    return out.join('\n');
}

function contentsStyles( schemaFileName ) {
    const schema = JSON.parse( fs.readFileSync( schemaFileName ) );
    const defs = schema['$defs'];
    const styleParams = Object.keys(defs).sort();

    const out = [];
    for ( const param of styleParams ) {
        let { type, description = '', default: defaultValue, enum: validValues } = defs[param];
        if ( description && typeof description === 'object' ) {
            if ( description.internal ) continue;
            description = description.human;
        }
        out.push( `  + __${param}__ ${description}` );
        // ATTN: This may need to be generalized if the schema evolves
        if ( param === 'fontFamily' ) {  // Assume for now: A set and generalizing extension
            const standard = defs[param].anyOf[0].enum;
            out.push(`\n    Possible values: ${standard.join(', ')}, or any font name available on the user's system.`);
        } else if ( param === 'fillStyle' ) {  // ATTN: Manually put in what we want to avoid excess generality for now
            out.push('\n    Possible values can be one of:' );
            out.push('\n    - `solid`, which is the default.');
            out.push('\n    - `dotted` along with an optional size of the dots and an optional tile size (pixels per dot in all directions)');
            out.push('\n    - `hashed`, along with an optional hashing direction (one of `vertical`, `horizontal`, `increasing`, `decreasing`, default is `increasing`) and an optional hash thickness (default: 0.5).');
            out.push('\n    - `crosshatched`, along with an optional hashing direction (`vertical` or `diagonal`) and thickness (default: 0.5)');
        } else if ( param === 'offset' ) {  // ATTN: Manually put in what we want to avoid excess generality for now
            const directions = defs['cardinalDirection']['enum'];
            out.push('\n    This applies to label offsets for nodes and edges and weight offsets for edges.' );
            out.push('\n    Possible values can be one of:' );
            out.push('\n    - `none`');
            out.push(`\n    - A cardinal direction (one of ${directions.join(', ')}). This offsets by the node or edge size in that direction.` );
            out.push(`\n    - A cardinal direction with a distance in units of the node or edge size.`);
            out.push(`\n    - Two cartesian coordinates dx, dy for the offset in units of the node or edge size.`);
            out.push(`\n    - Offset specified in polar coordinates,  with a number representing an angle in degrees, and another number indicating the (non-negative) distance from the position in units of the node or edge size.`);
        } else if ( validValues ) {
            out.push(`\n    Possible values: ${validValues.map( p => '`' + p + '`' ).join( ', ' ) }` );
        } else if ( defs[param].anyOf || defs[param].oneOf ) {
            throw new Error( 'Unhandled anyOf or oneOf in schema conversion' );
        } else {
            switch ( type ) {
                case 'string':
                    break;
                case 'number':
                        break;
                case 'array':
                    break;
                default:
                    break;
            }
        }
        if ( defaultValue !== void 0 ) {
            out.push( `\n    Default value: \`${defaultValue}\`` );
        }
        /* NOTE: examples may be misleading as they are tied to the JSON schema, not natural language usage
        if ( examples ) {
            out.push( '\n    Examples:' );
            out.push( `\n        ${examples.map( e => JSON.stringify(e)).join( '\n        ' ) }` );
        }
        */
        out.push( '' );
    }
    return out.join('\n');
}

function outputHelp( command ) {
    const help = execSync( `node ${command} --help` ).toString();
    return help;
}

const directiveDispatch = {
    'CONTENTS': {
        'commands': contentsCommands,
        'styles': contentsStyles
    },
    'OUTPUT': {
        'usage-help': outputHelp
    }
};

async function readByLine( fileName, outputFileName ) {
    const fileStream = fs.createReadStream( fileName );

    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity
    });
    const writeStream = fs.createWriteStream( outputFileName );

    for await (const line of rl) {
        if ( line.startsWith( '@' ) ) {
            const parts = /^@PROCESS-([A-Z]+)\(([^,]+),\s*([^)]+)\)$/.exec( line.trim() );
            if ( !parts ) {
                throw new Error( `Ill-formed @ directive: ${line}` );
            }
            const replacement = directiveDispatch[parts[1]][parts[2].trim()]( parts[3].trim() );
            writeStream.write( replacement + '\n' );
        } else {
            writeStream.write( line + '\n' );
        }
    }
    writeStream.end();
}

const inputFile = path.join(__dirname, '..', 'lib', 'spec', 'readme_template.md');
const outputFile = path.join(__dirname, '..', 'README.md');
readByLine( inputFile, outputFile );
