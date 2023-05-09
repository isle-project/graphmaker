const sharp = require('sharp');

async function extractCenterOfMass( svg, width, height ) {
    width = Math.round(width);
    height = Math.round(height);
    const buf = await sharp(Buffer.from(svg))
        .resize({height, width })
        .extractChannel(3)
        .threshold()
        .raw()
        .toBuffer();
    const arr = Array.from( buf );
    let centerOfMassX = 0;
    let centerOfMassY = 0;
    let index = 0;
    let totalMass = 0;
    for ( let row = 0; row < height; ++row ) {
        for ( let col = 0; col < width; ++col, ++index ) {
            if ( arr[index] > 0 ) {
                centerOfMassX += col;
                centerOfMassY += row;
                ++totalMass;
            }
        }
    }
    return [
        ( centerOfMassX / totalMass ) / width,
        ( centerOfMassY / totalMass ) / height
    ];
}

module.exports = extractCenterOfMass;
