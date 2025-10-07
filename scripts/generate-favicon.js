const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

async function generateFavicon() {
  try {
    const svgPath = path.join(__dirname, '../public/favicon.svg');
    const icoPath = path.join(__dirname, '../public/favicon.ico');
    const pngPath = path.join(__dirname, '../public/favicon.png');

    // Read SVG file
    const svgBuffer = fs.readFileSync(svgPath);

    // Generate 32x32 ICO (common favicon size)
    console.log('Generating favicon.ico (32x32)...');
    await sharp(svgBuffer)
      .resize(32, 32)
      .toFormat('png')
      .toFile(pngPath);

    // For ICO, we'll create multiple sizes and combine them
    // Generate 16x16 and 32x32 versions
    console.log('Generating 16x16 version...');
    const icon16 = await sharp(svgBuffer)
      .resize(16, 16)
      .toFormat('png')
      .toBuffer();

    console.log('Generating 32x32 version...');
    const icon32 = await sharp(svgBuffer)
      .resize(32, 32)
      .toFormat('png')
      .toBuffer();

    console.log('Generating 48x48 version...');
    const icon48 = await sharp(svgBuffer)
      .resize(48, 48)
      .toFormat('png')
      .toBuffer();

    // Create a simple ICO file structure (Windows ICO format)
    // ICO format: Header (6 bytes) + IconDir entries (16 bytes each) + Image data
    const createICO = (images) => {
      // ICO header
      const header = Buffer.alloc(6);
      header.writeUInt16LE(0, 0);    // Reserved, must be 0
      header.writeUInt16LE(1, 2);    // Image type: 1 for ICO
      header.writeUInt16LE(images.length, 4); // Number of images

      // Calculate offsets
      let offset = 6 + (16 * images.length);
      const entries = [];
      const imageData = [];

      images.forEach((img, i) => {
        const entry = Buffer.alloc(16);
        entry.writeUInt8(img.size, 0);           // Width
        entry.writeUInt8(img.size, 1);           // Height
        entry.writeUInt8(0, 2);                  // Color palette
        entry.writeUInt8(0, 3);                  // Reserved
        entry.writeUInt16LE(1, 4);               // Color planes
        entry.writeUInt16LE(32, 6);              // Bits per pixel
        entry.writeUInt32LE(img.data.length, 8); // Image size
        entry.writeUInt32LE(offset, 12);         // Image offset

        entries.push(entry);
        imageData.push(img.data);
        offset += img.data.length;
      });

      return Buffer.concat([header, ...entries, ...imageData]);
    };

    const icoBuffer = createICO([
      { size: 16, data: icon16 },
      { size: 32, data: icon32 },
      { size: 48, data: icon48 }
    ]);

    fs.writeFileSync(icoPath, icoBuffer);

    console.log('✅ Favicon generated successfully!');
    console.log(`   - favicon.svg (vector, scalable)`);
    console.log(`   - favicon.png (32x32 PNG)`);
    console.log(`   - favicon.ico (16x16, 32x32, 48x48)`);
  } catch (error) {
    console.error('❌ Error generating favicon:', error);
    process.exit(1);
  }
}

generateFavicon();
