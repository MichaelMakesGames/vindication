module.exports = {
	entry: "./client/index.ts",
	output: {
		filename: "bundle.js",
		path: __dirname + '/public/'
	},

	// Enable sourcemaps for debugging webpack's output.
	devtool: "source-map",

	resolve: {
		// Add '.ts' as resolvable extension
		extensions: [".ts", ".js", ".json"]
	},

	module: {
		rules: [
			// All files with a '.ts' extension will be handled by 'awesome-typescript-loader'.
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