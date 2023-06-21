const path = require('path');
const fs = require('fs');

fs.watch(path.resolve(__dirname, '..'), { recursive: true }, (event, filename) => {
    console.log(event, path.resolve(__dirname, '..', filename));
});