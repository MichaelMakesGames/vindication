module.exports = {
	entry: "./index.ts",
	output: {
		filename: "bundle.js",
		path: __dirname
	},

	// Enable sourcemaps for debugging webpack's output.
	devtool: "source-map",

	resolve: {
		// Add '.ts' and '.tsx' as resolvable extensions.
		extensions: [".ts", ".js", ".json"]
	},

	module: {
		rules: [
			// All files with a '.ts' or '.tsx' extension will be handled by 'awesome-typescript-loader'.
			{
				test: /\.ts$/,
				loader: "ts-loader"
			},

			// All output '.js' files will have any sourcemaps re-processed by 'source-map-loader'.
			{
				enforce: "pre",
				test: /\.js$/,
				loader: "source-map-loader"
			}
		]
	},
};