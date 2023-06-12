const sharp = require('sharp');

/**
 * Extracts the center of mass of the alpha channel from an SVG image.
 *
 * ## Notes
 *
 * -   The SVG is first resized to the provided dimensions, then converted into a raw bitmap using Sharp.
 * -   The center of mass is computed by iterating through each pixel in the alpha channel.
 *
 * @param {string} svg - SVG string
 * @param {number} width - desired width to resize the SVG
 * @param {number} height - desired height to resize the SVG
 * @returns {Promise<number[number[]]>} center of mass of the alpha channel as a pair of numbers between 0 and 1, representing the x and y coordinates
 */
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
