const path = require('path');

module.exports = {
  target: 'web',
  entry: './src/index.js',
  output: {
    filename: 'dist/strn.min.js',
    path: path.resolve(__dirname),
    library: {
      name: 'SaturnModule',
      type: 'var',
    }
  }
};
