const fs = require('fs');
const { exec } = require('child_process');

// Since we need to convert SVG to ICO, let's use a simple approach
// We'll create a PNG first, then convert to ICO using online tools or keep as PNG
// Most modern browsers support favicon.png

console.log('SVG favicon created at public/favicon.svg');
console.log('For ICO format, you can use online converters or tools like ImageMagick');
console.log('Alternatively, create a 32x32 PNG version of the favicon');

// Read the SVG and create a simple HTML to test it
const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Favicon Test</title>
    <link rel="icon" type="image/svg+xml" href="/favicon.svg">
</head>
<body>
    <h1>Favicon Test Page</h1>
    <p>Check the browser tab for the favicon!</p>
    <img src="/favicon.svg" width="100" height="100" alt="Favicon Preview">
</body>
</html>
`;

fs.writeFileSync('public/favicon-test.html', html);
console.log('Test page created at public/favicon-test.html');
