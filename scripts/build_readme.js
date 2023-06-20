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
        const argStr = args ? ' ' + args : '';

        out.push( `  + __${command}${argStr}__` );
        out.push( `\n    ${description}`);
    }
    return out.join('\n');
}

function contentsStyles( schemaFileName ) {
    const schema = JSON.parse( fs.readFileSync( schemaFileName ) );
    const defs = schema['$defs'];
    const styleParams = Object.keys(defs).sort();

    const out = [];
    for ( const param of styleParams ) {
        let { type, description = '', default: defaultValue, examples, enum: validValues } = defs[param];
        if ( description && typeof description === 'object' ) {
            if ( description.internal ) continue;
            description = description.human;
        }
        out.push( `  + __${param}__ ${description}` );
        if ( param.anyOf ) {  // A set and generalizing extension

        } else if ( param.oneOf ) {  // Several choices, possibly related extensionally

        } else if ( validValues ) {
            out.push(`\n    Possible values: ${validValues.map( p => '`' + p + '`' ).join( ', ' ) }` );
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
        if ( examples ) {
            out.push( '\n    Examples:' );
            out.push( `\n        ${examples.map( e => JSON.stringify(e)).join( '\n        ' ) }` );
        }
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

const inputFile =  path.join(__dirname, '..', 'lib', 'spec', 'readme_template.md');
const outputFile = path.join(__dirname, '..', 'README.md');
readByLine( inputFile, outputFile );
