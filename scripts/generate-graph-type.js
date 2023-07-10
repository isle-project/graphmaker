const { join } = require( 'path' );
const { writeFileSync } = require( 'fs' );
const { compile } = require( 'json-schema-to-typescript' );

const schema = require( join( __dirname, '..', 'lib', 'spec', 'graph-schema.json' ) );

schema[ '$defs' ].cardinalDirection.description = schema[ '$defs' ].cardinalDirection.description.model;
schema[ '$defs' ].fontColor.description = schema[ '$defs' ].fontColor.description.model;

compile( schema )
  .then(ts => {
    ts = ts.replace( 'GraphSchema', 'Graph' );
    writeFileSync( join( __dirname, '..', 'types', 'graph.d.ts' ), ts );
  });
