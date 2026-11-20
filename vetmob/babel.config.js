module.exports = function (api) {
  api.cache(true);
  return {
    presets: [
      // Use the preset bundled with the local `expo` package so the expo-router
      // Babel plugin can resolve `expo-router` (avoids hoisted root node_modules).
      [require('expo/internal/babel-preset'), { jsxImportSource: 'nativewind' }],
      'nativewind/babel',
    ],
    plugins: ['@babel/plugin-transform-class-static-block'],
  };
};